// Procedural Web Audio — F1 rumble-to-wail engine + all SFX + helicopter rotor.
// PORTED from the 2D reference src/audio.js (the synth voices are kept ~verbatim).
// The dual chiptune MUSIC tracks are dropped — the supplied MP3 (music.js) is the
// music bed now. Everything here routes through one SFX channel (one toggle).
import { gearAt } from "./gearbox.js";

const A4 = 440;
const SEMI = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
function noteHz(name, octave) {
  if (name === "-" || !name) return 0;
  const s = SEMI[name]; if (s == null) return 0;
  const midi = octave * 12 + s + 12;
  return A4 * Math.pow(2, (midi - 69) / 12);
}

let ctx = null, masterGain = null, sfxGain = null, inited = false;
let sfxEnabled = true;
const SFX_KEY = "jr3d.sfx";
const sfxVol = 0.9;

function loadSfx() { try { const v = localStorage.getItem(SFX_KEY); return v === null ? true : v === "1"; } catch { return true; } }
function saveSfx(on) { try { localStorage.setItem(SFX_KEY, on ? "1" : "0"); } catch {} }

export function initAudio() {
  if (inited) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain(); masterGain.gain.value = 0.6; masterGain.connect(ctx.destination);
    sfxEnabled = loadSfx();
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxEnabled ? sfxVol : 0; sfxGain.connect(masterGain);
    inited = true;
  } catch {}
}
export function resumeAudio() { if (ctx && ctx.state === "suspended") ctx.resume(); }
export function suspendAudio() { if (ctx && ctx.state === "running") { try { ctx.suspend(); } catch {} } }

export function isSfxEnabled() { return sfxEnabled; }
export function setSfxEnabled(on) { sfxEnabled = !!on; saveSfx(sfxEnabled); if (sfxGain) sfxGain.gain.value = sfxEnabled ? sfxVol : 0; }
export function toggleSfx() { setSfxEnabled(!sfxEnabled); return sfxEnabled; }

let noiseBuf = null;
function getNoiseBuf() {
  if (!ctx) return null;
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// ── F1 engine: two detuned sawtooths (rasp) + sub-octave square (growl). Pitch +
// filter open with speed so the high-RPM scream is reserved for top speed. ──
let engineOsc = null, engineOsc2 = null, engineOscSub = null, engineGain = null, engineGainSub = null, engineFilt = null, _engineRampage = false;

export function startEngine() {
  if (!ctx || engineOsc) return;
  engineOsc = ctx.createOscillator(); engineOsc.type = "sawtooth"; engineOsc.frequency.value = 38;
  engineOsc2 = ctx.createOscillator(); engineOsc2.type = "sawtooth"; engineOsc2.frequency.value = 38; engineOsc2.detune.value = 12;
  engineOscSub = ctx.createOscillator(); engineOscSub.type = "square"; engineOscSub.frequency.value = 19;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineGainSub = ctx.createGain(); engineGainSub.gain.value = 0;
  engineFilt = ctx.createBiquadFilter(); engineFilt.type = "lowpass"; engineFilt.frequency.value = 320; engineFilt.Q.value = 1.4;
  engineOsc.connect(engineFilt); engineOsc2.connect(engineFilt);
  engineFilt.connect(engineGain); engineGain.connect(sfxGain);
  engineOscSub.connect(engineGainSub); engineGainSub.connect(sfxGain);
  engineOsc.start(); engineOsc2.start(); engineOscSub.start();
  _engineRampage = false;
}
export function stopEngine() {
  if (!engineOsc) return;
  try { engineOsc.stop(); } catch {}
  try { engineOsc2.stop(); } catch {}
  try { engineOscSub.stop(); } catch {}
  engineOsc.disconnect(); engineOsc2.disconnect(); engineOscSub.disconnect();
  engineGain.disconnect(); engineGainSub.disconnect(); engineFilt.disconnect();
  engineOsc = engineOsc2 = engineOscSub = engineGain = engineGainSub = engineFilt = null;
}
// Engine note driven by REVS THROUGH A GEARBOX, not raw speed. Within a gear the
// pitch climbs to the redline; an upshift drops it back and it climbs again. That
// rise-drop-rise pulse is the heartbeat that makes a car sound like a machine
// being worked instead of a siren sweeping for 84 seconds.
export function setEngine(speed01) {
  if (!engineOsc || !ctx) return;
  const s = Math.max(0, Math.min(1, speed01));
  const { gear, rev } = gearAt(s);
  const t = ctx.currentTime;
  // Each gear sits a little higher overall, so top gear is still the highest note
  // even though every gear starts its sweep low.
  const base = 38 + (gear - 1) * 13;
  const span = 150 + (gear - 1) * 9;
  const f = base + span * Math.pow(rev, 1.15);
  // Short time constant so an upshift is heard as a distinct drop, not a slur.
  engineOsc.frequency.setTargetAtTime(f, t, 0.045);
  engineOsc2.frequency.setTargetAtTime(f * 1.006, t, 0.045);
  engineOscSub.frequency.setTargetAtTime(f * 0.5, t, 0.045);
  // Brightness opens with revs (strain) and with outright speed (wind).
  if (!_engineRampage) engineFilt.frequency.setTargetAtTime(320 + 900 * rev + 950 * s, t, 0.07);
  const vol = 0.030 + 0.030 * rev + 0.028 * s;
  engineGain.gain.setTargetAtTime(vol, t, 0.06);
  engineGainSub.gain.setTargetAtTime(vol * 0.70, t, 0.06);
}

// Upshift thud — a short muted transient so a gear change is FELT, not just heard.
export function sfxShift() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(74, t + 0.07);
  const g = ctx.createGain(); g.gain.value = 0.10; g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.11);
}
export function setEngineRampage(on) {
  if (!engineFilt || !ctx || _engineRampage === on) return;
  _engineRampage = on;
  const t = ctx.currentTime;
  if (on) {
    engineFilt.frequency.setTargetAtTime(2600, t, 0.08);
    engineFilt.Q.setTargetAtTime(2.6, t, 0.08);
    engineGain.gain.setTargetAtTime(0.14, t, 0.06);
    engineGainSub.gain.setTargetAtTime(0.10, t, 0.06);
  } else {
    engineFilt.Q.setTargetAtTime(1.4, t, 0.15);
  }
}

// ── SFX ──
export function sfxNearMiss() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.14, t + i * 0.05 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.12);
    o.connect(g); g.connect(sfxGain); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.14);
  });
}
// Coin pickup — a bright two-note ting (B5 → E6).
export function sfxCoin() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [988, 1319].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.12, t + i * 0.055 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.055 + 0.13);
    o.connect(g); g.connect(sfxGain); o.start(t + i * 0.055); o.stop(t + i * 0.055 + 0.15);
  });
}
// Combo blip — pitch climbs a semitone per combo step, with a sparkle harmonic.
export function sfxCombo(level) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = 523 * Math.pow(2, Math.min(12, Math.max(0, level - 1)) / 12);
  const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.17);
  const o2 = ctx.createOscillator(); o2.type = "square"; o2.frequency.value = f * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0;
  g2.gain.linearRampToValueAtTime(0.07, t + 0.01); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
  o2.connect(g2); g2.connect(sfxGain); o2.start(t); o2.stop(t + 0.12);
}
export function sfxBump() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.10);
  const og = ctx.createGain(); og.gain.value = 0.15; og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.16);
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 900;
  const ng = ctx.createGain(); ng.gain.value = 0.10; ng.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain); src.start(t); src.stop(t + 0.12);
}
export function sfxCrash() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 1200;
  const g = ctx.createGain(); g.gain.value = 0.32; g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
  src.connect(filt); filt.connect(g); g.connect(sfxGain); src.start(t); src.stop(t + 0.45);
}
export function sfxRampage() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [261, 392, 523, 659, 784].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.18, t + i * 0.05 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.16);
    o.connect(g); g.connect(sfxGain); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.18);
  });
}
export function sfxShockwave() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(25, t + 0.35);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.30, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.42);
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 600; filt.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0.18; ng.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain); src.start(t); src.stop(t + 0.35);
}
export function sfxBarrelDrop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.40);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.46);
}
// Nitro grab — a filtered noise whoosh sweeping up under a rising tone.
export function sfxNitro() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 4;
  bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(4200, t + 0.45);
  const ng = ctx.createGain(); ng.gain.value = 0;
  ng.gain.linearRampToValueAtTime(0.26, t + 0.06); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  src.connect(bp); bp.connect(ng); ng.connect(sfxGain); src.start(t); src.stop(t + 0.55);
  const o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.4);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.10, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.48);
}

// Opposing-car horn — the doppler blare of a head-on shave going past.
export function sfxHorn() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [440, 554].forEach((f) => {
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 1.09, t);              // approaching...
    o.frequency.linearRampToValueAtTime(f * 0.88, t + 0.34);   // ...and gone past
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.11, t + 0.02);
    g.gain.setValueAtTime(0.11, t + 0.16);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.4);
  });
}

// Ramp takeoff — a short upward whip.
export function sfxLaunch() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.22);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.28);
}

// Landing — suspension slam: a low thud plus a gravel-ish noise burst.
export function sfxLand() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.30, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.3);
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 1600;
  const ng = ctx.createGain(); ng.gain.value = 0.16; ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain); src.start(t); src.stop(t + 0.2);
}

// Klaxon that announces the opposing carriageway opening.
export function sfxAlert() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [0, 0.22, 0.44].forEach((off) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 330;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.15, t + off + 0.02);
    g.gain.setValueAtTime(0.15, t + off + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.19);
    o.connect(g); g.connect(sfxGain); o.start(t + off); o.stop(t + off + 0.21);
  });
}

export function sfxGameOver() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [["G", 4, 0], ["E", 4, 0.14], ["C", 4, 0.28]].forEach(([n, oc, off]) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = noteHz(n, oc);
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.2, t + off + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.4);
    o.connect(g); g.connect(sfxGain); o.start(t + off); o.stop(t + off + 0.45);
  });
}

// ── TYRE SCREECH ── held while the car is sliding. A drift you can hear is
// worth far more than one you can only see: this is the feedback that tells the
// player they are doing the thing the game is rewarding, without a HUD readout.
let skidSrc = null, skidGain = null, skidFilt = null;
export function startSkid() {
  if (!ctx || skidSrc) return;
  skidSrc = ctx.createBufferSource(); skidSrc.buffer = getNoiseBuf(); skidSrc.loop = true;
  skidFilt = ctx.createBiquadFilter(); skidFilt.type = "bandpass"; skidFilt.frequency.value = 1500; skidFilt.Q.value = 5.5;
  skidGain = ctx.createGain(); skidGain.gain.value = 0;
  skidSrc.connect(skidFilt); skidFilt.connect(skidGain); skidGain.connect(sfxGain);
  skidSrc.start();
}
export function setSkidLevel(l) {
  if (!skidGain || !ctx) return;
  const t = ctx.currentTime, v = Math.max(0, Math.min(1, l));
  skidGain.gain.setTargetAtTime(0.085 * v, t, 0.04);
  // Pitch rises with how hard the car is crossing the road, so a committed
  // slide squeals and a lazy one just hisses.
  skidFilt.frequency.setTargetAtTime(1100 + 1500 * v, t, 0.06);
}
export function stopSkid() {
  if (!skidSrc) return;
  try { skidSrc.stop(); } catch {}
  skidSrc.disconnect(); skidGain.disconnect(); skidFilt.disconnect();
  skidSrc = skidGain = skidFilt = null;
}

// ── PASS-BY ── The shave is the most frequent and most important thing that
// happens in this game, and until now it was SILENT at racing speed: the only
// sfxNearMiss() call sat behind a >=100 km/h gate that the 0.60 heat speed floor
// (= 120 km/h) meant could never be the losing branch. The single best moment in
// the loop made no sound at all.
//
// A real pass-by is a band of noise that sweeps DOWN in pitch as the car goes by
// — that Doppler drop is the whole reason a near miss feels near. `tight` (0..1)
// opens it up: a pixel-close shave is louder, brighter and drops further.
export function sfxWhoosh(tight = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const k = Math.max(0, Math.min(1, tight));
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.Q.value = 1.5 + 2.2 * k;
  f.frequency.setValueAtTime(1250 + 900 * k, t);
  f.frequency.exponentialRampToValueAtTime(240, t + 0.20 + 0.08 * k);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05 + 0.16 * k, t + 0.035);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26 + 0.1 * k);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.42);
}

// ── WIND + ROAD ROAR ── A continuous filtered-noise bed that opens with speed.
// The engine alone is a tone, and a tone does not convey velocity: what actually
// tells your ear you are doing 200 is the broadband rush around it. This is the
// cheapest possible "expensive game" lever in the whole project.
let windSrc = null, windGain = null, windFilt = null;
export function startWind() {
  if (!ctx || windSrc) return;
  windSrc = ctx.createBufferSource(); windSrc.buffer = getNoiseBuf(); windSrc.loop = true;
  windFilt = ctx.createBiquadFilter(); windFilt.type = "lowpass";
  windFilt.frequency.value = 400; windFilt.Q.value = 0.6;
  windGain = ctx.createGain(); windGain.gain.value = 0;
  windSrc.connect(windFilt); windFilt.connect(windGain); windGain.connect(sfxGain);
  windSrc.start();
}
// speed01 is 0..1+ of rated top speed; `nos` lifts the whole bed so nitrous
// arrives as air as well as a roar.
export function setWind(speed01, nos = 0) {
  if (!windGain || !ctx) return;
  const t = ctx.currentTime;
  const v = Math.max(0, Math.min(1.3, speed01));
  windGain.gain.setTargetAtTime(0.010 + 0.055 * v * v + 0.030 * nos, t, 0.12);
  windFilt.frequency.setTargetAtTime(320 + 2200 * v + 900 * nos, t, 0.15);
}
export function stopWind() {
  if (!windSrc) return;
  try { windSrc.stop(); } catch {}
  windSrc.disconnect(); windGain.disconnect(); windFilt.disconnect();
  windSrc = windGain = windFilt = null;
}

// ── NITROUS ── a held roar: the crack of the bottle, then a resonant blast whose
// brightness tracks how far the spool has wound in.
let nosSrc = null, nosGain = null, nosFilt = null;
export function startNos() {
  if (!ctx || nosSrc) return;
  const t = ctx.currentTime;
  nosSrc = ctx.createBufferSource(); nosSrc.buffer = getNoiseBuf(); nosSrc.loop = true;
  nosFilt = ctx.createBiquadFilter(); nosFilt.type = "bandpass"; nosFilt.frequency.value = 700; nosFilt.Q.value = 1.1;
  nosGain = ctx.createGain(); nosGain.gain.value = 0;
  nosSrc.connect(nosFilt); nosFilt.connect(nosGain); nosGain.connect(sfxGain);
  nosSrc.start();
  // The purge: a short bright hiss on the way in, so engaging has an attack.
  const p = ctx.createBufferSource(); p.buffer = getNoiseBuf();
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3200;
  const pg = ctx.createGain(); pg.gain.value = 0.22; pg.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  p.connect(hp); hp.connect(pg); pg.connect(sfxGain); p.start(t); p.stop(t + 0.3);
}
export function setNosLevel(l) {
  if (!nosGain || !ctx) return;
  const t = ctx.currentTime, v = Math.max(0, Math.min(1, l));
  nosGain.gain.setTargetAtTime(0.19 * v, t, 0.05);
  nosFilt.frequency.setTargetAtTime(600 + 2800 * v, t, 0.08);
}
export function stopNos() {
  if (!nosSrc) return;
  try { nosSrc.stop(); } catch {}
  nosSrc.disconnect(); nosGain.disconnect(); nosFilt.disconnect();
  nosSrc = nosGain = nosFilt = null;
}

// ── Helicopter rotor — continuous while choppers are on-screen ──
let heliSrc = null, heliGain = null, heliLfo = null, heliLfoGain = null;
export function startHeliSound() {
  if (!ctx || heliSrc) return;
  heliSrc = ctx.createBufferSource(); heliSrc.buffer = getNoiseBuf(); heliSrc.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 3;
  heliGain = ctx.createGain(); heliGain.gain.value = 0;
  heliLfo = ctx.createOscillator(); heliLfo.type = "square"; heliLfo.frequency.value = 18;
  heliLfoGain = ctx.createGain(); heliLfoGain.gain.value = 0.09;
  heliSrc.connect(bp); bp.connect(heliGain);
  heliLfo.connect(heliLfoGain); heliLfoGain.connect(heliGain.gain);
  heliGain.connect(sfxGain);
  heliSrc.start(); heliLfo.start();
  heliGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.3);
}
export function stopHeliSound() {
  if (!heliSrc) return;
  try { heliSrc.stop(); } catch {}
  try { heliLfo.stop(); } catch {}
  heliSrc.disconnect(); heliGain.disconnect(); heliLfo.disconnect(); heliLfoGain.disconnect();
  heliSrc = heliGain = heliLfo = heliLfoGain = null;
}
