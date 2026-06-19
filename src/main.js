// Joshua Racer 3D — Phase 7 (ship it).
// Full arcade shell: TITLE → NAME_ENTRY → (TUTORIAL) → RACE ↔ PAUSED → GAMEOVER,
// plus an online LEADERBOARD reachable from the title and game-over. The 3D world
// keeps animating as a live attract scene behind the menus.
import * as THREE from "three";
import { PHYS, STEER, SCORE, RACE } from "./config.js";
import { initInput, getInput, consumePress, clearSteer } from "./input.js";
import * as juice from "./juice.js";
import { toggleComfort, isComfort } from "./comfort.js";
import { initMusic, startOnce, toggleMute, isMuted, pauseMusic, resumeMusic } from "./music.js";
import { initPwa } from "./pwa.js";
import {
  initAudio, resumeAudio, suspendAudio, startEngine, stopEngine, setEngine, setEngineRampage,
  sfxNearMiss, sfxCombo, sfxBump, sfxCrash, sfxRampage, sfxShockwave, sfxBarrelDrop, sfxGameOver,
  startHeliSound, stopHeliSound, isSfxEnabled, toggleSfx,
} from "./audio.js";
import { makePlayer, updatePlayer, playerBox, applyCollisionLoss } from "./entities/player.js";
import { makeTrafficSystem, prepopulateTraffic, updateTraffic, checkTrafficHit, smashCar, SPAWN_ROW_GAP } from "./entities/traffic.js";
import { makeTrafficView } from "./render3d/vehicles.js";
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
import * as ui from "./ui.js";
import { setPlayerName, getPlayerName, fetchTop, submitScore, flushPending, cachedTop } from "./leaderboard.js";

const canvas = document.getElementById("game3d");
const { renderer, scene, camera, resize, follow } = makeScene(canvas);
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
let raceTime = 0, topSpeedKmh = 0;
let rampageMeter = 0, rampageCooldown = 0, rampageMsg = "", rampageMsgTimer = 0;
let heliSoundOn = false;

// Juice: milestone callouts + camera shake.
const SPEED_MILESTONES = [120, 150, 180, 200];
let speedMsIdx = 0;             // next speed milestone to fire
const comboMsHit = new Set();   // combo milestones already celebrated this run
const _shake = { x: 0, y: 0 };

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
  player.z = 0; player.x = 0; player.speed = PHYS.startSpeed;
  player.raceTime = 0; player.steerSmooth = 0; player.steerVis = 0;
  player.lives = RACE.startLives; player.invuln = 1.5;
  player.rampage = 0; player.boost = 0;
  traffic.list.length = 0; traffic.nextRowZ = 80; traffic.lastGapLane = 2;
  traffic.rowsSpawned = 0; traffic.passedCount = 0; traffic.rowGapZ = SPAWN_ROW_GAP;
  prepopulateTraffic(traffic, 500);
  cops = makeCopsSystem();
  startScoring(score, 0);
  combo = 0; comboTimer = 0; comboBest = 0; nearMissTimer = 0; crashFlash = 0;
  raceTime = 0; topSpeedKmh = 0;
  rampageMeter = 0; rampageCooldown = 0; rampageMsg = ""; rampageMsgTimer = 0;
  hitTopSpeed = false; densityTimer = 0; densityMul = 1;
  attractT = 0;
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
  player.steerVis = 0; player.steerSmooth = 0;    // un-bank immediately on impact
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
    passed: traffic.passedCount, time: raceTime, topSpeed: topSpeedKmh,
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

// Gentle auto-driving backdrop shown behind the title / name / leaderboard /
// tutorial menus. No scoring, no collisions, no cops — just a lively scene.
function stepAttract(dt) {
  attractT += dt;
  player.speed = PHYS.maxSpeed * 0.5;
  player.z += player.speed * dt;
  const sway = Math.sin(attractT * 0.45);
  player.x = sway * 22;
  player.steerVis = sway * 0.45;                 // visual bank/yaw only
  updateTraffic(traffic, dt, player.z, { playerX: player.x, onPassed: () => {}, onNearMiss: () => {} });
  const speed01 = player.speed / PHYS.maxSpeed;
  const fov = effects.update(dt, speed01);
  chase.update(dt, player, fov);
}

function stepRace(dt) {
  updatePlayer(player, dt, getInput(), { onFenceBump: sfxBump });
  raceTime += dt;
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
  traffic.rowGapZ = SPAWN_ROW_GAP / densityMul;
  traffic.densityMul = densityMul;

  // Traffic sim + scoring (pass bonus ×combo; near-miss two tiers).
  updateTraffic(traffic, dt, player.z, {
    playerX: player.x,
    onPassed: () => {
      score.score += SCORE.passBonus * Math.max(1, combo);
      if (rampageCooldown > 0) rampageCooldown -= 1;     // pass-cooldown burns down
    },
    onNearMiss: () => {
      const kmh = player.speed / PHYS.maxSpeed * PHYS.topSpeedKmh;
      if (kmh >= RACE.comboKmh) {                  // NEAR MISS COMBO territory
        combo += 1; comboBest = Math.max(comboBest, combo);
        comboTimer = RACE.comboWindow;
        score.score += SCORE.nearMissBonus * combo;
        sfxCombo(combo);
        juice.addShake(0.05);
        hud.popup("+" + (SCORE.nearMissBonus * combo), "nearmiss");
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
        score.score += SCORE.nearMissBonus;
        nearMissTimer = 0.8;
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

  // Collisions.
  if (player.rampage > 0) {
    // RAMPAGE: plow through — each smash feeds the combo; invincible, no life loss.
    const box = playerBox(player);
    let t, guard = 0;
    while ((t = checkTrafficHit(traffic, box)) && guard++ < 8) { smashCar(t, player.x); registerSmash(); }
  } else if (player.invuln <= 0) {
    const t = checkTrafficHit(traffic, playerBox(player));
    if (t) {
      smashCar(t, player.x);                       // knock the hit car aside (no clip-through)
      player.x += player.x > t.x ? 3.5 : -3.5;
      player.steerSmooth = 0;
      if (takeHit(0.5, 1.4)) return;
    }
    // Flaming barrel (skipped if a traffic hit this frame already granted invuln).
    if (player.invuln <= 0) {
      const bar = checkBarrelHit(cops, playerBox(player));
      if (bar) { bar.hit = true; if (takeHit(0.5, 1.2)) return; }
    }
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
  road.worldPos(player.z, player.x, _carPos);
  car.root.position.copy(_carPos);
  car.root.rotation.y = road.headingAt(player.z) + player.steerVis * STEER.yawIntoTurn;
  car.body.rotation.z = -player.steerVis * STEER.bank;
  car.setSteer(player.steerVis * STEER.wheelMax);
  car.setRampage(player.rampage > 0, performance.now() / 1000);
  // Blink the car while invulnerable (just after a crash), but only mid-race.
  car.root.visible = !(state === STATE.RACE && player.invuln > 0 && Math.floor(performance.now() / 70) % 2 === 0);
  trafficView.update(traffic, FIXED_DT);
  copsView.update(cops, player.z);
  scenery.update(player.z, speed01);
  environment.update(player.z);
  // Camera shake (juice): offset → render → restore so it never accumulates.
  juice.shake(_shake);
  camera.position.x += _shake.x; camera.position.y += _shake.y;
  follow(camera);   // keep the sunset sky + sun + key light centered on the camera
  environment.follow(camera);
  hud.update({
    score: score.score, lives: player.lives, passed: traffic.passedCount,
    speed01, combo, comboTimer, nearMissTimer, crashFlash,
    rampageActive: player.rampage > 0, rampageMeter, rampageCooldown,
    rampageMsg, rampageMsgTimer,
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
