// Headless sim assertions for Joshua Racer 3D — run with `node tools/simtest.mjs`.
// config.js, player.js, traffic.js, gearbox.js and scoring.js are pure logic with no
// DOM or Three.js, so the whole simulation can be stepped and measured in plain node.
// This is the fast path for anything that is not visual; see HANDOFF.md §6.
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const imp = (p) => import(pathToFileURL(join(SRC, p)).href);

const { PHYS, ONCOMING, NITRO, JUMP, ROAD } = await imp("config.js");
const { makeHeat, heatSpeed01 } = await imp("heat.js");
const { makePlayer, updatePlayer, playerBox, launchPlayer } = await imp("entities/player.js");
const T = await imp("entities/traffic.js");

const DT = 1 / 60;
const noInput = { steer: 0 };

// ── 1. Jump arc ──────────────────────────────────────────────────────────────
{
  const p = makePlayer();
  p.speed = PHYS.maxSpeed; p.raceTime = 200;
  let air = null, peak = 0, z0;
  launchPlayer(p);
  z0 = p.z;
  for (let i = 0; i < 400 && air === null; i++) {
    updatePlayer(p, DT, noInput, { onLand: (a) => { air = a; } });
    peak = Math.max(peak, p.y);
  }
  const dist = p.z - z0;
  console.log(`1. JUMP     air=${air.toFixed(2)}s peak=${peak.toFixed(1)}u distance=${dist.toFixed(0)}u  (${(dist / 94).toFixed(1)} traffic rows cleared)`);
  console.log(`   after landing: y=${p.y} vy=${p.vy} airborne=${p.airborne} speed kept=${(p.speed / PHYS.maxSpeed * 100).toFixed(0)}%`);
}

// ── 2. Air steering authority is reduced, not zero ───────────────────────────
{
  const mk = (airborne) => {
    const p = makePlayer(); p.speed = PHYS.maxSpeed; p.raceTime = 200;
    if (airborne) { launchPlayer(p); p.vy = 999; }   // stay up for the whole sample
    for (let i = 0; i < 30; i++) updatePlayer(p, DT, { steer: 1 }, {});
    return p.x;
  };
  const ground = mk(false), sky = mk(true);
  console.log(`2. AIRSTEER ground drift=${ground.toFixed(1)}u  airborne=${sky.toFixed(1)}u  ratio=${(sky / ground).toFixed(2)} (config ${JUMP.airSteer})`);
}

// ── 3. Opposing traffic: closes on the player, stays in its lane ─────────────
{
  const sys = T.makeTrafficSystem();
  T.prepopulateTraffic(sys, 500);
  const p = makePlayer(); p.speed = PHYS.maxSpeed; p.raceTime = 200;
  T.startOncoming(sys, p.z);
  let onc = 0, minGapSeen = 1e9, laneMin = 1e9, laneMax = -1e9, withFlowMin = 1e9;
  let nearMiss = 0, oncNearMiss = 0;
  for (let i = 0; i < 60 * 90; i++) {
    updatePlayer(p, DT, noInput, {});
    T.updateTraffic(sys, DT, p.z, {
      playerX: p.x, playerY: p.y,
      onPassed: () => {},
      onNearMiss: (t, c) => { nearMiss++; if (c && c.oncoming) oncNearMiss++; },
    });
    for (const c of sys.list) {
      if (c.oncoming) { laneMin = Math.min(laneMin, c.x); laneMax = Math.max(laneMax, c.x); }
      else if (!c.smashed) withFlowMin = Math.min(withFlowMin, c.x);
    }
  }
  onc = sys.list.filter((c) => c.oncoming).length;
  // Encounter rate: how often does the player meet one?
  console.log(`3. ONCOMING live=${onc} in flight, lane x range=[${laneMin.toFixed(1)},${laneMax.toFixed(1)}] (lane ${ONCOMING.lane} centre ${(-ROAD.halfWidth + (ROAD.halfWidth * 2 / ROAD.laneCount) * 0.5).toFixed(1)})`);
  console.log(`   same-direction cars never cross x=${withFlowMin.toFixed(1)}  → separation from opposing lane = ${(withFlowMin - laneMax).toFixed(1)}u`);
  console.log(`   near-misses in 90s: ${nearMiss} total, ${oncNearMiss} head-on (player drove straight down the centre, so 0 head-on is correct)`);
}

// ── 4. Encounter cadence + gap lane never the opposing lane ──────────────────
{
  const sys = T.makeTrafficSystem();
  T.prepopulateTraffic(sys, 500);
  const p = makePlayer(); p.speed = PHYS.maxSpeed; p.raceTime = 200;
  T.startOncoming(sys, p.z);
  const seen = new Set();
  let meets = 0, gapLaneViolations = 0, rowCarsInOncomingLane = 0;
  const laneOf = (x) => Math.floor((x + ROAD.halfWidth) / (ROAD.halfWidth * 2 / ROAD.laneCount));
  for (let i = 0; i < 60 * 120; i++) {
    updatePlayer(p, DT, noInput, {});
    T.updateTraffic(sys, DT, p.z, { playerX: p.x, playerY: p.y, onPassed: () => {}, onNearMiss: () => {} });
    if (sys.lastGapLane === ONCOMING.lane) gapLaneViolations++;
    for (const c of sys.list) {
      if (!c.oncoming && !c.smashed && laneOf(c.x) === ONCOMING.lane) rowCarsInOncomingLane++;
      if (c.oncoming && c.passed && !seen.has(c)) { seen.add(c); meets++; }
    }
  }
  console.log(`4. CADENCE  met ${meets} opposing cars in 120s → one every ${(120 / meets).toFixed(1)}s`);
  console.log(`   gap lane == opposing lane on ${gapLaneViolations} frames (must be 0)`);
  console.log(`   with-flow cars found in the opposing lane: ${rowCarsInOncomingLane} (must be 0)`);
}

// ── 5. Nitro + ramps spawn, and boost actually raises the speed cap ──────────
{
  const sys = T.makeTrafficSystem();
  T.prepopulateTraffic(sys, 500);
  const p = makePlayer(); p.speed = PHYS.maxSpeed; p.raceTime = 200;
  let nitroSeen = 0, rampSeen = 0, riskyN = 0;
  const seenN = new Set(), seenR = new Set();
  for (let i = 0; i < 60 * 120; i++) {
    updatePlayer(p, DT, noInput, {});
    if (i === 60 * 34) T.startOncoming(sys, p.z);
    T.updateTraffic(sys, DT, p.z, { playerX: p.x, playerY: p.y, onPassed: () => {}, onNearMiss: () => {} });
    for (const n of sys.nitros) if (!seenN.has(n)) { seenN.add(n); nitroSeen++; if (n.risky) riskyN++; }
    for (const r of sys.ramps) if (!seenR.has(r)) { seenR.add(r); rampSeen++; }
  }
  const dist = p.z;
  console.log(`5. PICKUPS  over ${(dist / 1000).toFixed(1)}k units / 120s: ${nitroSeen} nitro (${riskyN} in the opposing lane), ${rampSeen} ramps`);
  console.log(`   → a ramp every ${(dist / rampSeen).toFixed(0)}u (config min gap ${JUMP.minGapZ}u), nitro every ${(120 / nitroSeen).toFixed(1)}s`);

  // Speed tracks the throttle the HEAT model asks for — the thing that replaced
  // the old race-time ramp. Detailed balance lives in tools/heattest.mjs.
  const q = makePlayer(); q.speed = PHYS.maxSpeed * 0.6;
  const kmh = (v) => (v / PHYS.maxSpeed * PHYS.topSpeedKmh).toFixed(0);
  q.throttle01 = 0.6;
  for (let i = 0; i < 300; i++) updatePlayer(q, DT, noInput, {});
  const cold = q.speed;
  q.throttle01 = 1.0;
  for (let i = 0; i < 600; i++) updatePlayer(q, DT, noInput, {});
  console.log(`   throttle 0.60 → ${kmh(cold)} km/h, throttle 1.00 → ${kmh(q.speed)} km/h (speed IS heat)`);
}

// ── 6. Airborne immunity: traffic, coins and near-misses all switch off ──────
{
  const sys = T.makeTrafficSystem();
  sys.list.push({ skin: T.TRAFFIC_TYPES[0], x: 0, z: 100, speed: 0, cruise: null, passed: false, nearMissed: false, smashed: false, driftVx: 0, signalT: 0 });
  sys.coins.push({ x: 0, z: 100, got: false });
  sys.nitros.push({ x: 0, z: 100, got: false });
  const p = makePlayer(); p.x = 0; p.z = 100;
  const box = playerBox(p);
  const ground = { hit: !!T.checkTrafficHit(sys, box, 0), coin: T.checkCoinGrab(sys, box, 0), nitro: T.checkNitroGrab(sys, box, 0) };
  sys.coins[0].got = false; sys.nitros[0].got = false;
  const air = { hit: !!T.checkTrafficHit(sys, box, 15), coin: T.checkCoinGrab(sys, box, 15), nitro: T.checkNitroGrab(sys, box, 15) };
  console.log(`6. AIRBORNE on the road: hit=${ground.hit} coin=${ground.coin} nitro=${ground.nitro}`);
  console.log(`   15u up:      hit=${air.hit} coin=${air.coin} nitro=${air.nitro}   (all must be false/0)`);
}

// ── 8. Ramp trigger fires exactly once ───────────────────────────────────────
{
  const sys = T.makeTrafficSystem();
  sys.ramps.push({ x: 0, z: 200, used: false });
  const p = makePlayer(); p.x = 0; p.z = 100; p.speed = PHYS.maxSpeed; p.raceTime = 200;
  let hits = 0, launched = 0, lands = 0;
  for (let i = 0; i < 60 * 6; i++) {
    updatePlayer(p, DT, noInput, { onLand: () => lands++ });
    const r = T.checkRampHit(sys, playerBox(p), p.y);
    if (r) { hits++; if (launchPlayer(p)) launched++; }
  }
  console.log(`8. RAMP     triggered ${hits}× (must be 1), launched ${launched}×, landed ${lands}×`);
  // Off-lane car should NOT trigger it.
  const sys2 = T.makeTrafficSystem();
  sys2.ramps.push({ x: 0, z: 200, used: false });
  const q = makePlayer(); q.x = 30; q.z = 100; q.speed = PHYS.maxSpeed; q.raceTime = 200;
  let miss = 0;
  for (let i = 0; i < 60 * 6; i++) { updatePlayer(q, DT, noInput, {}); if (T.checkRampHit(sys2, playerBox(q), q.y)) miss++; }
  console.log(`   30u off the ramp lane: triggered ${miss}× (must be 0)`);
}
