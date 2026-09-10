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
  // accel/drag are how quickly the car chases the speed HEAT is asking for. The
  // lag is deliberate — it makes a heat gain feel like it builds into speed.
  accel: 14,
  drag: 5,
  fenceBounce: 7,
  fenceSpeedKeep: 0.88,
  // Lateral steer feel (ported from the fun 2D game). steerSpeed is peak sideways
  // velocity; steerEase gives an asymmetric ease — GENTLE onset from rest (a light
  // touch is a small, precise, deliberate cut) but SNAPPY (×3.5) on releases and
  // reversals so emergency dodges are instant. This is the key to "crisp but
  // controllable" — a uniform smoothing made every move laggy.
  steerSpeed: 112,
  steerEase: 16,
  steerSpeedFactor: 0.65,
  // LATERAL GRIP — the x-factor. The car now carries sideways MOMENTUM: steering
  // sets a target lateral velocity and the car's actual vx chases it at this
  // rate. The gap between the two is SLIP, which over-rotates the car's nose
  // (see STEER.driftYaw) — so the car visibly points into a turn before its mass
  // follows, and counter-settles on release. That gap between where it points
  // and where it's going is what makes an arcade racer feel like driving instead
  // of sliding a cursor. Lower = looser/driftier; higher = planted/on-rails.
  grip: 10,
  carHalfWidth: 6,
  carHalfHeight: 8,
  topSpeedKmh: 200,
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
  countdownSeconds: 3,
  comboKmh: 100,
  comboWindow: 2.8,
  // Police helicopter: flies in once the player crosses copTriggerKmh and drops
  // flaming barrels (a hit bills heat like any other crash).
  copTriggerKmh: 150,
  // Tension/release pacing: traffic spacing breathes ±densityWaveAmp on a
  // densityWavePeriod-second cycle (surge → breather → surge) so difficulty isn't
  // monotonic ON TOP of the heat-driven base density. The gap lane is always left
  // open, so every row stays threadable.
  densityWaveAmp: 0.18,
  densityWavePeriod: 22,
  // Gold coins scattered down the OPEN gap lane — the ideal weaving line. Grabbing
  // them rewards precise driving (and turns "avoid cars" into "chase a line").
  coinRowChance: 0.28,
  coinsPerTrail: 3,
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
  coinValue: 50,           // per coin grabbed on the racing line
  // Precision (tightness) bonus on a near-miss: a closer shave pays more,
  // 1 → 1 + precisionMax. Within precisionPx lateral clearance = pixel-perfect.
  precisionMax: 0.6,
  precisionPx: 9,
};

// Game-over LETTER GRADE by final score — the instant "did I do well?" verdict
// that fuels the retry reflex. [minScore, letter, qualifier, cssColor].
// Recalibrated for the heat economy (tools/heattest.mjs section F): a bot that
// plays the slipstream line scores ~33k over two minutes, so S is a long run
// held genuinely hot rather than a long run survived.
export const GRADES = [
  [60000, "S", "LEGENDARY!", "#ffd24a"],
  [30000, "A", "GREAT RUN",  "#5ef08a"],
  [12000, "B", "SOLID",      "#9be7ff"],
  [0,     "C", "KEEP GOING", "#cfc7e6"],
];

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
  // Speed-reactive dolly: as speed climbs the camera eases BACK and DROPS toward
  // the road. Low + far reads as fast (the ground rushes closer to the lens), and
  // because it's tied to speed you FEEL acceleration as the world pulls away.
  backAtSpeed: 7,    // extra distance behind at top speed
  dropAtSpeed: 2.6,  // how much lower the camera sits at top speed
  fov: 66,           // FOV (Comfort Mode narrows it)
  near: 1,
  far: 700,
};

// Steering FEEL (visual only — the sim's lateral motion is unchanged). Smooths
// the rubbery instant slide and makes the car steer like a real car: front
// wheels turn, the nose yaws into the move, and the body banks.
export const STEER = {
  wheelMax: 0.5,     // max front-wheel yaw (radians) at full lock
  yawIntoTurn: 0.14, // how far the whole car points into the turn (radians)
  bank: 0.16,        // body roll (radians) — now driven by actual lateral MASS, not input
  driftYaw: 0.55,    // extra nose rotation from slip — the drift/oversteer look
  pitch: 0.030,      // weight transfer: squat under power, dive on impact (radians)
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

// ── Deeper-fun systems (oncoming lane, nitro, jumps, nightfall) ───────────────

// OPPOSING TRAFFIC. The outermost lane carries cars coming the OTHER way, so the
// road stops being a uniform field of overtakes: one lane is now genuinely lethal
// but pays out roughly double on a shave, which is what makes lane choice a
// decision instead of a habit. Painted on the road as a double-yellow from the
// first frame (see render3d/road.js) so the rule is legible before it bites.
export const ONCOMING = {
  lane: 0,                 // leftmost lane (screen-left) is the opposing carriageway
  gap: 380,                // base world-space spacing between opposing cars
  gapJitter: 180,
  spawnAhead: 620,         // born this far out — beyond the fog, so they fade IN
  cullAhead: 340,          // no 3D mesh built until a car is this close
  speedMul: 0.34,          // fraction of cruise speed, travelling -z
  nearMissMul: 2.4,        // head-on shaves pay far more than an overtake
  hitSeverity: 0.75,       // ... and a head-on costs far more speed than a rear-end
};

// NITRO CANISTERS — now HEAT pickups (see HEAT.canister). Placed 70% of the time
// in the opposing lane once it is live, so the reward for reading the oncoming
// rhythm is a big slug of the only resource that matters.
export const NITRO = {
  chance: 0.10,            // per spawned row (≈ one every 9s at base density)
  riskyLaneChance: 0.7,    // how often it sits in the opposing lane (once live)
  value: 120,              // score for grabbing one
};

// RAMPS. Sparse kickers on the shoulder-side lanes that launch the car into a
// real arc. Airborne = no traffic collisions (the car is above them), so a ramp
// is both a spectacle and a deliberate escape hatch from a bad row.
export const JUMP = {
  startSeconds: 20,        // ramps start appearing after the opening
  chance: 0.13,            // per spawned row
  minGapZ: 620,            // never two ramps closer than this
  takeoffVy: 34,           // launch velocity (world units/s) — ~1.6s of air
  gravity: 46,             // downward accel while airborne
  airSteer: 0.35,          // steering authority with the wheels off the road
  rampLen: 34,             // ramp footprint along z
  rampRise: 4.6,           // ramp height at the lip
  airScorePerSec: 260,     // score per second of air
  landShake: 0.34,
};

// NIGHTFALL. A one-way dusk → night grade over the run: the world darkens,
// headlights and neon take over, and a long run visibly earns its own atmosphere.
// Deliberately NOT looping — the escalation reads as progress. Menus stay at
// dusk (nightT only advances while racing), preserving the warm title shot.
// Nightfall is now driven by the SECTOR table (src/stages.js), which sets a
// target level the grade eases toward; only the exposure endpoints live here.
export const NIGHT = {
  easeRate: 0.22,          // how fast nightT chases the sector's target
  exposureDusk: 1.22,
  exposureNight: 0.74,
};

// ── HEAT ─────────────────────────────────────────────────────────────────────
// The single resource the game now runs on (src/heat.js). Everything here is
// balanced around one question: how long can you coast before the run dies?
// At the numbers below, doing NOTHING takes you from a full bar to flameout in
// about 14 seconds — long enough to reposition, far too short to relax.
export const HEAT = {
  start: 0.34,             // enough to be moving properly from the first frame

  // Decay. Hotter drains faster, so the top of the bar is a place you visit.
  drainBase: 0.045,        // per second at zero heat
  drainScale: 0.065,       // extra per second at full heat

  // Gains. Tuned so a good near-miss roughly cancels 2s of decay, and a deep
  // tailgate is worth about the same — two different routes to the same fuel.
  nearMiss: 0.085,         // flat part of a shave
  nearMissTight: 0.095,    // ...plus this much, scaled by how close it was
  oncomingMul: 2.2,        // head-on shaves are the richest fuel in the game
  // The slipstream has to be a beat the player can HOLD, not a frame-perfect
  // twitch. At a ~35 u/s closing speed a 62-unit tail is about a second and a
  // half of "hold it… hold it… now bail", which is the rhythm the whole game is
  // built on. A 34-unit tail was under a second and simply read as a rear-end.
  draftRate: 0.42,         // per second at the bumper, falling off to 0 at draftRange
  draftRange: 62,          // how far back the slipstream reaches
  draftLateral: 7,         // how well lined up you have to be
  airRate: 0.16,           // per second airborne
  coin: 0.03,
  canister: 0.28,          // nitro pickups are now heat pickups
  smash: 0.05,             // per car plowed during overdrive — feeds the frenzy
  sectorBonus: 0.18,       // clean top-up for reaching a new sector

  // Costs.
  crash: 0.45,             // a crash is survivable if you are hot, fatal if cold
  dash: 0.10,              // the escape move spends the resource it protects

  // Zero-heat grace. Long enough for one desperate lunge at a car.
  flameoutSeconds: 4.0,
  // How much heat you must genuinely claw back to escape the flameout clock.
  // Without this, ANY positive gain reset it — and in dense traffic a grazing
  // slipstream frame happens constantly, so the fire could never actually kill
  // you. The emergency has to be escaped on purpose, not survived by accident.
  flameoutClear: 0.04,

  // Overdrive — the old rampage, now earned continuously off the top of the bar.
  overdriveAt: 0.985,
  overdriveExit: 0.55,
  overdriveDrain: 0.16,    // ~2.7s from full unless you keep smashing
  overdriveSpeedMul: 1.10,
  overdriveScoreBonus: 2,

  // Derived outputs.
  speedFloor: 0.60,        // cold speed as a fraction of top — MUST outrun traffic
  speedCurve: 0.8,         // <1 so early heat pays off and cold is escapable
  scoreMul: 3.0,           // score rate at full heat vs. cold
  densityMul: 1.25,        // traffic density at full heat vs. cold
};

// The emergency lateral hop. Overrides grip entirely for its duration, which is
// what separates it from just steering hard — it is a teleport you pay for.
export const DASH = {
  vx: 195,                 // lateral speed while dashing (~2 lanes in one dash)
  time: 0.24,
  cooldown: 0.45,
};

// ── CHAIN ────────────────────────────────────────────────────────────────────
// The skill ceiling. Every risk you take — a shave, a held slipstream, a landed
// jump, a canister, a smash — links the chain, and the chain multiplies BOTH the
// heat those risks pay and the score they earn. It lapses if you play safe for a
// moment and it resets to nothing if you crash.
//
// This is what turns a good run into a story. "I scored 41,880" is a number;
// "I had a 46 chain going and then hit a bus" is a thing you tell someone.
export const CHAIN = {
  window: 3.2,             // seconds of no risk before the chain lapses
  cap: 30,                 // links past this still count, but stop multiplying
  step: 0.04,              // → ×2.2 at the cap
  draftMin: 0.45,          // a slipstream must be HELD this long to link
  milestones: [10, 20, 30, 50, 75, 100],
};

// ── NOS ──────────────────────────────────────────────────────────────────────
// The Underground verb. You HOLD it, it burns the heat bar, and the world goes
// wide and streaky. Collapsing nitrous into the heat resource is the whole idea:
// the bar that is your speed, your score and your life is also the bottle. Every
// second on the button is a second stolen from staying alive, which makes "when
// do I burn it" the most interesting decision in the game.
export const NOS = {
  burn: 0.115,             // heat per second while held (~1/3 of a full bar over 3s)
  minHeat: 0.03,           // below this the bottle is dry
  speedMul: 1.24,          // on top of whatever heat is already buying you
  spool: 0.18,             // seconds to wind in/out — a punch, not a switch
  fovKick: 20,             // degrees of extra FOV at full song
  camBack: 9,              // extra chase distance
  camDrop: 2.4,            // ... and lower, so the ground rushes
  scorePerSec: 140,
};

// ── DRIFT ────────────────────────────────────────────────────────────────────
// Underground scored the slide, so this does too — and it costs no new button,
// because player.slip already measures exactly the right thing: the gap between
// where the wheels point and where the mass is actually going. Hard reversals
// through dense traffic produce it naturally, which means the weaving the game
// is built on now READS as driving instead of dodging.
export const DRIFT = {
  // A drift is measured on LATERAL VELOCITY, not on slip. Slip is the gap
  // between wheels and mass, which spikes for ~0.2s after a steering change and
  // then — worse — pins high while you grind along the barrier, because the wall
  // holds vx at zero. Scoring slip therefore paid out for wall-riding and gave
  // nothing for committed driving. |vx| is the honest measure: it is high exactly
  // while the car is genuinely crossing the road, and the fence kills it.
  minVx: 42,               // of a ~73 u/s maximum — a committed cut, not a nudge
  minSpeed01: 0.55,        // ... and only at real speed
  // Drift pays SCORE handsomely and heat only modestly — on purpose. Sliding
  // needs no traffic, so if it refilled the bar properly you could mash
  // left-right down an empty lane forever and never engage the game. At this
  // rate a pure slide still loses ground against decay: drifting EXTENDS a run,
  // it cannot sustain one. Traffic remains the only real fuel.
  heatPerSec: 0.075,
  // 1400 paid ~770/s while sliding — more than the distance score at full heat,
  // so mashing left-right down an empty road out-earned a skilled run. Drifting
  // is a flourish on top of the loop, not a replacement for it.
  scorePerSec: 260,
  graceSeconds: 0.28,      // brief dips below `min` do not end the slide
  // Slip only spikes while the mass is CATCHING UP with the wheels, so a slide
  // here is naturally short — a committed direction change, not a long corner.
  // 0.35s rejected almost every real one; 0.18 pays a committed cut and still
  // ignores a twitch.
  minBankSeconds: 0.18,
  // A slide through dense traffic can otherwise run unbroken forever and never
  // pay out at all — the better you drift, the less you got. Long slides bank
  // on this interval and carry on, which also gives them a rhythm.
  maxSeconds: 3.0,
};
