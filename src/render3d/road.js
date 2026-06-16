// Curved endless road — the bridge between the 2D (x, z) sim and the 3D world.
//
// Owns a CENTERLINE defined by a gentle curvature function κ(z). Integrating κ
// gives a heading θ(z) and a path P(z) in the world XZ-plane. Any sim entity at
// (x, z) maps to world = P(z) + x·N(z), where N is the road's lateral normal.
// Collision/AI never see the curve — this is purely presentation.
//
// The visible road is a fixed-size ribbon of rings whose vertices are recomputed
// every frame from the centerline around the car, so it "scrolls" smoothly and
// curves without ever popping. Lane markings + rumble strips come from a tiled
// canvas texture (UV.v = world distance), so dashes flow toward the player.
import * as THREE from "three";
import { CURVE, ROAD, WORLD } from "../config.js";

const STEP = CURVE.step;                       // centerline sample spacing
const TOTAL_HALF = ROAD.halfWidth + ROAD.shoulder;
const TILE_LEN = 32;                           // world units per texture repeat

// Ribbon window around the car.
const BEHIND = 40, AHEAD = 320, RING_STEP = 4;
const RINGS = Math.round((BEHIND + AHEAD) / RING_STEP) + 1;

function curveAt(d) {
  return CURVE.amp1 * Math.sin(d * CURVE.freq1) +
         CURVE.amp2 * Math.sin(d * CURVE.freq2 + CURVE.phase2);
}

export function makeRoad(scene) {
  // ── Centerline sample store (global index i ↔ distance i*STEP) ──
  let baseI = 0;                  // global index of element 0 of the arrays
  let topI = 0;                   // highest built global index
  const xs = [0], zs = [0], ths = [0];

  function buildTo(globalI) {
    while (topI < globalI) {
      const li = topI - baseI;
      const d = topI * STEP;
      const k = curveAt(d);
      const thMid = ths[li] + k * STEP * 0.5;
      xs.push(xs[li] + Math.sin(thMid) * STEP);
      zs.push(zs[li] + Math.cos(thMid) * STEP);
      ths.push(ths[li] + k * STEP);
      topI++;
    }
  }

  const _c = { x: 0, z: 0, th: 0, sin: 0, cos: 1 };
  function centerlineAt(zDist) {
    let gi = Math.floor(zDist / STEP);
    if (gi < baseI) gi = baseI;
    buildTo(gi + 1);
    const li = gi - baseI;
    const f = zDist / STEP - gi;
    _c.x = xs[li] + (xs[li + 1] - xs[li]) * f;
    _c.z = zs[li] + (zs[li + 1] - zs[li]) * f;
    _c.th = ths[li] + (ths[li + 1] - ths[li]) * f;
    _c.sin = Math.sin(_c.th);
    _c.cos = Math.cos(_c.th);
    return _c;
  }

  // world = P(z) + lat·N(z). The forward-looking chase cam puts world +X on the
  // LEFT of screen, so we use N = (-cosθ, 0, +sinθ) — that makes a positive lateral
  // offset (right-steer) move the car to screen-RIGHT. Symmetric road/scenery make
  // the sign choice invisible everywhere except the steer direction.
  function worldPos(zDist, lat, out) {
    const c = centerlineAt(zDist);
    out.set(c.x - lat * c.cos, WORLD.groundY, c.z + lat * c.sin);
    return out;
  }
  function headingAt(zDist) { return centerlineAt(zDist).th; }

  function prune(playerZ) {
    const keepFromI = Math.floor((playerZ - 60) / STEP);
    const drop = keepFromI - baseI;
    if (drop > 128) {
      xs.splice(0, drop); zs.splice(0, drop); ths.splice(0, drop);
      baseI += drop;
    }
  }

  // ── Ribbon mesh ──
  const positions = new Float32Array(RINGS * 2 * 3);
  const uvs = new Float32Array(RINGS * 2 * 2);
  const normals = new Float32Array(RINGS * 2 * 3);
  for (let i = 0; i < RINGS * 2; i++) normals[i * 3 + 1] = 1;   // all face up
  const indices = [];
  for (let r = 0; r < RINGS - 1; r++) {
    const a = r * 2, b = r * 2 + 1, c = (r + 1) * 2, d = (r + 1) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);

  const tex = makeRoadTexture();
  // Light sheen — subtle reflection, mostly matte so the road stays neutral.
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide });
  mat.envMapIntensity = 0.7;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const _l = new THREE.Vector3(), _r = new THREE.Vector3();
  function update(playerZ) {
    prune(playerZ);
    const posAttr = geo.attributes.position, uvAttr = geo.attributes.uv;
    for (let r = 0; r < RINGS; r++) {
      const zDist = playerZ - BEHIND + r * RING_STEP;
      worldPos(zDist, -TOTAL_HALF, _l);
      worldPos(zDist, +TOTAL_HALF, _r);
      const o = r * 6;
      positions[o] = _l.x; positions[o + 1] = _l.y; positions[o + 2] = _l.z;
      positions[o + 3] = _r.x; positions[o + 4] = _r.y; positions[o + 5] = _r.z;
      const uo = r * 4, v = zDist / TILE_LEN;
      uvs[uo] = 0; uvs[uo + 1] = v;
      uvs[uo + 2] = 1; uvs[uo + 3] = v;
    }
    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
  }

  return { mesh, update, worldPos, headingAt, centerlineAt };
}

// Cross-section texture (u across the full width incl. shoulders, v along road).
function makeRoadTexture() {
  const W = 256, H = 256;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");

  const total = TOTAL_HALF * 2;
  const uShoulder = ROAD.shoulder / total;            // shoulder fraction each side
  const uRoadL = uShoulder, uRoadR = 1 - uShoulder;
  const px = (u) => Math.round(u * W);

  // Shoulders (sandy).
  g.fillStyle = "#b7a06a"; g.fillRect(0, 0, W, H);
  // Asphalt.
  g.fillStyle = "#3a3d44"; g.fillRect(px(uRoadL), 0, px(uRoadR) - px(uRoadL), H);

  // Rumble strips just inside each shoulder (red/white along v).
  const rumbleW = Math.max(3, Math.round(0.012 * W));
  for (let y = 0; y < H; y += 16) {
    g.fillStyle = (Math.floor(y / 16) % 2 === 0) ? "#d63b3b" : "#eeeeee";
    g.fillRect(px(uRoadL), y, rumbleW, 16);
    g.fillRect(px(uRoadR) - rumbleW, y, rumbleW, 16);
  }
  // Solid white road edge lines.
  g.fillStyle = "#e9e9e9";
  g.fillRect(px(uRoadL) + rumbleW, 0, 2, H);
  g.fillRect(px(uRoadR) - rumbleW - 2, 0, 2, H);

  // Dashed lane separators (4 internal lines for 5 lanes).
  const roadFrac = uRoadR - uRoadL;
  g.fillStyle = "#f4f4f4";
  for (let k = 1; k < ROAD.laneCount; k++) {
    const u = uRoadL + roadFrac * (k / ROAD.laneCount);
    const x = px(u);
    for (let y = 0; y < H; y += H / 4) {            // 4 dash cycles per tile
      g.fillRect(x - 1, y, 3, Math.round(H / 4 * 0.55));
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
