// Continuous civilian traffic — the player weaves around it. PORTED from the 2D
// reference src/entities/traffic.js: row-based spawning with one guaranteed gap
// lane (shifts ≤1 row-to-row, rare ±2 "tough rows"), the no-collision AI
// (gap-wait drift + car-following/braking), turn-signal lead-ins, and the
// evasion-friendly checkTrafficHit AABB. Only the drawing is gone — render3d/
// vehicles.js renders sys.list. Collision is pure (x, z); the road curve never
// touches it.
//
// 3D-only additions, all still pure (x, z) scalar sim:
//   • an OPPOSING carriageway in the outermost lane (cars with negative speed),
//   • NITRO canisters, biased into that lane once it is live,
//   • RAMPS on the open gap lane, which launch the player (player.js owns the arc).
import { PHYS, ROAD, RACE, SCORE, ONCOMING, NITRO, JUMP, HEAT } from "../config.js";

const LANES = ROAD.laneCount;

// Vehicle types — dimensions (w lateral, h longitudinal) match the original
// skins (collision half-sizes = w/2, h/2), plus a 3D height + colour + shape so
// vehicles.js can build the mesh. Big = slow (lower speedMul).
export const TRAFFIC_TYPES = [
  { shape: "sedan", w: 9, h: 14, height: 4.0, speedMul: 0.30, color: 0xb9c0c9 },
  { shape: "sedan", w: 9, h: 14, height: 4.0, speedMul: 0.30, color: 0x3b6fb0 },
  { shape: "sedan", w: 9, h: 14, height: 4.0, speedMul: 0.32, color: 0xb02a2a },
  { shape: "sedan", w: 9, h: 14, height: 4.0, speedMul: 0.28, color: 0x3c424c},
  { shape: "sedan", w: 9, h: 14, height: 4.0, speedMul: 0.30, color: 0xe8e8ea },
  { shape: "taxi",  w: 9, h: 14, height: 4.2, speedMul: 0.32, color: 0xf5c518 },
  { shape: "suv",   w: 9, h: 16, height: 5.6, speedMul: 0.24, color: 0xe8e8ea },
  { shape: "suv",   w: 9, h: 16, height: 5.6, speedMul: 0.22, color: 0x3c424c},
  { shape: "suv",   w: 9, h: 16, height: 5.6, speedMul: 0.24, color: 0x35506f },
  { shape: "truck", w: 9, h: 18, height: 7.5, speedMul: 0.18, color: 0x2f5a8f },
  { shape: "truck", w: 9, h: 18, height: 7.5, speedMul: 0.18, color: 0xe8e8ea },
  { shape: "truck", w: 9, h: 18, height: 7.5, speedMul: 0.20, color: 0xc8631f },
  { shape: "bus",   w: 10, h: 22, height: 8.5, speedMul: 0.16, color: 0xe8e8ea },
  { shape: "bus",   w: 10, h: 22, height: 8.5, speedMul: 0.16, color: 0xd2691e },
];

function skinHalfX(s) { return s.w / 2; }
function skinHalfZ(s) { return s.h / 2; }
function pickSkin() { return TRAFFIC_TYPES[(Math.random() * TRAFFIC_TYPES.length) | 0]; }
const LANE_W = (ROAD.halfWidth * 2) / LANES;
function laneToX(laneIdx) { return -ROAD.halfWidth + LANE_W * (laneIdx + 0.5); }

// Once the opposing lane is live, same-direction cars must never wander into it —
// this is the inner edge of their world.
const WITH_FLOW_MIN_X = -ROAD.halfWidth + LANE_W * (ONCOMING.lane + 1) + 4;

export function makeTrafficSystem(opts = {}) {
  return {
    list: [],
    coins: [],                   // gold coins scattered down the open gap lane
    nitros: [],                  // nitro canisters (gap lane, or the risky one)
    ramps: [],                   // launch ramps on the open gap lane
    nextRowZ: 80,
    lastGapLane: 2,
    rowGapZ: opts.rowGapZ || SPAWN_ROW_GAP,
    densityMul: 1.0,
    passedCount: 0,
    rowsSpawned: 0,
    oncomingOn: false,           // is the opposing carriageway live yet?
    nextOncomingZ: 0,
    lastRampZ: -1e9,
  };
}
// BASE SPACING BETWEEN ROWS — the number that decides whether the game can be
// played at all. Density divides it, so it has to be generous enough that even
// the tightest sector at full heat leaves time to see a row, pick the gap and
// get there. At 80 it did not: the worst case was 17 units, which at 108 u/s is
// a fifth of a second, against a ~0.40s lane change. See tools/densitytest.mjs —
// that tool exists because this was wrong for months and nothing measured it.
export const SPAWN_ROW_GAP = 125;

function spawnRow(sys) {
  const r = Math.random();
  let shift;
  if (r < 0.05) shift = Math.random() < 0.5 ? -2 : 2;
  else if (r < 0.35) shift = -1;
  else if (r < 0.65) shift = 0;
  else shift = 1;
  let gap = sys.lastGapLane + shift;
  // The guaranteed gap can never be the opposing lane — that lane is not a way
  // through, it is the hazard, and every row must stay threadable without it.
  const minLane = sys.oncomingOn ? ONCOMING.lane + 1 : 0;
  if (gap < minLane) gap = minLane;
  if (gap >= LANES) gap = LANES - 1;
  sys.lastGapLane = gap;

  const wide = sys.rowsSpawned < 4;
  const gap2 = wide ? (gap + (Math.random() < 0.5 ? -1 : 1)) : -99;

  const candidateLanes = [];
  for (let i = 0; i < LANES; i++) {
    if (i === gap || i === gap2) continue;
    if (sys.oncomingOn && i === ONCOMING.lane) continue;   // reserved for opposing traffic
    candidateLanes.push(i);
  }
  for (let i = candidateLanes.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [candidateLanes[i], candidateLanes[j]] = [candidateLanes[j], candidateLanes[i]];
  }

  // HOW MANY CARS PER ROW. Once it was one, which was too few to weave through.
  // Then it was "density fills every lane but the guaranteed gap", which was far
  // too many: with the opposing lane live there are only three usable lanes left,
  // so a full row left exactly ONE way through, and the gap moves between rows.
  // Threading a single shifting slot at a fifth of a second per row is not
  // difficulty, it is a coin flip.
  //
  // So: ALWAYS LEAVE A SPARE. Besides the guaranteed gap there is at least one
  // more open lane, which means a row can be read and driven rather than
  // memorised — and the guaranteed gap goes back to being the IDEAL line rather
  // than the only survivable one.
  const dm = sys.densityMul || 1;
  let carsInRow = 1;
  if (!wide) {
    const extra = Math.max(0, dm - 1) * 1.5;
    carsInRow = 2 + Math.floor(extra) + (Math.random() < (extra % 1) ? 1 : 0);
  }
  const spare = candidateLanes.length >= 3 ? 1 : 0;
  const cap = Math.max(1, candidateLanes.length - spare);
  const lanesToFill = candidateLanes.slice(0, Math.min(carsInRow, cap));

  for (const lane of lanesToFill) {
    const skin = pickSkin();
    const x = laneToX(lane);
    const jitter = (Math.random() - 0.5) * 4;
    const speed = PHYS.cruiseSpeed * (skin.speedMul + (Math.random() * 0.08 - 0.02));
    const drift = Math.random() < 0.60 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    sys.list.push({
      skin, z: sys.nextRowZ + jitter, x, laneIdx: lane,
      speed, cruise: speed, passed: false, nearMissed: false, smashed: false,
      driftVx: 0, pendingDriftVx: drift * (6 + Math.random() * 5),
      signalT: drift ? 0.7 + Math.random() * 0.8 : 0,
      sigPhase: Math.random() * 560,
    });
  }

  // Occasional COIN TRAIL down the open gap lane — the ideal weaving line. The
  // gap shifts ≤1 lane/row, so successive trails form a dotted line that follows
  // the weave. Skipped during the gentle opening rows.
  if (!wide && Math.random() < RACE.coinRowChance) {
    const cx = laneToX(gap);
    const n = RACE.coinsPerTrail || 3;
    for (let i = 0; i < n; i++) {
      sys.coins.push({ x: cx, z: sys.nextRowZ - i * (sys.rowGapZ / n), got: false });
    }
  }

  // NITRO. Before the opposing lane is live it sits on the safe weaving line, so
  // the player learns what a canister is for free; afterwards most of them move
  // into the opposing lane, and the same grab becomes a genuine gamble.
  if (!wide && Math.random() < NITRO.chance) {
    const risky = sys.oncomingOn && Math.random() < NITRO.riskyLaneChance;
    sys.nitros.push({ x: laneToX(risky ? ONCOMING.lane : gap), z: sys.nextRowZ, got: false, risky });
  }

  // RAMP, on the open gap lane. Deliberately on the SAFE line rather than buried
  // in traffic: a ramp is a reward for reading the weave, not a trap, and the air
  // it buys (no collisions up there) is the payoff.
  if (!wide && sys.nextRowZ - sys.lastRampZ > JUMP.minGapZ && Math.random() < JUMP.chance) {
    sys.ramps.push({ x: laneToX(gap), z: sys.nextRowZ, used: false });
    sys.lastRampZ = sys.nextRowZ;
  }

  sys.nextRowZ += sys.rowGapZ + (Math.random() * 6 - 3);
  sys.rowsSpawned++;
}

// One car on the opposing carriageway: same skins, negative speed, no lane AI.
function spawnOncoming(sys) {
  const skin = pickSkin();
  const speed = -PHYS.cruiseSpeed * (ONCOMING.speedMul + Math.random() * 0.06);
  sys.list.push({
    skin, z: sys.nextOncomingZ, x: laneToX(ONCOMING.lane) + (Math.random() - 0.5) * 3,
    laneIdx: ONCOMING.lane, oncoming: true,
    speed, cruise: null, passed: false, nearMissed: false, smashed: false,
    driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0,
  });
  const dm = sys.densityMul || 1;
  sys.nextOncomingZ += (ONCOMING.gap + Math.random() * ONCOMING.gapJitter) / dm;
}

// Flip the opposing carriageway on, seeding it far enough out that the first car
// arrives as a visible approach rather than a materialisation.
//
// Cars already in that lane have to leave it, or the first opposing car will
// drive straight through one. Anything still out in the fog is simply moved;
// anything close enough to see pulls over under its own steam.
export function startOncoming(sys, playerZ) {
  if (sys.oncomingOn) return;
  sys.oncomingOn = true;
  sys.nextOncomingZ = playerZ + ONCOMING.spawnAhead;
  if (sys.lastGapLane <= ONCOMING.lane) sys.lastGapLane = ONCOMING.lane + 1;
  for (const c of sys.list) {
    if (c.smashed || c.oncoming || c.x >= WITH_FLOW_MIN_X) continue;
    if (c.z > playerZ + 150) c.x = WITH_FLOW_MIN_X;
    else { c.driftVx = 11; c.pendingDriftVx = 11; c.signalT = 0; c.evadeTo = WITH_FLOW_MIN_X; }
  }
}

export function prepopulateTraffic(sys, distance = 600) {
  while (sys.nextRowZ < distance) spawnRow(sys);
}

function driftBlocked(cars, c) {
  const dir = c.driftVx > 0 ? 1 : -1;
  const cHx = skinHalfX(c.skin), cHz = skinHalfZ(c.skin);
  for (const o of cars) {
    if (o === c || o.smashed) continue;
    if (Math.abs(o.z - c.z) >= cHz + skinHalfZ(o.skin) + 6) continue;
    const dx = (o.x - c.x) * dir;
    if (dx <= 0) continue;
    if (dx < cHx + skinHalfX(o.skin) + 8) return true;
  }
  return false;
}

export function smashCar(c, fromX = 0) {
  if (c.smashed) return;
  c.smashed = true;
  const dir = c.x >= fromX ? 1 : -1;
  c.vx = dir * (140 + Math.random() * 70);
  c.vz = -(20 + Math.random() * 25);
}

export function updateTraffic(sys, dt, playerZ, cbs, clearAheadDist = 0) {
  const ahead = playerZ + 220;
  if (clearAheadDist > 0 && sys.nextRowZ < playerZ + clearAheadDist) sys.nextRowZ = playerZ + clearAheadDist;
  while (sys.nextRowZ < ahead) spawnRow(sys);
  if (sys.oncomingOn) {
    while (sys.nextOncomingZ < playerZ + ONCOMING.spawnAhead) spawnOncoming(sys);
  }

  if (clearAheadDist > 0) {
    for (const c of sys.list) {
      if (!c.smashed && c.z > playerZ + 2 && c.z < playerZ + clearAheadDist) smashCar(c, 0);
    }
  }

  // Flying over a row is not a near miss — the shave has to happen at road level.
  const playerY = cbs?.playerY ?? 0;
  const atRoadLevel = playerY < 8;
  const halfRoad = ROAD.halfWidth;
  for (const c of sys.list) {
    if (c.smashed) { c.x += c.vx * dt; c.z += c.vz * dt; continue; }
    c.z += c.speed * dt;               // negative speed = opposing traffic

    if (!c.oncoming) {
      if (c.signalT > 0) {
        c.signalT -= dt;
        if (c.signalT <= 0) c.driftVx = c.pendingDriftVx;
      }
      // An evading car (cleared out of the newly-live opposing lane) drifts to a
      // set target and ignores the blocked test — nudging through is a far better
      // outcome than being stranded in the path of a head-on.
      if (c.driftVx && (c.evadeTo != null || !driftBlocked(sys.list, c))) {
        c.x += c.driftVx * dt;
        const lim = halfRoad - 6;
        const limNeg = sys.oncomingOn ? WITH_FLOW_MIN_X : -lim;
        if (c.evadeTo != null && c.x >= c.evadeTo) { c.x = c.evadeTo; c.driftVx = 0; c.evadeTo = null; }
        else if (c.x >= lim) { c.x = lim; c.driftVx = 0; }
        else if (c.x <= limNeg) { c.x = limNeg; c.driftVx = 0; }
      }
    }

    if (!c.passed && c.z < playerZ - 4) {
      c.passed = true; sys.passedCount++; cbs?.onPassed?.();
    }
    if (!c.nearMissed && c.passed && Math.abs(c.z - playerZ) < 18) {
      const dx = Math.abs(c.x - (cbs?.playerX ?? 0));
      if (dx < 18 && atRoadLevel) {
        c.nearMissed = true;
        // Edge-to-edge lateral clearance → tightness 0..1 (1 = a pixel-close shave).
        const clearance = Math.max(0, dx - (skinHalfX(c.skin) + PHYS.carHalfWidth));
        const tightness = Math.max(0, 1 - clearance / SCORE.precisionPx);
        cbs?.onNearMiss?.(tightness, c);
      }
    }
  }

  resolveTrafficSeparation(sys, dt);
  sys.list = sys.list.filter(c => c.z > playerZ - 50);
  // Drop pickups/props once used or scrolled past.
  sys.coins = sys.coins.filter(c => !c.got && c.z > playerZ - 20);
  sys.nitros = sys.nitros.filter(n => !n.got && n.z > playerZ - 20);
  sys.ramps = sys.ramps.filter(r => r.z > playerZ - 60);
}

// Grab any coins the player overlaps this frame — returns how many. Generous
// window (coins are a reward), collectible always (even mid-rampage / invuln),
// but not from mid-air: a coin on the tarmac is out of reach 15 units up.
export function checkCoinGrab(sys, box, playerY = 0) {
  if (playerY > 6) return 0;
  let got = 0;
  for (const c of sys.coins) {
    if (c.got) continue;
    if (box.x1 < c.x + 5 && box.x2 > c.x - 5 && box.z1 < c.z + 6 && box.z2 > c.z - 6) { c.got = true; got++; }
  }
  return got;
}

// Same deal for nitro canisters — returns how many were taken this frame.
export function checkNitroGrab(sys, box, playerY = 0) {
  if (playerY > 6) return 0;
  let got = 0;
  for (const n of sys.nitros) {
    if (n.got) continue;
    if (box.x1 < n.x + 6 && box.x2 > n.x - 6 && box.z1 < n.z + 7 && box.z2 > n.z - 7) { n.got = true; got++; }
  }
  return got;
}

// SLIPSTREAM. The nearest same-direction car directly ahead of the player, or
// null. This is the mechanic that turns traffic from an obstacle into fuel: heat
// pours in while you are tucked in behind someone, and faster the closer you get.
//
// The player is much quicker than any civilian car, so a draft cannot be HELD —
// you close on the bumper, hold it as long as your nerve lasts, and swerve out at
// the last moment, which hands you a near-miss on the way past. Two mechanics,
// one fluid move, and no extra button: the ideal line is now a chain rather than
// a dodge. Returns { car, closeness } with closeness 0..1 at the bumper.
export function draftTarget(sys, playerX, playerZ, playerY = 0) {
  if (playerY > 3) return null;
  let best = null, bestDz = Infinity;
  for (const c of sys.list) {
    if (c.smashed || c.oncoming) continue;
    const dz = c.z - playerZ;
    if (dz <= 1 || dz > HEAT.draftRange) continue;
    if (Math.abs(c.x - playerX) > HEAT.draftLateral) continue;
    if (dz < bestDz) { bestDz = dz; best = c; }
  }
  if (!best) return null;
  return { car: best, closeness: 1 - bestDz / HEAT.draftRange };
}

// Did the player just cross a ramp lip at road level? Returns the ramp (once).
const RAMP_HALF_X = LANE_W / 2 - 1;
export function checkRampHit(sys, box, playerY = 0) {
  if (playerY > 0.5) return null;
  for (const r of sys.ramps) {
    if (r.used) continue;
    if (box.z2 < r.z || box.z1 > r.z + 10) continue;
    if (Math.abs((box.x1 + box.x2) / 2 - r.x) > RAMP_HALF_X) continue;
    r.used = true;
    return r;
  }
  return null;
}

function resolveTrafficSeparation(sys, dt) {
  const cars = sys.list;
  cars.sort((a, b) => a.z - b.z);
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    // Opposing traffic has its own empty lane — it neither follows nor is followed.
    if (c.smashed || c.oncoming) continue;
    let leader = null, gap = 0, minGap = 0;
    for (let j = i + 1; j < cars.length; j++) {
      const o = cars[j];
      if (o.smashed || o.oncoming) continue;
      const dz = o.z - c.z;
      if (dz > 45) break;
      const latClear = skinHalfX(c.skin) + skinHalfX(o.skin) + 1.5;
      if (Math.abs(o.x - c.x) >= latClear) continue;
      leader = o; gap = dz;
      minGap = (skinHalfZ(c.skin) + skinHalfZ(o.skin)) * 0.95;
      break;
    }
    const followGap = minGap + 10;
    if (leader && gap < followGap) {
      if (c.speed > leader.speed) {
        const urgency = Math.min(1, (followGap - gap) / 10);
        c.speed += (leader.speed - c.speed) * Math.min(1, dt * (2 + 8 * urgency));
      }
      if (gap < minGap) {
        if (c.speed > leader.speed) c.speed = leader.speed;
        c.z -= Math.min(minGap - gap, 18 * dt);
      }
    } else if (c.cruise != null && c.speed < c.cruise) {
      c.speed = Math.min(c.cruise, c.speed + 6 * dt);
    }
  }
}

// Player-vs-traffic — evasion-friendly: collidable size 8% smaller than the
// model, snug box factors (esp. longitudinal 0.34) so clipping a corner reads as
// a great dodge, not a cheap death. Ported verbatim; airborne cars pass under.
const HIT_SCALE = 0.92;
export function checkTrafficHit(sys, box, playerY = 0) {
  if (playerY > 3) return null;
  for (const c of sys.list) {
    if (c.smashed) continue;
    const hx = skinHalfX(c.skin) * HIT_SCALE, hz = skinHalfZ(c.skin) * HIT_SCALE;
    const x1 = c.x - hx * 0.70, x2 = c.x + hx * 0.70;
    const z1 = c.z - hz * 0.34, z2 = c.z + hz * 0.34;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return c;
  }
  return null;
}
