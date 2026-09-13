// PARTICLES — tyre smoke, barrier sparks and impact debris.
//
// The game had no particle system at all, which is the single most expensive
// silence in the whole presentation: the drift scored and screeched but left no
// mark on the world, the barrier took speed off you without so much as a flash,
// and a crash that costs half the heat bar looked like two boxes touching.
// Every one of those is a moment the player is supposed to FEEL, and none of
// them put anything in the frame.
//
// Implementation is two pooled THREE.Points systems — one normal-blended (smoke,
// debris) and one additive (sparks) — so the whole thing is two draw calls no
// matter how much is in the air. A small custom shader gives each particle its
// own size, colour and alpha, which PointsMaterial cannot do; without per-
// particle alpha, smoke has to pop out of existence instead of thinning away.
import * as THREE from "three";

const SMOKE_MAX = 260;
const SPARK_MAX = 220;

// gl_PointSize is in PHYSICAL pixels, so without this every particle would be
// half-size on a retina phone and the effect would quietly disappear on exactly
// the devices this game is built for.
const VERT = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale * (300.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    if (t.a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor, t.a * vAlpha);
  }`;

function softTexture(inner, outer) {
  const s = 64, c = s / 2;
  const cv = document.createElement("canvas");
  cv.width = s; cv.height = s;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, outer);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One pool: flat typed arrays, a free-list cursor that wraps. Oldest particles
// are recycled when the pool is exhausted, which is always the right answer for
// this kind of effect — the newest puff matters more than the oldest.
function makePool(scene, max, blending, tex) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  const grow = new Float32Array(max);
  const drag = new Float32Array(max);
  const grav = new Float32Array(max);
  const alpha0 = new Float32Array(max);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  geo.setDrawRange(0, max);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uScale: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;      // the emitter is always right under the camera
  points.renderOrder = 3;
  scene.add(points);

  function spawn(x, y, z, vx, vy, vz, r, g, b, s0, grw, ttl, drg, gr, a0 = 1) {
    const i = cursor;
    cursor = (cursor + 1) % max;
    const i3 = i * 3;
    pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
    vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
    col[i3] = r; col[i3 + 1] = g; col[i3 + 2] = b;
    size[i] = s0; grow[i] = grw;
    life[i] = ttl; maxLife[i] = ttl;
    drag[i] = drg; grav[i] = gr;
    alpha0[i] = a0; alpha[i] = a0;
  }

  function update(dt) {
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      const i3 = i * 3;
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= d; vel[i3 + 1] = vel[i3 + 1] * d - grav[i] * dt; vel[i3 + 2] *= d;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      size[i] += grow[i] * dt;
      // Fade on a curve, not a line — a linear fade reads as a light switch.
      const t = life[i] / maxLife[i];
      alpha[i] = t * t * alpha0[i];
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  function clear() {
    for (let i = 0; i < max; i++) { life[i] = 0; alpha[i] = 0; }
    update(0);
  }

  return { spawn, update, clear, mat };
}

export function makeParticles(scene) {
  const smoke = makePool(scene, SMOKE_MAX, THREE.NormalBlending,
    softTexture("rgba(255,255,255,0.85)", "rgba(255,255,255,0.34)"));
  const spark = makePool(scene, SPARK_MAX, THREE.AdditiveBlending,
    softTexture("rgba(255,255,255,1)", "rgba(255,190,90,0.6)"));

  function setPixelRatio(r) { smoke.mat.uniforms.uScale.value = r; spark.mat.uniforms.uScale.value = r; }
  setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const rnd = (a) => (Math.random() * 2 - 1) * a;

  // Tyre smoke — the thing a slide leaves behind. `heat01` warms it from clean
  // white rubber dust toward a dirty grey, so a long slide visibly cooks.
  function tyreSmoke(x, y, z, back, n = 1, heat01 = 0) {
    for (let i = 0; i < n; i++) {
      const g = 0.86 - 0.22 * heat01 + rnd(0.05);
      smoke.spawn(
        x + rnd(1.2), y + 0.4 + Math.random() * 0.5, z + rnd(1.2),
        rnd(6) - back.x * 7, 2.5 + Math.random() * 4, rnd(6) - back.z * 7,
        g, g * 0.98, g * 0.96,
        1.1 + Math.random() * 0.6, 2.6 + Math.random() * 2.0,
        0.45 + Math.random() * 0.4, 1.7, -1.0,
        0.24 + 0.22 * Math.random(),
      );
    }
  }

  // Barrier sparks — a shower off the point of contact, thrown backwards along
  // the wall. The fence used to take speed off you in total silence and darkness.
  function wallSparks(x, y, z, back, side, n = 4) {
    for (let i = 0; i < n; i++) {
      spark.spawn(
        x + rnd(0.6), y + 0.7 + Math.random() * 0.9, z + rnd(0.8),
        -side * (8 + Math.random() * 26) - back.x * 34, 6 + Math.random() * 16, -back.z * 34 + rnd(10),
        1, 0.72 + Math.random() * 0.25, 0.24,
        0.24 + Math.random() * 0.18, -0.12,
        0.22 + Math.random() * 0.3, 0.9, 62,
        0.85,
      );
    }
  }

  // Impact: a hot flash of sparks plus a slower cloud of dark debris. This is
  // what a crash that costs half the heat bar is supposed to look like.
  function impact(x, y, z, strength = 1) {
    const ns = Math.round(14 + 22 * strength);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2, sp = (14 + Math.random() * 46) * strength;
      spark.spawn(
        x + rnd(1.6), y + 1.4 + rnd(1.2), z + rnd(1.6),
        Math.cos(a) * sp, 10 + Math.random() * 30 * strength, Math.sin(a) * sp,
        1, 0.6 + Math.random() * 0.35, 0.2,
        0.28 + Math.random() * 0.26, -0.14,
        0.3 + Math.random() * 0.4, 0.7, 74,
        0.95,
      );
    }
    const nd = Math.round(8 + 12 * strength);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * Math.PI * 2, sp = (8 + Math.random() * 26) * strength;
      const g = 0.16 + Math.random() * 0.14;
      smoke.spawn(
        x + rnd(2.2), y + 1.2 + rnd(1.4), z + rnd(2.2),
        Math.cos(a) * sp, 8 + Math.random() * 22, Math.sin(a) * sp,
        g, g, g * 1.05,
        0.5 + Math.random() * 0.45, 0.35,
        0.5 + Math.random() * 0.5, 1.1, 52,
        0.75,
      );
    }
  }

  function update(dt) { smoke.update(dt); spark.update(dt); }
  function clear() { smoke.clear(); spark.clear(); }

  return { tyreSmoke, wallSparks, impact, update, clear, setPixelRatio };
}
