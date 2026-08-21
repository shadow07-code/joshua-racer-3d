// Environment — the NFS2-style varied scenery that the road runs through:
//   • a shimmering SEA stretching to the horizon,
//   • a sand CAUSEWAY (embankment) that the road sits on, sloping down to the sea,
//   • atmospheric TUNNELS (zone-driven) with emissive ceiling lights streaming past,
//   • a suspension BRIDGE (zone-driven) — deck + parapets, pylon towers, and main
//     cables with hangers — carrying the road out over open water.
// Everything is driven off the curved centerline (road.worldPos) and the zone map.
import * as THREE from "three";
import { ROAD } from "../config.js";
import { zoneTypeAt, zoneBlend } from "./zones.js";

const TOTAL_HALF = ROAD.halfWidth + ROAD.shoulder;   // 63
// The sea sits well below the road so the causeway reads as a raised embankment
// and, more importantly, so the bridge deck has real air beneath it.
const SEA_Y = -8.5;
const EMB = 108;                                      // sand half-width
const EMB_EDGE = 132;                                 // slopes down to the sea here

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

// ── Bridge ──
// Deck cross-section, drawn as an open box-girder outline: parapet wall, a
// chamfer down to the girder, then the flat underside. Same segment-pool trick
// as the tunnel, so the span starts and ends crisply on an abutment — a bridge
// SHOULD have a hard edge. Only the sand causeway needs to fade, and it does
// that by sinking under the water (see updateEmbankment).
const BR_HALF = TOTAL_HALF + 2.6;                     // 65.6
const PARAPET_H = 2.6, GIRDER_Y = -3.6;
const DECK_X = [-BR_HALF, -BR_HALF, -BR_HALF + 3, BR_HALF - 3, BR_HALF, BR_HALF];
const DECK_Y = [PARAPET_H, -0.7, GIRDER_Y, GIRDER_Y, -0.7, PARAPET_H];
const DECK_N = DECK_X.length;
const BSEG_LEN = 40, BSEG_RINGS = 5, BRIDGE_POOL = 12;

const TOWER_SPACING = 190, TOWER_POOL = 4, SPAN_POOL = 3;
const TOWER_H = 48, PYLON_X = BR_HALF + 2.4;
const CABLE_TOP = 42, CABLE_SAG = 33;                 // midspan cable sits ~9 above the deck
const CABLE_SAMPLES = 14, HANGER_EVERY = 2;
const CABLE_COUNT = SPAN_POOL * 2 * CABLE_SAMPLES;
const HANGER_COUNT = SPAN_POOL * 2 * Math.ceil(CABLE_SAMPLES / HANGER_EVERY);

const lerp = (a, b, t) => a + (b - a) * t;

export function makeEnvironment(scene, road) {
  const v = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

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

  // ── Bridge deck segment pool ──
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 0.85, metalness: 0.18, side: THREE.DoubleSide });
  deckMat.envMapIntensity = 0.35;
  const dIdx = [];
  for (let r = 0; r < BSEG_RINGS - 1; r++) {
    for (let k = 0; k < DECK_N - 1; k++) {
      const a = r * DECK_N + k, b = a + 1, c = (r + 1) * DECK_N + k, d = c + 1;
      dIdx.push(a, c, b, b, c, d);
    }
  }
  const deckSegs = [];
  for (let i = 0; i < BRIDGE_POOL; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BSEG_RINGS * DECK_N * 3), 3));
    g.setIndex(dIdx.slice());
    const m = new THREE.Mesh(g, deckMat);
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    deckSegs.push(m);
  }

  // ── Pylon towers (cloned pool) ──
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x6a6f7a, roughness: 0.6, metalness: 0.45 });
  steelMat.envMapIntensity = 0.5;
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x1a1408, emissive: 0xffb03a, emissiveIntensity: 0.5, roughness: 0.4 });
  const towerProto = makeTower(steelMat, neonMat);
  const towers = [];
  for (let i = 0; i < TOWER_POOL; i++) {
    const g = towerProto.clone();
    g.visible = false;
    scene.add(g);
    towers.push(g);
  }

  // ── Main cables + hangers (instanced segments) ──
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ae, roughness: 0.45, metalness: 0.7 });
  const cables = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.62, 1), cableMat, CABLE_COUNT);
  cables.frustumCulled = false;
  scene.add(cables);
  const hangers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1, 0.3), cableMat, HANGER_COUNT);
  hangers.frustumCulled = false;
  scene.add(hangers);

  // ── Frame updates ────────────────────────────────────────────────────────
  function updateEmbankment(playerZ) {
    for (let r = 0; r < RINGS; r++) {
      const z = playerZ - BEHIND + r * STEP;
      // Over a bridge the causeway does not narrow — it SINKS, sliding under the
      // sea plane (which is opaque, so it simply disappears). That reads as a
      // beach running out into the water, and needs no width trickery.
      const sink = zoneBlend(z, "bridge") * (Math.abs(SEA_Y) + 4);
      for (let k = 0; k < EMB_N; k++) {
        road.worldPos(z, embX[k], v);
        const o = (r * EMB_N + k) * 3;
        embPos[o] = v.x; embPos[o + 1] = embY[k] - sink; embPos[o + 2] = v.z;
      }
    }
    embGeo.attributes.position.needsUpdate = true;
    embGeo.computeVertexNormals();
    embGeo.computeBoundingSphere();
  }

  // Shared "stamp a cross-section along z into a pooled ribbon" helper.
  function assignSeg(seg, z0, len, rings, xs, ys) {
    const pos = seg.geometry.attributes.position.array;
    const n = xs.length;
    const dz = len / (rings - 1);
    for (let r = 0; r < rings; r++) {
      const z = z0 + r * dz;
      for (let k = 0; k < n; k++) {
        road.worldPos(z, xs[k], v);
        const o = (r * n + k) * 3;
        pos[o] = v.x; pos[o + 1] = ys[k]; pos[o + 2] = v.z;
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
      if (zoneTypeAt(z + TSEG_LEN / 2) === "tunnel" && pi < TUNNEL_POOL) {
        assignSeg(tunnelSegs[pi++], z, TSEG_LEN, TSEG_RINGS, ARCH_X, ARCH_Y);
      }
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

  // Cable height above the deck at fraction u across a span (parabolic sag —
  // anchored at the pylon tops, lowest at midspan).
  const cableY = (u) => CABLE_TOP - CABLE_SAG * 4 * u * (1 - u);

  function updateBridge(playerZ) {
    // Deck.
    let di = 0;
    const dstart = Math.floor((playerZ - BEHIND) / BSEG_LEN) * BSEG_LEN;
    for (let z = dstart; z < playerZ + AHEAD; z += BSEG_LEN) {
      if (zoneTypeAt(z + BSEG_LEN / 2) === "bridge" && di < BRIDGE_POOL) {
        assignSeg(deckSegs[di++], z, BSEG_LEN, BSEG_RINGS, DECK_X, DECK_Y);
      }
    }
    for (let i = di; i < BRIDGE_POOL; i++) deckSegs[i].visible = false;

    // Towers on a fixed z grid, wherever that grid falls inside a bridge zone.
    const tstart = Math.floor((playerZ - BEHIND) / TOWER_SPACING) * TOWER_SPACING;
    let ti = 0, ci = 0, hi = 0;
    for (let z = tstart; z <= playerZ + AHEAD; z += TOWER_SPACING) {
      if (zoneTypeAt(z) !== "bridge") continue;
      if (ti < TOWER_POOL) {
        const g = towers[ti++];
        road.worldPos(z, 0, v);
        g.position.set(v.x, 0, v.z);
        g.rotation.y = road.headingAt(z);
        g.visible = true;
      }
      // Main cable + hangers for the span STARTING here — only if it lands on
      // another tower. The deck runs on past the last one as an approach span.
      if (zoneTypeAt(z + TOWER_SPACING) !== "bridge") continue;
      for (const side of [-1, 1]) {
        const lat = side * PYLON_X;
        for (let i = 0; i < CABLE_SAMPLES; i++) {
          const u0 = i / CABLE_SAMPLES, u1 = (i + 1) / CABLE_SAMPLES;
          road.worldPos(z + u0 * TOWER_SPACING, lat, _a); _a.y = cableY(u0);
          road.worldPos(z + u1 * TOWER_SPACING, lat, _b); _b.y = cableY(u1);
          if (ci < CABLE_COUNT) {
            dummy.position.copy(_a).lerp(_b, 0.5);
            dummy.scale.set(1, 1, _a.distanceTo(_b));
            dummy.lookAt(_b);                     // local +Z runs along the cable
            dummy.updateMatrix();
            cables.setMatrixAt(ci++, dummy.matrix);
          }
          if (i > 0 && i % HANGER_EVERY === 0 && hi < HANGER_COUNT) {
            const drop = _a.y - PARAPET_H;
            dummy.position.set(_a.x, PARAPET_H + drop / 2, _a.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, drop, 1);
            dummy.updateMatrix();
            hangers.setMatrixAt(hi++, dummy.matrix);
          }
        }
      }
    }
    for (let i = ti; i < TOWER_POOL; i++) towers[i].visible = false;
    hideRest(cables, ci, CABLE_COUNT);
    hideRest(hangers, hi, HANGER_COUNT);
    cables.instanceMatrix.needsUpdate = true;
    hangers.instanceMatrix.needsUpdate = true;
  }

  function hideRest(inst, from, count) {
    if (from >= count) return;
    dummy.position.set(0, -9999, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = from; i < count; i++) inst.setMatrixAt(i, dummy.matrix);
  }

  function update(playerZ) { updateEmbankment(playerZ); updateTunnels(playerZ); updateBridge(playerZ); }
  function follow(cam) { sea.position.x = cam.position.x; sea.position.z = cam.position.z; }

  // Nightfall grade: the water and sand go cold and dark while every artificial
  // light in the world (tunnel strips, tower neon) takes over the frame.
  const SEA_DUSK = new THREE.Color(0x35637c), SEA_NIGHT = new THREE.Color(0x0d1c2e);
  const SAND_DUSK = new THREE.Color(0x8c7d58), SAND_NIGHT = new THREE.Color(0x2b2a2c);
  const CONC_DUSK = new THREE.Color(0x474a51), CONC_NIGHT = new THREE.Color(0x2a2d33);
  const DECK_DUSK = new THREE.Color(0x555a63), DECK_NIGHT = new THREE.Color(0x33373f);
  function setNight(n) {
    seaMat.color.copy(SEA_DUSK).lerp(SEA_NIGHT, n);
    sandMat.color.copy(SAND_DUSK).lerp(SAND_NIGHT, n);
    concrete.color.copy(CONC_DUSK).lerp(CONC_NIGHT, n);
    deckMat.color.copy(DECK_DUSK).lerp(DECK_NIGHT, n);
    lightMat.emissiveIntensity = lerp(3.2, 6.0, n);
    neonMat.emissiveIntensity = lerp(0.5, 4.2, n);
  }

  return { update, follow, setNight };
}

// One suspension pylon: twin legs rising out of the water, two crossbeams, and
// a neon strip up the inner face of each leg (dead at dusk, blazing at night).
function makeTower(steelMat, neonMat) {
  const g = new THREE.Group();
  const footY = SEA_Y - 3;
  const legH = TOWER_H - footY;
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3.6, legH, 3.6), steelMat);
    leg.position.set(side * PYLON_X, footY + legH / 2, 0);
    g.add(leg);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.5, TOWER_H * 0.62, 0.9), neonMat);
    neon.position.set(side * (PYLON_X - 1.95), TOWER_H * 0.42, 0);
    g.add(neon);
  }
  const beamW = PYLON_X * 2 + 3.6;
  for (const y of [TOWER_H * 0.54, TOWER_H * 0.93]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, 2.4, 3.0), steelMat);
    beam.position.set(0, y, 0);
    g.add(beam);
  }
  return g;
}
