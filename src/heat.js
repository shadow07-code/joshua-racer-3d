// HEAT — the one resource the whole game runs on.
//
// Heat is simultaneously the player's SPEED, their SCORE MULTIPLIER, their LIFE,
// and the traffic DENSITY dial. It drains on its own, and the only way to put it
// back is to take risk: tailgate, shave past a car, fly, run the wrong-way lane.
//
// The point of collapsing all of that into a single number is push-forward
// racing. If score ticked up on its own you could drive down an empty lane
// forever; here that starves you and the run dies. Traffic stops being an
// obstacle you resent and becomes the fuel you go looking for — the same
// inversion that makes Doom Eternal's demons into ammo rather than problems.
//
// The nastiest consequence, and the best one: a crash costs a big slice of heat,
// so a hot player survives mistakes that kill a cold one. Aggression is the SAFE
// play. Pure scalar logic, no DOM and no Three.js — see tools/simtest.mjs.
import { HEAT } from "./config.js";

export function makeHeat() {
  return {
    v: HEAT.start,        // 0..1
    peak: HEAT.start,     // highest reached this run (end-of-run stat)
    overdrive: false,     // invincible smash-through, entered at the top
    flameout: 0,          // seconds of grace remaining at zero heat
    dead: false,          // flameout expired — the run is over
    draftT: 0,            // seconds spent in a slipstream this run (stat)
    tier: 0,              // 0..3 band, drives the HUD/world look and callouts
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Heat bands. These are what the world grades against and what the player reads
// off the bar without doing arithmetic.
export const TIERS = [
  { min: 0.00, name: "COLD",  color: "#5b7fa8" },
  { min: 0.35, name: "WARM",  color: "#ffc247" },
  { min: 0.66, name: "HOT",   color: "#ff7a2f" },
  { min: 0.90, name: "WHITE", color: "#fff4d0" },
];
export function tierOf(v) {
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (v >= TIERS[k].min) i = k;
  return i;
}

// Add (or spend, with a negative amount) heat. Returns the actual delta applied,
// so callers can tell a real gain from one that hit the ceiling.
export function addHeat(h, amount) {
  if (h.dead) return 0;
  const before = h.v;
  h.v = clamp01(h.v + amount);
  if (h.v > h.peak) h.peak = h.v;
  // Only a REAL recovery puts the fire out — see HEAT.flameoutClear.
  if (h.v > HEAT.flameoutClear) h.flameout = 0;
  return h.v - before;
}

// Per-frame decay, overdrive state machine, and the flameout countdown.
// `events` out-param reports edges the caller needs to react to (audio, banners)
// without this module knowing anything about them.
export function updateHeat(h, dt, events) {
  if (h.dead) return;

  // Overdrive burns heat at a flat, brutal rate instead of the normal curve —
  // it is a spend of everything you banked, and it only lasts as long as you
  // keep feeding it (each smash tops it back up).
  if (h.overdrive) {
    h.v = clamp01(h.v - HEAT.overdriveDrain * dt);
    if (h.v <= HEAT.overdriveExit) {
      h.overdrive = false;
      if (events) events.overdriveEnd = true;
    }
  } else {
    // Hotter burns faster, so the top of the bar is a place you visit, not live.
    const drain = HEAT.drainBase + HEAT.drainScale * h.v;
    h.v = clamp01(h.v - drain * dt);
    if (h.v >= HEAT.overdriveAt) {
      h.overdrive = true;
      if (events) events.overdriveStart = true;
    }
  }

  // Flameout: running dry does not kill instantly. You get a few seconds of
  // siren to go and take a risk, which is the most desperate and best moment in
  // a run. The clock runs any time you are BELOW flameoutClear rather than only
  // at exactly zero — otherwise the crumbs you pick up incidentally from passing
  // traffic hold you at 0.001 forever and the fire can never actually kill you.
  if (h.v <= HEAT.flameoutClear) {
    if (h.flameout === 0 && events) events.flameoutStart = true;
    h.flameout += dt;
    if (h.flameout >= HEAT.flameoutSeconds) {
      h.dead = true;
      if (events) events.dead = true;
    }
  }

  const t = tierOf(h.v);
  if (t !== h.tier) {
    if (events) { events.tierFrom = h.tier; events.tierTo = t; }
    h.tier = t;
  }
}

// Speed as a fraction of the car's rated top speed.
//
// The floor is deliberately WELL above the fastest civilian traffic. A cold
// player has to still be overtaking, or low heat would mean no near-misses,
// which would mean no heat — a death spiral with no way out. The floor is the
// escape hatch; the punishment for being cold is the flameout clock, not
// helplessness.
export function heatSpeed01(h) {
  const eased = Math.pow(h.v, HEAT.speedCurve);
  const base = HEAT.speedFloor + (1 - HEAT.speedFloor) * eased;
  return h.overdrive ? base * HEAT.overdriveSpeedMul : base;
}

// Score multiplier — running hot is worth several times running cold, so the
// leaderboard measures nerve rather than patience.
export function heatScoreMul(h) {
  return 1 + HEAT.scoreMul * h.v + (h.overdrive ? HEAT.overdriveScoreBonus : 0);
}

// THE TOW RUNS OUT. Multiplier on the slipstream's value, by how long the tow has
// been held continuously. Before the brake existed this could not matter — the
// car outran every civilian by construction, so no draft lasted more than a
// second or two. Now that a player can match pace and sit there, an undecayed
// draft would be a heat fountain: park behind a bus, never take another risk,
// win. Rich for the first beat, and by ~3s worth less than the bar is draining,
// so holding is still correct and parking never is.
export function draftFalloff(heldSeconds) {
  const t = Math.max(0, heldSeconds);
  return HEAT.draftFadeFloor + (1 - HEAT.draftFadeFloor) * Math.exp(-t / HEAT.draftFade);
}

// Traffic density, INVERTED against heat — and that inversion is a correction,
// not a flourish.
//
// It used to read `1 + 1.25 * h.v`: run hot, and the road fills up. It sounds
// right ("more fuel AND more danger") and it was wrong twice over.
//
//   1. At the top it made the game IMPOSSIBLE. Density divides row spacing, and
//      heat also buys speed, so a hot player met rows that were closer together
//      AND arriving faster. Measured in tools/densitytest.mjs the thread ratio —
//      time between rows over time to change one lane — fell to 0.64. The next
//      wall arrived before a lane change could finish. The game punished you for
//      playing it well.
//   2. At the bottom it was a DEATH SPIRAL. Traffic is the only fuel, so a cold
//      player was handed an emptier road, which made them colder.
//
// Both ends are fixed by turning it around. The cold player gets a slightly
// busier road — fuel exactly when they are starving — and the hot player gets
// room to use the speed they earned. The premise is untouched: drain is constant
// and only risk pays, so playing safe still kills you. You are simply no longer
// denied the chance to recover, or drowned for succeeding.
//
// Escalation now lives entirely in the SECTOR table (src/stages.js), which is the
// right home for it: it is monotonic, it is announced, and because sectors are
// distance-gated, driving hot still carries you into the harder ones faster.
export function heatDensity(h) {
  return 1 + HEAT.densityMul * (1 - h.v);
}
