// Roadside scenery for the coastal locale — guard posts with glowing reflector
// caps (a strong speed cue at dusk), palms, and NEON BILLBOARDS that light up as
// night falls. Recycled along the road as the car advances, thinned with speed so
// fewer objects whip past at top speed, and zone-aware: palms and billboards are
// suppressed inside tunnels and out over the bridge, where they would be absurd.
import * as THREE from "three";
import { ROAD } from "../config.js";
import { zoneTypeAt } from "./zones.js";

const TOTAL_HALF = ROAD.halfWidth + ROAD.shoulder;
const S_BEHIND = 30, S_AHEAD = 320;

// Warm signage, per the project's neutral-dusk direction — amber, sand and a
// single cool teal. Deliberately NOT synthwave magenta.
const SIGNS = [
  ["JOSHUA", "#ffcf5a"],
  ["NITRO", "#7fe9d0"],
  ["DUSK CLUB", "#ffe0a8"],
  ["RACER", "#ff9a4a"],
  ["COAST HWY", "#9fd8ff"],
  ["J1", "#ffcf5a"],
];

export function makeScenery(scene, road) {
  const dummy = new THREE.Object3D();
  const v = new THREE.Vector3();

  // ── Guard posts + emissive reflector caps (both sides), instanced ──
  const POST_SPACING = 10;
  const perSide = Math.ceil((S_BEHIND + S_AHEAD) / POST_SPACING);
  const postCount = perSide * 2;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x33373f, roughness: 0.6, metalness: 0.2 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 3.2, 0.45), postMat, postCount);
  posts.frustumCulled = false;
  scene.add(posts);

  const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb030, emissiveIntensity: 2.4, roughness: 0.4 });
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), capMat, postCount);
  caps.frustumCulled = false;
  scene.add(caps);

  const postItems = [];
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? -1 : 1;
    for (let i = 0; i < perSide; i++) postItems.push({ z: i * POST_SPACING, side, slot: i });
  }

  // ── Palms (denser cloned pool) ──
  const PALM_SPACING = 34;
  const palmPerSide = Math.ceil((S_BEHIND + S_AHEAD) / PALM_SPACING);
  const palmProto = makePalm();
  const palms = [];
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? -1 : 1;
    for (let i = 0; i < palmPerSide; i++) {
      const g = palmProto.clone();
      scene.add(g);
      palms.push({ g, z: i * PALM_SPACING + (s ? 17 : 0), side });
    }
  }

  // ── Neon billboards (night only) ──
  const BOARD_SPACING = 165;
  const boardCount = Math.ceil((S_BEHIND + S_AHEAD) / BOARD_SPACING) + 1;
  const boardMats = [];
  const boards = [];
  for (let i = 0; i < boardCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const [word, color] = SIGNS[i % SIGNS.length];
    const { group, mat } = makeBillboard(word, color);
    group.visible = false;
    scene.add(group);
    boardMats.push(mat);
    boards.push({ g: group, z: i * BOARD_SPACING, side });
  }

  let night = 0;

  function update(playerZ, speed01) {
    const recycleSpan = perSide * POST_SPACING;
    const thin = speed01 > 0.6;
    for (let i = 0; i < postItems.length; i++) {
      const it = postItems[i];
      while (it.z < playerZ - S_BEHIND) it.z += recycleSpan;
      const yaw = road.headingAt(it.z);
      road.worldPos(it.z, it.side * (TOTAL_HALF + 2.5), v);
      const hidden = thin && (it.slot % 2 === 1);
      dummy.position.set(v.x, 1.6, v.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(hidden ? 0.0001 : 1);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 3.4;
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;

    const palmSpan = palmPerSide * PALM_SPACING;
    palms.forEach((p, idx) => {
      while (p.z < playerZ - S_BEHIND) p.z += palmSpan;
      road.worldPos(p.z, p.side * (TOTAL_HALF + 15), v);
      p.g.position.set(v.x, 0, v.z);
      p.g.rotation.y = road.headingAt(p.z) + (idx % 3);
      // Palms belong on the coast only — never inside a tunnel or, worse,
      // standing in open water alongside the bridge.
      const openAir = zoneTypeAt(p.z) === "coast";
      p.g.visible = openAir && !(speed01 > 0.72 && (idx % 2 === 1));
    });

    const boardSpan = boardCount * BOARD_SPACING;
    const lit = night > 0.12;
    for (const b of boards) {
      while (b.z < playerZ - S_BEHIND) b.z += boardSpan;
      if (!lit || zoneTypeAt(b.z) !== "coast") { b.g.visible = false; continue; }
      road.worldPos(b.z, b.side * (TOTAL_HALF + 52), v);
      b.g.position.set(v.x, 0, v.z);
      // Angled toward the approaching car rather than square to the road, so the
      // sign face is readable well before you draw level with it.
      b.g.rotation.y = road.headingAt(b.z) + b.side * (Math.PI / 2 + 0.6);
      b.g.visible = true;
    }
  }

  // Nightfall: reflectors burn brighter against the dark, and the billboards
  // fade up from dead panels to full neon.
  function setNight(n) {
    night = n;
    capMat.emissiveIntensity = 2.4 + 2.6 * n;
    const glow = Math.max(0, (n - 0.12) / 0.88);
    for (const m of boardMats) m.emissiveIntensity = 2.8 * glow;
  }

  return { update, setNight };
}

function makePalm() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x27a045, roughness: 0.65 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.85, 12, 8), trunkMat);
  trunk.position.y = 6;
  g.add(trunk);
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6.5, 6), leafMat);
    const a = (i / 7) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 2.6, 11.5, Math.sin(a) * 2.6);
    frond.rotation.z = Math.cos(a) * 0.95;
    frond.rotation.x = Math.sin(a) * 0.95;
    g.add(frond);
  }
  return g;
}

// A lit sign panel on twin posts. The word is baked to a canvas with a soft halo
// so the emissive map itself carries the neon bleed, then bloom finishes the job.
function makeBillboard(word, color) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8, metalness: 0.2 });
  const W = 34, H = 13, Y = 15;
  for (const px of [-W * 0.32, W * 0.32]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, Y, 1.1), postMat);
    post.position.set(px, Y / 2, 0);
    group.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, H + 1.6, 0.8), postMat);
  frame.position.set(0, Y + H / 2, -0.5);
  group.add(frame);

  const tex = makeSignTexture(word, color);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0,
    transparent: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  panel.position.set(0, Y + H / 2, 0);
  group.add(panel);
  return { group, mat };
}

function makeSignTexture(word, color) {
  const W = 512, H = 192;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, W, H);
  g.font = "900 108px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = 34;
  g.fillStyle = color;
  for (let i = 0; i < 3; i++) g.fillText(word, W / 2, H / 2);   // stack passes to build the halo
  g.shadowBlur = 0;
  g.fillStyle = "#fffaf0";
  g.fillText(word, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
