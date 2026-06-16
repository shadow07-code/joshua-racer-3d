// Scene, renderer, sunset sky, lighting, fog, and the reflection environment.
//
// The road is endless, so the sky dome, sun, and lights FOLLOW the camera (via
// follow()) — you never drive "past" the sunset; it sits at infinity ahead.
import * as THREE from "three";
import { CAMERA, FOG } from "../config.js";

// Neutral dusk palette — muted, balanced (no loud magenta), but kept bright
// enough to read clearly (not murky).
const SKY_TOP = new THREE.Color(0x5a6e93);       // brighter slate blue overhead
const SKY_PINK = new THREE.Color(0xcc9f86);      // warm taupe mid-band
const SKY_HOT = new THREE.Color(0xf3cb9d);       // bright warm sand at the horizon
const GROUND_COL = new THREE.Color(0x76705f);    // neutral taupe ground
const SUN_DIR = new THREE.Vector3(-0.10, 0.20, 0.975).normalize();

export function makeScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(SKY_HOT.clone().lerp(SKY_PINK, 0.35).getHex(), FOG.density);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  camera.position.set(0, CAMERA.height, -CAMERA.back);
  camera.layers.enable(1);   // the sun lives on layer 1 (excluded from the reflection cube cam)

  // ── 3-stop gradient sky dome (hot → pink → indigo), unaffected by fog ──
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { hot: { value: SKY_HOT }, pink: { value: SKY_PINK }, top: { value: SKY_TOP } },
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
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSunTexture(), color: 0xffffff,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sun.scale.set(190, 190, 1);
  sun.layers.set(1);         // keep the bright sun out of the reflection env map
  scene.add(sun);

  // Ground/sea is provided by render3d/environment.js (coastal causeway + sea).

  // ── Lights ── warm key (sun) + cool rim/fill for contrast.
  scene.add(new THREE.HemisphereLight(0xb4bdd0, GROUND_COL.getHex(), 1.0));
  const sunLight = new THREE.DirectionalLight(0xffeccf, 1.25);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sunLight.target = sunTarget;
  scene.add(sunLight);
  const rim = new THREE.DirectionalLight(0x7f96c0, 0.5);     // cool back-rim
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  function follow(cam) {
    sky.position.copy(cam.position);
    sun.position.copy(cam.position).addScaledVector(SUN_DIR, 540);
    sunLight.position.copy(cam.position).addScaledVector(SUN_DIR, 220);
    sunTarget.position.copy(cam.position);
    sunTarget.updateMatrixWorld();
    rim.position.copy(cam.position).add(new THREE.Vector3(40, 80, -120));
  }
  follow(camera);

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

  return { renderer, scene, camera, resize, follow };
}

// Soft sun: a bright core that falls off smoothly to transparent (no ringed edge).
function makeSunTexture() {
  const s = 256, c = s / 2;
  const cv = document.createElement("canvas");
  cv.width = s; cv.height = s;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.00, "rgba(255,255,250,1.0)");
  grad.addColorStop(0.10, "rgba(255,246,224,0.95)");
  grad.addColorStop(0.24, "rgba(255,214,156,0.5)");
  grad.addColorStop(0.5, "rgba(255,184,128,0.16)");
  grad.addColorStop(1.0, "rgba(255,170,120,0.0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
