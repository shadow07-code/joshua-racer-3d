// Score accumulator + localStorage high score. PORTED from the 2D reference
// (src/scoring.js), simplified to a single locale (no map/difficulty multipliers).
// Distance + pass + near-miss + smash + per-second survival are added by the
// game loop; this owns the running total and the persisted best.
import { SCORE } from "./config.js";

const HI_KEY = "jr3d.hiscore";

export function makeScoreState() {
  return { score: 0, lastZ: 0, hi: 0, beatHi: false };
}

export function loadHiScore() {
  try { return parseInt(localStorage.getItem(HI_KEY), 10) || 0; } catch { return 0; }
}
export function saveHiScore(score) {
  try {
    const cur = loadHiScore();
    if (score > cur) { localStorage.setItem(HI_KEY, String(Math.floor(score))); return true; }
  } catch {}
  return false;
}
export function bestEverScore() { return loadHiScore(); }

export function startScoring(state, playerZ) {
  state.score = 0;
  state.lastZ = playerZ;
  state.hi = loadHiScore();
  state.beatHi = false;
}

// Per-frame distance accumulator.
export function tickScore(state, playerZ) {
  const dz = Math.max(0, playerZ - state.lastZ);
  state.lastZ = playerZ;
  state.score += dz * SCORE.distanceWeight;
  if (state.score > state.hi) state.beatHi = true;
}

export function finalizeScore(state) {
  const isNew = saveHiScore(state.score);
  if (isNew) state.hi = Math.floor(state.score);
  return isNew;
}
