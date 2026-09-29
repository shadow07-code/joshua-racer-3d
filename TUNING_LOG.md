# Tuning log

One entry per polish-loop iteration: **what** changed, **why**, and the
**evidence** (harness numbers, node probes, filmstrips). Newest first. Anything
here can be reverted on its own — each entry is one commit.

## Backlog (noticed, not yet done — pick from here, re-rank as you go)

- Crash / barrier / landing: does the camera sell the hit (punch, not just shake)?
- The chase camera follows by lerping world position, so it lags ~speed/posDampK behind and cuts corners on curves; a road-space follow would make the distance deliberate.
- The test pane is often hidden (stale screenshots): the scratchpad shot server (port 8098) + `__shot()` saves frames to disk instead.
- Near-miss moment: a brief lens response (FOV tick / streak burst) on a PERFECT.
- HUD: is the speed readout + heat bar legible at a glance on a 375-wide phone?
- Phone performance: pixel-ratio cap, shadow map size, particle counts.

## 2026-09-29 — the camera frames a car, not a road (jr3d-v33)

- **What:** chase `back` 24 → 16, `backAtSpeed` 7 → 5, `lateralFollow` 0.5 → 0.62; FOV 66 + 13 kick → 62 + 10 (72° flat out instead of 79°). Height, look-ahead and damping untouched.
- **Why:** on an 812×375 phone at top speed the car was 7.5% of the screen width, parked on the horizon, with the bottom 40% of the screen showing empty road between lens and car — and a car one row ahead was 7–11 px tall. (The chase also lags ~14 units at speed, so the real distance was ~45.)
- **Evidence:** measured by projecting the car's real dimensions and road points through the live camera at top speed: car width 7.5% → 11.7%, car bottom at 59% → 64% of screen height, a car 60 ahead 11 → 13 px, 125 ahead 7 → 8 px, gap between rows 60→125 ahead 8 → 11 px. Lane-change and fence filmstrips keep the car well framed (at the fence it sits 62% across, was 59%). Harnesses unchanged, density worst 2.79. Easy revert: the five numbers above.

## 2026-09-29 — the sun's glint on the sea is a line, not a smudge (jr3d-v32)

- **What:** sea `roughness` 0.3 → 0.45 (`render3d/environment.js`).
- **Why:** the big white blob beside the road in every dusk frame was the low sun's specular on the sea (proved by A/B: gone with the sea hidden or rough, unchanged with the sun sprite hidden). At 0.3 it was round and blown out, right at road height — it read as a smudge on the lens.
- **Evidence:** same frame (z=500, 191 km/h): fully clipped pixels below the horizon 256 → 0, near-white 738 → 420; film shows a thin line of light on the horizon water instead. Bridge frames unchanged. Harnesses unchanged, density worst 2.79.

## 2026-09-29 — speed streaks that actually move (jr3d-v31)

- **What:** the 46 fixed radial spokes (brightness re-rolled every frame) are now 40 dashes that fly outward from the vanishing point, accelerating with perspective; length = motion blur; none in the wedge over the car.
- **Why:** the old lines never moved — at 60 fps they were a shimmer, not motion — and half of them ran straight across the car and road.
- **Evidence:** node probe — per-frame brightness jitter 0.098 → 0.010 at 200 km/h; streaks cross the frame in 0.47s at the edge at ~2,100 px/s (0 before). Before/after filmstrips (+0/50/100/150ms): old spokes identical in every frame; new dashes advance each frame. Harnesses unchanged, density worst 2.79.
