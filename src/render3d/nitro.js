// Nitro canisters — the "pick a lane" pickup. A small pool of glowing aqua
// bottles that hover and spin on the road, placed via the same curve mapping as
// everything else (worldPos(z, x)). Deliberately COOL against the warm dusk
// world so a canister reads instantly and never blurs into a gold coin. Pure
// visuals; the grab test lives in entities/traffic.js (checkNitroGrab).
import * as THREE from "three";

const POOL = 14;
const AQUA = 0x2ff0c8;

export function makeNitroView(scene, road) {
  const bodyGeo = new THREE.CylinderGeometry(1.7, 1.7, 6.2, 14);
  const capGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.2, 10);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: AQUA, metalness: 0.55, roughness: 0.25,
    emissive: AQUA, emissiveIntensity: 1.1,
  });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x203038, metalness: 0.8, roughness: 0.35 });
  // Additive halo so bloom picks the canister out of a dark lane from far off.
  const haloMat = new THREE.SpriteMaterial({
    map: makeHaloTexture(), color: 0x9dfff0,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < POOL; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;                 // lie the bottle along the road
    g.add(body);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 3.4;
    g.add(cap);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(15, 15, 1);
    g.add(halo);
    g.visible = false;
    group.add(g);
    items.push(g);
  }
  scene.add(group);
  const _p = new THREE.Vector3();

  function update(sys, playerZ) {
    const t = performance.now() / 1000;
    let mi = 0;
    const list = sys.nitros || [];
    for (const n of list) {
      if (n.got) continue;
      if (n.z < playerZ - 10 || n.z > playerZ + 240) continue;
      if (mi >= POOL) break;
      const g = items[mi++];
      road.worldPos(n.z, n.x, _p);
      g.position.set(_p.x, _p.y + 3.2 + Math.sin(t * 2.4 + n.z * 0.1) * 0.55, _p.z);
      g.rotation.y = road.headingAt(n.z);
      g.rotation.z = t * 1.6 + n.z * 0.04;
      g.visible = true;
    }
    for (; mi < POOL; mi++) items[mi].visible = false;
    bodyMat.emissiveIntensity = 1.1 + Math.sin(t * 5) * 0.35;
  }

  return { update };
}

function makeHaloTexture() {
  const s = 128, c = s / 2;
  const cv = document.createElement("canvas");
  cv.width = s; cv.height = s;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.0, "rgba(190,255,244,0.55)");
  grad.addColorStop(0.35, "rgba(80,240,205,0.22)");
  grad.addColorStop(1.0, "rgba(40,220,190,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
