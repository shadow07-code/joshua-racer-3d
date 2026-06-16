// HUD — re-implemented as a DOM/CSS overlay (per the brief). Owns the score,
// lives, pass count, speed, combo banner, near-miss flash, crash flash, the
// RAMPAGE pip meter + banner + tint, and the game-over panel. main.js feeds it
// state each frame.
import { PHYS, RACE } from "./config.js";

export function makeHud(onPlayAgain) {
  const el = (id) => document.getElementById(id);
  const scoreEl = el("score"), livesEl = el("lives"), passedEl = el("passed"), speedEl = el("speed");
  const comboEl = el("combo"), comboN = el("combo-n"), comboBar = el("combo-bar");
  const nearmissEl = el("nearmiss"), crashEl = el("crash-flash");
  const rampMsgEl = el("rampage-msg"), rampTintEl = el("rampage-tint"), pipsEl = el("pips");
  const goPanel = el("gameover"), goScore = el("go-score"), goBest = el("go-best"),
    goNew = el("go-new"), goPassed = el("go-passed"), goTime = el("go-time"),
    goTop = el("go-top"), goBtn = el("go-again");
  const popupsEl = el("popups");
  if (goBtn && onPlayAgain) goBtn.addEventListener("click", onPlayAgain);

  // Floating score / milestone popup that rises + fades (juice). kind ∈
  // nearmiss | combo | smash | milestone; `big` bumps the size for key moments.
  function popup(text, kind = "milestone", big = false) {
    if (!popupsEl) return;
    const d = document.createElement("div");
    d.className = "popup " + kind + (big ? " big" : "");
    d.textContent = text;
    d.style.left = (42 + Math.random() * 16) + "%";
    popupsEl.appendChild(d);
    setTimeout(() => { d.remove(); }, 1000);
  }
  function clearPopups() { if (popupsEl) popupsEl.innerHTML = ""; }

  // Build the rampage pips (gold = banked near-misses; blue = pass-cooldown refill).
  const pipEls = [];
  if (pipsEl) for (let i = 0; i < RACE.rampageNearMisses; i++) {
    const d = document.createElement("div"); d.className = "pip"; pipsEl.appendChild(d); pipEls.push(d);
  }

  const fmt = (n) => Math.floor(n).toLocaleString();

  function update(s) {
    if (scoreEl) scoreEl.textContent = fmt(s.score);
    if (livesEl) livesEl.textContent = "♥".repeat(Math.max(0, s.lives));
    if (passedEl) passedEl.textContent = "PASSED " + s.passed;
    if (speedEl) speedEl.textContent = Math.round(s.speed01 * PHYS.topSpeedKmh);

    if (comboEl) {
      if (s.combo >= 2) {
        comboEl.classList.add("show");
        if (comboN) comboN.textContent = "×" + s.combo;
        if (comboBar) comboBar.style.width = (Math.max(0, Math.min(1, s.comboTimer / RACE.comboWindow)) * 100) + "%";
      } else comboEl.classList.remove("show");
    }
    if (nearmissEl) nearmissEl.style.opacity = s.nearMissTimer > 0 ? Math.min(1, s.nearMissTimer / 0.8).toFixed(2) : 0;
    if (crashEl) crashEl.style.opacity = (s.crashFlash > 0 ? Math.min(0.55, s.crashFlash) : 0).toFixed(3);

    // ── Rampage ──
    if (rampTintEl) rampTintEl.style.opacity = s.rampageActive ? 0.18 : 0;
    if (rampMsgEl) {
      rampMsgEl.style.opacity = s.rampageMsgTimer > 0 ? Math.min(1, s.rampageMsgTimer / 0.5).toFixed(2) : 0;
      if (s.rampageMsgTimer > 0) rampMsgEl.textContent = s.rampageMsg;
    }
    if (pipsEl) {
      let show = false;
      if (s.rampageActive) {
        show = false;
      } else if (s.rampageMeter > 0) {
        show = true;
        for (let i = 0; i < pipEls.length; i++)
          pipEls[i].className = "pip" + (i < s.rampageMeter ? " gold" : "") + (s.rampageMeter === RACE.rampageNearMisses - 1 ? " flash" : "");
      } else if (s.rampageCooldown > 0) {
        show = true;
        const filled = RACE.rampageCooldownPasses - s.rampageCooldown;   // refills as cars pass
        for (let i = 0; i < pipEls.length; i++) pipEls[i].className = "pip" + (i < filled ? " blue" : "");
      }
      pipsEl.classList.toggle("show", show);
    }
  }

  function showGameOver(g) {
    if (goScore) goScore.textContent = fmt(g.score);
    if (goBest) goBest.textContent = fmt(g.best);
    if (goNew) goNew.style.display = g.isNew ? "block" : "none";
    if (goPassed) goPassed.textContent = g.passed;
    if (goTime) goTime.textContent = Math.floor(g.time) + "S";
    if (goTop) goTop.textContent = g.topSpeed + " KM/H";
    if (goPanel) goPanel.classList.add("show");
  }
  function hideGameOver() { if (goPanel) goPanel.classList.remove("show"); }

  return { update, showGameOver, hideGameOver, popup, clearPopups };
}
