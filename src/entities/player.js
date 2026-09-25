// Player car — auto-accelerate with a two-phase start ramp, binary steer, and
// rubber-fence edges. PORTED from the 2D reference (src/entities/player.js); the
// drawing is gone (render3d/models.js owns that). `x` is the lateral offset from
// the road CENTERLINE — pure scalar, so the curve never touches this math.
import { PHYS, ROAD, JUMP, DRIFT } from "../config.js";

export function makePlayer() {
  return {
    z: 0,            // distance traveled along the road (world units)
    x: 0,            // lateral offset from the centerline
    y: 0,            // height above the road — non-zero only mid-jump
    vy: 0,           // vertical velocity while airborne
    airT: 0,         // seconds of air on the current jump
    airborne: false,
    speed: PHYS.startSpeed,
    throttle01: 0.6, // target speed as a fraction of top — written by the HEAT model
    drifting: false, // mid-slide
    driftT: 0,       // seconds of the current slide
    driftSum: 0,     // integral of |slip| over it — "how hard", not just "how long"
    driftGrace: 0,
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

export function updatePlayer(p, dt, input, callbacks) {
  p.raceTime += dt;
  // Speed at the END of the previous frame — NOT the start of this one — so that
  // speed changes made outside this function (a crash calling applyCollisionLoss)
  // are still seen here and register as a nose-dive.
  const prevSpeed = p.lastSpeed != null ? p.lastSpeed : p.speed;

  // SPEED IS HEAT. It used to be a clock — rampTarget(raceTime) climbed to top
  // speed over 84 seconds whatever the player did, which meant the single most
  // important decision in a racing game (commit or back off) did not exist.
  // main.js now writes p.throttle01 from the heat model every frame, so how fast
  // the car is moving is a direct readout of how hard you have been driving. The
  // accel/drag lag is deliberate: heat gains feel like they BUILD into speed.
  const target = PHYS.maxSpeed * (p.throttle01 != null ? p.throttle01 : 0.6);
  if (p.speed < target) p.speed = Math.min(target, p.speed + PHYS.accel * dt);
  else if (p.speed > target) p.speed = Math.max(target, p.speed - PHYS.drag * dt);
  if (p.speed < 4) p.speed = 4;

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
  // Off a ramp the wheels have nothing to bite on, so steering authority
  // collapses to a bit of aero yaw — you commit to the line you took off with.
  const targetVx = steer * PHYS.steerSpeed * steerScale * (p.airborne ? JUMP.airSteer : 1);
  p.vx += (targetVx - p.vx) * Math.min(1, dt * PHYS.grip);
  p.slip = Math.max(-1, Math.min(1, (targetVx - p.vx) / PHYS.steerSpeed));
  p.x += p.vx * dt;

  // ── DRIFT ── `slip` is already the gap between where the wheels point and
  // where the mass is going, which is exactly what a slide IS. So scoring the
  // drift needs no new physics and no new button: commit hard through a reversal
  // and the car slides, and the slide is worth something.
  const speedFrac2 = p.speed / PHYS.maxSpeed;
  // Pinned against the barrier does not count: the wall zeroes vx anyway, and
  // rewarding wall-riding is the opposite of rewarding control.
  const sliding = Math.abs(p.vx) >= DRIFT.minVx && speedFrac2 >= DRIFT.minSpeed01
    && !p.airborne && p.edgeContact === 0;
  if (sliding) {
    p.driftGrace = DRIFT.graceSeconds;
    if (!p.drifting) { p.drifting = true; p.driftT = 0; p.driftSum = 0; }
  }
  if (p.drifting) {
    if (sliding) {
      p.driftT += dt;
      p.driftSum += (Math.abs(p.vx) / PHYS.steerSpeed) * dt;
      // Pay out a long slide and keep going, rather than waiting for an end that
      // may never come while the player is weaving hard through traffic.
      if (p.driftT >= DRIFT.maxSeconds) {
        const t = p.driftT, sum = p.driftSum;
        p.driftT = 0; p.driftSum = 0;
        if (callbacks?.onDriftEnd) callbacks.onDriftEnd(t, sum, true);
      }
    }
    else {
      // A brief dip below the threshold does not break a slide — otherwise every
      // drift would end the instant the car crossed neutral mid-transition.
      p.driftGrace -= dt;
      if (p.driftGrace <= 0) {
        const t = p.driftT, sum = p.driftSum;
        p.drifting = false; p.driftT = 0; p.driftSum = 0;
        if (callbacks?.onDriftEnd) callbacks.onDriftEnd(t, sum);
      }
    }
  }

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

  // ── AIR ── A ramp hands the car a vertical velocity and gravity does the rest.
  // Nothing else changes: forward speed is untouched, so a jump is pure upside —
  // spectacle plus a window where traffic passes harmlessly underneath.
  if (p.airborne) {
    p.airT += dt;
    p.y += p.vy * dt;
    p.vy -= JUMP.gravity * dt;
    if (p.y <= 0) {
      const air = p.airT;
      p.y = 0; p.vy = 0; p.airT = 0; p.airborne = false;
      if (callbacks?.onLand) callbacks.onLand(air);
    }
  }

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

// Abandon any slide in progress without banking it — what a crash does to a drift.
export function cancelDrift(p) { p.drifting = false; p.driftT = 0; p.driftSum = 0; p.driftGrace = 0; }

// Launch off a ramp. Starts at the lip height so the arc continues the ramp
// surface instead of snapping back to the road first.
export function launchPlayer(p) {
  if (p.airborne) return false;
  p.airborne = true;
  p.vy = JUMP.takeoffVy;
  p.y = JUMP.rampRise;
  p.airT = 0;
  return true;
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
