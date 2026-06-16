// Procedural Web Audio — F1 rumble-to-wail engine + all SFX + helicopter rotor.
// PORTED from the 2D reference src/audio.js (the synth voices are kept ~verbatim).
// The dual chiptune MUSIC tracks are dropped — the supplied MP3 (music.js) is the
// music bed now. Everything here routes through one SFX channel (one toggle).

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
export function setEngine(speed01) {
  if (!engineOsc || !ctx) return;
  const s = Math.max(0, Math.min(1, speed01));
  const t = ctx.currentTime;
  const curve = Math.pow(s, 1.7);
  const f = 38 + 300 * curve;
  engineOsc.frequency.setTargetAtTime(f, t, 0.06);
  engineOsc2.frequency.setTargetAtTime(f * 1.006, t, 0.06);
  engineOscSub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
  if (!_engineRampage) engineFilt.frequency.setTargetAtTime(320 + 1900 * curve, t, 0.08);
  const vol = 0.030 + 0.055 * curve;
  engineGain.gain.setTargetAtTime(vol, t, 0.06);
  engineGainSub.gain.setTargetAtTime(vol * 0.70, t, 0.06);
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
