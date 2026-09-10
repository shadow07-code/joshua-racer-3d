// Speed effects — dynamic vignette + FOV kick + radial speed lines.
//
// Spectacle-first: the FOV widens, the edges darken, and white speed streaks
// rush outward from the vanishing point as speed climbs. Comfort Mode disables
// the FOV kick + speed lines and deepens the vignette.
import { params as comfortParams } from "../comfort.js";
import { NOS } from "../config.js";

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

  function drawSpeedLines(intensity, nos = 0) {
    if (!lctx) return;
    const w = window.innerWidth, h = window.innerHeight;
    if (lineCanvas.width !== w || lineCanvas.height !== h) { lineCanvas.width = w; lineCanvas.height = h; }
    lctx.clearRect(0, 0, w, h);
    if (intensity <= 0.001) return;
    const cx = w / 2, cy = h * 0.46;            // vanishing point ~road horizon
    // On nitrous the streaks start closer to the vanishing point and run right
    // off the edge of the frame — that is what reads as motion blur.
    const rIn = Math.min(w, h) * (0.18 - 0.12 * nos);
    const rOut = Math.max(w, h) * (0.62 + 0.55 * nos);
    lctx.lineCap = "round";
    for (let i = 0; i < N; i++) {
      const a = angles[i];
      const ca = Math.cos(a), sa = Math.sin(a);
      lctx.strokeStyle = `rgba(255,${Math.round(255 - 40 * nos)},${Math.round(255 - 90 * nos)},${(0.10 + 0.30 * Math.random()) * intensity})`;
      lctx.lineWidth = 1 + 1.5 * intensity + 1.6 * nos;
      lctx.beginPath();
      lctx.moveTo(cx + ca * rIn, cy + sa * rIn);
      lctx.lineTo(cx + ca * rOut, cy + sa * rOut);
      lctx.stroke();
    }
  }

  // Returns the FOV to apply this frame. `nos` (0..1) is the nitrous spool, and
  // it is what turns speed into the Underground shot: the lens yanks wide, the
  // vignette clamps down, and the streaks go from a hint to a tunnel.
  function update(dt, speed01, nos = 0) {
    const cp = comfortParams();
    const targetVig = cp.vignetteMax * Math.max(band(speed01, 0.25, 1.0), nos * 0.85);
    const kick = cp.fovKickEnabled ? cp.fovKick * band(speed01, 0.3, 1.05) : 0;
    // The FOV punch is the single biggest "I am going fast" lever there is, so it
    // survives Comfort Mode at reduced strength rather than being switched off.
    const targetFov = cp.fovBase + kick + NOS.fovKick * nos * (cp.fovKickEnabled ? 1 : 0.4);

    // NOS winds in faster than the ambient easing, or the punch arrives late.
    const a = 1 - Math.exp(-(4 + 8 * nos) * dt);
    vis += (targetVig - vis) * a;
    fov += (targetFov - fov) * a;

    if (vignette) vignette.style.opacity = vis.toFixed(3);
    const streak = Math.max(cp.speedLines ? band(speed01, 0.5, 1.05) : 0, nos);
    drawSpeedLines(streak, nos);
    return fov;
  }

  return { update };
}
