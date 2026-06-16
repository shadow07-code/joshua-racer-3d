// Player car — auto-accelerate with a two-phase start ramp, binary steer, and
// rubber-fence edges. PORTED from the 2D reference (src/entities/player.js); the
// drawing is gone (render3d/models.js owns that). `x` is the lateral offset from
// the road CENTERLINE — pure scalar, so the curve never touches this math.
import { PHYS, ROAD, STEER } from "../config.js";

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
    steerVis: 0,     // effective steer this frame (drives wheels/yaw/bank)
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

  const boostCap = PHYS.maxSpeed * (PHYS.boostFactor || 1);
  let target = rampTarget(p.raceTime);
  if (p.boost > 0) { target = boostCap; p.boost = Math.max(0, p.boost - dt); }

  if (p.speed < target) p.speed = Math.min(target, p.speed + PHYS.accel * dt);
  else if (p.speed > target) p.speed = Math.max(target, p.speed - PHYS.drag * dt);
  if (p.speed < 4) p.speed = 4;
  const cap = p.boost > 0 ? boostCap : PHYS.maxSpeed;
  if (p.speed > cap) p.speed = cap;

  // Steering — eased toward the raw input so the lateral slide isn't instant
  // (kills the rubbery feel), then speed-scaled so high-speed moves are calmer.
  p.steerSmooth += (input.steer - p.steerSmooth) * Math.min(1, dt * STEER.smoothing);
  const steer = p.steerSmooth;
  p.steerVis = p.steerSmooth;
  const speedFrac = p.speed / PHYS.maxSpeed;
  const steerScale = 1 - (1 - PHYS.steerSpeedFactor) * speedFrac;
  p.x += steer * PHYS.steerSpeed * steerScale * dt;

  // Rubber-fence edges — can't leave the asphalt; a fresh bump shaves speed once.
  const bound = ROAD.halfWidth - PHYS.carHalfWidth;
  const holdingIntoFence =
    (p.edgeContact > 0 && steer > 0) || (p.edgeContact < 0 && steer < 0);
  if (Math.abs(p.x) >= bound) {
    const side = p.x > 0 ? 1 : -1;
    p.x = side * bound;
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
