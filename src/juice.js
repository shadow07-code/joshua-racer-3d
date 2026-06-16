// Game feel: time control (hitstop + slow-mo) and a camera-shake trauma model.
// These are the cheap, high-impact "juice" levers — every impact gets weight,
// every big moment gets a beat. Comfort Mode (the owner's opt-in safety net)
// dials the aggressive stuff down: no slow-mo, gentler shake, shorter hitstop.
import { isComfort } from "./comfort.js";

let hitstop = 0;       // seconds of full sim-freeze remaining (impact "punch")
let slowmo = 0;        // seconds of slow-mo remaining
let slowmoScale = 1;   // sim time scale while slow-mo is active
let trauma = 0;        // 0..1 shake energy (decays continuously)
let _t = 0;            // shake noise clock

// A hard freeze for a few frames — makes a crash/smash hit like a truck.
export function hitStop(sec) { hitstop = Math.max(hitstop, isComfort() ? sec * 0.4 : sec); }

// Bullet-time for a beat — reserved for the big moments (rampage trigger/exit).
export function slowMo(sec, scale = 0.4) {
  if (isComfort()) return;
  slowmo = Math.max(slowmo, sec);
  slowmoScale = scale;
}

// Add shake energy (trauma stacks; shake = trauma², so it ramps nicely).
export function addShake(amount) { trauma = Math.min(1, trauma + (isComfort() ? amount * 0.35 : amount)); }

// Advance the timers on REAL dt; return the sim time-scale for this frame.
// 0 during hitstop (frozen but still rendering), slowmoScale during slow-mo.
export function update(realDt) {
  let scale = 1;
  if (hitstop > 0) { hitstop = Math.max(0, hitstop - realDt); scale = 0; }
  else if (slowmo > 0) { slowmo = Math.max(0, slowmo - realDt); scale = slowmoScale; }
  trauma = Math.max(0, trauma - realDt * 1.7);
  _t += realDt;
  return scale;
}

const SHAKE_POS = 1.7;   // peak camera offset in world units
// Write the current shake offset into `out` ({x,y}); returns the shake strength.
export function shake(out) {
  const s = trauma * trauma;
  const n = (a, b) => Math.sin(_t * a) * Math.cos(_t * b);
  out.x = n(61, 39) * s * SHAKE_POS;
  out.y = n(47, 71) * s * SHAKE_POS * 0.7;
  return s;
}

export function resetJuice() { hitstop = 0; slowmo = 0; slowmoScale = 1; trauma = 0; }
