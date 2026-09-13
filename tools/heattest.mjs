// Headless balance harness for the HEAT loop — `node tools/heattest.mjs`.
//
// This is the test that actually matters for whether the game is FUN, because
// the design claim is a set of numbers: playing safe must kill you, aggression
// must pay, being cold must be escapable, and being hot must be survivable.
// Each of those is measurable without ever opening a browser.
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const imp = (p) => import(pathToFileURL(join(SRC, p)).href);

const { PHYS, HEAT, ONCOMING, SCORE, CHAIN, BRAKE, SLINGSHOT } = await imp("config.js");
const ST = await imp("stages.js");
const RK = await imp("rank.js");
const H = await imp("heat.js");
const { makePlayer, updatePlayer, playerBox } = await imp("entities/player.js");
const T = await imp("entities/traffic.js");

const DT = 1 / 60;
const line = (s) => console.log(s);

// ── SEEDED RNG ───────────────────────────────────────────────────────────────
// The traffic sim calls Math.random() dozens of times a second, so an unseeded
// harness produces a DIFFERENT world every run — and the integration bots swung
// from "died at 48s with 3.5k" to "survived 120s with 65k" on identical code.
// That made the one instrument this project uses to decide whether the game is
// balanced completely unusable for comparing a change against the code it
// replaced. Seed it, run every bot over the same set of worlds, and report the
// median so one lucky spawn cannot carry a verdict.
const _realRandom = Math.random;
function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = function mulberry32() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function unseedRandom() { Math.random = _realRandom; }
const SEEDS = [1, 2, 3, 4, 5, 6, 7];
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a[(a.length - 1) >> 1]; };

// ── A. The decay curve — how long does coasting buy you? ─────────────────────
line("\nA. DOING NOTHING");
{
  for (const start of [1.0, 0.66, 0.34]) {
    const h = H.makeHeat(); h.v = start; h.overdrive = false;
    let t = 0;
    while (!h.dead && t < 120) { H.updateHeat(h, DT, {}); t += DT; }
    // Subtract the flameout grace to report the time the bar actually took to empty.
    line(`   from ${(start * 100).toFixed(0)}% heat → dead in ${t.toFixed(1)}s ` +
         `(bar empty at ${(t - HEAT.flameoutSeconds).toFixed(1)}s, then ${HEAT.flameoutSeconds}s of grace)`);
  }
}

// ── B. Equilibrium: how often must you take a risk to hold a given heat? ─────
line("\nB. EQUILIBRIUM — near-misses needed to HOLD a level");
{
  for (const period of [3.0, 2.0, 1.5, 1.0]) {
    const h = H.makeHeat(); h.v = 0.5;
    let t = 0, acc = 0;
    while (t < 90 && !h.dead) {
      acc += DT;
      if (acc >= period) { acc -= period; H.addHeat(h, HEAT.nearMiss + HEAT.nearMissTight * 0.5); }
      H.updateHeat(h, DT, {});
      t += DT;
    }
    line(`   a mid-tightness shave every ${period.toFixed(1)}s → settles at ${(h.v * 100).toFixed(0)}% ` +
         (h.dead ? "(DIED)" : ""));
  }
  // Before the brake existed this was an upper bound nobody could reach. Now a
  // player CAN match pace and sit there, so the decay is the only thing standing
  // between the design and "park behind a bus and win" — test it directly.
  const h = H.makeHeat(); h.v = 0.5;
  let t = 0, held = 0;
  while (t < 60) {
    held += DT;
    H.addHeat(h, HEAT.draftRate * 0.7 * H.draftFalloff(held) * DT);
    H.updateHeat(h, DT, {});
    t += DT;
  }
  line(`   PARKED in a tow at 70% closeness for 60s → ${(h.v * 100).toFixed(0)}% ` +
       (h.v < 0.5 ? "(LOSES ground — parking is not a strategy ✔)" : "(!! a heat fountain — the falloff is too weak)"));
}

// ── C. Crash survivability: is aggression really the safe play? ──────────────
line("\nC. CRASH SURVIVABILITY");
{
  for (const start of [0.95, 0.6, 0.35, 0.2]) {
    const h = H.makeHeat(); h.v = start;
    H.addHeat(h, -HEAT.crash);
    line(`   crash at ${(start * 100).toFixed(0)}% → ${(h.v * 100).toFixed(0)}% left` +
         (h.v <= 0 ? "  ← on the flameout clock" : ""));
  }
}

// ── D. Speed range — a cold player must still overtake, or it is a death spiral ──
line("\nD. SPEED FLOOR vs TRAFFIC");
{
  const kmh = (f) => (f * PHYS.topSpeedKmh).toFixed(0);
  const cold = H.heatSpeed01({ v: 0, overdrive: false });
  const hot = H.heatSpeed01({ v: 1, overdrive: false });
  const od = H.heatSpeed01({ v: 1, overdrive: true });
  const fastest = Math.max(...T.TRAFFIC_TYPES.map((s) => s.speedMul)) + 0.06;
  const slowest = Math.min(...T.TRAFFIC_TYPES.map((s) => s.speedMul));
  line(`   cold ${kmh(cold)} km/h · hot ${kmh(hot)} km/h · overdrive ${kmh(od)} km/h`);
  line(`   traffic runs ${kmh(slowest)}–${kmh(fastest)} km/h`);
  const margin = (cold - fastest) * PHYS.maxSpeed;
  line(`   closing speed on the FASTEST car while stone cold: ${margin.toFixed(0)} u/s ` +
       (margin > 15 ? "→ recovery is always possible" : "→ DEATH SPIRAL RISK"));
}

// ── E. Full integration: a bot that plays the intended line ──────────────────
// Drives to the nearest car ahead, tucks into its slipstream, swerves out late.
// If the design works, this bot should climb and hold heat; a bot that just
// drives down the middle of an empty lane should die.
line("\nE. INTEGRATION — two bots, same world");

function runBot(policy, seconds) {
  const sys = T.makeTrafficSystem();
  T.prepopulateTraffic(sys, 500);
  const p = makePlayer();
  const h = H.makeHeat();
  let score = 0, lastZ = 0, t = 0, crashes = 0, nearMisses = 0, draftTime = 0, maxHeat = 0;
  let chain = 0, chainTimer = 0, chainBest = 0, draftStreak = 0, sectorBest = 1;
  const chainMul = () => 1 + Math.min(chain, CHAIN.cap) * CHAIN.step;
  const link = () => { chain++; chainBest = Math.max(chainBest, chain); chainTimer = CHAIN.window; };
  let brakeTime = 0, slings = 0, draftCar = null, draftHeldFor = 0, draftSince = 1e9;
  while (t < seconds && !h.dead) {
    const act = policy(sys, p, h);
    const steer = typeof act === "number" ? act : (act.steer || 0);
    const brake = typeof act === "number" ? false : !!act.brake;
    if (brake) brakeTime += DT;
    p.throttle01 = H.heatSpeed01(h);
    updatePlayer(p, DT, { steer, brake }, {});
    const sector = ST.sectorAt(ST.sectorIndexAt(p.z));
    sectorBest = Math.max(sectorBest, sector.index);
    sys.densityMul = H.heatDensity(h) * sector.density;
    T.updateTraffic(sys, DT, p.z, {
      playerX: p.x, playerY: p.y,
      onPassed: () => {},
      onNearMiss: (tight, c) => {
        nearMisses++;
        const headOn = !!(c && c.oncoming);
        const slung = !headOn && c && c === draftCar
          && draftHeldFor >= SLINGSHOT.minDraft && draftSince <= SLINGSHOT.window;
        if (slung) { slings++; draftCar = null; }
        H.addHeat(h, (HEAT.nearMiss + HEAT.nearMissTight * tight)
          * (headOn ? HEAT.oncomingMul : 1) * (slung ? SLINGSHOT.heatMul : 1) * chainMul());
        link();
      },
    });
    draftSince += DT;
    const d = T.draftTarget(sys, p.x, p.z, p.y);
    if (d) {
      draftTime += DT; draftStreak += DT; draftCar = d.car;
      H.addHeat(h, HEAT.draftRate * d.closeness * H.draftFalloff(draftStreak) * DT);
    } else if (draftStreak > 0) {
      if (draftStreak > CHAIN.draftMin) link();
      draftHeldFor = draftStreak; draftSince = 0; draftStreak = 0;
    }
    if (chainTimer > 0) { chainTimer -= DT; if (chainTimer <= 0) chain = 0; }
    if (!h.overdrive && p.invuln <= 0) {
      const hit = T.checkTrafficHit(sys, playerBox(p), p.y);
      if (hit) {
        T.smashCar(hit, p.x);
        crashes++;
        p.speed = Math.max(PHYS.startSpeed * 0.5, p.speed * 0.5);
        p.invuln = 1.4;
        H.addHeat(h, -HEAT.crash);
        chain = 0; chainTimer = 0;
      }
    }
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - DT);
    H.updateHeat(h, DT, {});
    maxHeat = Math.max(maxHeat, h.v);
    score += Math.max(0, p.z - lastZ) * SCORE.distanceWeight * H.heatScoreMul(h);
    lastZ = p.z;
    t += DT;
  }
  return { t, h, score, crashes, nearMisses, draftTime, maxHeat, chainBest, sectorBest,
           dist: p.z, brakeTime, slings };
}

// The coward: holds the middle lane, never goes near anything.
const coward = () => 0;

// The racer: line up behind the nearest car, hold the slipstream, swerve late.
function racer(sys, p) {
  let target = null, bestDz = Infinity;
  for (const c of sys.list) {
    if (c.smashed || c.oncoming) continue;
    const dz = c.z - p.z;
    if (dz > 5 && dz < 140 && dz < bestDz) { bestDz = dz; target = c; }
  }
  if (!target) return 0;
  const dz = target.z - p.z, dx = target.x - p.x;
  if (dz > 15) return Math.abs(dx) < 1.5 ? 0 : Math.sign(dx);   // tuck in behind
  return dx >= 0 ? -1 : 1;                                       // swerve out late
}

// The PARASITE: finds one car, brakes to its pace and never leaves. If the
// economy is sound this must lose to the racer AND eventually die.
function parasite(sys, p) {
  let target = null, bestDz = Infinity;
  for (const c of sys.list) {
    if (c.smashed || c.oncoming) continue;
    const dz = c.z - p.z;
    if (dz > 14 && dz < 120 && dz < bestDz) { bestDz = dz; target = c; }
  }
  if (!target) return { steer: 0, brake: false };
  const dx = target.x - p.x;
  return { steer: Math.abs(dx) < 1.5 ? 0 : Math.sign(dx), brake: (target.z - p.z) < 40 };
}

line(`   (median of ${SEEDS.length} seeded worlds — same worlds for every bot)`);
line("   NOTE: these measure the ECONOMY, not technique — a 20-line stateless policy");
line("   cannot execute a three-phase slingshot, so that is measured in section O.");
const BOTS = [
  ["COWARD (never risks)", coward],
  ["RACER (no brake)", racer],
  ["PARASITE (parks in a tow)", parasite],
];
for (const [name, pol] of BOTS) {
  const runs = SEEDS.map((sd) => { seedRandom(sd); const r = runBot(pol, 120); unseedRandom(); return r; });
  const died = runs.filter((r) => r.h.dead).length;
  const mScore = median(runs.map((r) => r.score));
  const mLife = median(runs.map((r) => r.t));
  const verdict = died === runs.length ? `died, median ${mLife.toFixed(0)}s`
    : died === 0 ? `survived 120s` : `died in ${died}/${runs.length}`;
  line(`   ${name.padEnd(25)} ${verdict.padEnd(20)} score ${Math.round(mScore).toLocaleString().padStart(7)}  ` +
       `shaves ${median(runs.map((r) => r.nearMisses))}  draft ${median(runs.map((r) => r.draftTime)).toFixed(0)}s  ` +
       `crashes ${median(runs.map((r) => r.crashes))}  peak ${(median(runs.map((r) => r.maxHeat)) * 100).toFixed(0)}%`);
  line(`   ${"".padEnd(25)} sector ${median(runs.map((r) => r.sectorBest))}, chain ${median(runs.map((r) => r.chainBest))}, ` +
       `${Math.round(median(runs.map((r) => r.dist))).toLocaleString()} m, brake ${median(runs.map((r) => r.brakeTime)).toFixed(0)}s, ` +
       `slingshots ${median(runs.map((r) => r.slings))}`);
}

// ── F. Score calibration for the letter grades ───────────────────────────────
line("\nF. SCORE RATES (for GRADES thresholds)");
{
  seedRandom(11);
  const r = runBot(racer, 90);
  unseedRandom();
  line(`   a competent 90s run scores about ${Math.round(r.score).toLocaleString()}`);
  const rate = r.score / Math.max(1, r.t);
  line(`   ≈ ${Math.round(rate).toLocaleString()}/s — so 60s≈${Math.round(rate * 60).toLocaleString()}, ` +
       `120s≈${Math.round(rate * 120).toLocaleString()}, 240s≈${Math.round(rate * 240).toLocaleString()}`);
}

// ── G. Sectors: is the ladder actually reachable? ────────────────────────────
line("");
line("G. SECTOR LADDER");
{
  for (let i = 1; i <= 10; i++) {
    const sc = ST.sectorAt(i);
    const z = ST.sectorStartZ(i);
    const tHot = z / (PHYS.maxSpeed * 0.95);
    const tMid = z / (PHYS.maxSpeed * 0.78);
    line(`   ${String(i).padStart(2)} ${sc.name.padEnd(12)} ${String(Math.round(z)).padStart(6)} m ` +
         `→ ${String(Math.round(tHot)).padStart(3)}s hot / ${String(Math.round(tMid)).padStart(3)}s middling` +
         `  [night ${sc.night.toFixed(2)}${sc.oncoming ? " onc" : "    "}${sc.cops ? " cops" : "     "} dens x${sc.density.toFixed(2)}]`);
  }
}

// ── H. Rank ladder: how many good runs to each title? ────────────────────────
line("");
line("H. RANK LADDER (at ~20k per strong run)");
{
  const RUN = 20000;
  for (let i = 1; i <= RK.MAX_RANK; i++) {
    let lo = 0, hi = 4000000;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (RK.rankAt(mid).index >= i) hi = mid; else lo = mid; }
    const xp = Math.round(hi);
    line(`   RANK ${String(i).padStart(2)} ${RK.rankAt(xp).name.padEnd(9)} ${xp.toLocaleString().padStart(9)} xp ` +
         `≈ ${(xp / RUN).toFixed(0)} strong runs`);
  }
}

// ── I. NOS: does the bottle behave, and is the trade real? ───────────────────
line("");
line("I. NOS");
{
  const { NOS } = await imp("config.js");
  const p = makePlayer(); p.throttle01 = 0.8; p.speed = PHYS.maxSpeed * 0.8;
  const kmh = (v) => (v / PHYS.maxSpeed * PHYS.topSpeedKmh).toFixed(0);
  for (let i = 0; i < 300; i++) updatePlayer(p, DT, { steer: 0 }, {});
  const cruise = p.speed;
  p.nosOn = true;
  let spoolFrames = 0;
  while (p.nos < 0.99 && spoolFrames < 200) { updatePlayer(p, DT, { steer: 0 }, {}); spoolFrames++; }
  for (let i = 0; i < 300; i++) updatePlayer(p, DT, { steer: 0 }, {});
  line(`   cruise ${kmh(cruise)} km/h → on NOS ${kmh(p.speed)} km/h ` +
       `(+${(p.speed / cruise * 100 - 100).toFixed(0)}%), spools in ${(spoolFrames / 60).toFixed(2)}s`);
  // How long can a full bar sustain it, and what does that cost you?
  const h = H.makeHeat(); h.v = 1;
  let t = 0;
  while (h.v > NOS.minHeat && t < 60) { H.addHeat(h, -NOS.burn * DT); H.updateHeat(h, DT, {}); t += DT; }
  line(`   a FULL bar sustains NOS for ${t.toFixed(1)}s (burn ${NOS.burn}/s + normal decay) — then you are empty and dying`);
}

// ── J. DRIFT: does it actually fire while weaving through traffic? ───────────
// The whole feature rests on |slip| clearing DRIFT.min during ordinary play. If
// it never does, drift scoring is dead code no matter how good the maths is.
line("");
line("J. DRIFT — does ordinary weaving produce slides?");
{
  const { DRIFT } = await imp("config.js");
  const cases = [
    ["mashing (0.5s flips)", 0.5],
    ["quick weave (0.9s)", 0.9],
    ["committed weave (1.4s)", 1.4],
    ["long holds (2.2s)", 2.2],
  ];
  for (const [label, period] of cases) {
    const p = makePlayer(); p.throttle01 = 0.9; p.speed = PHYS.maxSpeed * 0.9;
    let t = 0, dir = 1, acc = 0, banked = 0, totalT = 0, best = 0, heatGain = 0, scoreGain = 0;
    while (t < 30) {
      acc += DT;
      if (acc >= period) { acc -= period; dir = -dir; }
      updatePlayer(p, DT, { steer: dir }, {
        onDriftEnd: (dt2, sum) => {
          if (dt2 < DRIFT.minBankSeconds) return;
          banked++; totalT += dt2; best = Math.max(best, dt2);
          heatGain += DRIFT.heatPerSec * sum;
          scoreGain += DRIFT.scorePerSec * sum;
        },
      });
      t += DT;
    }
    line(`   ${label.padEnd(24)} ${String(banked).padStart(3)} drifts / 30s, best ${best.toFixed(2)}s, ` +
         `heat +${(heatGain / 30).toFixed(3)}/s, score ${Math.round(scoreGain).toLocaleString()}`);
  }
  line("   (decay is 0.045-0.110/s, so drift alone must NOT out-earn it — traffic is the fuel)");
}

// ── K. Flameout: can the fire actually kill you? ─────────────────────────────
line("");
line("K. FLAMEOUT");
{
  const mk = () => { const h = H.makeHeat(); h.v = 0.02; return h; };
  // Someone scraping incidental crumbs off passing traffic must still burn out.
  // A real graze is a slipstream frame at ~5% closeness: 0.42 * 0.05 = 0.021/s,
  // which is below the 0.045/s floor decay. It must NOT save you.
  const GRAZE = HEAT.draftRate * 0.05;
  let h = mk(), t = 0;
  while (!h.dead && t < 30) { H.addHeat(h, GRAZE * DT); H.updateHeat(h, DT, {}); t += DT; }
  line(`   grazing at ${GRAZE.toFixed(3)}/s (vs ${HEAT.drainBase}/s decay) → ` +
       `${h.dead ? "dead at " + t.toFixed(1) + "s — correct" : "SURVIVED 30s — the fire cannot kill, BUG"}`);
  // ... whereas one genuine shave buys you back out of it.
  h = mk(); t = 0;
  let saved = false;
  while (!h.dead && t < 12) {
    if (t > 2 && !saved) { H.addHeat(h, HEAT.nearMiss * 2); saved = true; }
    H.updateHeat(h, DT, {});
    t += DT;
  }
  // A real risk should visibly buy time even if you eventually burn out anyway.
  let base = mk(), bt = 0;
  while (!base.dead && bt < 30) { H.updateHeat(base, DT, {}); bt += DT; }
  line(`   nothing at all              → dead at ${bt.toFixed(1)}s`);
  line(`   one real shave at t=2s      → ${h.dead ? "dead at " + t.toFixed(1) + "s" : "escaped to " + (h.v * 100).toFixed(0) + "%"}` +
       `  (bought ${(t - bt).toFixed(1)}s)`);
}

// ── L. THE BRAKE: does the new pedal do what it claims? ──────────────────────
line("\nL. BRAKE");
{
  const p = makePlayer();
  p.throttle01 = 1;
  let t = 0;
  while (t < 3 && p.speed < PHYS.maxSpeed * 0.99) { updatePlayer(p, DT, { steer: 0 }, {}); t += DT; }
  const top = p.speed;
  let stopT = 0;
  while (stopT < 5 && p.speed > PHYS.maxSpeed * BRAKE.floor01 + 0.5) {
    updatePlayer(p, DT, { steer: 0, brake: true }, {});
    stopT += DT;
  }
  line(`   ${(top / PHYS.maxSpeed * PHYS.topSpeedKmh).toFixed(0)} km/h → ` +
       `${(p.speed / PHYS.maxSpeed * PHYS.topSpeedKmh).toFixed(0)} km/h in ${stopT.toFixed(2)}s`);

  // The floor has to be UNDER the quickest civilian car, or a tow can never be
  // matched and the brake buys nothing the design cares about.
  const fastest = Math.max(...T.TRAFFIC_TYPES.map((k) => k.speedMul)) * PHYS.cruiseSpeed;
  const slowest = Math.min(...T.TRAFFIC_TYPES.map((k) => k.speedMul)) * PHYS.cruiseSpeed;
  const floor = PHYS.maxSpeed * BRAKE.floor01;
  line(`   brake floor ${floor.toFixed(0)} u/s vs traffic ${slowest.toFixed(0)}-${fastest.toFixed(0)} u/s ` +
       (floor < fastest ? "→ every car in the game is matchable ✔" : "→ !! cannot match the fast lane"));
  line(`   cold speed floor is ${(HEAT.speedFloor * PHYS.maxSpeed).toFixed(0)} u/s, so OFF the brake you always overtake ` +
       (HEAT.speedFloor * PHYS.maxSpeed > fastest ? "✔" : "!!"));

  // Weight transfer: braking must genuinely sharpen the car, or it is just a pause.
  const lat = (brake) => {
    const q = makePlayer(); q.throttle01 = 1;
    for (let i = 0; i < 90; i++) updatePlayer(q, DT, { steer: 0 }, {});
    let peak = 0;
    for (let i = 0; i < 45; i++) { updatePlayer(q, DT, { steer: 1, brake }, {}); peak = Math.max(peak, Math.abs(q.vx)); }
    return peak;
  };
  const free = lat(false), stood = lat(true);
  line(`   peak lateral over 0.75s of full lock: ${free.toFixed(0)} u/s free, ${stood.toFixed(0)} u/s on the brake ` +
       `(${((stood / free - 1) * 100).toFixed(0)}% sharper)`);
}

// ── M. THE TOW: the decay curve, in seconds a player can read ────────────────
line("\nM. SLIPSTREAM DECAY");
{
  for (const held of [0, 0.5, 1.0, 2.0, 3.0, 5.0]) {
    const f = H.draftFalloff(held);
    const rate = HEAT.draftRate * 0.8 * f;
    const drainAt = (v) => HEAT.drainBase + HEAT.drainScale * v;
    line(`   held ${held.toFixed(1)}s → ${(f * 100).toFixed(0)}% value, ` +
         `${(rate * 100).toFixed(1)}%/s in vs ${(drainAt(0.6) * 100).toFixed(1)}%/s out at 60% heat ` +
         (rate > drainAt(0.6) ? "(gaining)" : "(losing)"));
  }
}

// ── N. ELEVATION: the road climbs now, so it had better not sink ─────────────
line("\nN. ROAD ELEVATION");
{
  const R = await imp("curve.js");
  let lo = Infinity, hi = -Infinity, maxGrade = 0, bad = 0;
  for (let z = 0; z < 60000; z += 3) {
    const y = R.elevAt(z), g = R.gradeAt(z);
    if (!Number.isFinite(y) || !Number.isFinite(g)) bad++;
    lo = Math.min(lo, y); hi = Math.max(hi, y);
    maxGrade = Math.max(maxGrade, Math.abs(g));
  }
  line(`   height ${lo.toFixed(2)} .. ${hi.toFixed(2)} over 60 km ` +
       (lo >= -0.001 ? "(never below y=0, so never under the sea ✔)" : "(!! DIPS BELOW THE SEA)"));
  line(`   steepest grade ${(maxGrade * 100).toFixed(1)}% — over the 320-unit view that is ` +
       `${(maxGrade * 320).toFixed(0)} units of rise/fall`);
  line(`   non-finite samples: ${bad} ${bad === 0 ? "✔" : "!!"}`);
}

// ── O. THE SLINGSHOT, EXECUTED ───────────────────────────────────────────────
// The bots are crude, so "how often does a bot land one" says more about the bot
// than the mechanic. This is the mechanic itself, driven by hand: close on one
// car, brake to hold station in its tow, then break out just far enough to
// squeeze past. If a player who does exactly the right thing cannot make this
// register, the move does not exist however good the numbers look.
line("\nO. SLINGSHOT — a scripted, perfect execution");
{
  const sys = T.makeTrafficSystem();
  sys.nextRowZ = 1e9;                       // no spawning; one hand-placed car
  const skin = T.TRAFFIC_TYPES[0];
  const car = {
    skin, z: 120, x: 0, laneIdx: 2, speed: PHYS.cruiseSpeed * skin.speedMul,
    cruise: PHYS.cruiseSpeed * skin.speedMul, passed: false, nearMissed: false,
    smashed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0,
  };
  sys.list.push(car);

  const p = makePlayer();
  const h = H.makeHeat(); h.v = 0.5;
  const before = h.v;
  let t = 0, draftStreak = 0, draftHeldFor = 0, draftSince = 1e9, draftCar = null;
  let heldPeak = 0, fired = null, phase = "close";

  while (t < 14 && !fired) {
    const dz = car.z - p.z, dx = car.x - p.x;
    let steer = 0, brake = false;
    if (phase === "close") {
      if (dz < 22) phase = "tow";
      steer = Math.abs(dx) < 1 ? 0 : Math.sign(dx);
    }
    if (phase === "tow") {
      brake = dz < 20;                       // hold station in the wake
      steer = Math.abs(dx) < 1 ? 0 : Math.sign(dx);
      if (draftStreak > 1.2) phase = "break";
    }
    // Hold the line rather than steering until it is reached: full lock carries
    // ~9 extra units after release, which overshoots the near-miss band.
    if (phase === "break") {
      const want = car.x - 13;
      steer = Math.abs(want - p.x) < 1.5 ? 0 : Math.sign(want - p.x);
    }

    p.throttle01 = H.heatSpeed01(h);
    updatePlayer(p, DT, { steer, brake }, {});
    draftSince += DT;
    T.updateTraffic(sys, DT, p.z, {
      playerX: p.x, playerY: p.y, onPassed: () => {},
      onNearMiss: (tight, c) => {
        const slung = c === draftCar && draftHeldFor >= SLINGSHOT.minDraft && draftSince <= SLINGSHOT.window;
        H.addHeat(h, (HEAT.nearMiss + HEAT.nearMissTight * tight) * (slung ? SLINGSHOT.heatMul : 1));
        fired = { slung, tight, gap: draftSince };
      },
    });
    const d = T.draftTarget(sys, p.x, p.z, p.y);
    if (d) {
      draftStreak += DT; draftCar = d.car; heldPeak = Math.max(heldPeak, draftStreak);
      H.addHeat(h, HEAT.draftRate * d.closeness * H.draftFalloff(draftStreak) * DT);
    } else if (draftStreak > 0) {
      draftHeldFor = draftStreak; draftSince = 0; draftStreak = 0;
    }
    H.updateHeat(h, DT, {});
    t += DT;
  }

  line(`   tow held ${heldPeak.toFixed(2)}s, broke out, ` +
       (fired
         ? `shave ${fired.slung ? "REGISTERED AS A SLINGSHOT ✔" : "landed but NOT counted !!"} ` +
           `(tightness ${fired.tight.toFixed(2)}, ${fired.gap.toFixed(2)}s after leaving the tow)`
         : "never got past the car !!"));
  line(`   heat ${(before * 100).toFixed(0)}% → ${(h.v * 100).toFixed(0)}% over ${t.toFixed(1)}s ` +
       `(net ${((h.v - before) * 100 >= 0 ? "+" : "")}${((h.v - before) * 100).toFixed(0)} points of bar) ` +
       (h.v > before ? "✔ the move pays" : "!! the move loses"));

  // What the technique is actually WORTH, next to just blasting past the same
  // car. This is the number that decides whether the brake is a skill or a trap.
  const tight = fired ? fired.tight : 0.6;
  const plainHeat = HEAT.nearMiss + HEAT.nearMissTight * tight;
  const slungHeat = plainHeat * SLINGSHOT.heatMul;
  const towHeat = 0.42 * (() => {             // ~1.35s of tow at ~75% closeness
    let acc = 0;
    for (let k = 0; k < Math.round(1.35 / DT); k++) acc += 0.75 * H.draftFalloff(k * DT) * DT;
    return acc;
  })();
  const plainScore = SCORE.nearMissBonus * (1 + SCORE.precisionMax * tight);
  const slungScore = plainScore * SLINGSHOT.scoreMul;
  line(`   plain shave: +${(plainHeat * 100).toFixed(1)} bar, ${Math.round(plainScore)} pts`);
  line(`   tow + slingshot: +${((towHeat + slungHeat) * 100).toFixed(1)} bar, ${Math.round(slungScore)} pts ` +
       `→ ${((towHeat + slungHeat) / plainHeat).toFixed(1)}x the fuel, ${(slungScore / plainScore).toFixed(1)}x the points`);
}
