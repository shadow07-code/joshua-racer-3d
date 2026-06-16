// Background music — the supplied MP3 track. (The fully procedural Web Audio
// engine/SFX from the 2D game ports in a later phase; this is the music bed.)
// Autoplay is blocked until a user gesture, so main.js calls startOnce() from
// the first tap/key. A toolbar button toggles mute (persisted).

const TRACK = "./assets/audio/redline_at_midnight.mp3";
const MUTE_KEY = "jr3d.musicMuted";

let el = null;
let started = false;
let muted = false;

function loadMuted() { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } }
function saveMuted(m) { try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch {} }

export function initMusic() {
  muted = loadMuted();
  el = new Audio(TRACK);
  el.loop = true;
  el.preload = "auto";
  el.volume = 0.6;
  el.muted = muted;
}

// Begin playback on the first user gesture (safe to call repeatedly).
export function startOnce() {
  if (started || !el) return;
  started = true;
  el.play().catch(() => { started = false; });   // retry on a later gesture if blocked
}

// Pause/resume the bed without forgetting that playback was started (used by the
// pause overlay + auto-pause when the tab is backgrounded).
export function pauseMusic() { if (el && started) el.pause(); }
export function resumeMusic() { if (el && started && !muted) el.play().catch(() => {}); }

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  saveMuted(muted);
  if (el) {
    el.muted = muted;
    if (!muted) startOnce();
  }
  return muted;
}
