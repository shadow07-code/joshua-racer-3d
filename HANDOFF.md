# Joshua Racer 3D — Handoff

A third-person 3D arcade racer (Need for Speed 2 SE vibe) — a remake of the finished 2D game
**Joshua 1 Racer**. Vanilla JS ES modules + Three.js via import map (vendored), **no build step**.
This doc is the single source of truth for picking the project back up.

| | |
|---|---|
| **Live game** | https://joshua-racer-3d.vercel.app |
| **Repo** | https://github.com/shadow07-code/joshua-racer-3d (public) |
| **Vercel** | project `joshua-racer-3d`, scope `antonysajan-9019` |
| **Service worker** | `jr3d-v22` — **bump on every code change** |
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

### Then, on the same day: SECTORS, CHAIN and RANK

The heat loop fixed *the racing*; it did not make a **game**. A run was still a
flat, nameless drive until you died, and there was nothing to say afterwards and
no reason to start a second one. Three additions, each aimed at a different gap:

- **SECTORS** (`src/stages.js`) give a run its shape. Eight named, announced,
  distance-gated chapters — COAST RUN → RUSH HOUR → NIGHTFALL → WRONG WAY → AIR
  PATROL → GRIDLOCK → BLACKOUT → RED LINE, then endless OVERLOAD N. Each rewrites
  the rules (night level, opposing lane, cops, density). Distance-gated on
  purpose: driving hot advances you through the game faster. **"I reached
  BLACKOUT" is a sentence; "I scored 41,880" is not.**
- **CHAIN** is the skill ceiling. Every risk — a shave, a HELD slipstream, a
  landed jump, a canister, a smash — links it, and it multiplies both the heat
  those risks pay and the score they earn. A crash resets it to nothing. In the
  harness, two runs of the *same bot* in the *same world* differ 4× in score
  purely on chain preservation (chain 132 → 41k, chain 6 → 9k).
- **RANK** (`src/rank.js`) is the reason to press PLAY AGAIN. Lifetime score buys
  12 ranks, ROOKIE → JOSHUA. Deliberately NOT a power-up — an arcade leaderboard
  has to compare like with like — it is a title, shown on the title screen and
  celebrated on the result screen.

The result screen is now the shareable artefact: sector reached as the headline,
grade, score, rank bar with a rank-up flash, and eight stats.

### Then: the UNDERGROUND pass — NOS and DRIFT

Aimed squarely at NFS Underground. Two verbs, one structural idea:

- **THE HEAT BAR IS THE NOS BOTTLE.** Holding NOS burns the same resource that is
  your speed, your score and your life. A full bar sustains it ~4.6s and then you
  are empty and dying, so "when do I burn it" is the sharpest decision in the
  game. It comes with the Underground camera: FOV yanks +20°, the chase pulls
  back 9 and drops 2.4, and the speed streaks start near the vanishing point and
  run off the edge of frame.
- **DRIFT** scores the slide, off the existing physics and with no new button.
  **Measured on lateral velocity, NOT on slip** — see the trap in §6, that
  distinction was a real bug. It pays score generously and heat only modestly, on
  purpose: sliding needs no traffic, so if it refilled the bar you could mash
  left-right down an empty road forever. Drifting extends a run; it cannot
  sustain one. Traffic stays the only real fuel.
- **DASH moved to a double-tap of a steer pad**, freeing the centre for NOS.

### Then: the FEEL pass — the BRAKE, the SLINGSHOT, and a road with hills

The game had been through four redesigns without ever acquiring the most basic
verb in racing. Speed was a pure readout of HEAT: you could ask for more of it
and never for less, which is why the slipstream — the mechanic the whole economy
is built on — could not be *held*. The car outran every civilian on the road by
construction, so a tow lasted about a second and a half however well you drove
it, and the code had written that limitation up as a design feature.

- **BRAKE** (`BRAKE` in config, `btn-brake` stacked above the NOS pad, Down/S on
  the keyboard). Pulls the speed target down to `floor01` (0.30 of top = 32 u/s,
  deliberately under the *quickest* civilian car at 35 u/s so **every** car on
  the road is matchable). Weight transfers onto the nose, so the front bites:
  `steerBonus` + `gripBonus` make the car 35% sharper on the brake, measured in
  harness section L. It is not a safety valve — heat drains on a clock whatever
  your speed, and score is distance × heat, so every second on the pedal is
  points you did not bank and fuel you did not replace.
- **THE TOW NOW RUNS OUT** (`HEAT.draftFade` / `draftFadeFloor`). The instant a
  player can match pace and sit there, an undecayed draft is a heat fountain:
  park behind a bus, never take another risk, win. The value of a tow decays with
  how long it has been held, bottoming out **below** the idle drain rate — so
  holding is still correct and parking is always fatal. The PARASITE bot (section
  E) exists purely to prove that, and it dies in 6 of 7 seeded worlds.
- **SLINGSHOT** (`SLINGSHOT` in config). Ride a car's wake, break out, and shave
  it on the way past: that pair was always two adjacent systems that happened to
  reward each other, and naming it turns a habit into a technique. Worth **3.8×
  the heat and 2.2× the score** of a plain shave (harness section O).
- **Every shave is audible.** It never was. The only `sfxNearMiss()` call sat
  behind a `>= 100 km/h` gate that the 0.60 speed floor (= 120 km/h) made
  unreachable, so the most frequent and best moment in the loop happened in
  total silence. `sfxWhoosh(tightness)` is a band of noise sweeping *down* in
  pitch — that Doppler drop is most of why a near miss feels near.
- **ROAD ELEVATION** (`CURVE.elev*`, `src/curve.js`). Crests and dips. See the
  trap in §6: wavelength matters far more than amplitude here.
- Plus: a **camera that rolls** a few degrees with the slide (Comfort Mode zeroes
  it), **particles** (tyre smoke, barrier sparks, impact debris —
  `render3d/particles.js`), **brake lights** that blaze at the chase camera, a
  **wind/road-roar bed** that opens with speed, and **haptics**.

---

## 1. Open items (start here)

1. **🟠 Still not PLAYED, only observed.** Verified in-browser: boots clean, the
   sector banner fires and reads, the sector HUD tracks, the result screen lays
   out correctly at 800×450, rank shows on the title. Fixed during that pass: the
   sector banner was invisible against a bright sky (now sits on a dark band), and
   the rank row collided with itself. **Still unseen in motion: OVERDRIVE, the
   flameout death, a long chain, and sectors 2+ arriving naturally** — the preview
   pane composites too slowly to drive that far. Balance is from
   `tools/heattest.mjs`, not hands on it.
2. **🟠 The HEAT redesign itself has not been PLAYED either.** Verified: it boots
   clean, the HUD is right, heat visibly drains while coasting, the multiplier and
   speed track it, and all game-over element ids resolve. Fixed during that pass:
   the DASH pad was inheriting `#steer-controls button` (40% wide, 64px font) and
   swallowing the middle of the road.
   **Still unseen in motion: OVERDRIVE, the flameout death, and what high heat
   actually looks like** — the preview pane composites too slowly to reach them,
   and the balance numbers came from `tools/heattest.mjs`, not from hands on it.
   Most likely to need tuning, all single values in `HEAT` (`src/config.js`):
   `drainBase`/`drainScale` if it feels punishing, `draftRate`/`draftRange` if the
   slipstream is fiddly, `crash` (0.45) if a mistake feels fatal. The screen
   heat-wash strength is in `hud.js` (`rampTintEl`).
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
     `ONCOMING.gap`, `NITRO.chance` and `JUMP.chance` — all in `config.js`.
   - **`GRADES` may now be miscalibrated.** They were set from a single *unseeded* harness run that
     happened to score 65k; the harness is seeded now and a competent bot medians ~8.7k over two
     minutes. That bot crashes 42 times in that window, so it is a floor, not a ceiling — but
     nobody has measured what a human who actually slingshots scores. Do not touch `GRADES` until
     someone has.
   - **An expert BOT.** Section E's policies are stateless one-liners and cannot execute the
     three-phase slingshot, so the harness measures the *economy* (safe dies, parking is worthless)
     and section O measures the *mechanic* in isolation. A stateful bot that strings slingshots
     together would let the two be compared directly, which is the one balance question still open.
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
  stages.js       SECTORS — the named, distance-gated chapters a run moves through
  rank.js         lifetime XP → 12 ranks (persistent; deliberately not a power-up)
  tips.js         once-ever contextual coaching — teaches each system in situ
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
| NOS | `NOS` | `burn` 0.115/s (a full bar ≈ 4.6s), `speedMul` 1.24, `fovKick`/`camBack`/`camDrop` are the Underground shot |
| Drift | `DRIFT` | `minVx` 42 of ~73 max — commitment, not a nudge. `heatPerSec` MUST stay under the 0.045–0.110/s decay or drifting becomes a way to survive without traffic |
| Sectors | `src/stages.js` `SECTORS` | distance thresholds + per-sector night/oncoming/cops/density. Endless past the table |
| Chain | `CHAIN` | `window` 3.2s to lapse, `cap` 30 × `step` 0.04 → ×2.2 max, `draftMin` 0.45s to count a slipstream |
| Ranks | `src/rank.js` `RANKS` | cumulative lifetime score thresholds |
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

### Feel dials added by the FEEL pass

| Want to change | Knob | Now |
|---|---|---|
| How hard the brake bites | `BRAKE.power` | 52 (vs `PHYS.drag` 5) |
| How slow the brake will take you | `BRAKE.floor01` | 0.30 — **must stay under the fastest traffic** (0.35 of cruise) |
| Brake-to-turn sharpness | `BRAKE.steerBonus` / `gripBonus` | 0.30 / 0.55 → 35% more lateral |
| How fast a tow loses value | `HEAT.draftFade` / `draftFadeFloor` | 1.6s e-fold, floors at 0.12 — **the floor must stay below `HEAT.drainBase` (0.045) or parking becomes viable** |
| Slingshot payout | `SLINGSHOT.heatMul` / `scoreMul` | 1.8 / 2.2 |
| How long after leaving a tow a shave still counts | `SLINGSHOT.window` | 1.6s — breaking out and getting past genuinely takes ~1.2s |
| Hill size | `CURVE.elevAmp1/2` | 9 / 6 → road spans y 0–30 |
| Hill length | `CURVE.elevFreq1/2` | ~1100 / ~2600-unit wavelengths |
| Camera roll | `CAMERA.roll` | 0.055 rad (~3°); Comfort Mode sets 0 |
| Smoke/spark density | `render3d/particles.js` emitter rates | smoke `16 + 40×intensity`/s, sparks 90/s |

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

**§6B. `node tools/heattest.mjs`** — the BALANCE harness. Sections G/H print the
sector and rank ladders; **I** checks the NOS trade, **J** sweeps drift across
weave styles (this is what caught the slip-vs-velocity bug), and **K** asserts the
fire can actually kill: grazing must die, doing nothing must die at exactly
`flameoutSeconds`, and one real shave must visibly buy time, and the most important
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

- **The harness was UNSEEDED until the FEEL pass, and its verdicts were noise.**
  The traffic sim calls `Math.random()` dozens of times a second, so identical
  code produced "died at 48s with 3.5k" and "survived 120s with 65k" on different
  runs. Any balance claim made before that is worth exactly nothing. It now seeds
  `Math.random` per run and reports the **median of 7 fixed worlds**, and every
  bot drives the same seven. If you add a bot, run it through `SEEDS` too.
- **Road elevation: WAVELENGTH matters more than AMPLITUDE.** The first pass used
  ~700-unit hills, which sounds generous until you remember the view is only 320
  units deep — a whole crest fitted inside the frame, climb cancelled descent, and
  the net change across the visible road was **4 units**. It read as dead flat.
  At ~1100 units you spend seconds climbing toward a horizon you cannot see past.
  Measure with harness section N, not with your eyes.
- **A near miss needs the pass to be inside 18 units, and a lane is 22.4 wide.**
  So a clean one-lane-over pass scores *nothing* — you have to squeeze. This is
  deliberate (it is what makes a shave a skill) but it bites when writing bots:
  steering "until you reach the offset" overshoots, because releasing full lock at
  ~90 u/s of lateral velocity carries another ~9 units before grip bleeds it off.
  Hold the line instead of aiming at it.
- **Anything drawn on the road must add `v.y` now.** `road.worldPos()` returns a
  real height. Everything that used to write a literal `0` (or an absolute height
  like the bridge cables) has been converted, but new geometry will float or sink
  if it forgets. Anything longer than a few units also needs pitching by
  `road.gradeAt(z)` — over a bus's 22 units a 6% grade is 1.3 units of nose.
- **`navigator.vibrate` logs a console error on every call before a real user
  gesture**, so haptics are gated behind the first `pointerdown`/`keydown`
  (`src/juice.js`). A *synthetic* keydown satisfies the gate but not Chrome, so
  driving the game from the console will still print those errors — that is the
  test harness, not a bug.
- **`gl_PointSize` is in PHYSICAL pixels and scales as `300/distance`.** At the
  chase camera's ~25 units with DPR 2 that is ~24 screen pixels per unit of
  `aSize`. The first particle pass shipped smoke at `aSize` 10 — 240px beach
  balls. Smoke wants to be wide and nearly transparent; sparks small and bright.
- **The preview pane stops `requestAnimationFrame` entirely while hidden**, so
  waiting does nothing and each screenshot advances about one frame. To actually
  drive the game, replace `window.requestAnimationFrame` with a capture-only stub
  and call the stored callback in a loop — the pattern is in this session's
  transcript. Note that screenshots can lag the JS state by a frame or two, so
  read the DOM for truth and use the picture for looks.

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
- **A "drift" here is LATERAL VELOCITY, not `slip`.** Slip is the gap between
  where the wheels point and where the mass is going, which sounds like the right
  measure and is not: it spikes for ~0.2s after a steering change and then pins
  HIGH while you grind along the barrier, because the wall holds `vx` at zero. A
  slip-based drift therefore paid out for wall-riding and gave nothing at all for
  committed driving — the harness showed a hard weave banking **zero** drifts
  while a lazy one banked eighteen. `|vx|` is the honest measure.
- **A long slide must auto-bank.** Threading dense traffic can hold a drift open
  indefinitely, and an unbroken drift that only pays on exit pays nothing — the
  better you drifted, the less you got. `DRIFT.maxSeconds` pays out and continues.
- **The flameout clock must run BELOW a threshold, not at exactly zero.** Any
  positive gain used to clear it, and a grazing slipstream frame happens
  constantly in traffic, so the player floated at 0.001 forever and the fire
  could never kill anyone. `HEAT.flameoutClear` is the escape bar now.
- **The HUD must scale off viewport HEIGHT, not fixed px.** A landscape phone is
  ~375px tall, so every hard-coded size was roughly double what it should be
  there: the score collided with the toolbar and the NOS pad sat on the car. The
  big readouts now use `clamp(min, Nvh, max)` and the heat-bar hint hides under
  430px. **Check any new HUD element at 667×375, not just on desktop.**
- **A `nowrap` banner will clip on a phone.** The longest contextual tip is 494px
  and the 74vw cap on a landscape phone is ~493px, so it silently truncated the
  last word. Tips wrap now.
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
