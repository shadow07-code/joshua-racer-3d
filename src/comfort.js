// Comfort Mode — the opt-in motion-comfort safety net.
//
// Per the owner's direction, the DEFAULT is spectacle-first. Comfort Mode is one
// switch that, when ON, increases camera damping, narrows the FOV, strengthens
// the speed vignette, and disables the FOV-kick / speed-lines / shake. Phase 0's
// phone test decides whether it should default ON.
import { CAMERA } from "./config.js";

const state = { enabled: false };

const SPECTACLE = {
  fovBase: CAMERA.fov,        // 66
  fovKick: 13,                // extra FOV at top speed (sense of speed)
  fovKickEnabled: true,
  posDampK: CAMERA.posDampK,  // 7.5
  lookDampK: CAMERA.lookDampK, // 6.0
  vignetteMax: 0.3,           // peak edge-darkening opacity at top speed
  speedLines: true,
};

const COMFORT = {
  fovBase: 58,                // narrower view = less peripheral flow
  fovKick: 0,                 // no FOV kick
  fovKickEnabled: false,
  posDampK: 4.5,              // smoother (more lag) = held-shot feel
  lookDampK: 3.5,
  vignetteMax: 0.5,           // stronger tunnel
  speedLines: false,
};

export function isComfort() { return state.enabled; }
export function setComfort(on) { state.enabled = !!on; }
export function toggleComfort() { state.enabled = !state.enabled; return state.enabled; }

// Active parameter set for the current mode.
export function params() { return state.enabled ? COMFORT : SPECTACLE; }
