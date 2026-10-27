// Speed effects — dynamic vignette + FOV kick + speed streaks.
//
// Spectacle-first: the FOV widens, the edges darken, and streaks of light rush
// out of the vanishing point past the lens as speed climbs. Comfort Mode
// disables the FOV kick + streaks and deepens the vignette.
import { params as comfortParams } from "../comfort.js";

// SPEED STREAKS. Each one is a dash travelling OUT along a fixed ray from the
// vanishing point, and it ACCELERATES as it comes (perspective: things near the
// horizon crawl, things at the edge of frame fly past), so its length is simply
// how far it moves in a short shutter — a motion blur, which is why a fast one
// is long and a new one is a speck. They used to be 46 fixed spokes whose
// brightness was re-rolled every frame: at 60 fps that is a shimmer, not motion,
// and the spokes ran straight across the car. Nothing below the car's ray is
// used now either — the streaks live in the sky and down the sides of the road.
export const STREAK = {
  count: 40,
  band: [0.5, 1.02],   // speed01 over which they fade in (cold floor ~0.6 = a hint)
  k: [1.5, 3.2],       // outward growth rate = k0 + k1 × speed01 (per second)
  r0: 0.15,            // perspective offset: a streak at r=0 still creeps outward
  shutter: 0.05,       // seconds of travel drawn as the streak's length
  alpha: [0.22, 0.52], // per-streak brightness range (fixed for its life, no flicker)
  gap: 0.72,           // radians either side of straight down left empty (the car)
};

// Pure: a pool of streaks, spread along their rays so the first frame is full.
export function makeStreaks(n = STREAK.count, rand = Math.random) {
  const S = [];
  for (let i = 0; i < n; i++) { const s = {}; respawn(s, rand); s.r = rand(); S.push(s); }
  return S;
}

function respawn(s, rand) {
  // Any angle except the wedge below the vanishing point where the car sits.
  const span = 2 * Math.PI - 2 * STREAK.gap;
  const a = Math.PI / 2 + STREAK.gap + rand() * span;   // canvas y is down: π/2 = straight down
  s.ca = Math.cos(a); s.sa = Math.sin(a);
  s.r = rand() * 0.08;
  s.alpha = STREAK.alpha[0] + rand() * (STREAK.alpha[1] - STREAK.alpha[0]);
  s.len = 0;
}

// Pure: advance every streak one frame. Returns the pool for chaining.
export function stepStreaks(S, dt, speed01, rand = Math.random) {
  const k = STREAK.k[0] + STREAK.k[1] * Math.max(0, Math.min(1.1, speed01));
  for (const s of S) {
    const v = k * (s.r + STREAK.r0);                    // d(r)/dt, fraction of the ray per second
    s.r += v * dt;
    s.len = v * STREAK.shutter;
    if (s.r - s.len > 1) respawn(s, rand);
  }
  return S;
}

export function makeEffects() {
  const vignette = document.getElementById("speed-vignette");
  const lineCanvas = document.getElementById("speed-lines");
  const lctx = lineCanvas ? lineCanvas.getContext("2d") : null;
  const streaks = makeStreaks();

  let vis = 0, fov = 62, drawn = true;
  // LENS PUNCH — degrees of FOV added on top of the speed kick, decaying fast.
  // Positive = the lens is blown open (a shave, OVERDRIVE); negative = it
  // flinches in (an impact). Spectacle only: Comfort Mode ignores it.
  let punch = 0, punchNow = 0;     // target (decays) and what the lens shows (attacks in ~2 frames)
  // THE TOW. Sitting in a slipstream used to change nothing on screen — the
  // only sign was a popup AFTER you pulled out, so half of the game's core move
  // ("tailgate, shave and slide") was invisible while you were doing it. Now
  // the air visibly rushes: the streaks speed up and thicken and the edges
  // close in, scaled by how close to the bumper you are.
  let tow = 0;                     // smoothed slipstream closeness, 0..1

  function band(t, a, b) {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  }

  function drawStreaks(intensity) {
    if (!lctx) return;
    const w = window.innerWidth, h = window.innerHeight;
    if (lineCanvas.width !== w || lineCanvas.height !== h) { lineCanvas.width = w; lineCanvas.height = h; drawn = true; }
    if (intensity <= 0.001) {
      if (drawn) { lctx.clearRect(0, 0, w, h); drawn = false; }   // idle: no per-frame clear
      return;
    }
    lctx.clearRect(0, 0, w, h);
    drawn = true;
    const cx = w / 2, cy = h * 0.46;                    // vanishing point ~road horizon
    const rIn = Math.min(w, h) * 0.2;
    const span = Math.hypot(w, h) * 0.55 - rIn;         // r = 1 is just past the corner
    lctx.lineCap = "round";
    for (const s of streaks) {
      const head = Math.min(1.02, s.r), tail = Math.max(0, s.r - s.len);
      if (head <= tail) continue;
      // Born faint at the horizon, full strength by a quarter of the way out.
      const born = Math.min(1, s.r / 0.25);
      const a = s.alpha * intensity * born * born;
      if (a < 0.01) continue;
      const r1 = rIn + tail * span, r2 = rIn + head * span;
      lctx.strokeStyle = `rgba(255,246,232,${a.toFixed(3)})`;
      lctx.lineWidth = 1 + 2.4 * s.r * intensity;
      lctx.beginPath();
      lctx.moveTo(cx + s.ca * r1, cy + s.sa * r1);
      lctx.lineTo(cx + s.ca * r2, cy + s.sa * r2);
      lctx.stroke();
    }
  }

  // Returns the FOV to apply this frame. `draft` is the slipstream's closeness
  // (0 = not in a tow, 1 = on the bumper).
  function update(dt, speed01, draft = 0) {
    const cp = comfortParams();
    tow += (draft - tow) * (1 - Math.exp(-dt * (draft > tow ? 10 : 5)));
    const targetVig = cp.vignetteMax * band(speed01, 0.25, 1.0) + 0.32 * tow;
    const kick = cp.fovKickEnabled ? cp.fovKick * band(speed01, 0.3, 1.05) : 0;
    const targetFov = cp.fovBase + kick;

    const a = 1 - Math.exp(-4 * dt);
    vis += (targetVig - vis) * a;
    fov += (targetFov - fov) * a;

    if (vignette) vignette.style.opacity = vis.toFixed(3);
    punch *= Math.exp(-dt * 6);
    punchNow += (punch - punchNow) * (1 - Math.exp(-dt * 30));
    const open = cp.fovKickEnabled ? Math.max(0, punchNow) : 0;
    // A blown-open lens also floods the streaks for a moment — the air rushing in.
    stepStreaks(streaks, dt, speed01 + open * 0.06 + 0.5 * tow);
    drawStreaks(cp.speedLines ? Math.min(1.4, band(speed01, STREAK.band[0], STREAK.band[1]) + open * 0.12 + 1.0 * tow) : 0);
    return fov + (cp.fovKickEnabled ? punchNow : 0);
  }

  function punchLens(deg) {
    if (Math.abs(deg) > Math.abs(punch) || Math.sign(deg) !== Math.sign(punch)) punch = deg;
  }

  return { update, punchLens };
}
