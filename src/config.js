// Global config for Joshua Racer 3D.
//
// Gameplay tuning is COPIED VERBATIM from the 2D reference (Joshua 1 Racer
// src/config.js) so the simulation feels identical — see the project memory.
// New to 3D: WORLD/CAMERA/CURVE blocks that drive the renderer + chase cam.
// The 2D-canvas-only bits (PALETTE, W, H, PLAYER_Y) are intentionally dropped.

export const PHYS = {
  startSpeed: 14,
  // Internal max-speed; HUD shows km/h via topSpeedKmh / maxSpeed ratio.
  // Deliberately low (108, not 135) — the main lever that keeps the road-scroll
  // calm at top speed. The km/h readout = speed / maxSpeed * topSpeedKmh.
  maxSpeed: 108,
  cruiseSpeed: 108,
  boostFactor: 1.10,
  // Two-phase ramp: punchy launch to ~100 km/h, then a slow grind to the top.
  rampPhase1Seconds: 4,
  rampPhase2Seconds: 80,
  accel: 14,
  drag: 5,
  fenceBounce: 7,
  fenceSpeedKeep: 0.88,
  steerSpeed: 120,
  steerSpeedFactor: 0.65,
  carHalfWidth: 6,
  carHalfHeight: 8,
  topSpeedKmh: 200,
  phase1Kmh: 100,
};

// Wide multi-lane road (lateral units == the 2D game's pixels, reused 1:1 so the
// ported (x, z) sim is unchanged).
export const ROAD = {
  halfWidth: 56,
  shoulder: 7,
  laneCount: 5,
};

// Endless-survival rules (subset used so far; rest copied as phases land).
export const RACE = {
  startLives: 3,
  countdownSeconds: 3,
  topSpeedThreshold: 0.95,
  comboKmh: 100,
  comboWindow: 2.8,
  // RAMPAGE: an unbroken chain of `rampageNearMisses` combo-tier near-misses
  // fills the pip meter and fires a ~7s invincible nitrous smash-through. On
  // exit, an instantaneous shockwave kicks out the next 2 cars ahead. Then the
  // meter is locked until `rampageCooldownPasses` cars are passed.
  rampageNearMisses: 10,
  rampageCooldownPasses: 10,
  rampageDuration: 7,
  rampageClearDist: 120,   // exit-shockwave search range for the next 2 cars
  // Police helicopter: flies in once the player crosses copTriggerKmh and drops
  // flaming barrels (a hit costs a life). Density compounds after top speed.
  copTriggerKmh: 150,
  densityStepSeconds: 50,
  densityStepIncrement: 0.10,
  densityMax: 1.9,
};

export const SPAWN = {
  trafficRowGap: 72,
  sceneryPerMeter: 0.22,
};

export const SCORE = {
  distanceWeight: 1.0,
  passBonus: 25,
  nearMissBonus: 100,
  smashBonus: 150,
  survivalSecondBonus: 10,
};

// ── 3D presentation ──────────────────────────────────────────────────────────

export const WORLD = {
  groundY: 0,        // road surface height
};

// Damped third-person chase camera. Distances are in world units (same scale as
// the road). Higher damp-K = snappier; Comfort Mode lowers them for a held shot.
export const CAMERA = {
  back: 24,          // distance behind the car along the road tangent (pulled back)
  height: 11,        // height above the road
  lookAhead: 42,     // look-at point this far ahead down the curve
  lateralFollow: 0.5,  // how much the cam slides with the car's lateral offset
  lookLateral: 0.72,   // how much the look-at point tracks the car laterally
  posDampK: 7.5,     // exponential damping rate for camera position
  lookDampK: 6.0,    // exponential damping rate for the look-at point
  fov: 66,           // FOV (Comfort Mode narrows it)
  near: 1,
  far: 700,
};

// Steering FEEL (visual only — the sim's lateral motion is unchanged). Smooths
// the rubbery instant slide and makes the car steer like a real car: front
// wheels turn, the nose yaws into the move, and the body banks.
export const STEER = {
  smoothing: 9,      // higher = snappier; lower = smoother/laggier steer easing
  wheelMax: 0.45,    // max front-wheel yaw (radians) at full lock
  yawIntoTurn: 0.12, // how far the whole car points into the turn (radians)
  bank: 0.11,        // body roll into the turn (radians)
};

// Gentle sweeping road curvature κ(z) = 1/radius, as a sum of slow sines so the
// road meanders without ever turning sharply (large radius = comfort headroom).
export const CURVE = {
  step: 4,           // centerline sample spacing (world units)
  amp1: 0.00070, freq1: 0.00160,
  amp2: 0.00045, freq2: 0.00072, phase2: 1.3,
};

export const FOG = {
  density: 0.0030,   // lighter haze — clearer, less murky
};

export const KEYS = {
  left:  ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
  pause: ["p", "P", " "],
  enter: ["Enter", " "],
};
