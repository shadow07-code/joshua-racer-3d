// Continuous civilian traffic — the player weaves around it. PORTED from the 2D
// reference src/entities/traffic.js: row-based spawning with one guaranteed gap
// lane (shifts ≤1 row-to-row, rare ±2 "tough rows"), the no-collision AI
// (gap-wait drift + car-following/braking), turn-signal lead-ins, and the
// evasion-friendly checkTrafficHit AABB. Only the drawing is gone — render3d/
// vehicles.js renders sys.list. Collision is pure (x, z); the road curve never
// touches it.
import { PHYS, ROAD, RACE } from "../config.js";

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
function laneToX(laneIdx) {
  const laneW = (ROAD.halfWidth * 2) / LANES;
  return -ROAD.halfWidth + laneW * (laneIdx + 0.5);
}

export function makeTrafficSystem(opts = {}) {
  return {
    list: [],
    nextRowZ: 80,
    lastGapLane: 2,
    rowGapZ: opts.rowGapZ || SPAWN_ROW_GAP,
    densityMul: 1.0,
    passedCount: 0,
    rowsSpawned: 0,
  };
}
export const SPAWN_ROW_GAP = 94;   // base spacing (density scaling divides this)

function spawnRow(sys) {
  const r = Math.random();
  let shift;
  if (r < 0.05) shift = Math.random() < 0.5 ? -2 : 2;
  else if (r < 0.35) shift = -1;
  else if (r < 0.65) shift = 0;
  else shift = 1;
  let gap = sys.lastGapLane + shift;
  if (gap < 0) gap = 0;
  if (gap >= LANES) gap = LANES - 1;
  sys.lastGapLane = gap;

  const wide = sys.rowsSpawned < 4;
  const gap2 = wide ? (gap + (Math.random() < 0.5 ? -1 : 1)) : -99;

  const candidateLanes = [];
  for (let i = 0; i < LANES; i++) {
    if (i === gap || i === gap2) continue;
    candidateLanes.push(i);
  }
  for (let i = candidateLanes.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [candidateLanes[i], candidateLanes[j]] = [candidateLanes[j], candidateLanes[i]];
  }

  let carsInRow = 1;
  const dm = sys.densityMul || 1;
  if (!wide && dm > 1.12) {
    const p2 = Math.min(0.6, (dm - 1.12) * 1.1);
    if (Math.random() < p2) carsInRow = 2;
  }
  const lanesToFill = candidateLanes.slice(0, Math.min(carsInRow, candidateLanes.length));

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

  sys.nextRowZ += sys.rowGapZ + (Math.random() * 6 - 3);
  sys.rowsSpawned++;
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

  if (clearAheadDist > 0) {
    for (const c of sys.list) {
      if (!c.smashed && c.z > playerZ + 2 && c.z < playerZ + clearAheadDist) smashCar(c, 0);
    }
  }

  const halfRoad = ROAD.halfWidth;
  for (const c of sys.list) {
    if (c.smashed) { c.x += c.vx * dt; c.z += c.vz * dt; continue; }
    c.z += c.speed * dt;

    if (c.signalT > 0) {
      c.signalT -= dt;
      if (c.signalT <= 0) c.driftVx = c.pendingDriftVx;
    }
    if (c.driftVx && !driftBlocked(sys.list, c)) {
      c.x += c.driftVx * dt;
      const lim = halfRoad - 6;
      if (c.x >= lim) { c.x = lim; c.driftVx = 0; }
      else if (c.x <= -lim) { c.x = -lim; c.driftVx = 0; }
    }

    if (!c.passed && c.z < playerZ - 4) {
      c.passed = true; sys.passedCount++; cbs?.onPassed?.();
    }
    if (!c.nearMissed && c.passed && Math.abs(c.z - playerZ) < 18) {
      if (Math.abs(c.x - (cbs?.playerX ?? 0)) < 18) { c.nearMissed = true; cbs?.onNearMiss?.(); }
    }
  }

  resolveTrafficSeparation(sys, dt);
  sys.list = sys.list.filter(c => c.z > playerZ - 50);
}

function resolveTrafficSeparation(sys, dt) {
  const cars = sys.list;
  cars.sort((a, b) => a.z - b.z);
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.smashed) continue;
    let leader = null, gap = 0, minGap = 0;
    for (let j = i + 1; j < cars.length; j++) {
      const o = cars[j];
      if (o.smashed) continue;
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
// a great dodge, not a cheap death. Ported verbatim.
const HIT_SCALE = 0.92;
export function checkTrafficHit(sys, box) {
  for (const c of sys.list) {
    if (c.smashed) continue;
    const hx = skinHalfX(c.skin) * HIT_SCALE, hz = skinHalfZ(c.skin) * HIT_SCALE;
    const x1 = c.x - hx * 0.70, x2 = c.x + hx * 0.70;
    const z1 = c.z - hz * 0.34, z2 = c.z + hz * 0.34;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return c;
  }
  return null;
}
