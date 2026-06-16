// Player car — a sleek road supercar (McLaren-F1-inspired, per the owner's NFS2
// reference): low wide body, curved glass canopy, twin racing stripes, round
// quad taillights, side intakes, rear diffuser + exhausts, and alloy wheels.
// Kept red with the white "J" (on the rear deck, facing the chase cam).
// Structure: root (position + road yaw) → body (steer bank) → meshes; front
// wheels live in pivot groups so they steer (setSteer).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const RED = 0xE40058;

function rbox(w, h, d, r) {
  r = r ?? Math.max(0.12, Math.min(w, h, d) * 0.3);
  return new RoundedBoxGeometry(w, h, d, 3, r);
}

export function makeCar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color: RED, metalness: 0.4, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.4 });
  paint.envMapIntensity = 0.5;    // softer highlights — no blown specular on the curves
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x18242f, metalness: 0.1, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.4 });
  glass.envMapIntensity = 0.45;   // diffuse reflections — no mirror-bright sun hotspot
  const stripe = new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.2, roughness: 0.5 });   // dark racing stripes (McLaren-style)
  const carbon = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.3, roughness: 0.5 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd0d4db, metalness: 0.95, roughness: 0.25 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a12, emissiveIntensity: 2.2 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xfff2c8, emissiveIntensity: 1.0 });
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.95, roughness: 0.3 });

  const add = (geo, m, x, y, z, parent = body) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

  // ── Bodywork ──
  add(rbox(8.6, 1.9, 17, 1.1), paint, 0, 1.65, 0);                 // main body
  const nose = add(rbox(7.6, 1.1, 6, 0.9), paint, 0, 1.5, 6.6); nose.rotation.x = -0.05;   // low nose/hood
  add(rbox(8.0, 0.3, 1.0, 0.1), carbon, 0, 0.95, 9.1);            // front splitter
  const deck = add(rbox(8.0, 1.4, 6, 1.0), paint, 0, 2.05, -5.6); deck.rotation.x = 0.06;  // rear haunches/deck

  // Greenhouse: a glass band (windshield + side/rear windows) + a low painted roof.
  add(rbox(5.6, 1.5, 7.0, 0.7), glass, 0, 2.35, 0.3);
  add(rbox(4.2, 1.0, 5.2, 0.8), paint, 0, 3.1, 0.0);

  // Twin racing stripes (hood → roof → deck).
  for (const sx of [-0.85, 0.85]) {
    add(rbox(0.7, 0.14, 6, 0.05), stripe, sx, 2.1, 6.6);
    add(rbox(0.7, 0.14, 5.2, 0.05), stripe, sx, 3.62, 0.0);
    add(rbox(0.7, 0.14, 5.4, 0.05), stripe, sx, 2.78, -5.6);
  }

  // Side intakes.
  add(rbox(1.1, 1.1, 3.2, 0.3), carbon, 4.4, 1.7, -1.6);
  add(rbox(1.1, 1.1, 3.2, 0.3), carbon, -4.4, 1.7, -1.6);

  // ── Rear ──
  add(rbox(7.6, 0.9, 1.4, 0.25), carbon, 0, 1.05, -8.4);          // diffuser
  const tail = (x) => { const m = add(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16), tailMat, x, 2.2, -8.5); m.rotation.x = Math.PI / 2; };
  tail(1.2); tail(2.5); tail(-1.2); tail(-2.5);
  const exhaust = (x) => { const m = add(new THREE.CylinderGeometry(0.32, 0.32, 0.6, 12), exhaustMat, x, 1.15, -8.7); m.rotation.x = Math.PI / 2; };
  exhaust(-0.8); exhaust(0.8);

  // Headlights.
  add(rbox(1.7, 0.5, 0.6, 0.2), headMat, 2.4, 1.7, 9.0);
  add(rbox(1.7, 0.5, 0.6, 0.2), headMat, -2.4, 1.7, 9.0);

  // White "J" on the rear deck, facing the chase cam (reads upright).
  const jTex = makeLetterTexture("J");
  const jMat = new THREE.MeshStandardMaterial({ map: jTex, transparent: true, emissive: 0xffffff, emissiveMap: jTex, emissiveIntensity: 0.3, roughness: 0.5 });
  const jPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), jMat);
  jPlane.rotation.y = Math.PI;
  jPlane.rotation.x = -0.12;
  jPlane.position.set(0, 2.95, -7.7);
  body.add(jPlane);

  // ── Alloy wheels (front pair steerable) ──
  const tyreGeo = new THREE.CylinderGeometry(1.7, 1.7, 1.5, 22);
  const rimGeo = new THREE.CylinderGeometry(1.05, 1.05, 1.55, 6);   // 6-spoke-ish facet
  const hubGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.62, 8);
  const buildWheel = (parent) => {
    const t = new THREE.Mesh(tyreGeo, tyreMat); t.rotation.z = Math.PI / 2; parent.add(t);
    const r = new THREE.Mesh(rimGeo, rimMat); r.rotation.z = Math.PI / 2; parent.add(r);
    const hub = new THREE.Mesh(hubGeo, rimMat); hub.rotation.z = Math.PI / 2; parent.add(hub);
  };
  const wx = 4.15, fz = 5.5, rz = -5.5, wy = 1.7;
  const frontL = new THREE.Group(); frontL.position.set(wx, wy, fz); body.add(frontL); buildWheel(frontL);
  const frontR = new THREE.Group(); frontR.position.set(-wx, wy, fz); body.add(frontR); buildWheel(frontR);
  const rearL = new THREE.Group(); rearL.position.set(wx, wy, rz); body.add(rearL); buildWheel(rearL);
  const rearR = new THREE.Group(); rearR.position.set(-wx, wy, rz); body.add(rearR); buildWheel(rearR);
  // Dark wheel arches.
  for (const [ax, az] of [[wx, fz], [-wx, fz], [wx, rz], [-wx, rz]]) add(rbox(2.0, 1.4, 4.2, 0.6), carbon, ax, 1.9, az);

  // Soft contact shadow (flat on the ground — added to root, not body).
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 20),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  root.add(shadow);

  // ── RAMPAGE aura (hidden until nitrous fires): a glowing ground ring + twin
  // nitrous flames out the back. Additive so bloom makes it blaze.
  const aura = new THREE.Group();
  aura.visible = false;
  root.add(aura);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x33b5ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.7, 8, 36), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4;
  aura.add(ring);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const fxp of [-0.85, 0.85]) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.85, 7, 12), flameMat);
    fl.rotation.x = -Math.PI / 2;          // taper trailing backward (-Z)
    fl.position.set(fxp, 1.4, -10.5);
    aura.add(fl);
    flames.push(fl);
  }

  function setSteer(angle) { frontL.rotation.y = angle; frontR.rotation.y = angle; }
  function setRampage(on, t = 0) {
    aura.visible = on;
    if (on) {
      ring.scale.setScalar(0.85 + Math.sin(t * 22) * 0.15);
      for (let i = 0; i < flames.length; i++) flames[i].scale.z = 0.8 + Math.sin(t * 30 + i) * 0.3;
    }
  }
  return { root, body, setSteer, setRampage };
}

function makeLetterTexture(ch) {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = s; cv.height = s;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, s, s);
  g.fillStyle = "#ffffff";
  g.font = "900 112px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(ch, s / 2, s / 2 + 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShadowTexture() {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = s; cv.height = s;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(0,0,0,0.5)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}
