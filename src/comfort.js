// Comfort Mode — the opt-in motion-comfort safety net.
//
// Per the owner's direction, the DEFAULT is spectacle-first. Comfort Mode is one
// switch that, when ON, increases camera damping, narrows the FOV, strengthens
// the speed vignette, and disables the FOV-kick / speed-lines / shake. Phase 0's
// phone test decides whether it should default ON.
import { CAMERA } from "./config.js";

const state = { enabled: false };

const SPECTACLE = {
  fovBase: CAMERA.fov,        // 62
  fovKick: 10,                // extra FOV at top speed (sense of speed) — 72° flat out; 79° shrank the traffic you must read
  fovKickEnabled: true,
  posDampK: CAMERA.posDampK,  // 7.5
  lookDampK: CAMERA.lookDampK, // 6.0
  vignetteMax: 0.3,           // peak edge-darkening opacity at top speed
  speedLines: true,
  roll: CAMERA.roll,          // camera banks a few degrees with the slide
  speedBuzz: 0.0022,          // radians of high-speed lens shiver at full speed
};

const COMFORT = {
  fovBase: 58,                // narrower view = less peripheral flow
  fovKick: 0,                 // no FOV kick
  fovKickEnabled: false,
  posDampK: 4.5,              // smoother (more lag) = held-shot feel
  lookDampK: 3.5,
  vignetteMax: 0.5,           // stronger tunnel
  speedLines: false,
  roll: 0,                    // horizon welded level — the whole point of the mode
  speedBuzz: 0,               // and no shiver
};

export function isComfort() { return state.enabled; }
export function setComfort(on) { state.enabled = !!on; }
export function toggleComfort() { state.enabled = !state.enabled; return state.enabled; }

// Active parameter set for the current mode.
export function params() { return state.enabled ? COMFORT : SPECTACLE; }
