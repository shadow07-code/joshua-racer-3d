// Is the road actually DRIVEABLE? — `node tools/densitytest.mjs`
//
// The heat harness measures the economy: does playing safe kill you, does
// aggression pay. It never once asked the more basic question — when a row of
// traffic arrives, does the player have enough TIME to get to the gap?
//
// That question has an exact answer. A row arrives every `rowGapZ / closing
// speed` seconds. Moving one lane takes a measurable amount of time (steering is
// speed-scaled and the mass lags the wheels). Divide the two and you get the
// number that decides whether the game is playable:
//
//   THREAD RATIO = time between rows / time to change one lane
//
//   < 1.0   impossible — the next wall arrives before you can reach the gap
//   1.0-1.5 frame-perfect, permanently. Not a difficulty curve, a wall.
//   2.0-3.0 demanding but fair: see it, decide, move.
//   > 4.0   roomy
//
// The gap lane can also shift TWO lanes between rows (5% of rows), so the ratio
// needs headroom above 2 or those rows are unavoidable deaths rather than hard
// ones.
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const imp = (p) => import(pathToFileURL(join(SRC, p)).href);

const { PHYS, ROAD, HEAT, RACE, ONCOMING } = await imp("config.js");
const H = await imp("heat.js");
const ST = await imp("stages.js");
const T = await imp("entities/traffic.js");
const { makePlayer, updatePlayer } = await imp("entities/player.js");

const DT = 1 / 60;
const line = (s) => console.log(s);
const LANE_W = (ROAD.halfWidth * 2) / ROAD.laneCount;

// How long does one lane change actually take at a given speed? Measured, not
// assumed: steering authority is speed-scaled and the mass lags the wheels, so
// the answer is not lane width over steer speed.
function laneChangeSeconds(throttle01) {
  const p = makePlayer();
  p.throttle01 = throttle01;
  for (let i = 0; i < 240; i++) updatePlayer(p, DT, { steer: 0 }, {});   // settle at speed
  const x0 = p.x;
  let t = 0;
  while (t < 3 && Math.abs(p.x - x0) < LANE_W) { updatePlayer(p, DT, { steer: 1 }, {}); t += DT; }
  return t;
}

// What the spawner will actually produce at a given density multiplier. Mirrors
// entities/traffic.js spawnRow — kept in step by asserting against a live spawn
// below, so this cannot quietly drift out of date.
function carsPerRow(dm, oncomingOn) {
  const candidates = ROAD.laneCount - 1 - (oncomingOn ? 1 : 0);   // minus the gap lane
  const extra = Math.max(0, dm - 1) * 1.5;
  const spare = candidates >= 3 ? 1 : 0;                          // always leave a way through
  return Math.min(Math.max(1, candidates - spare), 2 + extra);
}

line("\n══ ROAD DENSITY AUDIT ══");
line("\nA. THREAD RATIO — time between rows vs time to change one lane");
line("   heat  sector                 gap(u)  cars/row  ahead  row(s)  lane(s)  RATIO");

const AVG_TRAFFIC = PHYS.cruiseSpeed * 0.27;        // the pace of the pack
const rows = [];
for (const heat of [0.0, 0.35, 0.7, 1.0]) {
  for (const si of [1, 3, 6, 8]) {
    const sector = ST.sectorAt(si);
    const h = { v: heat, overdrive: false };
    const dm = H.heatDensity(h) * sector.density;
    // The tension wave makes the road breathe; the SURGE half is what has to be
    // survivable, so that is what gets audited.
    const surge = 1 - RACE.densityWaveAmp;
    const gap = (T.SPAWN_ROW_GAP / dm) * surge;
    const thr = H.heatSpeed01(h);
    const speed = PHYS.maxSpeed * thr;
    const closing = Math.max(1, speed - AVG_TRAFFIC);
    const rowS = gap / closing;
    const laneS = laneChangeSeconds(thr);
    const ratio = rowS / laneS;
    const cpr = carsPerRow(dm, sector.oncoming);
    const ahead = (220 / gap) * cpr;
    rows.push({ heat, si, ratio });
    const verdict = ratio < 1 ? "IMPOSSIBLE" : ratio < 1.5 ? "frame-perfect" : ratio < 2.2 ? "harsh" : ratio < 4 ? "fair" : "roomy";
    line(`   ${(heat * 100).toFixed(0).padStart(4)}%  ${(si + " " + sector.name).padEnd(20)} ` +
         `${gap.toFixed(0).padStart(6)}  ${cpr.toFixed(1).padStart(8)}  ${ahead.toFixed(0).padStart(5)}  ` +
         `${rowS.toFixed(2).padStart(6)}  ${laneS.toFixed(2).padStart(7)}  ${ratio.toFixed(2).padStart(5)}  ${verdict}`);
  }
}

const worst = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
line(`\n   WORST CASE: ratio ${worst.ratio.toFixed(2)} at ${(worst.heat * 100).toFixed(0)}% heat, sector ${worst.si} ` +
     (worst.ratio < 1.5 ? "  ← the game is unplayable here" : worst.ratio < 2.2 ? "  ← tight" : "  ✔"));

// ── B. The same thing, but observed rather than derived ──────────────────────
line("\nB. OBSERVED — what the spawner really puts on the road");
line("   (drives the real traffic sim; counts what is inside the 220-unit view)");
for (const [label, heat, si] of [["cold, opening", 0.0, 1], ["mid, mid-run", 0.5, 3], ["hot, late", 1.0, 6]]) {
  const sector = ST.sectorAt(si);
  const h = { v: heat, overdrive: false };
  const dm = H.heatDensity(h) * sector.density;
  const sys = T.makeTrafficSystem();
  sys.densityMul = dm;
  sys.rowGapZ = T.SPAWN_ROW_GAP / dm;
  if (sector.oncoming) T.startOncoming(sys, 0);
  T.prepopulateTraffic(sys, 600);
  let z = 0, samples = 0, total = 0, maxAhead = 0, blocked = 0;
  const speed = PHYS.maxSpeed * H.heatSpeed01(h);
  for (let i = 0; i < 60 * 60; i++) {
    z += speed * DT;
    T.updateTraffic(sys, DT, z, { playerX: 0, playerY: 0, onPassed: () => {}, onNearMiss: () => {} });
    if (i % 10 === 0) {
      const near = sys.list.filter((c) => !c.smashed && c.z > z && c.z < z + 220);
      total += near.length; samples++;
      maxAhead = Math.max(maxAhead, near.length);
      // A "blocked row" is one where every lane you could legally use is taken.
      const soon = sys.list.filter((c) => !c.smashed && !c.oncoming && c.z > z + 20 && c.z < z + 60);
      const lanes = new Set(soon.map((c) => c.laneIdx));
      const usable = ROAD.laneCount - (sector.oncoming ? 1 : 0);
      if (lanes.size >= usable - 1) blocked++;
    }
  }
  line(`   ${label.padEnd(14)} ${(total / samples).toFixed(1).padStart(5)} cars in view (peak ${maxAhead}), ` +
       `only-one-way-through on ${(blocked / samples * 100).toFixed(0)}% of samples`);
}

// Keep the model in A honest about the real spawner.
{
  const sys = T.makeTrafficSystem();
  sys.densityMul = 2.0;
  T.prepopulateTraffic(sys, 4000);
  // Group by ROW, not by a fixed z bucket — rows carry +/-2 units of jitter, so
  // bucketing splits them and under-reports the count.
  const sorted = [...sys.list].sort((a, b) => a.z - b.z);
  const groups = [];
  for (const c of sorted) {
    const g = groups[groups.length - 1];
    if (g && c.z - g.z0 < 12) g.n++;
    else groups.push({ z0: c.z, n: 1 });
  }
  const settled = groups.slice(5, -1);              // skip the deliberately gentle opening rows
  const observed = settled.reduce((a, g) => a + g.n, 0) / Math.max(1, settled.length);
  const predicted = carsPerRow(2.0, false);
  line(`\n   model check @ dm 2.0: predicted ${predicted.toFixed(1)} cars/row, spawner produced ${observed.toFixed(1)} ` +
       (Math.abs(observed - predicted) < 0.6 ? "✔" : "!! the model in section A has drifted from spawnRow()"));
}
