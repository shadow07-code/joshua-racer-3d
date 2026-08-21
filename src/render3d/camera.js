// Damped third-person chase camera that follows the curved road.
//
// Sits behind + above the car along the road tangent and looks at a point a
// little AHEAD down the curve. Position and look-at are exponentially damped
// (frame-rate independent) so it reads like a held shot, never glued or jerky.
// The horizon is ALWAYS level — camera.up stays +Y, the car model banks instead.
// Comfort Mode raises the damping (smoother/laggier) via comfort.params().
import * as THREE from "three";
import { CAMERA, PHYS } from "../config.js";
import { params as comfortParams } from "../comfort.js";

export function makeChaseCam(camera, road) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  let inited = false;

  function computeDesired(player) {
    // Speed-reactive dolly: the faster you go, the further back and the LOWER the
    // camera sits. Because it eases there, gaining speed is something you SEE —
    // the world pulls away from you — and a low lens makes the ground rush.
    const sp = Math.max(0, Math.min(1, player.speed / PHYS.maxSpeed));
    const back = CAMERA.back + CAMERA.backAtSpeed * sp;
    const height = CAMERA.height - CAMERA.dropAtSpeed * sp;
    // Ramp jumps: the camera rises with the car but deliberately lags the arc —
    // following it exactly would cancel the height out and the jump would read as
    // the world dropping away instead of the car going up.
    const air = player.y || 0;
    road.worldPos(player.z - back, player.x * CAMERA.lateralFollow, desiredPos);
    desiredPos.y += height + air * 0.55;
    road.worldPos(player.z + CAMERA.lookAhead, player.x * CAMERA.lookLateral, desiredLook);
    desiredLook.y += 2.2 + air * 0.8;
  }

  // dt-independent exponential approach factor.
  const approach = (k, dt) => 1 - Math.exp(-k * dt);

  function update(dt, player, fov) {
    computeDesired(player);
    if (!inited) { pos.copy(desiredPos); look.copy(desiredLook); inited = true; }

    const cp = comfortParams();
    pos.lerp(desiredPos, approach(cp.posDampK, dt));
    look.lerp(desiredLook, approach(cp.lookDampK, dt));

    camera.position.copy(pos);
    camera.up.set(0, 1, 0);            // locked horizon — no roll, ever
    camera.lookAt(look);

    if (fov != null && Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  // Force the next update() to jump straight to the target instead of damping.
  // Called on every fresh run so a reset to z=0 doesn't leave the camera gliding
  // in from the old position (which made the car look skewed/"sideways").
  function snap() { inited = false; }

  return { update, snap };
}
