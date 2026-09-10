# Joshua Racer 3D — Handoff

A third-person 3D arcade racer (Need for Speed 2 SE vibe) — a remake of the finished 2D game
**Joshua 1 Racer**. Vanilla JS ES modules + Three.js via import map (vendored), **no build step**.
This doc is the single source of truth for picking the project back up.

| | |
|---|---|
| **Live game** | https://joshua-racer-3d.vercel.app |
| **Repo** | https://github.com/shadow07-code/joshua-racer-3d (public) |
| **Vercel** | project `joshua-racer-3d`, scope `antonysajan-9019` |
| **Service worker** | `jr3d-v18` — **bump on every code change** |
| **2D reference to port from** | `D:\Claude Code\Joshua racer 1\src\` |
| **Original brief** | `JOSHUA_RACER_3D_BRIEF.md` (several defaults **overridden** — see §2) |

The game is **complete and playable**: full arcade shell, traffic, scoring, rampage, helicopter,
coins, audio, PWA install, and an online leaderboard. Persistent memory also lives in the Claude
memory dir (`joshua-racer-3d-direction.md`, `joshua-racer-3d-architecture.md`).

---

## 0. READ THIS FIRST — the game was fundamentally redesigned on 2026-09-10

The owner reported, after everything below was built, that the game **still was not
fun**. The diagnosis: it had **one verb and no economy**. You steered. Coins, nitro,
ramps and the opposing lane were all still "steer onto this" or "steer away from
this", so none of them added a decision. Three things actively killed tension:

1. **Speed was a clock.** `rampTarget(raceTime)` climbed to top speed over 84
   seconds regardless of play, so the central decision of any racing game —
   commit or back off — did not exist.
2. **The guaranteed gap lane** gave every row a visible correct answer.
3. **Traffic was purely an obstacle**, so the player wanted *less* of the thing
   the game is made of. And there was barely any: ONE car per 94 units across
   five lanes meant you could drive five seconds without seeing another vehicle.

The fix is **HEAT** (`src/heat.js`): one resource that is simultaneously your
speed, your score multiplier, your life, and the traffic-density dial. It drains
constantly and refills only from risk. Playing safe starves you and the run ends.
Traffic became fuel rather than obstacle — the same inversion that turns Doom
Eternal's demons into ammo. **A crash bills heat, so a hot player survives
mistakes that kill a cold one: aggression is the safe play.**

---

## 1. Open items (start here)

1. **🟠 The HEAT redesign has NOT had a visual/feel pass.** The Chrome extension
   dropped mid-session, so it was verified headlessly (thoroughly — see §6A/§6B)
   and only boot-checked in the browser: no console errors, HUD elements present,
   hearts and pips gone. **Nobody has watched it move or played it.** Most likely
   things to be wrong: heat-bar placement/size, whether the DASH pad is reachable
   with a thumb, whether the drain rate feels punishing or fair, and whether the
   screen heat-wash is too strong. All of those are single values in `HEAT`
   (`src/config.js`) or CSS in `index.html`.
2. **🔴 The online leaderboard is DOWN — needs the owner.** The Upstash Redis database is
   unreachable: Vercel's runtime logs show `leaderboard upstream error: fetch failed` (a network/DNS
   failure, *not* auth — that would log `redis 401`). The env vars are still set in the project, so
   the most likely cause is the **free-tier DB was reclaimed after ~2 months idle**. Fix: create a
   new free DB at upstash.com, then update `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in
   Vercel → Settings → Environment Variables → **Redeploy**. Details in §7. *The game degrades
   gracefully meanwhile ("OFFLINE — SHOWING CACHED") and pending scores retry on a later load.*
2. **Oil slicks: DROPPED — do not build them.** The owner cancelled this outright on 2026-08-21.
   It is not backlog, it is a decision. (The 2D reference no longer contains `entities/oilspills.js`
   at all, so there was never anything to port either.)
3. **Bridge environment: DONE** (2026-08-21) — see §4.
4. **Deeper fun roadmap: DONE** (2026-08-21) — opposing lane, nitro, ramps and nightfall are all
   built and verified. See §4/§5.
5. **Not started, in rough priority order:**
   - **A balance pass once the owner has actually played it.** The new systems were tuned against
     headless numbers (encounter rates, air time, spawn cadence), not feel. The likely dials are
     `ONCOMING.startSeconds`/`gap`, `NITRO.chance` and `JUMP.chance` — all in `config.js`.
   - **The sea barely reads as water.** At dusk it fogs to almost exactly the sky colour, so the
     causeway and the bridge both look like they cross a void. A slow scrolling normal map (or even
     a horizon-line contrast tweak) would sell "over water" for very little work.
   - **More zone types.** `render3d/zones.js` is now a 5-entry table and the segment-pool pattern is
     proven three times over (tunnel, bridge deck, ramps) — a city or mountain-pass zone is mostly
     a cross-section array and a pool.

---

## 2. Direction & locked decisions (these OVERRIDE the brief)

- **Spectacle-first.** Comfort is an **opt-in safety net** (Comfort Mode toggle), never a veto — the
  owner is fine on motion comfort.
- **Visual target:** Need for Speed 2 SE — glossy cars, atmospheric varied environments.
- **Tone:** **neutral warm dusk**. The owner rejected loud pink/synthwave. Subtle bloom only.
- **Player car:** **road supercar** (McLaren-F1-ish), not the brief's open-wheel F1. Red, with "J".
- **Road:** gentle sweeping curves, not straight.
- **⚠️ SUPERSEDED 2026-09-10: "auto-accelerate" and "the 2D game is the fun
  benchmark".** Speed is no longer a clock and no longer ported from the 2D game;
  it is a readout of heat. The 2D reference is still the benchmark for *feel*
  (steering, drift, weight) but explicitly NOT for the reward loop, which is the
  thing that was not working. The owner authorised overriding these directly.
- **Landscape-only.**
- **Nightfall is one-way, and menus never leave dusk.** `nightT` climbs 0→1 over ~95 race seconds
  and then holds; it is reset to 0 by `resetWorld()` and only advances inside `stepRace`, so the
  title/name/leaderboard attract scene keeps the art-directed warm-dusk hero shot. A looping
  day/night cycle was rejected — the one-way grade reads as *escalation*, matching how every other
  system in the game (density, cops, opposing traffic) ramps.
- **Neon stays warm.** Billboards and tower strips are amber/sand with one cool teal. The
  no-synthwave rule above still applies at night — no magenta, no grids.
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
  heat.js         THE CORE LOOP — one resource: speed + score + life + density
  scoring.js      score accumulator + localStorage hi-score (distance × heat mult)
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
    nitro.js      glowing aqua nitro canister pool (cool, so it never reads as a coin)
    ramps.js      hazard-striped launch wedges (pooled ribbons off the centerline)
    cops3d.js     helicopter + flaming barrel + reticle pools
    scenery.js    palms + reflector posts + NEON BILLBOARDS (night-only, coast-only)
    environment.js  sea + sand causeway + tunnel pool + BRIDGE (deck/towers/cables) + setNight
    zones.js      zoneTypeAt(z) + zoneBlend(z,type): coast/tunnel/bridge (4200-unit supersection)
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

- **HEAT (the core loop):** one bar that is speed, score multiplier, life and
  traffic density. Drains constantly (full → flameout in ~14s of coasting).
  Refills ONLY from risk: the **slipstream** (tuck in behind a car — closer fills
  faster, and you cannot hold it because you are far quicker, so the move is hold
  then swerve late), near-misses (head-on pays ×2.2), air, canisters, coins.
  Crash bills 45%. Zero heat starts a 4s flameout siren; let it run out and the
  run ends. Fill the bar and you enter **OVERDRIVE** — invincible smash-through
  that only sustains itself while you keep hitting cars.
- **DASH:** an instant ~2-lane lateral hop that ignores grip and costs 10% heat —
  the resource that keeps you alive is the one you burn to escape.
- **Traffic density now follows HEAT**, not a clock, and the base density was
  raised from 1 car/row to 2–4. The game feeds you exactly as hard as you play.
- **Core:** curved endless road, damped chase cam, rubber-fence edges, fog,
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
- **Environments:** coastal causeway ↔ tunnels ↔ a **suspension BRIDGE** (deck + parapets, pylon
  towers with neon strips, parabolic main cables with hangers), zone-cycled. Bloom. The causeway
  *sinks* under the sea plane at a bridge mouth rather than narrowing, so the transition reads as a
  beach running out into the water.
- **Opposing carriageway:** the outermost lane goes two-way ~34s in (announced with a klaxon +
  banner). Painted as a double-yellow from frame one so the rule is legible before it bites. Head-on
  shaves pay ×2.4 and a head-on crash costs more speed. The gap lane can never be that lane, and any
  car caught in it when the lane opens pulls over.
- **Nitro canisters:** bank up to 6s of overspeed (the speedo genuinely reads past 200 km/h and turns
  cyan). 70% of them sit in the opposing lane once it is live — the risk *is* the reward.
- **Ramps / jumps:** hazard-striped wedges on the open weaving line launch a ~1.6s, 17-unit-high arc
  covering ~175 units (about two traffic rows). Airborne = no traffic or barrel collisions, reduced
  steering authority, air time paid out on landing. The shadow and headlight pool stay on the road.
- **Nightfall:** a one-way dusk→night grade over ~95s — sky, fog, every light and the renderer
  exposure. Headlights + beams + a ground pool + car underglow come up, traffic lamps brighten,
  opposing cars run hotter still, tunnel strips and tower neon blaze, roadside neon billboards light.
- **Shell:** title over a live attract scene, name entry, first-run tutorial, pause + auto-pause,
  game-over panel with grade/stats/actions, online leaderboard.
- **PWA:** manifest (landscape), service worker (network-first shell, `/api/` never cached),
  install splash + persistent button + instructions banner, rotate-to-landscape gate.

---

## 5. Tuning quick-reference

Everything numeric lives in **`src/config.js`**.

| What | Where | Notes |
|---|---|---|
| **THE WHOLE GAME** | `HEAT` | `drainBase`/`drainScale` set how long coasting buys you; `nearMiss`, `draftRate`/`draftRange`, `airRate`, `canister` are the refills; `crash` (0.45) is why hot = safe; `speedFloor` (0.60) **must** stay above the fastest traffic or cold becomes a death spiral |
| Dash | `DASH` | 195 u/s for 0.24s ≈ 2.2 lanes, 0.45s cooldown |
| Traffic amount | `SPAWN_ROW_GAP` (80) + `HEAT.densityMul` | cars/row is 2 + up to ~2.7 more with heat |
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
| **Opposing lane** | `ONCOMING` | `startSeconds` 34, `gap` 380 (≈1 car every 4.3s), `nearMissMul` 2.4, `hitSeverity` 0.75. `lane` 0 is assumed by the road texture's double-yellow — changing it repaints correctly, but re-check `WITH_FLOW_MIN_X` in traffic.js |
| **Nitro** | `NITRO` | `seconds` 2.6, `maxStock` 6, `chance` 0.10/row (≈every 11s), `riskyLaneChance` 0.7 |
| **Ramps** | `JUMP` | `takeoffVy` 34 + `gravity` 46 → ~1.6s air, ~17u peak, ~175u covered. `minGapZ` 620 floors the spacing at ~1 per 1300u |
| **Nightfall** | `NIGHT` | `startAfter` 12s grace, then 0→1 over `fallSeconds` 95. Exposure 1.22→0.74 is the only lever that also dims the baked reflection cube map |
| Zone schedule | `render3d/zones.js` `PATTERN` | 4200-unit supersection: coast 0–1400, tunnel →1980, coast →2760, **bridge →3560**, coast →4200 |
| Bridge geometry | `render3d/environment.js` | `SEA_Y` −8.5 (lowered so the deck has air under it), `TOWER_SPACING` 190, `TOWER_H` 48, `CABLE_SAG` 33 |

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

**Always** `node --check` every changed file first — it catches typos in seconds. The headless path
now also covers the opposing lane, nitro, ramps and the jump arc — see the pattern in §6A below.

**§6B. `node tools/heattest.mjs`** — the BALANCE harness, and the most important
test in the repo, because the design claim *is* a set of numbers. It measures:
how long coasting buys you; what shave rate holds a given heat; that a crash at
95% is survivable and at 35% is fatal; that a stone-cold car still out-runs the
fastest traffic (or cold is an inescapable death spiral); and it runs two bots
through the real sim — a COWARD that never takes a risk and a RACER that plays
the slipstream line. **The coward must die in well under a minute and the racer
must reach overdrive.** If that inverts, the loop is broken no matter how it looks.

**§6A. `node tools/simtest.mjs`** — the checked-in headless suite. What it asserts (extend it when
you touch the sim; it
caught a real fairness bug where cars stranded in the opposing lane would have been driven through
head-on): jump air time/height/distance; air-steering authority ratio; opposing cars stay in their
lane and same-direction cars never enter it; encounter cadence; the guaranteed gap lane is never the
opposing lane; pickup/ramp spawn rates; that airborne disables traffic hits, coins and nitro; and
that a ramp triggers exactly once and only in its own lane.

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
- **`road.reset()` must be called on every fresh run — and it now is.** `prune()` only ever moves
  the centerline's `baseI` FORWARD, so after ~570 units the samples for small `z` are gone. A restart
  puts the player back at `z = 0`, where `centerlineAt` clamped to `baseI` and then *extrapolated*
  thousands of steps backwards: positions stayed on a straight line but the **heading ran away**
  (measured 3.017 rad — the car facing backwards), so the car and the whole road loaded skewed. This
  was a long-standing bug, not a new one; `resetWorld()` now calls `road.reset()` first. If you ever
  teleport `player.z` (a debug hook, a level skip), you must warm the centerline out past the target
  first or you will hit the same thing as NaN-filled geometry and a black screen.
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

**Pushing does NOT deploy.** The Vercel project is not git-connected — every deployment in its
history was made manually by the CLI. A `git push` updates GitHub and leaves the live site on the
previous build, so the `vercel deploy` line above is always required.

Vercel serves this as a **static site + `api/` function, with no build command**. Always bump the
`sw.js` `VERSION` first, then confirm the live worker after deploying:

```bash
curl -s https://joshua-racer-3d.vercel.app/sw.js | grep VERSION
```

**Definition of done (from the brief):** a deployed PWA on a Vercel URL that plays like Joshua 1
Racer, installable + offline-capable, with the online leaderboard live. ← all met except the
leaderboard, which is blocked on §1 item 1.
