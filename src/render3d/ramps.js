// Launch ramps — hazard-striped wedges sitting on the open weaving line. Built
// as pooled ribbons off the curved centerline (same idiom as the tunnel and
// bridge segments), so a ramp bends with the road and never floats off it.
//
// Cross-section per ring is [outer-left base, left top, right top, outer-right
// base], which sweeps out both side walls and the sloped deck in one strip. The
// wedge climbs from flat at its foot to JUMP.rampRise at the lip, and the lip is
// exactly the z the sim triggers on (entities/traffic.js checkRampHit).
import * as THREE from "three";
import { ROAD, JUMP } from "../config.js";

const POOL = 3;
const RINGS = 7;
const HALF_X = (ROAD.halfWidth * 2) / ROAD.laneCount / 2 - 1;   // matches RAMP_HALF_X

export function makeRampsView(scene, road) {
  const v = new THREE.Vector3();

  const idx = [];
  for (let r = 0; r < RINGS - 1; r++) {
    for (let k = 0; k < 3; k++) {
      const a = r * 4 + k, b = a + 1, c = (r + 1) * 4 + k, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const uvs = new Float32Array(RINGS * 4 * 2);
  for (let r = 0; r < RINGS; r++) {
    const vv = r / (RINGS - 1);
    for (let k = 0; k < 4; k++) {
      const o = (r * 4 + k) * 2;
      uvs[o] = k / 3; uvs[o + 1] = vv;
    }
  }

  const tex = makeChevronTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.65, metalness: 0.25, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12,
  });

  const segs = [];
  for (let i = 0; i < POOL; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RINGS * 4 * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs.slice(), 2));
    g.setIndex(idx.slice());
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    segs.push(m);
  }

  function assign(mesh, ramp) {
    const pos = mesh.geometry.attributes.position.array;
    const foot = ramp.z - JUMP.rampLen;
    for (let r = 0; r < RINGS; r++) {
      const u = r / (RINGS - 1);
      const z = foot + u * JUMP.rampLen;
      const y = JUMP.rampRise * u * u;                 // eased kick, not a flat plank
      const xs = [-HALF_X, -HALF_X, HALF_X, HALF_X];
      const ys = [0, y, y, 0];
      for (let k = 0; k < 4; k++) {
        road.worldPos(z, xs[k], v);
        const o = (r * 4 + k) * 3;
        pos[o] = v.x; pos[o + 1] = ys[k] + v.y; pos[o + 2] = v.z;
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
    mesh.visible = true;
  }

  function update(sys, playerZ) {
    let mi = 0;
    for (const r of sys.ramps || []) {
      if (r.z < playerZ - 60 || r.z > playerZ + 260) continue;
      if (mi >= POOL) break;
      assign(segs[mi++], r);
    }
    for (; mi < POOL; mi++) segs[mi].visible = false;
  }

  // The stripes self-illuminate at night so a ramp is still readable once the
  // sun is gone — you have to see it early enough to choose it.
  function setNight(n) { mat.emissiveIntensity = 0.12 + 1.5 * n; }

  return { update, setNight };
}

function makeChevronTexture() {
  const W = 64, H = 128;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "#22252b";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#ffc82e";
  const band = 16;
  for (let y = -W; y < H + W; y += band * 2) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y + W);
    g.lineTo(W, y + W + band);
    g.lineTo(0, y + band);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
