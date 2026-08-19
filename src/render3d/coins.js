// Gold coins scattered down the open gap lane (the ideal weaving line). A small
// pool of spinning, floating, glinting discs — placed on the road via the same
// curve mapping as everything else (worldPos(z, x)). Pure visuals; the grab test
// lives in entities/traffic.js (checkCoinGrab).
import * as THREE from "three";

export function makeCoinsView(scene, road) {
  const POOL = 60;
  const geo = new THREE.CylinderGeometry(2.6, 2.6, 0.55, 20);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd23a, metalness: 0.9, roughness: 0.22,
    emissive: 0xff9e00, emissiveIntensity: 0.5,
  });
  const group = new THREE.Group();
  const meshes = [];
  for (let i = 0; i < POOL; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    group.add(m);
    meshes.push(m);
  }
  scene.add(group);
  const _p = new THREE.Vector3();

  function update(sys, playerZ) {
    const t = performance.now() / 1000;
    let mi = 0;
    const coins = sys.coins || [];
    for (const c of coins) {
      if (c.got) continue;
      if (c.z < playerZ - 10 || c.z > playerZ + 240) continue;
      if (mi >= POOL) break;
      const m = meshes[mi++];
      road.worldPos(c.z, c.x, _p);
      m.position.set(_p.x, _p.y + 2.6 + Math.sin(t * 3 + c.z * 0.12) * 0.5, _p.z);
      m.rotation.y = t * 3.4 + c.z * 0.05;   // spin about vertical — top face reads to the chase cam
      m.visible = true;
    }
    for (; mi < POOL; mi++) meshes[mi].visible = false;
  }

  return { update };
}
