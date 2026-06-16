# Joshua Racer 3D — Handoff / Status

A third-person 3D arcade racer (Need for Speed 2 SE vibe) — a remake of the finished 2D game
**Joshua 1 Racer**. Vanilla JS ES modules, Three.js via CDN-style import map (vendored locally),
**no build step**. This doc is the single source of truth for picking the project back up.

> Companion brief: `JOSHUA_RACER_3D_BRIEF.md` (the original spec — note: several of its defaults
> were **overridden** by the owner; see "Direction / decisions" below).
> Reference 2D game to port from: **`D:\Claude Code\Joshua racer 1\src\`**.
> Persistent memory also lives in the Claude memory dir (`joshua-racer-3d-direction.md`,
> `joshua-racer-3d-architecture.md`).

---

## 1. Current status (what's DONE)

The game is a **complete, playable arcade loop** with sound. Built & verified:

- **Phase 0 — core feel:** gentle **curved** endless road, **damped chase cam** (locked horizon),
  two-phase speed ramp, binary tap-steer, rubber-fence edges, fog, speed vignette, Comfort Mode.
- **Player car:** sleek **red road supercar** (McLaren-F1-style: low body, glass greenhouse,
  **dark twin racing stripes**, **round quad taillights**, alloy wheels) with the white **"J"** on
  the rear deck. (This **replaced** the brief's open-wheel F1, per the owner's NFS2 reference.)
- **Phase 2 — traffic:** ported `(x,z)` sim (row spawn + guaranteed shifting gap lane, no-collision
  AI, `checkTrafficHit`); 14 glossy vehicle types (sedan/taxi/SUV/truck/bus) with brake + amber
  turn-signal lights; collision → lose a life.
- **Phase 3 — scoring/HUD:** distance + pass×combo + near-miss (two tiers) + survival; persisted
  hi-score; **DOM HUD** (score/lives/passed/speed/combo banner/near-miss flash); **game-over panel**
  (score/best/NEW RECORD/passed/time/top + PLAY AGAIN). RACE↔GAMEOVER state machine.
- **Phase 4 — Rampage:** 10 combo near-misses fill a **pip meter** → ~7s invincible nitrous
  **smash-through** (smashBonus×combo + speed surge), exit shockwave, 10-pass cooldown; nitrous
  aura (blue ring + orange flame jets) + RAMPAGE!/CLEAR! banner.
- **Phase 5 (partial) — threats:** **police helicopter** (3D model w/ spinning rotor + beacon,
  sortie AI, drops **flaming barrels** above 150 km/h, single→dual patrol) + **density scaling**
  (traffic compounds after top speed). **Oil slicks NOT done yet.**
- **Phase 6 — audio:** procedural Web Audio — F1 **engine** (rumble→wail, opens up in rampage),
  **SFX** (near-miss, combo chime, crash, bump, rampage whoosh, shockwave, barrel drop, game-over),
  **helicopter rotor** loop. 🎵 music + 🔊 SFX toolbar toggles. Music bed = the owner's MP3.
- **Environments:** **coastal causeway** (road on a sand embankment over the **sea**, sun shimmer)
  ↔ **tunnels** (arched concrete + streaming emissive ceiling lights), zone-cycled. **Bridge NOT done.**
- **Visual polish:** neutral warm-dusk palette (NOT pink), soft camera-facing **sun sprite**,
  subtle **bloom** (vendored UnrealBloom), rounded/glossy clearcoat car paint.
- **PWA scaffold:** manifest (`orientation: landscape`), service worker (network-first + precache),
  install funnel ("Install the game — Yes/No"), rotate-to-landscape gate, SVG icons.
- **Phase 7 — Ship it (DONE; deploy pending owner accounts):** full arcade **shell + state machine**
  (`TITLE → NAME_ENTRY → (TUTORIAL) → RACE ↔ PAUSED → GAMEOVER`, plus `LEADERBOARD`) in `main.js`;
  DOM **title screen** over a **live 3D attract scene** (the car auto-drives behind the menus);
  **name entry** (remembered name); **online leaderboard** (`src/leaderboard.js` client +
  `api/leaderboard.js` Upstash serverless + `vercel.json`) reachable from title & game-over, with
  graceful offline cache + one-shot pending-submit retry; **first-run tutorial** card (gated by
  `jr3d.tutorialSeen`); **pause** (⏸ toolbar btn / `p` key) + **auto-pause** on blur/visibilitychange;
  game-over panel gained **LEADERBOARD / EXIT** actions. SW bumped to **v9** (+ `ui.js`/`leaderboard.js`
  precached, `/api/` bypassed so the board never caches). Overlay DOM/CSS live in `index.html`;
  overlay wiring in `src/ui.js`. **Verified in Chrome** (every transition, offline degradation,
  attract sim, no console errors). ⏳ **Only the live deploy remains** — needs the owner's Vercel
  account + a fresh Upstash store (see §6).

### What's LEFT (priority order)
1. **Deploy Phase 7 to Vercel** *(owner action; code is ready)* — connect a new Vercel project +
   a fresh Upstash Redis store so the **online leaderboard goes live**. Step-by-step in §6.
2. **Oil slicks** — the small remaining Phase 5 piece (slip hazard, no life cost). The reference
   `entities/oilspills.js` is dead code (depends on removed `RACE.totalLaps/lapLength`) → must be
   re-implemented for endless mode: spawn oil decals ahead periodically, `checkOilHit`, on hit set
   a brief slip (speed drop + steering wobble via a `player.oilTimer`), **no life cost**, no combo break.
3. **Bridge** environment — add a `"bridge"` zone in `render3d/zones.js` + render suspension
   towers/railings over the sea in `environment.js` (mirror the tunnel pool pattern).

---

## 2. Direction / decisions (these OVERRIDE the brief)

- **Spectacle-first**, comfort is an **opt-in safety net** (Comfort Mode toggle), not a veto.
  The owner is fine on motion comfort.
- **Visual target:** Need for Speed 2 SE — glossy cars, atmospheric varied environments.
- **Tone:** **neutral warm dusk** (owner rejected the loud pink/synthwave). Subtle bloom only.
- **Player car:** **road supercar**, not open-wheel F1 (kept red + "J").
- **Road:** **gentle sweeping curves** (not straight).
- **Landscape-only**; heavy PWA install funnel.
- **No build step:** Three.js via import map, **vendored** under `vendor/` (offline-capable).
- **Infra (for Phase 7):** **new** repo + **new** Vercel project + **fresh** Upstash store; reuse
  the reference's leaderboard API/client code.

---

## 3. Architecture (the key idea)

**Simulate in 2D `(x, z)`, render in 3D.** Every entity is `x` (lateral offset from the road
**centerline**) and `z` (distance along the road). Collision/AI/scoring are pure scalar `(x,z)`
math and port ~line-for-line from the 2D reference. The **curve + 3D rendering only affect the
camera/visuals** — `render3d/road.js` owns `curveAt(z)` → a centerline path `P(z)`; any entity maps
to world `P(z) + x·normal(z)`. Collision never sees the curve. The chase cam follows behind along
the tangent, locked horizon (the **car model** banks, not the camera).

### File map
```
index.html                 WebGL canvas + DOM HUD/menus overlay + import map (three, three/addons/)
vendor/three.module.js     Three.js r0.160 (vendored)
vendor/jsm/                 vendored addons: postprocessing/* (bloom), geometries/RoundedBoxGeometry
assets/audio/redline_at_midnight.mp3   music bed (owner-supplied)
manifest.webmanifest · sw.js (VERSION jr3d-v9) · icons/*.svg
vercel.json                cleanUrls + cache headers (no-cache shell/api, long-cache vendor/assets)
api/leaderboard.js         zero-dep Vercel serverless leaderboard (Upstash Redis REST)
.claude/launch.json        preview-server config (npx serve)
src/
  config.js        ALL tuning: PHYS, ROAD, RACE, SCORE, CAMERA, STEER, CURVE, FOG, WORLD, KEYS
  main.js          game loop (fixed 1/60), RACE↔GAMEOVER state machine, ALL wiring/scoring/collision
  input.js         keyboard + touch + on-screen steer pads
  music.js         MP3 music bed (loop, mute, starts on first gesture)
  audio.js         procedural Web Audio: engine + SFX + heli rotor (one SFX channel + toggle)
  scoring.js       score + localStorage hi-score
  hud.js           DOM HUD manager + game-over panel + pip meter + rampage banner
  ui.js            menu overlay manager (title/name/leaderboard/tutorial/paused) + lb render
  leaderboard.js   leaderboard client (fetch/submit + offline cache + pending retry; jr3d.* keys)
  comfort.js       Comfort Mode parameter sets
  pwa.js           SW registration + install funnel + landscape gate
  entities/
    player.js      ramp/steer/fence sim; x = offset from centerline; exposes steerVis
    traffic.js     ported (x,z) sim: spawnRow/gap-lane, no-collision AI, checkTrafficHit,
                   smashCar, TRAFFIC_TYPES table, export SPAWN_ROW_GAP (base gap for density)
    cops.js        helicopter sortie sim + barrels + checkBarrelHit (exports HELI_HOVER_AHEAD)
  render3d/
    scene.js       renderer, dusk sky shader, sun SPRITE (on layer 1 so it's excluded from the
                   reflection cube cam), lights, FogExp2, env cube map; exposes follow(cam)
    road.js        curveAt(z) centerline engine, worldPos(z,x,out), headingAt(z), dynamic road ribbon
    camera.js      damped chase cam (exponential, locked horizon)
    models.js      player supercar mesh + RAMPAGE aura; setSteer(a), setRampage(on,t)
    vehicles.js    traffic 3D models + makeTrafficView (positions, brake/turn-signal lights)
    cops3d.js      makeCopsView: helicopter + flaming barrel + reticle pools
    scenery.js     palms + glowing reflector posts (thin out with speed)
    environment.js sea plane + sand causeway ribbon + tunnel segment pool + ceiling-light pool
    zones.js       zoneTypeAt(z): deterministic coast/tunnel cycling (3400-unit supersection)
    effects.js     speed vignette + FOV kick + radial speed lines
    postfx.js      EffectComposer: RenderPass → UnrealBloom → OutputPass (fx.render())
```

### main.js loop (mental model)
`frame()` = fixed-timestep accumulator → `step(dt)` (sim, only when `state===RACE`) → `render()`.
`step`: updatePlayer → density scaling → updateTraffic (onPassed/onNearMiss scoring cbs) → rampage
timer/shockwave → updateCops + heli sound → collisions (rampage plow / `takeHit` for traffic+barrel)
→ combo decay → tickScore → setEngine. `render`: road.update → place/orient/bank car + setRampage →
trafficView/copsView/scenery/environment update → `follow(camera)` + env follow → `hud.update(...)`
→ `fx.render()`.

---

## 4. How to run & verify (IMPORTANT — read before testing)

**No build.** Serve the folder statically and open in a browser.

- **LAN server (kept running in background):** `npx serve -l 8080 .`
  - It **dies sometimes** — if `http://127.0.0.1:8080` is unreachable, just restart it
    (`npx -y serve -l 8080 .` as a background process).
  - Phone URL: `http://<LAN-IP>:8080` (LAN IP was `192.168.29.221`; re-check with
    `Get-NetIPAddress -AddressFamily IPv4`).
- **Syntax check before browser:** `node --check` every file under `src/` (catches typos fast).
- **Visual verification = Claude-in-Chrome MCP** (the owner has a Chrome instance connected):
  `list_connected_browsers` → `select_browser` → `tabs_context_mcp{createIfEmpty:true}` →
  `navigate` to `http://localhost:8080/?fresh=N` (bump N to bust cache) → run JS to
  `document.getElementById('install-no').click()` (dismiss install modal) → drive via
  `window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'}))` → `computer` `screenshot`.

### Verification GOTCHAS (these wasted a lot of time — know them)
- **Chrome tab backgrounding:** if the tab isn't the focused/visible tab, `document.hidden===true`
  and **rAF pauses** → the game loop freezes (score/speed stuck, screenshot shows a default/stale
  frame). Re-`navigate` to wake it, then screenshot quickly.
- **The IDE Preview MCP pane keeps collapsing to 0–11px wide** → its screenshots hang. **Don't use
  it.** Use Claude-in-Chrome on the 8080 server instead.
- **Service worker serves stale code.** After editing, **bump `VERSION` in `sw.js`**, and in the
  test tab clear it: unregister via `navigator.serviceWorker.getRegistrations()` + delete
  `caches.keys()`, then reload. Also **keep `sw.js`'s precache `ASSETS` list in sync** when adding
  files (or offline launch breaks).
- **Triggering rare states for a screenshot:** add a temporary `window.__x = () => {...}` hook at the
  end of `main.js`, verify, then **remove it** (this is how the rampage/helicopter visuals were
  checked — e.g. force high speed + invincibility, set `player.z` to a coast value, hover the heli).

---

## 5. Tuning quick-reference

- **Everything numeric:** `src/config.js`. Camera = `CAMERA` (back 24 / height 11 / lookAhead 42 /
  fov 66). Steering feel = `STEER`. Curve gentleness = `CURVE`. Fog = `FOG.density` (0.003).
  Rampage = `RACE.rampage*`. Helicopter/density = `RACE.copTriggerKmh` (150) / `RACE.density*`.
  Internal `PHYS.maxSpeed` (108) is the deliberate low road-scroll lever; km/h = `speed/maxSpeed*200`.
- **Palette / lighting / sun:** `render3d/scene.js` (SKY_TOP/PINK/HOT colours, light intensities,
  `toneMappingExposure` 1.22, `SUN_DIR`).
- **Bloom:** `render3d/postfx.js` (strength 0.3, radius 0.5, **threshold 0.96** — high so paint
  highlights don't bloom; only emissives/sun glow).
- **Zone schedule:** `render3d/zones.js` `PATTERN` (coast 0–1500, tunnel 1500–2080, coast 2080–3400;
  repeats every 3400). Tunnel geometry/lights tuned in `environment.js` (ARCH_X/Y, light pool).

---

## 6. Phase 7 — BUILT. Remaining: deploy (owner accounts).

The whole shell is built & verified (see §1). The code is deploy-ready; the **only** remaining work
is the live hookup, which needs the **owner's** Vercel + Upstash accounts. The leaderboard fails
**gracefully** until then (shows "OFFLINE — SHOWING CACHED"; runs are stashed and retried on a later
load), so the game is fully playable offline right now.

### How the leaderboard works (so you can debug it)
- `api/leaderboard.js` is a zero-dep Vercel **serverless function** (`/api/leaderboard`). It reads
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or the `KV_REST_API_*` aliases) from the
  env. **No env → it returns 503** and the client shows "LEADERBOARD UNAVAILABLE". Keys are
  namespaced `jr3d:lb:v1` (sorted set, best-per-name via `ZADD GT`) + `jr3d:lb:meta:v1` (hash).
- `src/leaderboard.js` is the client (fetch/submit, 6 s timeout, localStorage cache + one-shot
  pending retry, `jr3d.*` keys). `submitScore` is fire-and-forget from `endRun()`.
- Locally (`npx serve`) there is **no** `/api`, so GET returns 404 → client goes offline-cached.
  That's expected; it only works for real on Vercel.

### Deploy steps (owner does these; ~10 min)
1. **Git + GitHub:** the folder is **not yet a git repo**. `git init`, commit, push to a **new**
   GitHub repo (e.g. `joshua-racer-3d`). (Ask the owner before committing/pushing.)
2. **Vercel project:** on vercel.com → *Add New… → Project* → import that repo. It's a static site +
   `api/` function, **no build command** (framework preset: *Other*). `vercel.json` is already in place.
3. **Upstash store:** in the Vercel project → *Storage* → *Create Database* → **Upstash Redis** (or
   *Marketplace → Upstash*). Connecting it **auto-injects** `UPSTASH_REDIS_REST_URL/TOKEN` into the
   project env. (Or create a DB at upstash.com and paste the two REST vars into Vercel → Settings →
   Environment Variables.) **Redeploy** after connecting so the function sees the vars.
4. **Verify:** open the Vercel URL → title → LEADERBOARD shows "NO SCORES YET — BE THE FIRST!"
   (not "UNAVAILABLE"). Play a run; your score should appear. `GET /api/leaderboard` should return
   `{"entries":[…]}`. Install prompt + offline launch should work (it's a PWA).

**Definition of done (from the brief):** a deployed PWA on a Vercel URL that plays like Joshua 1
Racer, installable + offline-capable, with the online leaderboard live. ← only step 4 left to confirm.

---

## 7. Useful commands

```powershell
# syntax-check all modules
Get-ChildItem src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }

# (re)start the LAN server in the background
npx -y serve -l 8080 .

# find LAN IP for phone testing
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }
```
SW is at **v9** — bump it on the next code change (and keep `sw.js`'s `ASSETS` list + `/api/` bypass in sync).
