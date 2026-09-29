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

  let vis = 0, fov = 66, drawn = true;

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

  // Returns the FOV to apply this frame.
  function update(dt, speed01) {
    const cp = comfortParams();
    const targetVig = cp.vignetteMax * band(speed01, 0.25, 1.0);
    const kick = cp.fovKickEnabled ? cp.fovKick * band(speed01, 0.3, 1.05) : 0;
    const targetFov = cp.fovBase + kick;

    const a = 1 - Math.exp(-4 * dt);
    vis += (targetVig - vis) * a;
    fov += (targetFov - fov) * a;

    if (vignette) vignette.style.opacity = vis.toFixed(3);
    stepStreaks(streaks, dt, speed01);
    drawStreaks(cp.speedLines ? band(speed01, STREAK.band[0], STREAK.band[1]) : 0);
    return fov;
  }

  return { update };
}
