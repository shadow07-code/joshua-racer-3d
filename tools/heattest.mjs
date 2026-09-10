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

const { PHYS, HEAT, ONCOMING, SCORE } = await imp("config.js");
const H = await imp("heat.js");
const { makePlayer, updatePlayer, playerBox } = await imp("entities/player.js");
const T = await imp("entities/traffic.js");

const DT = 1 / 60;
const line = (s) => console.log(s);

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
  const h = H.makeHeat(); h.v = 0.5;
  let t = 0;
  while (t < 60) { H.addHeat(h, HEAT.draftRate * 0.7 * DT); H.updateHeat(h, DT, {}); t += DT; }
  line(`   drafting non-stop at 70% closeness (an UPPER BOUND — you cannot hold a
   slipstream, you always close on the bumper) → settles at ${(h.v * 100).toFixed(0)}% (a HOLD, not a climb — by design)`);
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
  while (t < seconds && !h.dead) {
    const steer = policy(sys, p, h);
    p.throttle01 = H.heatSpeed01(h);
    updatePlayer(p, DT, { steer }, {});
    sys.densityMul = H.heatDensity(h);
    T.updateTraffic(sys, DT, p.z, {
      playerX: p.x, playerY: p.y,
      onPassed: () => {},
      onNearMiss: (tight, c) => {
        nearMisses++;
        H.addHeat(h, (HEAT.nearMiss + HEAT.nearMissTight * tight) * (c && c.oncoming ? HEAT.oncomingMul : 1));
      },
    });
    const d = T.draftTarget(sys, p.x, p.z, p.y);
    if (d) { draftTime += DT; H.addHeat(h, HEAT.draftRate * d.closeness * DT); }
    if (!h.overdrive && p.invuln <= 0) {
      const hit = T.checkTrafficHit(sys, playerBox(p), p.y);
      if (hit) {
        T.smashCar(hit, p.x);
        crashes++;
        p.speed = Math.max(PHYS.startSpeed * 0.5, p.speed * 0.5);
        p.invuln = 1.4;
        H.addHeat(h, -HEAT.crash);
      }
    }
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - DT);
    H.updateHeat(h, DT, {});
    maxHeat = Math.max(maxHeat, h.v);
    score += Math.max(0, p.z - lastZ) * SCORE.distanceWeight * H.heatScoreMul(h);
    lastZ = p.z;
    t += DT;
  }
  return { t, h, score, crashes, nearMisses, draftTime, maxHeat };
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

for (const [name, pol] of [["COWARD (never risks)", coward], ["RACER (plays the line)", racer]]) {
  const r = runBot(pol, 120);
  const verdict = r.h.dead ? `DIED at ${r.t.toFixed(0)}s` : `alive at 120s`;
  line(`   ${name.padEnd(24)} ${verdict.padEnd(18)} peak heat ${(r.maxHeat * 100).toFixed(0)}%  ` +
       `shaves ${r.nearMisses}  draft ${r.draftTime.toFixed(0)}s  crashes ${r.crashes}  score ${Math.round(r.score).toLocaleString()}`);
}

// ── F. Score calibration for the letter grades ───────────────────────────────
line("\nF. SCORE RATES (for GRADES thresholds)");
{
  const r = runBot(racer, 90);
  line(`   a competent 90s run scores about ${Math.round(r.score).toLocaleString()}`);
  const rate = r.score / Math.max(1, r.t);
  line(`   ≈ ${Math.round(rate).toLocaleString()}/s — so 60s≈${Math.round(rate * 60).toLocaleString()}, ` +
       `120s≈${Math.round(rate * 120).toLocaleString()}, 240s≈${Math.round(rate * 240).toLocaleString()}`);
}
