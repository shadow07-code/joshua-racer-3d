// Roadside scenery for the coastal locale — guard posts with glowing reflector
// caps (a strong speed cue at dusk) and palms. Recycled along the road as the
// car advances, and thinned with speed so fewer objects whip past at top speed.
import * as THREE from "three";
import { ROAD } from "../config.js";

const TOTAL_HALF = ROAD.halfWidth + ROAD.shoulder;
const S_BEHIND = 30, S_AHEAD = 320;

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
      p.g.visible = !(speed01 > 0.72 && (idx % 2 === 1));
    });
  }

  return { update };
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
