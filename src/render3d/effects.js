// Speed effects — dynamic vignette + FOV kick + radial speed lines.
//
// Spectacle-first: the FOV widens, the edges darken, and white speed streaks
// rush outward from the vanishing point as speed climbs. Comfort Mode disables
// the FOV kick + speed lines and deepens the vignette.
import { params as comfortParams } from "../comfort.js";

export function makeEffects() {
  const vignette = document.getElementById("speed-vignette");
  const lineCanvas = document.getElementById("speed-lines");
  const lctx = lineCanvas ? lineCanvas.getContext("2d") : null;

  // Fixed streak angles so the lines don't flicker frame-to-frame.
  const N = 46;
  const angles = [];
  for (let i = 0; i < N; i++) angles.push(Math.random() * Math.PI * 2);

  let vis = 0, fov = 66;

  function band(t, a, b) {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  }

  function drawSpeedLines(intensity) {
    if (!lctx) return;
    const w = window.innerWidth, h = window.innerHeight;
    if (lineCanvas.width !== w || lineCanvas.height !== h) { lineCanvas.width = w; lineCanvas.height = h; }
    lctx.clearRect(0, 0, w, h);
    if (intensity <= 0.001) return;
    const cx = w / 2, cy = h * 0.46;            // vanishing point ~road horizon
    const rIn = Math.min(w, h) * 0.18;
    const rOut = Math.max(w, h) * 0.62;
    lctx.lineCap = "round";
    for (let i = 0; i < N; i++) {
      const a = angles[i];
      const ca = Math.cos(a), sa = Math.sin(a);
      lctx.strokeStyle = `rgba(255,255,255,${(0.10 + 0.22 * Math.random()) * intensity})`;
      lctx.lineWidth = 1 + 1.5 * intensity;
      lctx.beginPath();
      lctx.moveTo(cx + ca * rIn, cy + sa * rIn);
      lctx.lineTo(cx + ca * rOut, cy + sa * rOut);
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
    drawSpeedLines(cp.speedLines ? band(speed01, 0.5, 1.05) : 0);
    return fov;
  }

  return { update };
}
