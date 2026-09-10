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

const { PHYS, HEAT, ONCOMING, SCORE, CHAIN } = await imp("config.js");
const ST = await imp("stages.js");
const RK = await imp("rank.js");
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
  let chain = 0, chainTimer = 0, chainBest = 0, draftStreak = 0, sectorBest = 1;
  const chainMul = () => 1 + Math.min(chain, CHAIN.cap) * CHAIN.step;
  const link = () => { chain++; chainBest = Math.max(chainBest, chain); chainTimer = CHAIN.window; };
  while (t < seconds && !h.dead) {
    const steer = policy(sys, p, h);
    p.throttle01 = H.heatSpeed01(h);
    updatePlayer(p, DT, { steer }, {});
    const sector = ST.sectorAt(ST.sectorIndexAt(p.z));
    sectorBest = Math.max(sectorBest, sector.index);
    sys.densityMul = H.heatDensity(h) * sector.density;
    T.updateTraffic(sys, DT, p.z, {
      playerX: p.x, playerY: p.y,
      onPassed: () => {},
      onNearMiss: (tight, c) => {
        nearMisses++;
        H.addHeat(h, (HEAT.nearMiss + HEAT.nearMissTight * tight) * (c && c.oncoming ? HEAT.oncomingMul : 1) * chainMul());
        link();
      },
    });
    const d = T.draftTarget(sys, p.x, p.z, p.y);
    if (d) { draftTime += DT; draftStreak += DT; H.addHeat(h, HEAT.draftRate * d.closeness * DT); }
    else if (draftStreak > 0) { if (draftStreak > CHAIN.draftMin) link(); draftStreak = 0; }
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
  return { t, h, score, crashes, nearMisses, draftTime, maxHeat, chainBest, sectorBest, dist: p.z };
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
  line(`   ${"".padEnd(24)} reached SECTOR ${r.sectorBest} (${ST.sectorAt(r.sectorBest).name}), ` +
       `best chain ${r.chainBest}, ${Math.round(r.dist).toLocaleString()} m`);
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
