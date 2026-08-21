// Joshua Racer 3D — Phase 7 (ship it).
// Full arcade shell: TITLE → NAME_ENTRY → (TUTORIAL) → RACE ↔ PAUSED → GAMEOVER,
// plus an online LEADERBOARD reachable from the title and game-over. The 3D world
// keeps animating as a live attract scene behind the menus.
import * as THREE from "three";
import { PHYS, STEER, SCORE, RACE, ONCOMING, NITRO, JUMP, NIGHT } from "./config.js";
import { initInput, getInput, consumePress, clearSteer } from "./input.js";
import * as juice from "./juice.js";
import { toggleComfort, isComfort } from "./comfort.js";
import { initMusic, startOnce, toggleMute, isMuted, pauseMusic, resumeMusic } from "./music.js";
import { initPwa, setInstallButtonVisible } from "./pwa.js";
import {
  initAudio, resumeAudio, suspendAudio, startEngine, stopEngine, setEngine, setEngineRampage,
  sfxNearMiss, sfxCombo, sfxBump, sfxCrash, sfxRampage, sfxShockwave, sfxBarrelDrop, sfxGameOver, sfxCoin, sfxShift,
  sfxNitro, sfxHorn, sfxLaunch, sfxLand, sfxAlert,
  startHeliSound, stopHeliSound, isSfxEnabled, toggleSfx,
} from "./audio.js";
import { makePlayer, updatePlayer, playerBox, applyCollisionLoss, launchPlayer } from "./entities/player.js";
import {
  makeTrafficSystem, prepopulateTraffic, updateTraffic, checkTrafficHit, checkCoinGrab,
  checkNitroGrab, checkRampHit, startOncoming, smashCar, SPAWN_ROW_GAP,
} from "./entities/traffic.js";
import { makeTrafficView } from "./render3d/vehicles.js";
import { makeCoinsView } from "./render3d/coins.js";
import { makeNitroView } from "./render3d/nitro.js";
import { makeRampsView } from "./render3d/ramps.js";
import { makeCopsSystem, updateCops, checkBarrelHit } from "./entities/cops.js";
import { makeCopsView } from "./render3d/cops3d.js";
import { makeScene } from "./render3d/scene.js";
import { makeRoad } from "./render3d/road.js";
import { makeCar } from "./render3d/models.js";
import { makeChaseCam } from "./render3d/camera.js";
import { makeScenery } from "./render3d/scenery.js";
import { makeEnvironment } from "./render3d/environment.js";
import { makeEffects } from "./render3d/effects.js";
import { makeComposer } from "./render3d/postfx.js";
import { makeScoreState, startScoring, tickScore, finalizeScore, bestEverScore } from "./scoring.js";
import { makeHud } from "./hud.js";
import { gearAt } from "./gearbox.js";
import * as ui from "./ui.js";
import { setPlayerName, getPlayerName, fetchTop, submitScore, flushPending, cachedTop } from "./leaderboard.js";

const canvas = document.getElementById("game3d");
const { renderer, scene, camera, resize, follow, setNight } = makeScene(canvas);
const road = makeRoad(scene);
const car = makeCar();
scene.add(car.root);
const scenery = makeScenery(scene, road);
const environment = makeEnvironment(scene, road);
const chase = makeChaseCam(camera, road);
const effects = makeEffects();
const fx = makeComposer(renderer, scene, camera);
initInput(canvas);
initMusic();
initPwa();

const player = makePlayer();
const _carPos = new THREE.Vector3();

// Traffic (Phase 2).
const traffic = makeTrafficSystem();
prepopulateTraffic(traffic, 500);
const trafficView = makeTrafficView(scene, road);
const coinsView = makeCoinsView(scene, road);
const nitroView = makeNitroView(scene, road);
const rampsView = makeRampsView(scene, road);

// Threats + escalation (Phase 5): police helicopter + density scaling.
let cops = makeCopsSystem();
const copsView = makeCopsView(scene, road);
let hitTopSpeed = false, densityTimer = 0, densityMul = 1;

// ── Game state + scoring ──
const STATE = {
  TITLE: "TITLE", NAME_ENTRY: "NAME_ENTRY", LEADERBOARD: "LEADERBOARD",
  TUTORIAL: "TUTORIAL", RACE: "RACE", PAUSED: "PAUSED", GAMEOVER: "GAMEOVER",
};
let state = STATE.TITLE;
let lbReturnTo = STATE.TITLE;     // where the leaderboard BACK button returns to
let attractT = 0;                 // attract-mode auto-weave phase
let playerName = getPlayerName();

const score = makeScoreState();
let combo = 0, comboTimer = 0, comboBest = 0, nearMissTimer = 0, crashFlash = 0;
let raceTime = 0, topSpeedKmh = 0, coinsCollected = 0, nitrosGrabbed = 0, bestAir = 0;
// Nightfall (0 = the locked warm dusk, 1 = full night). Only advances while
// RACING, so every menu keeps the dusk hero shot the project is art-directed to.
let nightT = 0;
let rampageMeter = 0, rampageCooldown = 0, rampageMsg = "", rampageMsgTimer = 0;
let heliSoundOn = false;

// Juice: milestone callouts + camera shake.
const SPEED_MILESTONES = [120, 150, 180, 200];
let speedMsIdx = 0;             // next speed milestone to fire
const comboMsHit = new Set();   // combo milestones already celebrated this run
const _shake = { x: 0, y: 0 };
let lastGear = 1;               // for upshift detection (thud + kick)

// First-run steering tutorial — shown once, then remembered.
const TUTORIAL_KEY = "jr3d.tutorialSeen";
function hasSeenTutorial() { try { return localStorage.getItem(TUTORIAL_KEY) === "1"; } catch { return false; } }
function markTutorialSeen() { try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch {} }

const hud = makeHud(() => playAgain());
const comfortBtn = document.getElementById("btn-comfort");
const musicBtn = document.getElementById("btn-music");
const sfxBtn = document.getElementById("btn-sfx");
const pauseBtn = document.getElementById("btn-pause");
const hudEl = document.getElementById("hud");
const steerEl = document.getElementById("steer-controls");
const goPanel = document.getElementById("gameover");

// ── Overlay visibility, driven by state ──
function syncOverlays() {
  ui.showTitle(state === STATE.TITLE);
  setInstallButtonVisible(state === STATE.TITLE);   // persistent home-screen CTA
  ui.showNameEntry(state === STATE.NAME_ENTRY);
  ui.showLeaderboardPanel(state === STATE.LEADERBOARD);
  ui.showTutorial(state === STATE.TUTORIAL);
  ui.showPaused(state === STATE.PAUSED);
  if (goPanel) goPanel.classList.toggle("show", state === STATE.GAMEOVER);
  const playing = state === STATE.RACE || state === STATE.PAUSED;
  if (hudEl) hudEl.classList.toggle("show", playing);
  if (steerEl) steerEl.classList.toggle("show", state === STATE.RACE);
  if (pauseBtn) pauseBtn.style.display = playing ? "inline-block" : "none";
}
function setState(s) { state = s; syncOverlays(); }

function ensureAudio() { initAudio(); resumeAudio(); startOnce(); }

// Reset the whole world for a fresh run (also used to populate the attract scene).
function resetWorld() {
  road.reset();            // rebuild the centerline from z=0, or the world loads skewed
  player.z = 0; player.x = 0; player.speed = PHYS.startSpeed;
  player.raceTime = 0; player.steerSmooth = 0; player.steerVis = 0; player.steerLock = 0;
  player.vx = 0; player.slip = 0; player.accel01 = 0; player.lastSpeed = null; lastGear = 1;
  player.y = 0; player.vy = 0; player.airT = 0; player.airborne = false;
  player.lives = RACE.startLives; player.invuln = 1.5;
  player.rampage = 0; player.boost = 0;
  traffic.list.length = 0; traffic.coins.length = 0; traffic.nextRowZ = 80; traffic.lastGapLane = 2;
  traffic.rowsSpawned = 0; traffic.passedCount = 0; traffic.rowGapZ = SPAWN_ROW_GAP;
  traffic.nitros.length = 0; traffic.ramps.length = 0;
  traffic.oncomingOn = false; traffic.nextOncomingZ = 0; traffic.lastRampZ = -1e9;
  prepopulateTraffic(traffic, 500);
  coinsCollected = 0; nitrosGrabbed = 0; bestAir = 0;
  nightT = 0;
  cops = makeCopsSystem();
  startScoring(score, 0);
  combo = 0; comboTimer = 0; comboBest = 0; nearMissTimer = 0; crashFlash = 0;
  raceTime = 0; topSpeedKmh = 0;
  rampageMeter = 0; rampageCooldown = 0; rampageMsg = ""; rampageMsgTimer = 0;
  hitTopSpeed = false; densityTimer = 0; densityMul = 1;
  attractT = 0;
  applyNight(0);
  speedMsIdx = 0; comboMsHit.clear();
  clearSteer();            // drop any latched steer so a new run starts straight
  chase.snap();            // camera jumps to behind the car (no glide-in from old z)
  juice.resetJuice();
  hud.clearPopups();
}

// ── State transitions ──
function goTitle() {
  setEngineRampage(false); stopEngine();
  if (heliSoundOn) { stopHeliSound(); heliSoundOn = false; }
  resetWorld();                                 // fresh, populated attract scene
  const best = bestEverScore();
  ui.setTitleBest(best ? "BEST " + best.toLocaleString() : "");
  resumeAudio(); resumeMusic();                 // ambient music on the title
  setState(STATE.TITLE);
}

function beginRace() {
  resetWorld();
  setState(STATE.RACE);
  setEngineRampage(false); startEngine();        // safe no-op if audio isn't booted
  resumeMusic();
}

function playAgain() { ensureAudio(); beginRace(); }

function onPlay() { ensureAudio(); setState(STATE.NAME_ENTRY); }

function onNameConfirm(name) {
  playerName = setPlayerName(name);
  ensureAudio();
  if (hasSeenTutorial()) beginRace();
  else { resetWorld(); setState(STATE.TUTORIAL); }
}

function finishTutorial() { markTutorialSeen(); ensureAudio(); beginRace(); }

function openLeaderboard(returnTo) {
  lbReturnTo = returnTo;
  setState(STATE.LEADERBOARD);
  ui.renderLeaderboard({ entries: cachedTop() }, playerName);     // instant from cache
  fetchTop().then((data) => { if (state === STATE.LEADERBOARD) ui.renderLeaderboard(data, playerName); });
}
function closeLeaderboard() { setState(lbReturnTo || STATE.TITLE); }

function registerSmash() {
  combo += 1; comboBest = Math.max(comboBest, combo);
  comboTimer = RACE.comboWindow;
  score.score += SCORE.smashBonus * combo;
  sfxCombo(combo);
  juice.hitStop(0.035); juice.addShake(0.14);
  hud.popup("SMASH ×" + combo, "smash");
}

// Take a life-costing hit (traffic crash or flaming barrel). Returns true if the
// run just ended.
function takeHit(severity, invulnSec) {
  applyCollisionLoss(player, severity, invulnSec);
  combo = 0; comboTimer = 0; rampageMeter = 0;   // breaks the streak + dumps the meter
  crashFlash = 0.5;
  player.steerVis = 0; player.steerSmooth = 0; player.vx = 0; player.slip = 0;
  player.steerLock = 0.45;                        // un-bank + brief straight recovery
  sfxCrash();
  juice.hitStop(0.09); juice.addShake(0.55);
  player.lives -= 1;
  if (player.lives <= 0) { endRun(); return true; }
  return false;
}

function endRun() {
  const isNew = finalizeScore(score);
  setEngineRampage(false); stopEngine();
  if (heliSoundOn) { stopHeliSound(); heliSoundOn = false; }
  sfxGameOver();
  const run = {
    score: Math.floor(score.score), best: bestEverScore(), isNew,
    passed: traffic.passedCount, time: raceTime, topSpeed: topSpeedKmh, coins: coinsCollected,
    nitros: nitrosGrabbed, bestAir, night: nightT,
  };
  hud.showGameOver(run);
  setState(STATE.GAMEOVER);
  // Submit to the global board (fire-and-forget; refreshes the local cache so the
  // leaderboard panel shows this run immediately).
  submitScore({ name: playerName || "AAA", score: run.score, time: Math.floor(raceTime), passed: traffic.passedCount, topSpeed: topSpeedKmh });
}

// ── Pause / resume / auto-pause ──
function pauseGame() {
  if (state !== STATE.RACE) return;
  setState(STATE.PAUSED);
  setEngineRampage(false); stopEngine();
  if (heliSoundOn) { stopHeliSound(); heliSoundOn = false; }
  pauseMusic();
  suspendAudio();
}
function resumeGame() {
  if (state !== STATE.PAUSED) return;
  setState(STATE.RACE);
  resumeAudio(); startEngine(); resumeMusic();
}
function togglePause() { if (state === STATE.RACE) pauseGame(); else if (state === STATE.PAUSED) resumeGame(); }
function autoPause() {
  if (state === STATE.RACE) pauseGame();
  else pauseMusic();
  suspendAudio();
}
function onForeground() { resumeAudio(); if (state !== STATE.PAUSED) resumeMusic(); }

// ── UI + toolbar wiring ──
ui.initUI({
  onPlay,
  onOpenLeaderboard: () => { ensureAudio(); openLeaderboard(STATE.TITLE); },
  onNameConfirm,
  onNameBack: () => goTitle(),
  onLeaderboardBack: () => closeLeaderboard(),
  onTutorialDone: () => finishTutorial(),
  onResume: () => resumeGame(),
  onPauseExit: () => goTitle(),
  onPlayAgain: () => playAgain(),
  onGameOverLeaderboard: () => openLeaderboard(STATE.GAMEOVER),
  onExit: () => goTitle(),
});

function refreshComfortBtn() { if (comfortBtn) comfortBtn.textContent = "COMFORT: " + (isComfort() ? "ON" : "OFF"); }
function refreshMusicBtn() { if (musicBtn) { musicBtn.textContent = "🎵"; musicBtn.style.opacity = isMuted() ? "0.4" : "1"; } }
function refreshSfxBtn() { if (sfxBtn) { sfxBtn.textContent = "🔊"; sfxBtn.style.opacity = isSfxEnabled() ? "1" : "0.4"; } }
refreshComfortBtn();
refreshMusicBtn();
refreshSfxBtn();
if (comfortBtn) comfortBtn.addEventListener("click", () => { toggleComfort(); refreshComfortBtn(); });
if (musicBtn) musicBtn.addEventListener("click", () => { toggleMute(); refreshMusicBtn(); });
if (sfxBtn) sfxBtn.addEventListener("click", () => { initAudio(); resumeAudio(); toggleSfx(); refreshSfxBtn(); });
if (pauseBtn) pauseBtn.addEventListener("click", () => togglePause());

// Boot audio (music bed + procedural engine/SFX) on the first user gesture.
const kickAudio = () => { initAudio(); resumeAudio(); startOnce(); if (state === STATE.RACE) startEngine(); };
window.addEventListener("pointerdown", kickAudio, { once: true });
window.addEventListener("keydown", kickAudio, { once: true });

// Suspend audio + auto-pause a race when backgrounded; restore on return.
document.addEventListener("visibilitychange", () => { if (document.hidden) autoPause(); else onForeground(); });
window.addEventListener("pagehide", autoPause);
window.addEventListener("blur", autoPause);
window.addEventListener("focus", onForeground);

function onResize() { resize(); fx.setSize(window.innerWidth, window.innerHeight); }
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);

// Retry any leaderboard submission that failed on a previous (offline) run.
flushPending();

// ── Fixed-timestep loop (ported 1/60 accumulator) ──
const FIXED_DT = 1 / 60;
let acc = 0;
let lastT = performance.now();

// Push the current nightfall level through every system that has a look to
// grade. Guarded, because most frames it hasn't moved.
let nightApplied = -1;
function applyNight(n) {
  if (n === nightApplied) return;
  nightApplied = n;
  setNight(n);
  car.setNight(n);
  trafficView.setNight(n);
  scenery.setNight(n);
  environment.setNight(n);
  rampsView.setNight(n);
}

// Touchdown after a ramp jump — air time is the score, and the longer it was the
// harder the landing lands.
function onLanded(air) {
  const gain = Math.round(JUMP.airScorePerSec * air);
  score.score += gain;
  bestAir = Math.max(bestAir, air);
  sfxLand();
  juice.addShake(JUMP.landShake * (0.6 + 0.5 * Math.min(1, air)));
  const huge = air >= 1.4;
  hud.popup((huge ? "HUGE AIR! +" : "AIR! +") + gain, "smash", huge);
}

// Gentle auto-driving backdrop shown behind the title / name / leaderboard /
// tutorial menus. No scoring, no collisions, no cops — just a lively scene.
function stepAttract(dt) {
  attractT += dt;
  player.speed = PHYS.maxSpeed * 0.5;
  player.z += player.speed * dt;
  const sway = Math.sin(attractT * 0.45);
  player.x = sway * 22;
  player.steerVis = sway * 0.45;                 // visual bank/yaw only
  // Lean/drift now read from lateral MASS, so give the attract car a real vx
  // (the derivative of its sway) and a little slip — otherwise it drives flat.
  player.vx = Math.cos(attractT * 0.45) * 0.45 * 22;
  player.slip = player.steerVis * 0.25;
  updateTraffic(traffic, dt, player.z, { playerX: player.x, onPassed: () => {}, onNearMiss: () => {} });
  const speed01 = player.speed / PHYS.maxSpeed;
  const fov = effects.update(dt, speed01);
  chase.update(dt, player, fov);
}

function stepRace(dt) {
  updatePlayer(player, dt, getInput(), { onFenceBump: sfxBump, onLand: onLanded });
  raceTime += dt;

  // NIGHTFALL — a one-way grade from the locked warm dusk into full night, after
  // a short grace period so the opening frames are still the art-directed look.
  if (raceTime > NIGHT.startAfter) nightT = Math.min(1, (raceTime - NIGHT.startAfter) / NIGHT.fallSeconds);

  // The opposing carriageway opens. Announced hard, because it silently changes
  // the rule of an entire lane the player has spent half a minute using freely.
  if (!traffic.oncomingOn && raceTime >= ONCOMING.startSeconds) {
    startOncoming(traffic, player.z);
    hud.popup("ONCOMING TRAFFIC!", "milestone", true);
    rampageMsg = "LEFT LANE IS NOW TWO-WAY"; rampageMsgTimer = 2.6;
    sfxAlert(); juice.addShake(0.25);
  }
  const kmhNow = Math.round(player.speed / PHYS.maxSpeed * PHYS.topSpeedKmh);
  if (kmhNow > topSpeedKmh) topSpeedKmh = kmhNow;
  while (speedMsIdx < SPEED_MILESTONES.length && topSpeedKmh >= SPEED_MILESTONES[speedMsIdx]) {
    hud.popup(SPEED_MILESTONES[speedMsIdx] + " KM/H!", "milestone");
    juice.addShake(0.15);
    speedMsIdx++;
  }

  // Density scaling — once top speed is first reached, traffic compounds.
  if (!hitTopSpeed && player.speed >= PHYS.maxSpeed * RACE.topSpeedThreshold) { hitTopSpeed = true; densityTimer = 0; }
  if (hitTopSpeed) {
    densityTimer += dt;
    while (densityTimer >= RACE.densityStepSeconds) {
      densityTimer -= RACE.densityStepSeconds;
      densityMul = Math.min(RACE.densityMax, densityMul * (1 + RACE.densityStepIncrement));
    }
  }
  // Tension/release: breathe the row spacing on a slow cycle (surge → breather →
  // surge) so the difficulty has rhythm instead of a flat grind. Gap lane stays
  // open, so every row is still threadable.
  const wave = 1 + RACE.densityWaveAmp * Math.sin(raceTime * (2 * Math.PI / RACE.densityWavePeriod));
  traffic.rowGapZ = (SPAWN_ROW_GAP / densityMul) * wave;
  traffic.densityMul = densityMul;

  // Traffic sim + scoring (pass bonus ×combo; near-miss two tiers).
  updateTraffic(traffic, dt, player.z, {
    playerX: player.x,
    playerY: player.y,
    onPassed: () => {
      score.score += SCORE.passBonus * Math.max(1, combo);
      if (rampageCooldown > 0) rampageCooldown -= 1;     // pass-cooldown burns down
    },
    onNearMiss: (tightness = 0, car2 = null) => {
      const kmh = player.speed / PHYS.maxSpeed * PHYS.topSpeedKmh;
      // A head-on shave is the same skill at roughly double the closing speed,
      // so it pays roughly double — that multiplier IS the reason to gamble on
      // the opposing lane rather than treat it as a wall.
      const headOn = !!(car2 && car2.oncoming);
      const precision = (1 + SCORE.precisionMax * tightness) * (headOn ? ONCOMING.nearMissMul : 1);
      if (headOn) { sfxHorn(); juice.addShake(0.16); }
      // A tight shave rewards skill: a micro-freeze that punctuates the moment,
      // and a PERFECT! callout on the closest ones.
      if (tightness >= 0.55) { juice.hitStop(0.05); juice.addShake(0.14); }
      const perfect = tightness >= 0.7;
      if (kmh >= RACE.comboKmh) {                  // NEAR MISS COMBO territory
        combo += 1; comboBest = Math.max(comboBest, combo);
        comboTimer = RACE.comboWindow;
        const gain = Math.round(SCORE.nearMissBonus * combo * precision);
        score.score += gain;
        sfxCombo(combo);
        juice.addShake(0.05);
        const label = headOn ? "HEAD-ON! +" + gain : perfect ? "PERFECT! +" + gain : "+" + gain;
        hud.popup(label, headOn ? "headon" : perfect ? "perfect" : "nearmiss", perfect || headOn);
        if (combo >= 5 && combo % 5 === 0 && !comboMsHit.has(combo)) {
          comboMsHit.add(combo);
          hud.popup("COMBO ×" + combo + "!", "combo", true);
          juice.addShake(0.22);
        }
        // Fill the rampage meter while armed (not mid-rampage, not in cooldown).
        if (player.rampage <= 0 && rampageCooldown <= 0) {
          rampageMeter += 1;
          if (rampageMeter >= RACE.rampageNearMisses) {
            rampageMeter = 0;
            player.rampage = RACE.rampageDuration;
            player.boost = RACE.rampageDuration;   // nitrous overspeed surge
            rampageMsg = "RAMPAGE!"; rampageMsgTimer = 1.6;
            sfxRampage(); setEngineRampage(true);
            juice.slowMo(0.32, 0.45); juice.addShake(0.5);
            hud.popup("RAMPAGE!", "milestone", true);
          }
        }
      } else {                                     // discreet flat bonus, no combo
        score.score += Math.round(SCORE.nearMissBonus * precision);
        nearMissTimer = 0.8;
        if (headOn) hud.popup("HEAD-ON!", "headon");
        else if (perfect) hud.popup("PERFECT!", "perfect");
        sfxNearMiss();
      }
    },
  });

  // RAMPAGE timer + exit shockwave (kicks out the next 2 cars ahead).
  if (player.rampage > 0) {
    player.rampage = Math.max(0, player.rampage - dt);
    if (player.rampage === 0) {
      const ahead = traffic.list
        .filter((c) => !c.smashed && c.z > player.z && c.z < player.z + RACE.rampageClearDist)
        .sort((a, b) => a.z - b.z).slice(0, 2);
      for (const c of ahead) smashCar(c, player.x);
      rampageMsg = "CLEAR!"; rampageMsgTimer = 0.9;
      rampageCooldown = RACE.rampageCooldownPasses;       // lock the meter
      sfxShockwave(); setEngineRampage(false);
      juice.addShake(0.35); juice.slowMo(0.16, 0.5);
    }
  }

  // Police helicopter — flies in above copTriggerKmh and drops flaming barrels.
  updateCops(cops, dt, player.z, player.x, player.speed, { onDrop: sfxBarrelDrop });
  const helisOn = cops.active && cops.helis.length > 0;
  if (helisOn && !heliSoundOn) { startHeliSound(); heliSoundOn = true; }
  else if (!helisOn && heliSoundOn) { stopHeliSound(); heliSoundOn = false; }

  // RAMP — resolved BEFORE collisions, so the take-off frame is already airborne
  // and nothing parked near the lip can clip the car on its way up.
  if (checkRampHit(traffic, playerBox(player), player.y) && launchPlayer(player)) {
    sfxLaunch();
    juice.addShake(0.2);
  }

  // Collisions. Everything below is skipped while airborne (checkTrafficHit and
  // checkBarrelHit both take the height and bail out up there).
  if (player.rampage > 0) {
    // RAMPAGE: plow through — each smash feeds the combo; invincible, no life loss.
    const box = playerBox(player);
    let t, guard = 0;
    while ((t = checkTrafficHit(traffic, box, player.y)) && guard++ < 8) { smashCar(t, player.x); registerSmash(); }
  } else if (player.invuln <= 0) {
    const t = checkTrafficHit(traffic, playerBox(player), player.y);
    if (t) {
      smashCar(t, player.x);                       // knock the hit car aside (no clip-through)
      player.x += player.x > t.x ? 3.5 : -3.5;
      player.steerSmooth = 0;
      // A head-on arrives at roughly double the closing speed and hurts to match.
      const headOn = !!t.oncoming;
      if (headOn) juice.addShake(0.4);
      if (takeHit(headOn ? ONCOMING.hitSeverity : 0.5, headOn ? 1.6 : 1.4)) return;
    }
    // Flaming barrel (skipped if a traffic hit this frame already granted invuln).
    if (player.invuln <= 0 && !player.airborne) {
      const bar = checkBarrelHit(cops, playerBox(player));
      if (bar) { bar.hit = true; if (takeHit(0.5, 1.2)) return; }
    }
  }

  // Coins on the ideal weaving line — grabbed anytime (even mid-rampage / invuln),
  // but not from mid-air.
  const gotCoins = checkCoinGrab(traffic, playerBox(player), player.y);
  if (gotCoins) {
    coinsCollected += gotCoins;
    score.score += gotCoins * SCORE.coinValue;
    sfxCoin();
  }

  // NITRO — banks overspeed seconds. player.boost already drives the speed cap,
  // so this is the one pickup that changes how the car behaves, not just the score.
  const gotNitro = checkNitroGrab(traffic, playerBox(player), player.y);
  if (gotNitro) {
    nitrosGrabbed += gotNitro;
    player.boost = Math.min(NITRO.maxStock, player.boost + NITRO.seconds * gotNitro);
    score.score += gotNitro * NITRO.value;
    sfxNitro();
    juice.addShake(0.12);
    hud.popup("NITRO!", "nitro", true);
  }

  // Combo decay (a lapsed chain dumps the meter), flash timers.
  if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) { combo = 0; rampageMeter = 0; } }
  if (nearMissTimer > 0) nearMissTimer = Math.max(0, nearMissTimer - dt);
  if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - dt);
  if (rampageMsgTimer > 0) rampageMsgTimer = Math.max(0, rampageMsgTimer - dt);

  // Distance + per-second survival score.
  tickScore(score, player.z);
  score.score += SCORE.survivalSecondBonus * dt;

  const speed01 = player.speed / PHYS.maxSpeed;
  setEngine(speed01);
  // Upshift: a thud + a small kick so a gear change is felt, not just heard.
  const gearNow = gearAt(speed01).gear;
  if (gearNow > lastGear) { sfxShift(); juice.addShake(0.07); }
  lastGear = gearNow;
  const fov = effects.update(dt, speed01);
  chase.update(dt, player, fov);
}

function step(dt) {
  if (consumePress("c", "C")) { toggleComfort(); refreshComfortBtn(); }

  // Menu / pause keyboard fallbacks (desktop). Touch uses the on-screen buttons.
  if (state === STATE.TITLE && consumePress("Enter")) { onPlay(); return; }
  if (state === STATE.LEADERBOARD && consumePress("Enter", "Escape")) { closeLeaderboard(); return; }
  if (state === STATE.TUTORIAL && consumePress("Enter")) { finishTutorial(); return; }
  if (state === STATE.GAMEOVER && consumePress("Enter")) { playAgain(); return; }
  if (state === STATE.RACE && consumePress("p", "P")) { pauseGame(); return; }
  if (state === STATE.PAUSED && consumePress("p", "P", "Enter")) { resumeGame(); return; }

  switch (state) {
    case STATE.RACE: stepRace(dt); break;
    case STATE.TITLE:
    case STATE.NAME_ENTRY:
    case STATE.LEADERBOARD:
    case STATE.TUTORIAL: stepAttract(dt); break;
    default: break;   // PAUSED / GAMEOVER are frozen
  }
}

function render() {
  const speed01 = player.speed / PHYS.maxSpeed;
  road.update(player.z);
  // Place + orient the car: position on the centerline, yaw to the road heading,
  // and BANK the model into the steer (camera stays level — comfort lever).
  applyNight(nightT);
  road.worldPos(player.z, player.x, _carPos);
  car.root.position.copy(_carPos);
  car.root.position.y = player.y || 0;             // ramp jumps lift the whole car
  car.setAir(player.y || 0);                       // ...but its shadow stays on the road
  // Nose yaw = road heading + steering intent + SLIP. The slip term is the drift:
  // the car rotates into a turn ahead of its mass, and counter-settles on release.
  car.root.rotation.y = road.headingAt(player.z)
    + player.steerVis * STEER.yawIntoTurn
    + (player.slip || 0) * STEER.driftYaw;
  // Lean follows the actual sideways MASS (vx), not the input — so the body keeps
  // leaning while the car is still sliding, and rights itself as the slide bleeds off.
  car.body.rotation.z = -(player.vx || 0) / PHYS.steerSpeed * STEER.bank;
  // Weight transfer: squat under power, dive under braking/impact.
  // Negated: a positive rotation.x pitches the nose DOWN in three.js, and under
  // power the nose should lift (squat) — a crash then dives it. In the air the
  // same sign convention rotates the nose up on the way out and down on the way
  // in, which is what makes a jump read as an arc rather than a hop.
  car.body.rotation.x = player.airborne
    ? -Math.max(-1, Math.min(1, player.vy / JUMP.takeoffVy)) * 0.30
    : -(player.accel01 || 0) * STEER.pitch;
  car.setSteer(player.steerVis * STEER.wheelMax);
  car.setRampage(player.rampage > 0, performance.now() / 1000);
  // Blink the car while invulnerable (just after a crash), but only mid-race.
  car.root.visible = !(state === STATE.RACE && player.invuln > 0 && Math.floor(performance.now() / 70) % 2 === 0);
  trafficView.update(traffic, FIXED_DT, player.z);
  coinsView.update(traffic, player.z);
  nitroView.update(traffic, player.z);
  rampsView.update(traffic, player.z);
  copsView.update(cops, player.z);
  scenery.update(player.z, speed01);
  environment.update(player.z);
  // Camera shake (juice): offset → render → restore so it never accumulates.
  juice.shake(_shake);
  camera.position.x += _shake.x; camera.position.y += _shake.y;
  follow(camera);   // keep the sunset sky + sun + key light centered on the camera
  environment.follow(camera);
  hud.update({
    score: score.score, lives: player.lives, passed: traffic.passedCount, coins: coinsCollected,
    speed01, combo, comboTimer, nearMissTimer, crashFlash, ...gearAt(speed01),
    rampageActive: player.rampage > 0, rampageMeter, rampageCooldown,
    rampageMsg, rampageMsgTimer,
    boost: player.boost || 0, airborne: !!player.airborne,
  });
  fx.render();
  camera.position.x -= _shake.x; camera.position.y -= _shake.y;
}

function frame(now) {
  let dt = (now - lastT) / 1000;
  if (dt > 0.25) dt = 0.25;
  lastT = now;
  const tScale = juice.update(dt);   // 0 during hitstop, <1 during slow-mo, else 1
  acc += dt * tScale;
  while (acc >= FIXED_DT) { step(FIXED_DT); acc -= FIXED_DT; }
  render();
  requestAnimationFrame(frame);
}

// Boot into the title screen (live attract scene behind it).
goTitle();
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
