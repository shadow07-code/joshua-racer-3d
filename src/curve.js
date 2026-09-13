// The road's shape, as pure math: curvature, elevation and grade at a distance.
//
// Split out of render3d/road.js so it can be imported in node without pulling in
// Three.js — the project rule is that anything the design depends on gets proved
// headlessly before a browser is opened, and "the road never sinks below the
// sea" is exactly that kind of claim (tools/heattest.mjs section N).
import { CURVE } from "./config.js";

// κ(z) = 1/radius. Integrated by road.js into a heading and a path; never sharp,
// so the curve stays comfortable at 200 km/h.
export function curveAt(d) {
  return CURVE.amp1 * Math.sin(d * CURVE.freq1) +
         CURVE.amp2 * Math.sin(d * CURVE.freq2 + CURVE.phase2);
}

// y(z) — CRESTS AND DIPS. Unlike the curvature this is NOT integrated: elevation
// is a direct function of distance, so it needs no sample store, cannot drift,
// and is identical on frame one of every run.
//
// Offset by the full amplitude so the result is always >= 0, which is what keeps
// the road (and the sand causeway hanging off it) above environment.js's sea
// plane no matter what phase the player happens to be driving through.
const ELEV_BASE = CURVE.elevAmp1 + CURVE.elevAmp2;
export function elevAt(d) {
  return ELEV_BASE
    + CURVE.elevAmp1 * Math.sin(d * CURVE.elevFreq1)
    + CURVE.elevAmp2 * Math.sin(d * CURVE.elevFreq2 + CURVE.elevPhase2);
}

// dy/dz — the GRADE. Anything long enough to notice it (the player car at 17
// units, a bus at 22) pitches by this, or it hangs nose-up on a climb and
// ploughs into the tarmac coming down the other side.
export function gradeAt(d) {
  return CURVE.elevAmp1 * CURVE.elevFreq1 * Math.cos(d * CURVE.elevFreq1)
    + CURVE.elevAmp2 * CURVE.elevFreq2 * Math.cos(d * CURVE.elevFreq2 + CURVE.elevPhase2);
}
