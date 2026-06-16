// Environment — the NFS2-style varied scenery that the road runs through:
//   • a shimmering SEA stretching to the horizon,
//   • a sand CAUSEWAY (embankment) that the road sits on, sloping down to the sea,
//   • atmospheric TUNNELS (zone-driven) with emissive ceiling lights streaming past.
// Everything is driven off the curved centerline (road.worldPos) and the zone map.
import * as THREE from "three";
import { ROAD } from "../config.js";
import { zoneTypeAt } from "./zones.js";

const TOTAL_HALF = ROAD.halfWidth + ROAD.shoulder;   // 63
const SEA_Y = -3.2;
const EMB = 108;                                      // sand half-width
const EMB_EDGE = 130;                                 // slopes down to the sea here

// Ribbon coverage window (matches the road).
const BEHIND = 40, AHEAD = 320, STEP = 6;
const RINGS = Math.round((BEHIND + AHEAD) / STEP) + 1;

// Tunnel arch cross-section (local lateral x, height y) — springs from the ground
// at ±66, arches to a 26-high apex.
const ARCH_X = [-66, -66, -40, 0, 40, 66, 66];
const ARCH_Y = [0, 13, 22, 26, 22, 13, 0];
const ARCH_N = ARCH_X.length;
const APEX = 26;

// Tunnel is tiled from a pool of short arch segments (clean open mouths, no
// collapse artifacts).
const TSEG_LEN = 30, TSEG_RINGS = 6;
const TUNNEL_POOL = 16;
const LIGHT_SPACING = 26, LIGHT_POOL = 18;

export function makeEnvironment(scene, road) {
  const v = new THREE.Vector3();

  // ── Sea ──
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x35637c, metalness: 0.2, roughness: 0.3 });
  seaMat.envMapIntensity = 0.8;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  sea.renderOrder = -2;
  scene.add(sea);

  // ── Sand causeway (4-vert cross-section: sea-edge → flat → flat → sea-edge) ──
  const EMB_N = 4;
  const embX = [-EMB_EDGE, -EMB, EMB, EMB_EDGE];
  const embY = [SEA_Y, -0.05, -0.05, SEA_Y];
  const embGeo = new THREE.BufferGeometry();
  const embPos = new Float32Array(RINGS * EMB_N * 3);
  const embIdx = [];
  for (let r = 0; r < RINGS - 1; r++) {
    for (let k = 0; k < EMB_N - 1; k++) {
      const a = r * EMB_N + k, b = a + 1, c = (r + 1) * EMB_N + k, d = c + 1;
      embIdx.push(a, c, b, b, c, d);
    }
  }
  embGeo.setAttribute("position", new THREE.BufferAttribute(embPos, 3));
  embGeo.setIndex(embIdx);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0x8c7d58, roughness: 0.96, metalness: 0 });
  const embMesh = new THREE.Mesh(embGeo, sandMat);
  embMesh.frustumCulled = false;
  scene.add(embMesh);

  // ── Tunnel segment pool ──
  const concrete = new THREE.MeshStandardMaterial({ color: 0x474a51, roughness: 0.92, metalness: 0.06, side: THREE.DoubleSide });
  concrete.envMapIntensity = 0.25;
  const tIdx = [];
  for (let r = 0; r < TSEG_RINGS - 1; r++) {
    for (let k = 0; k < ARCH_N - 1; k++) {
      const a = r * ARCH_N + k, b = a + 1, c = (r + 1) * ARCH_N + k, d = c + 1;
      tIdx.push(a, c, b, b, c, d);
    }
  }
  const tunnelSegs = [];
  for (let i = 0; i < TUNNEL_POOL; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TSEG_RINGS * ARCH_N * 3), 3));
    g.setIndex(tIdx.slice());
    const m = new THREE.Mesh(g, concrete);
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    tunnelSegs.push(m);
  }

  // ── Ceiling light pool ──
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x1a1612, emissive: 0xffe2a8, emissiveIntensity: 3.2, roughness: 0.5 });
  const lights = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 1.4), lightMat);
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    lights.push(m);
  }

  function updateEmbankment(playerZ) {
    for (let r = 0; r < RINGS; r++) {
      const z = playerZ - BEHIND + r * STEP;
      for (let k = 0; k < EMB_N; k++) {
        road.worldPos(z, embX[k], v);
        const o = (r * EMB_N + k) * 3;
        embPos[o] = v.x; embPos[o + 1] = embY[k]; embPos[o + 2] = v.z;
      }
    }
    embGeo.attributes.position.needsUpdate = true;
    embGeo.computeVertexNormals();
    embGeo.computeBoundingSphere();
  }

  function assignTunnelSeg(seg, z0) {
    const pos = seg.geometry.attributes.position.array;
    const dz = TSEG_LEN / (TSEG_RINGS - 1);
    for (let r = 0; r < TSEG_RINGS; r++) {
      const z = z0 + r * dz;
      for (let k = 0; k < ARCH_N; k++) {
        road.worldPos(z, ARCH_X[k], v);
        const o = (r * ARCH_N + k) * 3;
        pos[o] = v.x; pos[o + 1] = ARCH_Y[k]; pos[o + 2] = v.z;
      }
    }
    seg.geometry.attributes.position.needsUpdate = true;
    seg.geometry.computeVertexNormals();
    seg.geometry.computeBoundingSphere();
    seg.visible = true;
  }

  function updateTunnels(playerZ) {
    let pi = 0;
    const start = Math.floor((playerZ - BEHIND) / TSEG_LEN) * TSEG_LEN;
    for (let z = start; z < playerZ + AHEAD; z += TSEG_LEN) {
      if (zoneTypeAt(z + TSEG_LEN / 2) === "tunnel" && pi < TUNNEL_POOL) assignTunnelSeg(tunnelSegs[pi++], z);
    }
    for (let i = pi; i < TUNNEL_POOL; i++) tunnelSegs[i].visible = false;

    let li = 0;
    const lstart = Math.floor((playerZ - BEHIND) / LIGHT_SPACING) * LIGHT_SPACING;
    for (let z = lstart; z < playerZ + AHEAD; z += LIGHT_SPACING) {
      if (zoneTypeAt(z) === "tunnel" && li < LIGHT_POOL) {
        road.worldPos(z, 0, v);
        const lm = lights[li++];
        lm.position.set(v.x, APEX - 1.6, v.z);
        lm.rotation.y = road.headingAt(z);
        lm.visible = true;
      }
    }
    for (let i = li; i < LIGHT_POOL; i++) lights[i].visible = false;
  }

  function update(playerZ) { updateEmbankment(playerZ); updateTunnels(playerZ); }
  function follow(cam) { sea.position.x = cam.position.x; sea.position.z = cam.position.z; }

  return { update, follow };
}
