// Police HELICOPTER chase — PORTED from the 2D reference (src/entities/cops.js),
// adapted to 3D world coordinates. Once the player crosses copTriggerKmh a chopper
// flies in ahead, locks onto the player's lane (telegraphed by a reticle), and
// drops a FLAMING BARREL that scrolls toward the player. A barrel hit costs a
// life. First sortie is a single chopper; after that, a zone-locked pair.
import { PHYS, ROAD, RACE } from "../config.js";

const HELI_AHEAD = 78;       // hovers this far ahead of the player (world units)
const HELI_ALT = 34;         // hover altitude
const HELI_HIGH = 100;       // fly-in/out altitude (out of frame)
const AIM_TIME = 1.1, ENTER_TIME = 1.7, EXIT_TIME = 1.7, RELOAD_TIME = 20, FIRST_DELAY = 3;
const SINGLE_SORTIES = 1, SECOND_DROP_DELAY = 1.8, DUAL_DEAD_ZONE = 12;
const BARREL_HALF_X = 5, BARREL_HALF_Z = 5;

function triggerSpeed() { return PHYS.maxSpeed * (RACE.copTriggerKmh / PHYS.topSpeedKmh); }
function leaveSpeed()   { return PHYS.maxSpeed * ((RACE.copTriggerKmh - 15) / PHYS.topSpeedKmh); }
const clampBound = (x, b) => Math.max(-b, Math.min(b, x));

function makeHeli(homeX, dropDelay, swayAmp, zoneMin, zoneMax) {
  return {
    x: homeX, homeX, alt: HELI_HIGH, dropDelay,
    aiming: false, dropped: false, lockX: 0, swayAmp, zoneMin, zoneMax,
    swayPhase: Math.random() * 6.28, swayPhase2: Math.random() * 6.28,
    swayFreq: 0.55 + Math.random() * 0.5, rotorPhase: Math.random() * 6,
    bobPhase: Math.random() * 6, beaconPhase: Math.random() * 6,
  };
}
function swayTargetX(h, bound) {
  let x = h.homeX + Math.sin(h.swayPhase) * h.swayAmp + Math.sin(h.swayPhase2) * h.swayAmp * 0.35;
  x = Math.max(h.zoneMin, Math.min(h.zoneMax, x));
  return clampBound(x, bound);
}

export function makeCopsSystem() {
  return { active: false, phase: "wait", phaseT: FIRST_DELAY, sortie: 0, helis: [], barrels: [] };
}

export function updateCops(sys, dt, playerZ, playerX, playerSpeed, cbs) {
  for (const b of sys.barrels) b.flame += dt;
  sys.barrels = sys.barrels.filter((b) => !b.hit && b.z > playerZ - 50);

  if (!sys.active && playerSpeed >= triggerSpeed()) { sys.active = true; sys.phase = "wait"; sys.phaseT = FIRST_DELAY; sys.helis = []; }
  else if (sys.active && playerSpeed < leaveSpeed()) { sys.active = false; sys.helis = []; }
  if (!sys.active) return;

  const bound = ROAD.halfWidth - 8;
  for (const h of sys.helis) {
    h.rotorPhase += dt; h.bobPhase += dt; h.beaconPhase += dt;
    h.swayPhase += h.swayFreq * dt; h.swayPhase2 += h.swayFreq * 0.41 * dt;
  }

  if (sys.phase === "wait") {
    sys.phaseT -= dt;
    if (sys.phaseT <= 0) {
      const dbl = sys.sortie >= SINGLE_SORTIES;
      if (dbl) {
        const half = DUAL_DEAD_ZONE / 2;
        sys.helis = [
          makeHeli(-bound * 0.5, 0, bound * 0.26, -bound, -half),
          makeHeli(bound * 0.5, SECOND_DROP_DELAY, bound * 0.26, half, bound),
        ];
      } else {
        sys.helis = [makeHeli(0, 0, bound * 0.5, -bound, bound)];
      }
      sys.phase = "enter"; sys.phaseT = ENTER_TIME;
    }
  } else if (sys.phase === "enter") {
    sys.phaseT -= dt;
    const f = 1 - Math.max(0, sys.phaseT) / ENTER_TIME;
    for (const h of sys.helis) { h.alt = HELI_HIGH + (HELI_ALT - HELI_HIGH) * f; h.x += (h.homeX - h.x) * Math.min(1, dt * 2); }
    if (sys.phaseT <= 0) { sys.phase = "aim"; sys.phaseT = 0; }
  } else if (sys.phase === "aim") {
    sys.phaseT += dt;
    let allDropped = true;
    for (const h of sys.helis) {
      h.alt = HELI_ALT + Math.sin(h.bobPhase * 2) * 1.5;
      const localT = sys.phaseT - h.dropDelay;
      if (h.dropped || localT < 0) {
        const tx = swayTargetX(h, bound);
        h.x += (tx - h.x) * Math.min(1, dt * 2.2);
        if (!h.dropped) allDropped = false;
        continue;
      }
      allDropped = false;
      if (!h.aiming) { h.aiming = true; h.lockX = Math.max(h.zoneMin, Math.min(h.zoneMax, clampBound(playerX, bound))); }
      h.x += Math.sign(h.lockX - h.x) * Math.min(Math.abs(h.lockX - h.x), 50 * dt);
      if (localT >= AIM_TIME) {
        sys.barrels.push({ x: h.lockX, z: playerZ + HELI_AHEAD, flame: Math.random() * 6.28, hit: false });
        h.dropped = true; h.aiming = false;
        cbs?.onDrop?.();
      }
    }
    if (allDropped) { sys.phase = "exit"; sys.phaseT = EXIT_TIME; }
  } else if (sys.phase === "exit") {
    sys.phaseT -= dt;
    const f = 1 - Math.max(0, sys.phaseT) / EXIT_TIME;
    for (const h of sys.helis) h.alt = HELI_ALT + (HELI_HIGH - HELI_ALT) * f;
    if (sys.phaseT <= 0) { sys.helis = []; sys.sortie++; sys.phase = "wait"; sys.phaseT = RELOAD_TIME; }
  }
}

export function checkBarrelHit(sys, box) {
  for (const b of sys.barrels) {
    const x1 = b.x - BARREL_HALF_X, x2 = b.x + BARREL_HALF_X, z1 = b.z - BARREL_HALF_Z, z2 = b.z + BARREL_HALF_Z;
    if (box.x1 < x2 && box.x2 > x1 && box.z1 < z2 && box.z2 > z1) return b;
  }
  return null;
}

export const HELI_HOVER_AHEAD = HELI_AHEAD;
