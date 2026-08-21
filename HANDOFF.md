# Joshua Racer 3D — Handoff

A third-person 3D arcade racer (Need for Speed 2 SE vibe) — a remake of the finished 2D game
**Joshua 1 Racer**. Vanilla JS ES modules + Three.js via import map (vendored), **no build step**.
This doc is the single source of truth for picking the project back up.

| | |
|---|---|
| **Live game** | https://joshua-racer-3d.vercel.app |
| **Repo** | https://github.com/shadow07-code/joshua-racer-3d (public) |
| **Vercel** | project `joshua-racer-3d`, scope `antonysajan-9019` |
| **Service worker** | `jr3d-v16` — **bump on every code change** |
| **2D reference to port from** | `D:\Claude Code\Joshua racer 1\src\` |
| **Original brief** | `JOSHUA_RACER_3D_BRIEF.md` (several defaults **overridden** — see §2) |

The game is **complete and playable**: full arcade shell, traffic, scoring, rampage, helicopter,
coins, audio, PWA install, and an online leaderboard. Persistent memory also lives in the Claude
memory dir (`joshua-racer-3d-direction.md`, `joshua-racer-3d-architecture.md`).

---

## 1. Open items (start here)

1. **🔴 The online leaderboard is DOWN — needs the owner.** The Upstash Redis database is
   unreachable: Vercel's runtime logs show `leaderboard upstream error: fetch failed` (a network/DNS
   failure, *not* auth — that would log `redis 401`). The env vars are still set in the project, so
   the most likely cause is the **free-tier DB was reclaimed after ~2 months idle**. Fix: create a
   new free DB at upstash.com, then update `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in
   Vercel → Settings → Environment Variables → **Redeploy**. Details in §7. *The game degrades
   gracefully meanwhile ("OFFLINE — SHOWING CACHED") and pending scores retry on a later load.*
2. **Oil slicks** — the last missing Phase 5 piece. The reference `entities/oilspills.js` is dead
   code (depends on removed `RACE.totalLaps`/`lapLength`) → must be re-implemented for endless mode:
   spawn oil decals ahead periodically, `checkOilHit`, on hit set a brief slip (speed drop + steering
   wobble via `player.oilTimer`). **No life cost, no combo break.**
3. **Bridge environment** — add a `"bridge"` zone to `render3d/zones.js` + suspension towers/railings
   over the sea in `environment.js` (mirror the tunnel segment-pool pattern).
4. **Deeper fun roadmap** (ranked, not yet built): **oncoming-traffic lane** (higher closing speed =
   bigger near-miss payoff), **nitro pickups** (a reason to pick a lane), **ramps / jumps**,
   **dusk→night cycle** with headlights and neon.

---

## 2. Direction & locked decisions (these OVERRIDE the brief)

- **Spectacle-first.** Comfort is an **opt-in safety net** (Comfort Mode toggle), never a veto — the
  owner is fine on motion comfort.
- **Visual target:** Need for Speed 2 SE — glossy cars, atmospheric varied environments.
- **Tone:** **neutral warm dusk**. The owner rejected loud pink/synthwave. Subtle bloom only.
- **Player car:** **road supercar** (McLaren-F1-ish), not the brief's open-wheel F1. Red, with "J".
- **Road:** gentle sweeping curves, not straight.
- **Landscape-only.**
- **Install funnel:** mimic the **original Joshua Racer's** — a splash shown **once**, a
  **persistent** home-screen button, and real instructions where there's no native prompt.
  (This *superseded* an earlier "heavy modal on every load" direction — nagging is out.)
- **No build step.** Three.js via import map, **vendored** under `vendor/` so the PWA works offline.
- **The 2D game is the fun benchmark.** When something feels off, diff against the reference rather
  than inventing — that is how both big feel regressions were found (see §6).

---

## 3. Architecture

**Simulate in 2D `(x, z)`, render in 3D.** Every entity is `x` (lateral offset from the road
**centerline**) and `z` (distance along the road). Collision, AI and scoring are pure scalar `(x,z)`
math that ports ~line-for-line from the 2D reference. **The curve and the 3D rendering only affect
the camera and visuals** — `render3d/road.js` owns `curveAt(z)` → a centerline path `P(z)`; an entity
maps to world `P(z) + x·normal(z)`. **Collision never sees the curve.** The chase cam follows behind
along the tangent with a locked horizon — the **car model** banks, never the camera.

### File map
```
index.html            WebGL canvas + ALL DOM overlays/HUD + CSS + import map (three, three/addons/)
vendor/three.module.js   Three.js r0.160 (vendored)  ·  vendor/jsm/  bloom addons + RoundedBox
assets/audio/redline_at_midnight.mp3                 music bed (owner-supplied)
manifest.webmanifest · sw.js (jr3d-v16) · icons/*.svg · vercel.json (cleanUrls + cache headers)
api/leaderboard.js    zero-dep Vercel serverless leaderboard (Upstash Redis REST)
.claude/launch.json   preview-server config
src/
  config.js       ALL tuning: PHYS, ROAD, RACE, SPAWN, SCORE, GRADES, CAMERA, STEER, CURVE, FOG, KEYS
  main.js         fixed-1/60 loop, the full state machine, ALL wiring/scoring/collision
  gearbox.js      pure gearAt(speed01) → {gear, rev}; shared by the engine synth AND the tachometer
  juice.js        hitstop / slow-mo / camera-shake trauma model (all Comfort-Mode aware)
  input.js        keyboard + touch + on-screen steer pads (+ clearSteer)
  audio.js        procedural Web Audio: gearbox engine + SFX + heli rotor (one channel + toggle)
  music.js        MP3 music bed (loop, mute, pause/resume)
  scoring.js      score accumulator + localStorage hi-score
  hud.js          DOM HUD, tach/gear, popups, pip meter, game-over panel + letter grade
  ui.js           menu overlay manager (title/name/leaderboard/tutorial/paused) + lb render
  leaderboard.js  leaderboard client (fetch/submit + offline cache + pending retry; jr3d.* keys)
  comfort.js      Comfort Mode parameter sets
  pwa.js          SW registration + install funnel (splash/button/banner) + landscape gate
  entities/
    player.js     speed ramp, asymmetric steer ease, LATERAL MOMENTUM + slip, fences, weight transfer
    traffic.js    ported (x,z) sim: spawnRow/gap-lane, no-collision AI, checkTrafficHit, smashCar,
                  TRAFFIC_TYPES, coins (+ checkCoinGrab), SPAWN_ROW_GAP
    cops.js       helicopter sortie sim + barrels + checkBarrelHit
  render3d/
    scene.js      renderer, dusk sky shader, sun SPRITE (layer 1 → excluded from the reflection cam),
                  lights, FogExp2, env cube map; exposes follow(cam)
    road.js       curveAt(z) centerline engine, worldPos(z,x,out), headingAt(z), dynamic road ribbon
    camera.js     damped chase cam, locked horizon, speed-reactive dolly, snap() for fresh runs
    models.js     player supercar mesh + RAMPAGE aura; setSteer(a), setRampage(on,t)
    vehicles.js   traffic 3D models + makeTrafficView (brake/turn-signal lights)
    coins.js      spinning gold coin pool on the racing line
    cops3d.js     helicopter + flaming barrel + reticle pools
    scenery.js    palms + glowing reflector posts (thin out with speed)
    environment.js  sea plane + sand causeway + tunnel segment pool + ceiling lights
    zones.js      zoneTypeAt(z): deterministic coast/tunnel cycling (3400-unit supersection)
    effects.js    speed vignette + FOV kick + radial speed lines
    postfx.js     EffectComposer: RenderPass → UnrealBloom → OutputPass (fx.render())
```

### The loop (mental model)
`frame()` → `juice.update(dt)` returns a **time scale** (0 during hitstop, <1 during slow-mo) →
fixed-timestep accumulator → `step(dt)` → `render()`.

`step` dispatches on state: `stepRace` (full sim) or `stepAttract` (the auto-driving backdrop behind
the menus — no scoring, no collisions). `stepRace`: updatePlayer → density scaling + wave →
updateTraffic (onPassed/onNearMiss callbacks) → rampage timer/shockwave → updateCops → collisions
(rampage plow / `takeHit`) → coins → combo decay → tickScore → setEngine + upshift detection.

`render`: road.update → place/orient/bank/pitch the car → traffic/coins/cops/scenery/environment →
**shake offset → `follow(camera)` → `fx.render()` → shake restore** → `hud.update(...)`.

**States:** `TITLE → NAME_ENTRY → (TUTORIAL) → RACE ↔ PAUSED → GAMEOVER`, plus `LEADERBOARD`
(reachable from title and game-over). The 3D world keeps animating behind every menu.

---

## 4. What's built

- **Core:** curved endless road, damped chase cam, two-phase speed ramp, rubber-fence edges, fog,
  speed vignette + FOV kick + speed lines, Comfort Mode.
- **Driving feel:** asymmetric steer ease (gentle onset / snappy reversals), **lateral momentum +
  slip → drift**, **6-speed gearbox**, weight transfer (squat/dive), speed-reactive camera dolly.
- **Traffic:** row spawn with a guaranteed shifting gap lane, no-collision AI (gap-wait drift +
  follow/brake), 14 vehicle types, brake + turn-signal lights, smash-aside on impact.
- **Scoring & reward loop:** distance + pass + survival + **precision near-misses** (tighter = up to
  ×1.6 + `PERFECT!`) + combo + **coins on the racing line** + **letter grades** (C/B/A/S).
- **Rampage:** 10 combo near-misses fill a pip meter → ~7s invincible nitrous smash-through, exit
  shockwave, 10-pass cooldown, aura + banner.
- **Threats:** police helicopter (sortie AI, drops flaming barrels above 150 km/h, single→dual) +
  compounding density scaling + a ±18% **density wave** (surge → breather → surge).
- **Juice:** hitstop, slow-mo, camera shake, floating score/milestone popups, speed + combo callouts.
- **Audio:** procedural gearbox engine, full SFX set, heli rotor, MP3 music bed, 🎵/🔊 toggles.
- **Environments:** coastal causeway over the sea ↔ atmospheric tunnels, zone-cycled. Bloom.
- **Shell:** title over a live attract scene, name entry, first-run tutorial, pause + auto-pause,
  game-over panel with grade/stats/actions, online leaderboard.
- **PWA:** manifest (landscape), service worker (network-first shell, `/api/` never cached),
  install splash + persistent button + instructions banner, rotate-to-landscape gate.

---

## 5. Tuning quick-reference

Everything numeric lives in **`src/config.js`**.

| What | Where | Notes |
|---|---|---|
| **Drift / looseness** | `PHYS.grip` (10) | **lower = more slide**, higher = planted/on-rails |
| Drift look | `STEER.driftYaw` (0.55) | how far the nose over-rotates vs the path |
| Steering rate | `PHYS.steerSpeed` (112), `steerEase` (16) | ease is **×3.5 on release/reversal** — do NOT make this symmetric (§6) |
| Lean / pitch | `STEER.bank` (0.16), `.pitch` (0.030) | bank is driven by **actual vx**, not input |
| Speed | `PHYS.maxSpeed` (108) | the low road-scroll lever; km/h = `speed/maxSpeed*200` |
| Gears | `src/gearbox.js` `BANDS`, `REV_FLOOR` (0.55) | floor sets the shift drop (~43%); 0.34 was far too much |
| Camera | `CAMERA` back 24 / height 11 / `backAtSpeed` 7 / `dropAtSpeed` 2.6 | |
| Rampage | `RACE.rampage*` | |
| Difficulty | `RACE.density*`, `densityWaveAmp/Period`, `copTriggerKmh` (150) | |
| Coins | `RACE.coinRowChance` (0.28), `coinsPerTrail` (3), `SCORE.coinValue` | spawn on the **open gap lane** |
| Precision | `SCORE.precisionMax` (0.6), `precisionPx` (9) | |
| Grades | `GRADES` | C/B/A/S thresholds |
| Palette / sun | `render3d/scene.js` | `toneMappingExposure` 1.22, `SUN_DIR` |
| Bloom | `render3d/postfx.js` | threshold **0.96** — high so only emissives/sun bloom |
| Zone schedule | `render3d/zones.js` `PATTERN` | coast 0–1500, tunnel 1500–2080, coast → 3400, repeats |

---

## 6. How to run & verify

**No build.** Serve the folder statically:

```bash
npx -y serve -l 8099 .
```

**Two verification paths — pick by what you changed:**

**A. Headless (fast, deterministic — prefer this for sim/logic).** `config.js`, `player.js`,
`traffic.js`, `gearbox.js` and `scoring.js` are **pure logic with no DOM or Three.js**, so you can
import them in plain node and assert on real numbers. This is how drift, gear shifts, weight
transfer, coins, precision and the density wave were all verified — far faster than driving a
browser, and it still works when browser tooling is unavailable:

```js
import { pathToFileURL } from "node:url";
const imp = (p) => import(pathToFileURL("D:/Claude Code/Joshua Racer 3D/src/" + p).href);
const { makePlayer, updatePlayer } = await imp("entities/player.js");
// ...step the sim and assert on the numbers
```

**B. Browser (for anything visual).** Claude-in-Chrome MCP → `tabs_context_mcp{createIfEmpty:true}`
→ `navigate` to `http://localhost:8099/?fresh=N` (bump N to bust cache) → `javascript_tool` to drive
→ `computer` screenshot.

**Always** `node --check` every changed file first — it catches typos in seconds.

### Traps (hard-won — read before debugging)

- **`localhost:8080` is hijacked.** Another local project ("Just A Scanner") has a service worker and
  sometimes a server on :8080; it will serve *the wrong app* and waste a lot of time. **Use 8099.**
- **`npx serve` dies silently.** If requests start failing, just restart it.
- **A backgrounded Chrome tab pauses `rAF`** (`document.hidden === true`), so the loop freezes and
  screenshots look stale or blank. Re-navigate to wake it, then screenshot quickly. To measure the
  sim regardless, add a temporary `window.__jr3d = { tick, draw, ... }` hook — **and remove it after**.
- **Service worker serves stale code.** Bump `VERSION` in `sw.js` **and** keep its `ASSETS` list in
  sync when adding files (or offline launch breaks). To force-refresh a test tab: unregister via
  `navigator.serviceWorker.getRegistrations()` + delete `caches.keys()`, then reload.
- **A one-frame impulse gets smoothed away.** A crash's speed loss lasts a single frame; a symmetric
  ease erases it entirely (the nose-dive silently never happened). `player.accel01` uses an
  **asymmetric rate** (snap 40 down / recover 6 up). The same lesson applies to any impact response.
- **Speed changes made *outside* `updatePlayer` are invisible** unless you compare against
  `p.lastSpeed` (the previous frame's end), not `p.speed` at this frame's start — `applyCollisionLoss`
  mutates speed externally on every crash.
- **three.js: `+rotation.x` pitches the nose DOWN.** Squat under power is *negative*.
- **Anchor `index.html` `<style>` edits precisely.** An over-broad "replace from X to `</style>`"
  once deleted every menu-overlay rule and blanked the title screen.
- **The "slanted car after crash" bug is fixed — don't re-diagnose it from scratch.** The dominant
  cause was crashing *while holding the steer pad* (you crash *because* you were swerving), so the car
  re-banked the instant control resumed. Fixed with `player.steerLock` (0.45s neutral-steer recovery
  set in `takeHit`), plus per-`pointerId` window pointer-release in `input.js` and `chase.snap()` on a
  fresh run. With no input held the car was always straight — it was never a stuck sim state.

---

## 7. Leaderboard (how it works + how to bring it back)

- **`api/leaderboard.js`** — zero-dep Vercel serverless function at `/api/leaderboard`. Reads
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` (or the `KV_REST_API_*` aliases). Keys: `jr3d:lb:v1` (sorted set,
  best-per-name via `ZADD GT`) + `jr3d:lb:meta:v1` (hash). Light per-IP rate limit. `GET` → top 20,
  `POST` → submit + refreshed board.
- **`src/leaderboard.js`** — client: 6s timeout, localStorage cache, one-shot pending-submit retry.
  `submitScore` is fire-and-forget from `endRun()`.
- **Status codes tell you the fault:** `503` = env vars missing → "LEADERBOARD UNAVAILABLE".
  `502` = the function ran but Redis failed → check the Vercel **runtime logs**, which now log the
  cause (`redis 401` = bad token; **`fetch failed` = host unreachable / DB gone**).
- **Locally there is no `/api`**, so GET 404s and the client falls back to cached/offline. Expected.

**To restore it:** create a free DB at upstash.com (Regional, e.g. Mumbai) → copy the **REST**
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (leave "Read-Only Token" unticked — the game
writes) → Vercel → `joshua-racer-3d` → Settings → Environment Variables (Production) → **Redeploy**.
Verify: `GET https://joshua-racer-3d.vercel.app/api/leaderboard` returns `{"entries":[...]}`.

---

## 8. Deploy

Both CLIs are installed and authenticated (`gh` as `shadow07-code`, `vercel` as `antonysajan-9019`).

```bash
git add -A && git commit -m "..." && git push origin main
vercel deploy --prod --yes
```

Vercel serves this as a **static site + `api/` function, with no build command**. Always bump the
`sw.js` `VERSION` first, then confirm the live worker after deploying:

```bash
curl -s https://joshua-racer-3d.vercel.app/sw.js | grep VERSION
```

**Definition of done (from the brief):** a deployed PWA on a Vercel URL that plays like Joshua 1
Racer, installable + offline-capable, with the online leaderboard live. ← all met except the
leaderboard, which is blocked on §1 item 1.
