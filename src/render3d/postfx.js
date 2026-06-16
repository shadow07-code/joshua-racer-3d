// Post-processing: UnrealBloom so the emissive bits (taillights, reflector caps,
// the sun, neon) glow — the biggest single "aggressive visual" lift. Rendering
// routes through an EffectComposer; OutputPass handles tone mapping + sRGB.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export function makeComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3,    // strength — subtle: just a soft glow on lights/sun, no scene-wide haze
    0.5,    // radius
    0.96    // threshold — only the very brightest (lights/sun) bloom, not paint highlights
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    bloom,
    setSize(w, h) { composer.setSize(w, h); },
    render() { composer.render(); },
  };
}
