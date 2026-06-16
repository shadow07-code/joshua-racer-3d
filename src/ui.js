// DOM wiring for the menu overlays layered over the canvas: the title screen,
// the pre-race name-entry panel, the global leaderboard panel, the first-run
// tutorial card, and the paused overlay. main.js owns game state; this module
// just shows/hides overlays and reports user intent back through callbacks.

import { sanitizeName, getPlayerName } from "./leaderboard.js";

let el = {};            // cached elements
let cb = {};            // callbacks supplied by main.js

export function initUI(callbacks) {
  cb = callbacks || {};
  el = {
    title: document.getElementById("title-screen"),
    titleBest: document.getElementById("title-best"),
    titlePlay: document.getElementById("title-play"),
    titleBoard: document.getElementById("title-board"),

    namePanel: document.getElementById("name-entry"),
    nameInput: document.getElementById("name-input"),
    nameStart: document.getElementById("name-start"),
    nameBack: document.getElementById("name-back"),

    lbPanel: document.getElementById("leaderboard"),
    lbList: document.getElementById("lb-list"),
    lbStatus: document.getElementById("lb-status"),
    lbBack: document.getElementById("lb-back"),

    tutPanel: document.getElementById("tutorial"),
    tutSkip: document.getElementById("tut-skip"),
    tutPlay: document.getElementById("tut-play"),

    pausedPanel: document.getElementById("paused"),
    pausedResume: document.getElementById("paused-resume"),
    pausedExit: document.getElementById("paused-exit"),

    goBoard: document.getElementById("go-board"),
    goExit: document.getElementById("go-exit"),
  };

  const on = (node, fn) => { if (node) node.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); };

  // Title screen.
  on(el.titlePlay, () => cb.onPlay && cb.onPlay());
  on(el.titleBoard, () => cb.onOpenLeaderboard && cb.onOpenLeaderboard());

  // Name entry.
  const confirmName = () => {
    const clean = sanitizeName(el.nameInput ? el.nameInput.value : "") || "AAA";
    cb.onNameConfirm && cb.onNameConfirm(clean);
  };
  on(el.nameStart, confirmName);
  on(el.nameBack, () => cb.onNameBack && cb.onNameBack());
  if (el.nameInput) {
    el.nameInput.addEventListener("keydown", (e) => {
      e.stopPropagation();   // keep typing out of the game's global key handlers
      if (e.key === "Enter") { e.preventDefault(); confirmName(); }
      else if (e.key === "Escape") { e.preventDefault(); cb.onNameBack && cb.onNameBack(); }
    });
    el.nameInput.addEventListener("keyup", (e) => e.stopPropagation());
  }

  // Leaderboard panel.
  on(el.lbBack, () => cb.onLeaderboardBack && cb.onLeaderboardBack());

  // Tutorial card.
  on(el.tutSkip, () => cb.onTutorialDone && cb.onTutorialDone());
  on(el.tutPlay, () => cb.onTutorialDone && cb.onTutorialDone());

  // Paused overlay.
  on(el.pausedResume, () => cb.onResume && cb.onResume());
  on(el.pausedExit, () => cb.onPauseExit && cb.onPauseExit());

  // Game-over action bar.
  on(el.goBoard, () => cb.onGameOverLeaderboard && cb.onGameOverLeaderboard());
  on(el.goExit, () => cb.onExit && cb.onExit());
}

function toggle(node, show) { if (node) node.classList.toggle("show", !!show); }

export function showTitle(show) { toggle(el.title, show); }
export function setTitleBest(text) { if (el.titleBest) el.titleBest.textContent = text || ""; }

export function showNameEntry(show) {
  toggle(el.namePanel, show);
  if (show && el.nameInput) {
    el.nameInput.value = getPlayerName();
    // Focus + select so the remembered name can be confirmed or typed over.
    setTimeout(() => { try { el.nameInput.focus(); el.nameInput.select(); } catch {} }, 30);
  }
}

export function showLeaderboardPanel(show) { toggle(el.lbPanel, show); }
export function showTutorial(show) { toggle(el.tutPanel, show); }
export function showPaused(show) { toggle(el.pausedPanel, show); }

// Render the board. data = { entries, offline, unconfigured }. Highlights the
// row matching `playerName`.
export function renderLeaderboard(data, playerName) {
  if (!el.lbList) return;
  const entries = (data && data.entries) || [];
  const mine = sanitizeName(playerName || "");
  el.lbList.innerHTML = "";

  if (el.lbStatus) {
    if (data && data.unconfigured) el.lbStatus.textContent = "LEADERBOARD UNAVAILABLE";
    else if (data && data.offline) el.lbStatus.textContent = "OFFLINE — SHOWING CACHED";
    else if (!entries.length) el.lbStatus.textContent = "NO SCORES YET — BE THE FIRST!";
    else el.lbStatus.textContent = "";
    el.lbStatus.classList.toggle("show", !!el.lbStatus.textContent);
  }

  let highlighted = false;
  for (const en of entries) {
    const row = document.createElement("div");
    row.className = "lb-row";
    if (!highlighted && mine && en.name === mine) { row.classList.add("me"); highlighted = true; }

    const rank = document.createElement("span");
    rank.className = "lb-rank";
    rank.textContent = String(en.rank).padStart(2, "0");

    const name = document.createElement("span");
    name.className = "lb-name";
    name.textContent = en.name;

    const score = document.createElement("span");
    score.className = "lb-score";
    score.textContent = String(en.score).padStart(6, "0");

    row.appendChild(rank);
    row.appendChild(name);
    row.appendChild(score);
    el.lbList.appendChild(row);
  }
}
