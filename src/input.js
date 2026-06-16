// Unified input — keyboard + canvas-touch + on-screen steer buttons.
// Ported from the 2D game; auto-accelerate, so there is no brake. Binary steer.
import { KEYS } from "./config.js";

const state = {
  steer: 0,
  pressed: new Set(),           // edge-triggered, consumed by the main loop
};

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

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  if (!heldKeys.has(e.key)) { heldKeys.add(e.key); state.pressed.add(e.key); }
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
  const press = (side) => { btnHeld[side] = true; state.pressed.add("Touch"); recompute(); };
  const release = (side) => { btnHeld[side] = false; recompute(); };
  const wire = (btn, side) => {
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); press(side); });
    btn.addEventListener("pointerup", (e) => { e.preventDefault(); release(side); });
    btn.addEventListener("pointercancel", () => release(side));
    btn.addEventListener("pointerleave", () => release(side));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  };
  wire(btnL, "L");
  wire(btnR, "R");
}

let _bound = false;
export function initInput(canvas) {
  if (_bound) return;
  _bound = true;
  bindPointer(canvas);
  bindSteerButtons();
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
