// Unified input — keyboard + canvas-touch + on-screen steer pads.
//
// Deliberately tiny: STEER, and a DASH on a double-tap of either direction (or
// Shift / Down on the keyboard). The car accelerates on its own — speed is HEAT —
// so there is nothing else to hold. NOS and a brake were tried and taken out
// again: they made the game harder to pick up without making it more fun.
import { KEYS } from "./config.js";

const state = {
  steer: 0,
  pressed: new Set(),           // edge-triggered, consumed by the main loop
};

const DASH_KEYS = ["Shift", "ArrowDown", "s", "S"];
const heldKeys = new Set();
const touchPoints = new Map();  // identifier -> { x, y, side }
const btnHeld = { L: false, R: false };

function recompute() {
  let s = 0;
  if (KEYS.left.some(k => heldKeys.has(k))) s -= 1;
  if (KEYS.right.some(k => heldKeys.has(k))) s += 1;
  // On-screen buttons take priority — the primary mobile control.
  if (btnHeld.L && !btnHeld.R) s = -1;
  else if (btnHeld.R && !btnHeld.L) s = 1;
  else {
    let leftTouch = false, rightTouch = false;
    for (const t of touchPoints.values()) {
      if (t.side === "L") leftTouch = true;
      else if (t.side === "R") rightTouch = true;
    }
    if (leftTouch && !rightTouch) s = -1;
    else if (rightTouch && !leftTouch) s = 1;
  }
  state.steer = Math.max(-1, Math.min(1, s));
}

// A quick double-tap of a steer direction is the dash — on the keyboard as well
// as the pads, so the gesture the tip teaches is the gesture both schemes use.
const DOUBLE_TAP_MS = 280;
const lastKeyTap = { L: -1e9, R: -1e9 };

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  if (!heldKeys.has(e.key)) {
    heldKeys.add(e.key);
    state.pressed.add(e.key);
    if (DASH_KEYS.includes(e.key)) state.pressed.add("Dash");
    const side = KEYS.left.includes(e.key) ? "L" : KEYS.right.includes(e.key) ? "R" : null;
    if (side) {
      const now = performance.now();
      if (now - lastKeyTap[side] < DOUBLE_TAP_MS) { state.pressed.add("Dash" + side); lastKeyTap[side] = -1e9; }
      else lastKeyTap[side] = now;
    }
  }
  recompute();
}, { passive: false });

window.addEventListener("keyup", (e) => { heldKeys.delete(e.key); recompute(); });

// Only the bottom half of the screen steers (bottom-left = left, bottom-right =
// right). The top half is a neutral "watch the road" zone.
const STEER_TOP_FRAC = 0.5;

function bindPointer(canvas) {
  const sideOf = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (clientY - rect.top < rect.height * STEER_TOP_FRAC) return null;
    return (clientX - rect.left) < rect.width / 2 ? "L" : "R";
  };
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches)
      touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY, side: sideOf(t.clientX, t.clientY) });
    state.pressed.add("Touch");
    recompute();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tp = touchPoints.get(t.identifier);
      if (tp) { tp.x = t.clientX; tp.y = t.clientY; tp.side = sideOf(t.clientX, t.clientY); }
    }
    recompute();
  }, { passive: false });
  const tend = (e) => { for (const t of e.changedTouches) touchPoints.delete(t.identifier); recompute(); };
  canvas.addEventListener("touchend", tend);
  canvas.addEventListener("touchcancel", tend);

  let mouseDown = false;
  const mouseId = "__mouse__";
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side: sideOf(e.clientX, e.clientY) });
    state.pressed.add("Touch");
    recompute();
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side: sideOf(e.clientX, e.clientY) });
    recompute();
  });
  window.addEventListener("mouseup", () => { mouseDown = false; touchPoints.delete(mouseId); recompute(); });
}

function bindSteerButtons() {
  const btnL = document.getElementById("btn-steer-left");
  const btnR = document.getElementById("btn-steer-right");
  if (!btnL || !btnR) return;
  const pointerSide = new Map();   // pointerId -> side currently pressing a pad
  // A quick double-tap on a steer pad is the emergency dash — same thumb, no new
  // button, and it reads as a flick rather than a separate control.
  const lastTap = { L: -1e9, R: -1e9 };
  const press = (side) => {
    const now = performance.now();
    if (now - lastTap[side] < DOUBLE_TAP_MS) { state.pressed.add("Dash" + side); lastTap[side] = -1e9; }
    else lastTap[side] = now;
    btnHeld[side] = true; state.pressed.add("Touch"); recompute();
  };
  const release = (side) => { btnHeld[side] = false; recompute(); };
  const wire = (btn, side) => {
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch {} pointerSide.set(e.pointerId, side); press(side); });
    btn.addEventListener("pointerup", (e) => { e.preventDefault(); release(side); pointerSide.delete(e.pointerId); });
    btn.addEventListener("pointercancel", (e) => { release(side); pointerSide.delete(e.pointerId); });
    btn.addEventListener("pointerleave", () => release(side));
    // If the button is hidden mid-press (e.g. a crash → game-over hides the steer
    // pads), the browser drops pointer capture without a pointerup — release here
    // so the steer doesn't stay latched into the next run (the "slanted car" bug).
    btn.addEventListener("lostpointercapture", () => release(side));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  };
  wire(btnL, "L");
  wire(btnR, "R");

  // Safety net: if a pad's own pointerup is ever missed (DOM churn / hidden
  // control / lost event), a window-level up or cancel for THAT pointer still
  // releases its side. Per-pointer, so multitouch steering isn't affected.
  const winRelease = (e) => {
    const side = pointerSide.get(e.pointerId);
    if (side) { release(side); pointerSide.delete(e.pointerId); }
  };
  window.addEventListener("pointerup", winRelease);
  window.addEventListener("pointercancel", winRelease);
}

let _bound = false;
export function initInput(canvas) {
  if (_bound) return;
  _bound = true;
  bindPointer(canvas);
  bindSteerButtons();
}

// Drop any latched on-screen steer/touch state — called when a fresh run starts
// so a stuck button (or a touch released over a hidden control) can't bleed a
// phantom steer into the new race.
export function clearSteer() {
  btnHeld.L = false; btnHeld.R = false;
  touchPoints.clear();
  recompute();
}

export function getInput() { return state; }

export function consumePress(...keys) {
  for (const k of keys) {
    if (state.pressed.has(k)) { state.pressed.delete(k); return true; }
  }
  return false;
}

export function consumeAnyPress() {
  if (state.pressed.size > 0) { state.pressed.clear(); return true; }
  return false;
}
