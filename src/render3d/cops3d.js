// 3D police helicopters + flaming barrels + targeting reticles — renders the
// cops sim (entities/cops.js). Helis hover ahead of the player, spin their
// rotors, blink a beacon, and a reticle marks the lane they're about to bomb.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HELI_HOVER_AHEAD } from "../entities/cops.js";

function rbox(w, h, d) { return new RoundedBoxGeometry(w, h, d, 2, Math.max(0.15, Math.min(w, h, d) * 0.28)); }

function makeHeliMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1b2747, metalness: 0.4, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8edf5, metalness: 0.2, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0e14, metalness: 0.3, roughness: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x141d2a, metalness: 0.2, roughness: 0.15, clearcoat: 0.6 });
  glass.envMapIntensity = 0.4;
  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };

  add(rbox(6, 3.4, 9), navy, 0, 0, 0);                       // fuselage
  add(rbox(6.1, 0.8, 9.1), white, 0, 0.2, 0);                // white stripe
  const dome = add(new THREE.SphereGeometry(2.4, 16, 12), glass, 0, 0.3, 3.4); dome.scale.set(1, 0.9, 1.1);  // cockpit
  add(rbox(1.3, 1.3, 9), navy, 0, 0.6, -7);                  // tail boom
  add(rbox(0.4, 3, 2.4), navy, 0, 1.8, -11);                 // tail fin
  add(rbox(0.4, 0.3, 7), dark, 2.4, -2.2, 0.5);              // skids
  add(rbox(0.4, 0.3, 7), dark, -2.4, -2.2, 0.5);
  add(rbox(0.3, 1.2, 1.2), dark, 0, -2.2, 4);                // skid struts
  add(rbox(0.3, 1.2, 1.2), dark, 0, -2.2, -3);
  const beacon = add(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a0606, emissive: 0xff2020, emissiveIntensity: 2.5 }), 0, 2.1, 0);

  const rotorHub = new THREE.Group(); rotorHub.position.set(0, 2.4, 0); g.add(rotorHub);
  rotorHub.add(new THREE.Mesh(new THREE.BoxGeometry(15, 0.18, 0.9), dark));
  rotorHub.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 15), dark));
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.7, 1.0, -11); g.add(tailRotor);
  tailRotor.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 0.5), dark));

  g.userData = { rotorHub, tailRotor, beacon };
  g.visible = false;
  return g;
}

function makeBarrelMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 14),
    new THREE.MeshStandardMaterial({ color: 0xd2641e, metalness: 0.4, roughness: 0.5 }));
  body.position.y = 2.5;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 0.8, 14),
    new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 }));
  band.position.y = 2.5; g.add(band);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(2, 7, 10), flameMat);
  flame.position.y = 8; g.add(flame);
  g.userData = { flame };
  g.visible = false;
  return g;
}

export function makeCopsView(scene, road) {
  const v = new THREE.Vector3();
  const helis = [makeHeliMesh(), makeHeliMesh()];
  const barrels = []; for (let i = 0; i < 8; i++) barrels.push(makeBarrelMesh());
  const reticles = [];
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(6, 0.5, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2.5 }));
    r.rotation.x = -Math.PI / 2; r.visible = false; reticles.push(r); scene.add(r);
  }
  for (const h of helis) scene.add(h);
  for (const b of barrels) scene.add(b);

  function update(sys, playerZ) {
    // Helicopters (hover ahead, face the player, rotors spinning).
    for (let i = 0; i < helis.length; i++) {
      const mesh = helis[i], h = sys.helis[i];
      if (!h) { mesh.visible = false; continue; }
      road.worldPos(playerZ + HELI_HOVER_AHEAD, h.x, v);
      mesh.position.set(v.x, h.alt, v.z);
      mesh.rotation.y = road.headingAt(playerZ + HELI_HOVER_AHEAD) + Math.PI;   // face the player
      mesh.userData.rotorHub.rotation.y = h.rotorPhase * 24;
      mesh.userData.tailRotor.rotation.x = h.rotorPhase * 30;
      mesh.userData.beacon.material.emissiveIntensity = (Math.floor(h.beaconPhase * 5) % 2 === 0) ? 3 : 0.2;
      mesh.visible = true;
    }
    // Reticles (one per heli currently aiming).
    let ri = 0;
    for (const h of sys.helis) {
      if (h.aiming && !h.dropped && ri < reticles.length) {
        road.worldPos(playerZ + HELI_HOVER_AHEAD, h.lockX, v);
        const r = reticles[ri++];
        r.position.set(v.x, 0.2, v.z);
        r.material.emissiveIntensity = (Math.floor(h.beaconPhase * 6) % 2 === 0) ? 3.2 : 0.6;
        r.visible = true;
      }
    }
    for (let i = ri; i < reticles.length; i++) reticles[i].visible = false;
    // Barrels (flaming hazards scrolling toward the player).
    for (let i = 0; i < barrels.length; i++) {
      const mesh = barrels[i], b = sys.barrels[i];
      if (!b) { mesh.visible = false; continue; }
      road.worldPos(b.z, b.x, v);
      mesh.position.set(v.x, 0, v.z);
      const fl = 1 + Math.sin(b.flame * 18) * 0.18 + Math.sin(b.flame * 7) * 0.1;
      mesh.userData.flame.scale.set(fl, fl, fl);
      mesh.visible = true;
    }
  }

  return { update };
}
