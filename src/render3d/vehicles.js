// 3D civilian vehicles + the view that mirrors the traffic sim (sys.list) into
// glossy meshes each frame. Models are procedural low-poly with clearcoat paint,
// raked glass, rim'd wheels and neat emissive lights — sized from the sim's
// vehicle types (big = slow). The view positions/orients them on the curved
// road, lights brake lamps when they slow, and blinks amber turn signals.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ONCOMING } from "../config.js";

function rbox(w, h, d, r) {
  r = r ?? Math.max(0.25, Math.min(w, h, d) * 0.3);
  return new RoundedBoxGeometry(w, h, d, 3, r);
}

function makeVehicleMesh(skin, oncoming) {
  const { w, h, height, color, shape } = skin;
  const g = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.4, roughness: 0.42, clearcoat: 0.85, clearcoatRoughness: 0.25 });
  paint.envMapIntensity = 0.85;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1218, metalness: 0.2, roughness: 0.08, clearcoat: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0f1216, metalness: 0.3, roughness: 0.5 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc2c6cf, metalness: 0.9, roughness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a12, emissiveIntensity: 1.1 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xfff2c8, emissiveIntensity: 0.6 });
  const mkSig = () => new THREE.MeshStandardMaterial({ color: 0x3a2400, emissive: 0xff9500, emissiveIntensity: 2.6 });

  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };

  // Wheels with rims.
  const wheelR = 1.3;
  const tyreGeo = new THREE.CylinderGeometry(wheelR, wheelR, 1.2, 16);
  const rimGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.25, 12);
  const wheel = (x, z) => {
    const t = add(tyreGeo, tyreMat, x, wheelR, z); t.rotation.z = Math.PI / 2;
    const r = add(rimGeo, rimMat, x, wheelR, z); r.rotation.z = Math.PI / 2;
  };
  const wx = w / 2 - 0.7, wz = h / 2 - 2.6;
  wheel(wx, wz); wheel(-wx, wz); wheel(wx, -wz); wheel(-wx, -wz);

  const baseY = wheelR + 0.3;
  const midY = baseY + height * 0.45;

  if (shape === "truck") {
    add(rbox(w, height * 0.6, h * 0.32, 0.5), paint, 0, baseY + height * 0.3, h * 0.3);          // cab
    add(rbox(w - 1.4, height * 0.32, h * 0.26, 0.3), glass, 0, baseY + height * 0.56, h * 0.36);  // windscreen
    add(rbox(w, height * 1.02, h * 0.62, 0.5), paint, 0, baseY + height * 0.52, -h * 0.16);       // cargo box
    add(rbox(w + 0.4, 0.6, 1.2, 0.2), trim, 0, baseY - 0.1, h / 2 - 0.4);                          // bumper
  } else if (shape === "bus") {
    add(rbox(w, height, h, 0.7), paint, 0, baseY + height * 0.5, 0);
    add(rbox(w + 0.06, height * 0.34, h * 0.9, 0.4), glass, 0, baseY + height * 0.66, 0);          // window band
    add(rbox(w + 0.2, height * 0.22, h, 0.3), trim, 0, baseY + height * 0.12, 0);                  // lower skirt
  } else {
    // sedan / taxi / suv — hood + raised cabin + trunk
    const lowH = height * (shape === "suv" ? 0.62 : 0.5);
    add(rbox(w, lowH, h, 0.7), paint, 0, baseY + lowH / 2, 0);                                     // main body
    const cabH = height * (shape === "suv" ? 0.5 : 0.46);
    const cabLen = h * (shape === "suv" ? 0.6 : 0.5);
    add(rbox(w - 1.4, cabH, cabLen, 0.6), paint, 0, baseY + lowH + cabH / 2 - 0.1, shape === "suv" ? -0.4 : -0.8);   // greenhouse
    add(rbox(w - 1.2, cabH * 0.7, cabLen * 0.96, 0.4), glass, 0, baseY + lowH + cabH * 0.55, shape === "suv" ? -0.4 : -0.8);  // glass
    add(rbox(w + 0.2, 0.5, 1.0, 0.2), trim, 0, baseY + 0.2, h / 2 - 0.3);                          // front bumper
    add(rbox(w + 0.2, 0.5, 1.0, 0.2), trim, 0, baseY + 0.2, -h / 2 + 0.3);                         // rear bumper
    if (shape === "taxi") add(rbox(2.2, 0.9, 1.4, 0.2), new THREE.MeshStandardMaterial({ color: 0xffcf2e, emissive: 0x553f00, emissiveIntensity: 0.4, roughness: 0.5 }), 0, baseY + lowH + cabH + 0.5, 0);
  }

  // Lights (compact strips).
  add(new THREE.BoxGeometry(1.3, 0.6, 0.3), tailMat, w / 2 - 1.3, midY, -h / 2 + 0.12);
  add(new THREE.BoxGeometry(1.3, 0.6, 0.3), tailMat, -(w / 2 - 1.3), midY, -h / 2 + 0.12);
  add(new THREE.BoxGeometry(1.1, 0.5, 0.3), headMat, w / 2 - 1.3, midY, h / 2 - 0.12);
  add(new THREE.BoxGeometry(1.1, 0.5, 0.3), headMat, -(w / 2 - 1.3), midY, h / 2 - 0.12);

  // Turn signals (one per side, toggled by the view).
  const sigGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const sigPos = add(sigGeo, mkSig(), w / 2 - 0.1, midY, h / 2 - 1.6);
  const sigNeg = add(sigGeo, mkSig(), -(w / 2 - 0.1), midY, h / 2 - 1.6);
  sigPos.visible = false; sigNeg.visible = false;

  // Opposing traffic points its headlights straight down the camera, so it gets
  // real beams — at night that pair of oncoming lights IS the warning.
  let beamMat = null;
  if (oncoming) {
    beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2d4, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    const LEN = 42;
    for (const bx of [w / 2 - 1.3, -(w / 2 - 1.3)]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, LEN, 10, 1, true), beamMat);
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(bx, midY, h / 2 + LEN / 2);
      g.add(beam);
    }
  }

  g.scale.setScalar(0.85);
  // tailMat is shared by both lamps — adjust once to brake.
  g.userData = { tailMat, headMat, beamMat, sigPos, sigNeg };
  return g;
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    }
  });
}

export function makeTrafficView(scene, road) {
  const meshes = new Map();
  const v = new THREE.Vector3();
  const live = new Set();
  let night = 0;

  // Opposing cars are born far beyond the fog so they arrive as a real approach;
  // building their meshes that early would be pure waste, so nothing gets a body
  // until it is close enough to be seen.
  function update(sys, dt, playerZ = 0) {
    const now = performance.now();
    live.clear();

    for (const car of sys.list) {
      if (car.z > playerZ + ONCOMING.cullAhead) continue;
      live.add(car);
      let g = meshes.get(car);
      if (!g) { g = makeVehicleMesh(car.skin, car.oncoming); scene.add(g); meshes.set(car, g); }

      road.worldPos(car.z, car.x, v);
      g.position.set(v.x, 0, v.z);
      // Opposing traffic faces back down the road at the player.
      g.rotation.y = road.headingAt(car.z) + (car.oncoming ? Math.PI : 0);

      const ud = g.userData;
      // Everyone's lamps come up after dark; oncoming cars run a touch hotter
      // still, because those two points of light are the whole telegraph.
      ud.headMat.emissiveIntensity = (car.oncoming ? 1.6 : 0.6) + (car.oncoming ? 4.4 : 2.6) * night;
      if (ud.beamMat) ud.beamMat.opacity = 0.07 * night;

      if (car.smashed) {
        ud.tumble = (ud.tumble || 0) + dt * 7;
        g.rotation.z = ud.tumble;
        ud.sigPos.visible = ud.sigNeg.visible = false;
      } else {
        g.rotation.z = 0;
        const braking = car.cruise != null && car.speed < car.cruise - 1.2;
        ud.tailMat.emissiveIntensity = (braking ? 3.4 : 1.1) + 1.1 * night;
        const sig = car.signalT > 0 ? Math.sign(car.pendingDriftVx || 0) : Math.sign(car.driftVx || 0);
        const blink = (Math.floor((now + (car.sigPhase || 0)) / 280) % 2) === 0;
        ud.sigPos.visible = sig > 0 && blink;
        ud.sigNeg.visible = sig < 0 && blink;
      }
    }

    for (const [car, g] of meshes) {
      if (!live.has(car)) { scene.remove(g); disposeGroup(g); meshes.delete(car); }
    }
  }

  function setNight(n) { night = n; }

  return { update, setNight };
}
