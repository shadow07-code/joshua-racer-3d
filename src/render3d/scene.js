// Scene, renderer, sunset sky, lighting, fog, and the reflection environment.
//
// The road is endless, so the sky dome, sun, moon and lights FOLLOW the camera
// (via follow()) — you never drive "past" the sunset; it sits at infinity ahead.
//
// NIGHTFALL: setNight(0..1) grades the whole frame from the locked warm-dusk
// look to full night — sky, fog, every light, and the renderer's exposure. Only
// the exposure can touch the baked reflection cube map (captured once at boot,
// from a sky that has since moved with the camera), so it does the heavy lifting
// and the discrete lights follow it down.
import * as THREE from "three";
import { CAMERA, FOG, NIGHT } from "../config.js";

// Neutral dusk palette — muted, balanced (no loud magenta), but kept bright
// enough to read clearly (not murky).
const SKY_TOP = new THREE.Color(0x5a6e93);       // brighter slate blue overhead
const SKY_PINK = new THREE.Color(0xcc9f86);      // warm taupe mid-band
const SKY_HOT = new THREE.Color(0xf3cb9d);       // bright warm sand at the horizon
// ... and where each of those lands once the sun is gone.
const NIGHT_TOP = new THREE.Color(0x070c1c);
const NIGHT_PINK = new THREE.Color(0x142240);
const NIGHT_HOT = new THREE.Color(0x2b3a5e);
const GROUND_COL = new THREE.Color(0x76705f);    // neutral taupe ground
const SUN_DIR = new THREE.Vector3(-0.10, 0.20, 0.975).normalize();
const MOON_DIR = new THREE.Vector3(0.52, 0.34, 0.78).normalize();

const lerp = (a, b, t) => a + (b - a) * t;
const fogColor = (hot, mid) => hot.clone().lerp(mid, 0.35);

export function makeScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = NIGHT.exposureDusk;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(fogColor(SKY_HOT, SKY_PINK).getHex(), FOG.density);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  camera.position.set(0, CAMERA.height, -CAMERA.back);
  camera.layers.enable(1);   // the sun lives on layer 1 (excluded from the reflection cube cam)

  // ── 3-stop gradient sky dome (hot → pink → indigo), unaffected by fog ──
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      hot: { value: SKY_HOT.clone() },
      pink: { value: SKY_PINK.clone() },
      top: { value: SKY_TOP.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 hot; uniform vec3 pink; uniform vec3 top;
      void main() {
        float h = vDir.y;
        vec3 lower = mix(hot, pink, smoothstep(-0.05, 0.12, h));
        vec3 col = mix(lower, top, smoothstep(0.10, 0.62, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // Sun — a soft camera-facing glow sprite (radial gradient, no hard halo edge).
  const sunTex = makeGlowTexture("rgba(255,255,250,1.0)", "rgba(255,246,224,0.95)", "rgba(255,214,156,0.5)", "rgba(255,184,128,0.16)", "rgba(255,170,120,0.0)");
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, color: 0xffffff,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sun.scale.set(190, 190, 1);
  sun.layers.set(1);         // keep the bright sun out of the reflection env map
  scene.add(sun);

  // Moon — takes the sun's place in the frame as night lands.
  const moonTex = makeGlowTexture("rgba(255,255,255,1.0)", "rgba(226,238,255,0.9)", "rgba(180,205,255,0.34)", "rgba(140,175,240,0.10)", "rgba(120,160,230,0.0)");
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTex, color: 0xffffff, opacity: 0,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  moon.scale.set(78, 78, 1);
  moon.layers.set(1);
  scene.add(moon);

  // Ground/sea is provided by render3d/environment.js (coastal causeway + sea).

  // ── Lights ── warm key (sun) + cool rim/fill for contrast, plus a cold
  // moonlight key that only wakes up after dark.
  const hemi = new THREE.HemisphereLight(0xb4bdd0, GROUND_COL.getHex(), 1.0);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffeccf, 1.25);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sunLight.target = sunTarget;
  scene.add(sunLight);
  const moonLight = new THREE.DirectionalLight(0xa8c2ff, 0);
  moonLight.target = sunTarget;
  scene.add(moonLight);
  const rim = new THREE.DirectionalLight(0x7f96c0, 0.5);     // cool back-rim
  scene.add(rim);
  const amb = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(amb);

  // Live sun/moon directions — the sun sinks below the horizon as night falls
  // (the opaque sea then swallows the sprite), the moon climbs.
  const sunDir = SUN_DIR.clone();
  const moonDir = MOON_DIR.clone();
  const _rimOff = new THREE.Vector3(40, 80, -120);

  function follow(cam) {
    sky.position.copy(cam.position);
    sun.position.copy(cam.position).addScaledVector(sunDir, 540);
    moon.position.copy(cam.position).addScaledVector(moonDir, 520);
    sunLight.position.copy(cam.position).addScaledVector(sunDir, 220);
    moonLight.position.copy(cam.position).addScaledVector(moonDir, 220);
    sunTarget.position.copy(cam.position);
    sunTarget.updateMatrixWorld();
    rim.position.copy(cam.position).add(_rimOff);
  }
  follow(camera);

  const _fogDusk = fogColor(SKY_HOT, SKY_PINK);
  const _fogNight = fogColor(NIGHT_HOT, NIGHT_PINK);
  let nightNow = -1;
  function setNight(t) {
    const n = Math.max(0, Math.min(1, t));
    if (n === nightNow) return;
    nightNow = n;

    skyMat.uniforms.hot.value.copy(SKY_HOT).lerp(NIGHT_HOT, n);
    skyMat.uniforms.pink.value.copy(SKY_PINK).lerp(NIGHT_PINK, n);
    skyMat.uniforms.top.value.copy(SKY_TOP).lerp(NIGHT_TOP, n);
    scene.fog.color.copy(_fogDusk).lerp(_fogNight, n);
    scene.fog.density = FOG.density * (1 + 0.30 * n);      // haze thickens after dark

    hemi.intensity = lerp(1.0, 0.22, n);
    sunLight.intensity = lerp(1.25, 0.0, Math.min(1, n * 1.25));
    moonLight.intensity = lerp(0, 0.55, n);
    rim.intensity = lerp(0.5, 0.26, n);
    amb.intensity = lerp(0.30, 0.11, n);
    sun.material.opacity = Math.max(0, 1 - n * 1.3);
    moon.material.opacity = Math.max(0, (n - 0.2) / 0.8);

    sunDir.copy(SUN_DIR); sunDir.y = lerp(SUN_DIR.y, -0.34, n); sunDir.normalize();
    moonDir.copy(MOON_DIR); moonDir.y = lerp(-0.15, MOON_DIR.y, n); moonDir.normalize();

    // The one lever that also dims the baked reflections.
    renderer.toneMappingExposure = lerp(NIGHT.exposureDusk, NIGHT.exposureNight, n);
    follow(camera);
  }
  setNight(0);

  // ── Reflection env map (capture sky + ground once; car added later) ──
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(1, 2000, cubeRT);
  cubeCam.position.set(0, 8, 0);
  cubeCam.update(renderer, scene);
  scene.environment = cubeRT.texture;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, resize, follow, setNight };
}

// Soft celestial body: a bright core falling off smoothly to transparent (no
// ringed edge). Shared by the sun and the moon, with different colour stops.
function makeGlowTexture(c0, c1, c2, c3, c4) {
  const s = 256, c = s / 2;
  const cv = document.createElement("canvas");
  cv.width = s; cv.height = s;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.00, c0);
  grad.addColorStop(0.10, c1);
  grad.addColorStop(0.24, c2);
  grad.addColorStop(0.50, c3);
  grad.addColorStop(1.00, c4);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
