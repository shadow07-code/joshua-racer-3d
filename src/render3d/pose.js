// CAR POSE — how the BODY of the car moves, as distinct from where the car is.
//
// The sim (entities/player.js) decides where the car goes; this decides what it
// looks like getting there: which way the nose points, how the body leans, how
// it shivers at speed, how fast the wheels turn and whether the tyres are
// scrubbing hard enough to smoke. It changes nothing about the driving itself —
// no collision, lane-change time or score depends on it — but it is most of
// what the driving FEELS like, because it is what the eye reads.
//
// Pure math, no Three.js, so it is measurable in node like everything else.
import { PHYS, STEER } from "../config.js";

export function makePose() {
  return {
    yaw: 0, yawV: 0,         // nose angle relative to the road, and its rate
    roll: 0, rollV: 0,       // body lean (+ = toward local +x) and its rate
    ax: 0, lastVx: 0,        // smoothed lateral acceleration (the load on the tyres)
    spin: 0,                 // wheel rotation angle
    buzzT: 0,                // road-buzz clock
    lift: 0, buzzRoll: 0,    // this frame's road buzz (body height, extra lean)
    scrub: 0,                // 0..1 how hard the tyres are being dragged sideways
  };
}

// One step of a damped spring (semi-implicit Euler: stable at 60 Hz for the
// stiffnesses used here). `hz` is the natural frequency, `zeta` the damping
// ratio — under 1 lets it overshoot and settle, which is what reads as mass.
function spring(x, v, target, hz, zeta, dt) {
  const w = 2 * Math.PI * hz;
  v += (w * w * (target - x) - 2 * zeta * w * v) * dt;
  return [x + v * dt, v];
}

export function updatePose(q, p, dt) {
  if (dt <= 0) return q;
  const speed = Math.max(1, p.speed);
  const speed01 = Math.min(1.2, p.speed / PHYS.maxSpeed);
  const steer = p.steerVis || 0, slip = p.slip || 0, vx = p.vx || 0;
  const grounded = !p.airborne;

  // ── HEADING FOLLOWS THE PATH ──
  // The nose used to be steering + slip. Slip is largest the instant you press
  // (the wheels have turned, the mass has not moved yet) and flips sign the
  // instant you let go, so a lane change read as: a 15° twitch, then a crab
  // across three lanes with the nose nearly straight while the car was really
  // travelling at 35-55° to the road, then a 15° flick the WRONG way on release
  // while it was still sliding right. Now the nose tracks the direction the car
  // is actually travelling (a fraction of it — full would be absurd at this
  // lateral speed), led a little by the steering so it turns in first, and
  // settles on a spring so it has weight.
  const travel = Math.atan2(vx, speed);
  // Slip still adds yaw, but only while it pushes the SAME way the wheels are
  // turned — a turn-in, or a hard reversal where the tail swings out. Slip on a
  // release is the car settling, not steering, and must not flick the nose.
  const over = grounded && p.edgeContact === 0 && steer * slip > 0 ? slip : 0;
  const yawTarget = STEER.travelYaw * travel + STEER.yawIntoTurn * steer + STEER.driftYaw * over;
  [q.yaw, q.yawV] = spring(q.yaw, q.yawV, yawTarget, STEER.yawHz, STEER.yawDamp, dt);

  // ── WEIGHT TRANSFER ──
  // A car leans OUT of a turn because of lateral acceleration, not lateral
  // speed: it rolls as it turns in, rocks back through level as it straightens,
  // and sits flat on a steady line. The old lean was a straight readout of vx,
  // so it rolled over at a fixed angle and hung there like a picture on a nail.
  // A little of the velocity lean is kept so a long slide still looks loaded.
  const rawAx = (vx - q.lastVx) / dt;
  q.lastVx = vx;
  q.ax += (rawAx - q.ax) * Math.min(1, dt * 18);            // one frame of vx noise is not a load
  const axN = Math.max(-1.5, Math.min(1.5, q.ax / (PHYS.steerSpeed * PHYS.grip)));
  const rollTarget = grounded
    ? -(STEER.bank * vx / PHYS.steerSpeed + STEER.bankAccel * axN)
    : q.roll * 0.9;                                          // in the air nothing loads it
  [q.roll, q.rollV] = spring(q.roll, q.rollV, rollTarget, STEER.rollHz, STEER.rollDamp, dt);

  // ── ROAD BUZZ ── Tarmac at 200 comes up through the chassis. Two unrelated
  // frequencies so it never settles into an obvious wobble; grows with the
  // SQUARE of speed, so cruising is smooth and flat out is alive.
  q.buzzT += dt;
  const b = grounded ? speed01 * speed01 : 0;
  const n1 = Math.sin(q.buzzT * 43.7) * 0.6 + Math.sin(q.buzzT * 71.3 + 1.7) * 0.4;
  const n2 = Math.sin(q.buzzT * 37.1 + 0.6) * 0.5 + Math.sin(q.buzzT * 83.9 + 2.9) * 0.5;
  q.lift = STEER.buzzLift * b * n1;
  q.buzzRoll = STEER.buzzRoll * b * n2;

  // ── WHEELS ── Rolling, at a rate the eye can follow. The rims are six-sided,
  // so a true 10 rev/s would alias into standing still (or turning backwards)
  // at 60 fps; this stays under half a facet per frame at any speed.
  q.spin += dt * 2 * Math.PI * (grounded ? 0.8 + 2.4 * Math.min(1, speed01) : 1.2);
  if (q.spin > 1e4) q.spin -= 2 * Math.PI * 1000;

  // ── SCRUB ── How hard the tyres are being dragged sideways. An ordinary lane
  // change keeps them clean; a hard reversal (the mass still going one way, the
  // wheels already the other) is what actually lights them up.
  // Rises at once, dies away over ~a quarter second: the real scrub on a hard
  // reversal only lasts about 90ms, which is too short for smoke to read.
  const s = grounded && p.edgeContact === 0 && speed01 > 0.4 ? (Math.abs(slip) - STEER.scrubFrom) / (1 - STEER.scrubFrom) : 0;
  const now = Math.max(0, Math.min(1, s));
  q.scrub = now >= q.scrub ? now : Math.max(now, q.scrub - dt * 4);
  return q;
}

// A knock — a crash or the barrier — kicks the body, and the springs above let
// it swing and settle instead of snapping straight.
export function kickPose(q, yawKick, rollKick) {
  q.yawV += yawKick;
  q.rollV += rollKick;
}

// Fresh run: flat, straight, still.
export function resetPose(q) { Object.assign(q, makePose()); }
