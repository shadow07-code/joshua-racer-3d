// Player car — auto-accelerate with a two-phase start ramp, binary steer, and
// rubber-fence edges. PORTED from the 2D reference (src/entities/player.js); the
// drawing is gone (render3d/models.js owns that). `x` is the lateral offset from
// the road CENTERLINE — pure scalar, so the curve never touches this math.
import { PHYS, ROAD } from "../config.js";

export function makePlayer() {
  return {
    z: 0,            // distance traveled along the road (world units)
    x: 0,            // lateral offset from the centerline
    speed: PHYS.startSpeed,
    boost: 0,        // seconds of nitro remaining (Rampage, later phases)
    edgeContact: 0,  // which fence the car is against (-1/0/+1)
    bounce: 0,       // remaining inward rubber-fence rebound
    invuln: 0,
    raceTime: 0,     // seconds since the race started (drives the ramp)
    lives: 3,
    rampage: 0,
    steerSmooth: 0,  // eased steer (-1..1) — smooths the rubbery instant slide
    steerVis: 0,     // effective steer this frame (drives the front wheels)
    steerLock: 0,    // seconds of post-crash steer lockout (forces a straight recovery)
    vx: 0,           // lateral VELOCITY — the car carries sideways momentum
    slip: 0,         // -1..1 gap between steering intent and actual vx (drives drift yaw)
    accel01: 0,      // -1..1 smoothed longitudinal accel (drives squat/dive)
    lastSpeed: null, // speed at the end of the previous frame (catches crash losses)
  };
}

// Two-phase target speed: punchy linear climb to ~100 km/h in rampPhase1Seconds,
// then a slow smoothstep grind from there up to maxSpeed (200 km/h).
function rampTarget(raceTime) {
  const p1End = PHYS.rampPhase1Seconds;
  const p2End = p1End + PHYS.rampPhase2Seconds;
  const phase1Top = PHYS.maxSpeed * (PHYS.phase1Kmh / PHYS.topSpeedKmh);
  if (raceTime <= p1End) {
    const t = raceTime / p1End;
    return PHYS.startSpeed + (phase1Top - PHYS.startSpeed) * t;
  }
  if (raceTime >= p2End) return PHYS.maxSpeed;
  const t = (raceTime - p1End) / (p2End - p1End);
  const e = t * t * (3 - 2 * t);
  return phase1Top + (PHYS.maxSpeed - phase1Top) * e;
}

export function updatePlayer(p, dt, input, callbacks) {
  p.raceTime += dt;
  // Speed at the END of the previous frame — NOT the start of this one — so that
  // speed changes made outside this function (a crash calling applyCollisionLoss)
  // are still seen here and register as a nose-dive.
  const prevSpeed = p.lastSpeed != null ? p.lastSpeed : p.speed;

  const boostCap = PHYS.maxSpeed * (PHYS.boostFactor || 1);
  let target = rampTarget(p.raceTime);
  if (p.boost > 0) { target = boostCap; p.boost = Math.max(0, p.boost - dt); }

  if (p.speed < target) p.speed = Math.min(target, p.speed + PHYS.accel * dt);
  else if (p.speed > target) p.speed = Math.max(target, p.speed - PHYS.drag * dt);
  if (p.speed < 4) p.speed = 4;
  const cap = p.boost > 0 ? boostCap : PHYS.maxSpeed;
  if (p.speed > cap) p.speed = cap;

  // Steering — asymmetric ease (ported from the fun 2D game): a GENTLE onset from
  // rest makes a light touch a small, precise, deliberate cut; but releases and
  // reversals snap fast (×3.5) so letting off and emergency dodges are instant.
  // A post-crash lockout forces neutral so the car recovers straight even if a
  // pad is held/stuck; the fast release-rate makes that recovery crisp too.
  let steerInput = input.steer;
  if (p.steerLock > 0) { p.steerLock = Math.max(0, p.steerLock - dt); steerInput = 0; }
  const reversing = steerInput !== 0 && p.steerSmooth !== 0 && Math.sign(steerInput) !== Math.sign(p.steerSmooth);
  const releasing = Math.abs(steerInput) < Math.abs(p.steerSmooth);
  const easeRate = (reversing || releasing) ? PHYS.steerEase * 3.5 : PHYS.steerEase;
  p.steerSmooth += (steerInput - p.steerSmooth) * Math.min(1, dt * easeRate);
  const steer = p.steerSmooth;
  p.steerVis = p.steerSmooth;
  const speedFrac = p.speed / PHYS.maxSpeed;
  const steerScale = 1 - (1 - PHYS.steerSpeedFactor) * speedFrac;

  // LATERAL MOMENTUM. Steering sets a TARGET sideways velocity; the car's actual
  // vx chases it at `grip`, so the mass takes a moment to follow the wheels — and
  // keeps sliding for a moment after they straighten. The shortfall between the
  // two is SLIP: positive when the car is steering harder than it is yet moving
  // (nose rotates into the turn), negative on release (the car counter-settles).
  // The renderer turns slip into extra nose yaw — that is the drift look.
  const targetVx = steer * PHYS.steerSpeed * steerScale;
  p.vx += (targetVx - p.vx) * Math.min(1, dt * PHYS.grip);
  p.x += p.vx * dt;
  p.slip = Math.max(-1, Math.min(1, (targetVx - p.vx) / PHYS.steerSpeed));

  // Rubber-fence edges — can't leave the asphalt; a fresh bump shaves speed once.
  const bound = ROAD.halfWidth - PHYS.carHalfWidth;
  const holdingIntoFence =
    (p.edgeContact > 0 && steer > 0) || (p.edgeContact < 0 && steer < 0);
  if (Math.abs(p.x) >= bound) {
    const side = p.x > 0 ? 1 : -1;
    p.x = side * bound;
    p.vx = 0;                                     // the wall stops the sideways slide
    if (p.edgeContact !== side) {
      p.edgeContact = side;
      p.speed = Math.max(PHYS.startSpeed * 0.6, p.speed * PHYS.fenceSpeedKeep);
      if (callbacks?.onFenceBump) callbacks.onFenceBump();
    }
    p.bounce = -side * PHYS.fenceBounce;
  }
  if (p.bounce && !holdingIntoFence) {
    const step = p.bounce * Math.min(1, dt * 12);
    p.x += step;
    p.bounce -= step;
    if (Math.abs(p.bounce) < 0.1) p.bounce = 0;
  }
  if (Math.abs(p.x) < bound - 2 && !holdingIntoFence) p.edgeContact = 0;

  p.z += p.speed * dt;

  // WEIGHT TRANSFER: smoothed longitudinal acceleration, normalized so the
  // renderer can squat the body under power and dive it on an impact (a crash
  // drops speed hard outside this function, which reads as a big nose-dive).
  const rawAccel = dt > 0 ? (p.speed - prevSpeed) / dt / PHYS.accel : 0;
  const accelTarget = Math.max(-1, Math.min(1, rawAccel));
  // ASYMMETRIC: a deceleration spike (an impact) must land on the very frame it
  // happens, so the nose dives hard; the recovery back to squat is slow and
  // springy. A single symmetric ease smoothed the one-frame crash impulse away
  // entirely and the car never dived at all.
  const rate = accelTarget < p.accel01 ? 40 : 6;
  p.accel01 += (accelTarget - p.accel01) * Math.min(1, dt * rate);
  p.lastSpeed = p.speed;

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
}

export function applyCollisionLoss(p, severity, invulnSeconds = 0.6) {
  p.speed = Math.max(PHYS.startSpeed * 0.5, p.speed * (1 - severity));
  p.invuln = Math.max(p.invuln, invulnSeconds);
}

// Hit box in (x, z) — used by checkTrafficHit once traffic lands (Phase 2).
export function playerBox(p) {
  return {
    x1: p.x - PHYS.carHalfWidth,
    x2: p.x + PHYS.carHalfWidth,
    z1: p.z - PHYS.carHalfHeight * 0.5,
    z2: p.z + PHYS.carHalfHeight * 0.5,
  };
}
