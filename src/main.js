// Joshua Racer 3D — Phase 7 (ship it).
// Full arcade shell: TITLE → NAME_ENTRY → (TUTORIAL) → RACE ↔ PAUSED → GAMEOVER,
// plus an online LEADERBOARD reachable from the title and game-over. The 3D world
// keeps animating as a live attract scene behind the menus.
import * as THREE from "three";
import { PHYS, STEER, SCORE, RACE, ONCOMING, NITRO, JUMP, NIGHT, HEAT, CHAIN, DRIFT, SLINGSHOT } from "./config.js";
import { sectorIndexAt, sectorAt, nextSectorZ, sectorStartZ } from "./stages.js";
import { currentRank, bankRun } from "./rank.js";
import { tipOnce, TIPS } from "./tips.js";
import {
  makeHeat, addHeat, updateHeat, heatSpeed01, heatScoreMul, heatDensity, TIERS,
} from "./heat.js";
import { initInput, getInput, consumePress, clearSteer } from "./input.js";
import * as juice from "./juice.js";
import { toggleComfort, isComfort } from "./comfort.js";
import { initMusic, startOnce, toggleMute, isMuted, pauseMusic, resumeMusic } from "./music.js";
import { initPwa, setInstallButtonVisible } from "./pwa.js";
import {
  initAudio, resumeAudio, suspendAudio, startEngine, stopEngine, setEngine, setEngineRampage,
  sfxNearMiss, sfxCombo, sfxBump, sfxCrash, sfxRampage, sfxShockwave, sfxBarrelDrop, sfxGameOver, sfxCoin, sfxShift,
  sfxNitro, sfxHorn, sfxLaunch, sfxLand, sfxAlert,
  startSkid, stopSkid, setSkidLevel, sfxWhoosh, startWind, setWind, stopWind,
  startHeliSound, stopHeliSound, isSfxEnabled, toggleSfx,
} from "./audio.js";
import { makePlayer, updatePlayer, playerBox, applyCollisionLoss, launchPlayer, dashPlayer, cancelDrift } from "./entities/player.js";
import {
  makeTrafficSystem, prepopulateTraffic, updateTraffic, checkTrafficHit, checkCoinGrab,
  checkNitroGrab, checkRampHit, startOncoming, smashCar, draftTarget, SPAWN_ROW_GAP,
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
import { makeParticles } from "./render3d/particles.js";
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
const particles = makeParticles(scene);
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
let densityMul = 1;

// SECTORS — the run's shape. Distance-gated, so driving hot advances you faster.
let sectorIdx = 1, sector = sectorAt(1), sectorBest = 1;

// HEAT — the one resource the game runs on. See src/heat.js for why.
const heat = makeHeat();
let draftT = 0, draftStreak = 0, dashCount = 0;
let driftTime = 0, bestDrift = 0, skidOn = false, windOn = false;
// SLINGSHOT bookkeeping — which car you were towing off, how long you held it,
// and how long ago you broke out. A shave on THAT car inside the window is the
// move the whole economy was pointing at, so it gets a name and a payout.
let draftCar = null, draftHeldFor = 0, draftSince = 1e9;
let slingshots = 0;
let smokeAcc = 0, sparkAcc = 0;

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
// CHAIN — every risk links it, a crash breaks it, and it multiplies both the
// heat those risks pay and the score they earn.
let chain = 0, chainTimer = 0, chainBest = 0, nearMissTimer = 0, crashFlash = 0;
let raceTime = 0, topSpeedKmh = 0, coinsCollected = 0, nitrosGrabbed = 0, bestAir = 0;
// Nightfall (0 = the locked warm dusk, 1 = full night). Only advances while
// RACING, so every menu keeps the dusk hero shot the project is art-directed to.
let nightT = 0;
let rampageMsg = "", rampageMsgTimer = 0;
let heliSoundOn = false;

// Juice: milestone callouts + camera shake.
const SPEED_MILESTONES = [120, 150, 180, 200];
let speedMsIdx = 0;             // next speed milestone to fire
const chainMsHit = new Set();   // chain milestones already celebrated this run
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
  player.invuln = 1.5;
  player.rampage = 0; player.throttle01 = HEAT.speedFloor;
  player.dashT = 0; player.dashCd = 0; player.dashDir = 0;
  Object.assign(heat, makeHeat());
  draftT = 0; draftStreak = 0; dashCount = 0;
  cancelDrift(player);
  driftTime = 0; bestDrift = 0;
  draftCar = null; draftHeldFor = 0; draftSince = 1e9;
  slingshots = 0; smokeAcc = 0; sparkAcc = 0;
  particles.clear();
  if (skidOn) { stopSkid(); skidOn = false; }
  traffic.list.length = 0; traffic.coins.length = 0; traffic.nextRowZ = 80; traffic.lastGapLane = 2;
  traffic.rowsSpawned = 0; traffic.passedCount = 0; traffic.rowGapZ = SPAWN_ROW_GAP;
  traffic.nitros.length = 0; traffic.ramps.length = 0;
  traffic.oncomingOn = false; traffic.nextOncomingZ = 0; traffic.lastRampZ = -1e9;
  traffic.densityMul = heatDensity(heat);      // seed the opening rows at the right density
  prepopulateTraffic(traffic, 500);
  coinsCollected = 0; nitrosGrabbed = 0; bestAir = 0;
  nightT = 0;
  cops = makeCopsSystem();
  startScoring(score, 0);
  chain = 0; chainTimer = 0; chainBest = 0; nearMissTimer = 0; crashFlash = 0;
  sectorIdx = 1; sector = sectorAt(1); sectorBest = 1;
  raceTime = 0; topSpeedKmh = 0;
  rampageMsg = ""; rampageMsgTimer = 0;
  densityMul = 1;
  attractT = 0;
  applyNight(0);
  speedMsIdx = 0; chainMsHit.clear();
  clearSteer();            // drop any latched steer so a new run starts straight
  chase.snap();            // camera jumps to behind the car (no glide-in from old z)
  juice.resetJuice();
  hud.clearPopups();
  hud.clearSector();
  hud.clearTip();
}

// ── State transitions ──
function goTitle() {
  setEngineRampage(false); stopEngine(); stopWind(); windOn = false;
  if (heliSoundOn) { stopHeliSound(); heliSoundOn = false; }
  resetWorld();                                 // fresh, populated attract scene
  const best = bestEverScore();
  const r = currentRank();
  ui.setTitleBest(
    "RANK " + r.index + " · " + r.name + (best ? "   —   BEST " + best.toLocaleString() : ""));
  resumeAudio(); resumeMusic();                 // ambient music on the title
  setState(STATE.TITLE);
}

function beginRace() {
  resetWorld();
  setState(STATE.RACE);
  hud.sector(sector);
  setEngineRampage(false); startEngine();        // safe no-op if audio isn't booted
  startWind(); windOn = true;                    // the broadband rush that reads as speed
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

// The multiplier the chain is currently worth. Applied to BOTH heat gains and
// score bonuses, so a long chain makes you faster, richer and harder to kill at
// the same time — and makes the crash that ends it genuinely expensive.
function chainMul() { return 1 + Math.min(chain, CHAIN.cap) * CHAIN.step; }

// Link the chain. Every risk in the game funnels through here.
function linkChain(quiet) {
  chain += 1;
  chainBest = Math.max(chainBest, chain);
  chainTimer = CHAIN.window;
  if (!quiet && CHAIN.milestones.includes(chain) && !chainMsHit.has(chain)) {
    chainMsHit.add(chain);
    hud.popup("CHAIN ×" + chain, "combo", chain >= 30);
    juice.addShake(0.18);
    sfxCombo(Math.min(12, chain));
  }
}

function registerSmash() {
  linkChain();
  score.score += SCORE.smashBonus * chain;
  sfxCombo(Math.min(12, chain));
  juice.hitStop(0.035); juice.addShake(0.14); juice.rumble(35);
  emitImpact(0.7);
  hud.popup("SMASH ×" + chain, "smash");
}

// Take a life-costing hit (traffic crash or flaming barrel). Returns true if the
// run just ended.
// Take a crash. There are no lives any more — a crash bills HEAT, which means a
// hot player shrugs off a mistake that kills a cold one. That is the whole
// incentive structure in one line: driving aggressively is the SAFE play, and
// the run ends when you have nothing left to spend, not when a counter hits zero.
function takeHit(severity, invulnSec) {
  applyCollisionLoss(player, severity, invulnSec);
  // The chain is the real casualty of a crash — more than the heat, that is what
  // the player mourns, and what makes them drive better next time.
  if (chain >= 8) hud.popup("CHAIN LOST (" + chain + ")", "crash");
  chain = 0; chainTimer = 0;
  crashFlash = 0.5;
  player.steerVis = 0; player.steerSmooth = 0; player.vx = 0; player.slip = 0;
  player.dashT = 0;                               // a crash cancels a dash outright
  cancelDrift(player);                            // ... and throws away the slide
  player.steerLock = 0.45;                        // un-bank + brief straight recovery
  sfxCrash();
  juice.hitStop(0.09); juice.addShake(0.55); juice.rumble([50, 40, 90]);
  emitImpact(1);
  const lost = -addHeat(heat, -HEAT.crash);
  hud.popup("-" + Math.round(lost * 100) + " HEAT", "crash", true);
  return false;
}

function endRun() {
  const isNew = finalizeScore(score);
  const banked = bankRun(score.score);
  setEngineRampage(false); stopEngine();
  stopWind(); windOn = false;
  if (heliSoundOn) { stopHeliSound(); heliSoundOn = false; }
  if (skidOn) { stopSkid(); skidOn = false; }
  sfxGameOver();
  juice.rumble([90, 60, 140]);
  const run = {
    score: Math.floor(score.score), best: bestEverScore(), isNew,
    passed: traffic.passedCount, time: raceTime, topSpeed: topSpeedKmh, coins: coinsCollected,
    nitros: nitrosGrabbed, bestAir, night: nightT,
    peakHeat: heat.peak, draftT, dashes: dashCount,
    sector: sectorBest, sectorName: sectorAt(sectorBest).name,
    chainBest, dist: player.z, rank: banked.rank, rankedUp: banked.rankedUp,
    driftTime, bestDrift, slingshots,
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
  stopWind(); windOn = false;
  if (skidOn) { stopSkid(); skidOn = false; }
  if (heliSoundOn) { stopHeliSound(); heliSoundOn = false; }
  pauseMusic();
  suspendAudio();
}
function resumeGame() {
  if (state !== STATE.PAUSED) return;
  setState(STATE.RACE);
  resumeAudio(); startEngine(); startWind(); windOn = true; resumeMusic();
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

function onResize() {
  resize();
  fx.setSize(window.innerWidth, window.innerHeight);
  particles.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}
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

// ── PARTICLE EMITTERS ────────────────────────────────────────────────────────
// All of them need a point ON the road in world space plus the direction "back
// down the road", which is just the centreline heading. Kept here rather than in
// particles.js so that module stays a pure, road-agnostic pool.
const _pp = new THREE.Vector3();
const _back = { x: 0, z: 0 };
function backAt(z) {
  const th = road.headingAt(z);
  _back.x = -Math.sin(th); _back.z = -Math.cos(th);
  return _back;
}

// Rubber off the rear tyres. Rate scales with how hard the car is actually
// crossing the road, so a committed slide boils and a lazy one wisps.
function emitTyreSmoke(dt, intensity) {
  smokeAcc += dt * (16 + 40 * intensity);
  let n = Math.floor(smokeAcc);
  if (n <= 0) return;
  smokeAcc -= n;
  const back = backAt(player.z);
  while (n-- > 0) {
    const side = Math.random() < 0.5 ? -4.15 : 4.15;
    road.worldPos(player.z - 5.5, player.x + side, _pp);
    particles.tyreSmoke(_pp.x, _pp.y + (player.y || 0), _pp.z, back, 1, intensity);
  }
}

// Grinding the barrier. The fence used to shave speed off the car in total
// silence and darkness; now it throws a shower off the point of contact.
function emitWallSparks(dt, side) {
  sparkAcc += dt * 90;
  let n = Math.floor(sparkAcc);
  if (n <= 0) return;
  sparkAcc -= n;
  const back = backAt(player.z);
  road.worldPos(player.z - 1, player.x + side * 5.5, _pp);
  particles.wallSparks(_pp.x, _pp.y, _pp.z, back, side, Math.min(6, n));
}

function emitImpact(strength) {
  road.worldPos(player.z + 6, player.x, _pp);
  particles.impact(_pp.x, _pp.y + (player.y || 0) + 0.4, _pp.z, strength);
}

// A slide just ended cleanly. Banked by how HARD it was, not merely how long —
// driftSum is the integral of |slip|, so committing deeper pays more than
// holding a lazy angle for the same duration.
function onDriftBanked(t, sum, sustained) {
  if (t < DRIFT.minBankSeconds) return;
  driftTime += t;
  bestDrift = Math.max(bestDrift, t);
  addHeat(heat, DRIFT.heatPerSec * sum * chainMul());
  const gain = Math.round(DRIFT.scorePerSec * sum * chainMul());
  score.score += gain;
  linkChain();
  hud.popup((sustained ? "DRIFT KING +" : t > 1.4 ? "BIG DRIFT +" : "DRIFT +") + gain, "drift", sustained || t > 1.4);
  juice.addShake(0.1);
}

// Touchdown after a ramp jump — air time is the score, and the longer it was the
// harder the landing lands.
function onLanded(air) {
  const gain = Math.round(JUMP.airScorePerSec * air * chainMul());
  score.score += gain;
  linkChain();
  bestAir = Math.max(bestAir, air);
  sfxLand();
  juice.addShake(JUMP.landShake * (0.6 + 0.5 * Math.min(1, air)));
  juice.rumble(Math.round(30 + 60 * Math.min(1, air)));
  emitTyreSmoke(0.22, 0.8);                        // the puff off a hard touchdown
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
  const input = getInput();
  // DASH — the emergency hop. It costs heat, which is the point: the resource
  // that keeps you alive is the same one you burn to escape, so bailing out of a
  // bad line is never free and hoarding is never safe.
  const dashL = consumePress("DashL"), dashR = consumePress("DashR");
  if (dashL || dashR || consumePress("Dash")) {
    const dir = dashL ? -1 : dashR ? 1 : (input.steer || Math.sign(player.vx) || 1);
    if (heat.v > HEAT.dash && dashPlayer(player, dir)) {
      addHeat(heat, -HEAT.dash);
      dashCount++;
      juice.addShake(0.16);
      sfxLaunch();
    }
  }

  updatePlayer(player, dt, input, {
    onFenceBump: sfxBump,
    onLand: onLanded,
    onDriftEnd: onDriftBanked,
  });
  raceTime += dt;

  // ── SECTORS ── Distance-gated, so running hot moves you through the game
  // faster. Each one announces itself and rewrites the rules; the sector you
  // reached is the headline of the result screen.
  const idxNow = sectorIndexAt(player.z);
  if (idxNow !== sectorIdx) {
    sectorIdx = idxNow;
    sector = sectorAt(idxNow);
    sectorBest = Math.max(sectorBest, idxNow);
    hud.sector(sector);
    sfxAlert(); juice.addShake(0.3); juice.rumble([30, 40, 30]);
    addHeat(heat, HEAT.sectorBonus);              // a clean top-up for getting here
    if (sector.oncoming && !traffic.oncomingOn) {
      startOncoming(traffic, player.z);
      if (tipOnce("oncoming")) hud.tip(TIPS.oncoming);
    }
  }
  // Nightfall eases toward whatever the sector asks for, rather than running off
  // a wall-clock — so the world darkens because you got further, not older.
  nightT += (sector.night - nightT) * Math.min(1, dt * NIGHT.easeRate);
  const kmhNow = Math.round(player.speed / PHYS.maxSpeed * PHYS.topSpeedKmh);
  if (kmhNow > topSpeedKmh) topSpeedKmh = kmhNow;
  while (speedMsIdx < SPEED_MILESTONES.length && topSpeedKmh >= SPEED_MILESTONES[speedMsIdx]) {
    hud.popup(SPEED_MILESTONES[speedMsIdx] + " KM/H!", "milestone");
    juice.addShake(0.15);
    speedMsIdx++;
  }

  // DENSITY FOLLOWS HEAT, not a clock. The game feeds you exactly as hard as you
  // are playing: run hot and the road fills up, which is simultaneously more fuel
  // and more danger. That is what stops a hot streak from becoming a free ride,
  // and it means the difficulty curve is authored by the player, not by a timer.
  densityMul = heatDensity(heat) * sector.density;
  player.throttle01 = heatSpeed01(heat);
  // Tension/release: breathe the row spacing on a slow cycle (surge → breather →
  // surge) so the difficulty has rhythm instead of a flat grind. Gap lane stays
  // open, so every row is still threadable.
  const wave = 1 + RACE.densityWaveAmp * Math.sin(raceTime * (2 * Math.PI / RACE.densityWavePeriod));
  traffic.rowGapZ = (SPAWN_ROW_GAP / densityMul) * wave;
  traffic.densityMul = densityMul;

  // Traffic sim + scoring (pass bonus ×chain; near-miss two tiers).
  updateTraffic(traffic, dt, player.z, {
    playerX: player.x,
    playerY: player.y,
    onPassed: () => {
      score.score += SCORE.passBonus * Math.max(1, chain);

    },
    onNearMiss: (tightness = 0, car2 = null) => {
      const kmh = player.speed / PHYS.maxSpeed * PHYS.topSpeedKmh;
      // A head-on shave is the same skill at roughly double the closing speed,
      // so it pays roughly double — that multiplier IS the reason to gamble on
      // the opposing lane rather than treat it as a wall.
      const headOn = !!(car2 && car2.oncoming);
      // SLINGSHOT — the move this game was built around without ever naming it:
      // ride a car's wake, then break out and take the shave on the way past.
      // Drafting and near-missing were two adjacent systems; paying the pair as
      // one named move is what turns a habit into a technique.
      const slung = !headOn && !!car2 && car2 === draftCar
        && draftHeldFor >= SLINGSHOT.minDraft && draftSince <= SLINGSHOT.window;
      if (slung) { draftCar = null; slingshots++; }
      const precision = (1 + SCORE.precisionMax * tightness)
        * (headOn ? ONCOMING.nearMissMul : 1) * (slung ? SLINGSHOT.scoreMul : 1);
      if (headOn) { sfxHorn(); juice.addShake(0.16); }
      // EVERY SHAVE IS NOW AUDIBLE. It never was: the only sfx call sat behind a
      // >=100 km/h gate that the 0.60 speed floor (= 120 km/h) made unreachable,
      // so the best and most frequent moment in the loop happened in silence.
      // A band of noise sweeping DOWN in pitch is what a pass-by actually sounds
      // like, and that Doppler drop is most of why a near miss feels near.
      sfxWhoosh(tightness);
      // FUEL. A shave is the main way heat goes back in — tighter pays more, and
      // a head-on shave in the opposing lane is the richest source in the game.
      addHeat(heat, (HEAT.nearMiss + HEAT.nearMissTight * tightness)
        * (headOn ? HEAT.oncomingMul : 1) * (slung ? SLINGSHOT.heatMul : 1) * chainMul());
      linkChain();
      // A tight shave rewards skill: a micro-freeze that punctuates the moment,
      // and a PERFECT! callout on the closest ones.
      const perfect = tightness >= 0.7;
      if (tightness >= 0.55) { juice.hitStop(0.05); juice.addShake(0.14); }
      if (perfect || headOn || slung) juice.rumble(perfect ? 24 : 16);
      const gain = Math.round(SCORE.nearMissBonus * Math.max(1, chain) * precision);
      score.score += gain;
      juice.addShake(0.05);
      nearMissTimer = 0.8;
      const label = slung ? "SLINGSHOT! +" + gain
        : headOn ? "HEAD-ON! +" + gain
        : perfect ? "PERFECT! +" + gain
        : "+" + gain;
      hud.popup(label, slung ? "nitro" : headOn ? "headon" : perfect ? "perfect" : "nearmiss",
        perfect || headOn || slung);
      if (kmh < RACE.comboKmh) sfxNearMiss();      // the slow-speed chirp, kept
    },
  });


  // Police helicopter — flies in above copTriggerKmh and drops flaming barrels.
  if (sector.cops) updateCops(cops, dt, player.z, player.x, player.speed, { onDrop: sfxBarrelDrop });
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
  if (heat.overdrive) {
    // OVERDRIVE: plow through — invincible, and every car smashed tops the heat
    // back up. That is what makes it last: the frenzy sustains itself only while
    // you keep hitting things, so the reward for a full bar is more aggression.
    const box = playerBox(player);
    let t, guard = 0;
    while ((t = checkTrafficHit(traffic, box, player.y)) && guard++ < 8) {
      smashCar(t, player.x);
      registerSmash();
      addHeat(heat, HEAT.smash);
    }
  } else if (player.invuln <= 0) {
    const t = checkTrafficHit(traffic, playerBox(player), player.y);
    if (t) {
      smashCar(t, player.x);                       // knock the hit car aside (no clip-through)
      player.x += player.x > t.x ? 3.5 : -3.5;
      player.steerSmooth = 0;
      // A head-on arrives at roughly double the closing speed and hurts to match.
      const headOn = !!t.oncoming;
      if (headOn) juice.addShake(0.4);
      takeHit(headOn ? ONCOMING.hitSeverity : 0.5, headOn ? 1.6 : 1.4);
    }
    // Flaming barrel (skipped if a traffic hit this frame already granted invuln).
    if (player.invuln <= 0 && !player.airborne) {
      const bar = checkBarrelHit(cops, playerBox(player));
      if (bar) { bar.hit = true; takeHit(0.5, 1.2); }
    }
  }

  // Coins on the ideal weaving line — grabbed anytime (even mid-rampage / invuln),
  // but not from mid-air.
  const gotCoins = checkCoinGrab(traffic, playerBox(player), player.y);
  if (gotCoins) {
    coinsCollected += gotCoins;
    score.score += gotCoins * SCORE.coinValue;
    addHeat(heat, HEAT.coin * gotCoins);
    sfxCoin();
  }

  // NITRO canisters are HEAT pickups — a big instant slug of the only resource
  // that matters, which is why they are worth gambling the opposing lane for.
  const gotNitro = checkNitroGrab(traffic, playerBox(player), player.y);
  if (gotNitro) {
    nitrosGrabbed += gotNitro;
    addHeat(heat, HEAT.canister * gotNitro * chainMul());
    linkChain();
    score.score += gotNitro * NITRO.value;
    sfxNitro();
    juice.addShake(0.12);
    hud.popup("+HEAT", "nitro", true);
  }

  // ── HEAT ──────────────────────────────────────────────────────────────────
  // SLIPSTREAM. Tucking in behind a car pours heat in, and faster the closer you
  // dare to sit. You cannot hold it — you are far quicker than any civilian car —
  // so the move is: close on the bumper, hold your nerve, swerve out late, and
  // collect the near-miss on the way past. Two mechanics, one fluid line.
  draftSince += dt;
  const draft = draftTarget(traffic, player.x, player.z, player.y);
  if (draft) {
    draftT += dt;
    draftStreak += dt;
    draftCar = draft.car;
    // You always out-run the car in front, so a tow ends on its own — the move is
    // to hold your nerve on the bumper and swerve out as late as you dare.
    addHeat(heat, HEAT.draftRate * draft.closeness * dt);
  } else if (draftStreak > 0) {
    // A slipstream only LINKS if you actually held it — leaning on someone's
    // bumper for a moment is the risk; brushing past them is not.
    if (draftStreak > CHAIN.draftMin) linkChain();
    if (draftStreak > 1.0) hud.popup("SLIPSTREAM", "nitro");     // only the real ones
    draftHeldFor = draftStreak;
    draftSince = 0;
    draftStreak = 0;
  }
  if (player.airborne) addHeat(heat, HEAT.airRate * chainMul() * dt);

  // A slide you can HEAR — and SEE — is worth far more than one you can only
  // infer from a number: this is what tells the player they are doing the thing
  // the game rewards.
  const lateral = Math.min(1, Math.abs(player.vx) / PHYS.steerSpeed);
  const skidLevel = (player.airborne || !player.drifting) ? 0 : lateral;
  const skidding = skidLevel > 0.12;
  if (skidding && !skidOn) { startSkid(); skidOn = true; }
  else if (!skidding && skidOn) { stopSkid(); skidOn = false; }
  if (skidOn) setSkidLevel(skidLevel);
  if (skidding) emitTyreSmoke(dt, skidLevel);

  // Grinding the barrier throws sparks. It used to cost speed in silence and
  // darkness, which made the edge of the road feel like a bug rather than a wall.
  if (player.edgeContact !== 0 && !player.airborne && player.speed > PHYS.maxSpeed * 0.3) {
    emitWallSparks(dt, player.edgeContact);
  }

  // Teach each mechanic the first time it is ever relevant, once ever. The
  // tutorial card cannot carry nine systems; this can, at the moment each starts
  // to matter. One at a time, so a first run is coached rather than lectured.
  if (draftStreak > 0.9 && tipOnce("slingshot")) hud.tip(TIPS.slingshot);
  else if (draftStreak > 0.35 && tipOnce("draft")) hud.tip(TIPS.draft);
  else if (player.drifting && player.driftT > 0.3 && tipOnce("drift")) hud.tip(TIPS.drift);
  else if (heat.v < 0.18 && raceTime > 6 && tipOnce("lowHeat")) hud.tip(TIPS.lowHeat);
  else if (chain >= 5 && tipOnce("chain")) hud.tip(TIPS.chain);

  const hev = {};
  updateHeat(heat, dt, hev);
  if (hev.overdriveStart) {
    player.rampage = 1;                            // the car model reads this for its aura
    rampageMsg = "OVERDRIVE!"; rampageMsgTimer = 1.6;
    sfxRampage(); setEngineRampage(true);
    juice.slowMo(0.3, 0.45); juice.addShake(0.5); juice.rumble([60, 50, 60, 50, 120]);
    hud.popup("OVERDRIVE!", "milestone", true);
  }
  if (hev.overdriveEnd) {
    player.rampage = 0;
    rampageMsg = "CLEAR!"; rampageMsgTimer = 0.9;
    sfxShockwave(); setEngineRampage(false);
    juice.addShake(0.35);
  }
  if (hev.flameoutStart) { rampageMsg = "FLAMEOUT — GET HEAT!"; rampageMsgTimer = HEAT.flameoutSeconds; sfxAlert(); }
  if (hev.tierTo > hev.tierFrom && hev.tierTo >= 2) {
    hud.popup(TIERS[hev.tierTo].name, "milestone", hev.tierTo === 3);
    juice.addShake(0.12);
  }
  if (heat.dead) { endRun(); return; }

  // Combo decay (a lapsed chain dumps the meter), flash timers.
  if (chainTimer > 0) { chainTimer -= dt; if (chainTimer <= 0) chain = 0; }
  if (nearMissTimer > 0) nearMissTimer = Math.max(0, nearMissTimer - dt);
  if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - dt);
  if (rampageMsgTimer > 0) rampageMsgTimer = Math.max(0, rampageMsgTimer - dt);

  // Ground covered, multiplied by how hot you were covering it. The old flat
  // per-second survival bonus is gone on purpose — points for merely existing is
  // exactly what let a player idle in an empty lane and still climb the board.
  tickScore(score, player.z, heatScoreMul(heat));

  const speed01 = player.speed / PHYS.maxSpeed;
  setEngine(speed01);
  // Upshift: a thud + a small kick so a gear change is felt, not just heard.
  const gearNow = gearAt(speed01).gear;
  if (gearNow > lastGear) { sfxShift(); juice.addShake(0.07); }
  lastGear = gearNow;
  setWind(speed01);
  particles.update(dt);
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
  // Bloom rides the heat, so a hot run visibly blooms out — the lights, the
  // reflectors and the neon all bleed harder the harder you are driving.
  fx.bloom.strength = 0.3 + 0.55 * heat.v + (heat.overdrive ? 0.35 : 0);
  road.worldPos(player.z, player.x, _carPos);
  car.root.position.copy(_carPos);
  car.root.position.y += player.y || 0;            // ramp jumps lift the whole car
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
  // ...and the road now CLIMBS, so the car has to pitch with it. Over a 17-unit
  // wheelbase a 5% grade is a full unit of rise: without this the nose hangs in
  // the air uphill and ploughs into the tarmac coming down the other side.
  car.body.rotation.x = (player.airborne
    ? -Math.max(-1, Math.min(1, player.vy / JUMP.takeoffVy)) * 0.30
    : -(player.accel01 || 0) * STEER.pitch) - road.gradeAt(player.z);
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
    score: score.score, passed: traffic.passedCount, coins: coinsCollected,
    speed01, chain, chainTimer, chainMul: chainMul(), nearMissTimer, crashFlash, ...gearAt(speed01),
    sectorIdx, sectorName: sector.name,
    sectorProgress: (player.z - sectorStartZ(sectorIdx)) / Math.max(1, nextSectorZ(sectorIdx) - sectorStartZ(sectorIdx)),
    dist: player.z,
    rampageActive: heat.overdrive, rampageMsg, rampageMsgTimer,
    heat: heat.v, heatTier: heat.tier, overdrive: heat.overdrive,
    flameout: heat.flameout, drafting: state === STATE.RACE && draftStreak > 0,
    mult: heatScoreMul(heat), airborne: !!player.airborne,
    drifting: player.drifting, driftT: player.driftT,
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
