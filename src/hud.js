// HUD — re-implemented as a DOM/CSS overlay (per the brief). Owns the score,
// lives, pass count, speed, combo banner, near-miss flash, crash flash, the
// RAMPAGE pip meter + banner + tint, and the game-over panel. main.js feeds it
// state each frame.
import { PHYS, GRADES, CHAIN } from "./config.js";
import { TIERS } from "./heat.js";

// Letter grade for a final score — GRADES is sorted high→low by min-score.
function gradeFor(score) {
  for (const g of GRADES) if (score >= g[0]) return g;
  return GRADES[GRADES.length - 1];
}

export function makeHud(onPlayAgain) {
  const el = (id) => document.getElementById(id);
  const scoreEl = el("score"), multEl = el("mult"), passedEl = el("passed"), speedEl = el("speed"), coinsEl = el("coins-hud");
  const heatEl = el("heat"), heatFill = el("heat-fill"), heatTier = el("heat-tier");
  const secName = el("sector-name"), secDist = el("sector-dist"), secBar = el("sector-bar");
  const banner = el("sector-banner"), bIdx = el("sector-banner-idx"),
    bName = el("sector-banner-name"), bSub = el("sector-banner-sub");
  const tachEl = el("tach"), tachFill = el("tach-fill"), gearEl = el("gear");
  const comboEl = el("combo"), comboN = el("combo-n"), comboBar = el("combo-bar");
  const nearmissEl = el("nearmiss"), crashEl = el("crash-flash");
  const driftEl = el("drift"), driftT = el("drift-t");
  const tipEl = el("tip"), tipText = el("tip-text");
  const rampMsgEl = el("rampage-msg"), rampTintEl = el("rampage-tint");
  const goPanel = el("gameover"), goScore = el("go-score"), goBest = el("go-best"),
    goNew = el("go-new"), goPassed = el("go-passed"), goTime = el("go-time"),
    goTop = el("go-top"), goBtn = el("go-again"), goCoins = el("go-coins"),
    goNitro = el("go-nitro"), goAir = el("go-air"), goChain = el("go-chain"),
    goDrift = el("go-drift"), goSlings = el("go-slings"),
    goDist = el("go-dist"), goSector = el("go-sector"), goSectorIdx = el("go-sector-idx"),
    goRankName = el("go-rank-name"), goRankNext = el("go-rank-next"), goRankBar = el("go-rank-bar"),
    goGradeLetter = el("go-grade-letter"), goGradeQual = el("go-grade-qual"),
    goPeak = el("go-peak");
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

  // The sector announcement — held long enough to read, then faded. This is the
  // beat that turns "driving until I die" into "I made it to BLACKOUT".
  let bannerTimer = null;
  function sector(s) {
    if (!banner) return;
    if (bIdx) bIdx.textContent = "SECTOR " + s.index;
    if (bName) bName.textContent = s.name;
    if (bSub) bSub.textContent = s.sub;
    banner.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove("show"), 1900);
  }
  function clearSector() { if (banner) banner.classList.remove("show"); clearTimeout(bannerTimer); }

  // A one-off coaching line, held long enough to read at speed.
  let tipTimer = null;
  function tip(text) {
    if (!tipEl) return;
    if (tipText) tipText.textContent = text;
    tipEl.classList.add("show");
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tipEl.classList.remove("show"), 3400);
  }
  function clearTip() { if (tipEl) tipEl.classList.remove("show"); clearTimeout(tipTimer); }

  const fmt = (n) => Math.floor(n).toLocaleString();

  function update(s) {
    if (scoreEl) scoreEl.textContent = fmt(s.score);
    if (multEl) multEl.textContent = "×" + (s.mult || 1).toFixed(1);
    if (passedEl) passedEl.textContent = "PASSED " + s.passed;
    if (coinsEl) coinsEl.textContent = "🪙 " + (s.coins || 0);
    if (speedEl) {
      // Overdrive pushes speed01 past 1, so the readout genuinely climbs past
      // the car's rated top speed — colour it to make that unmissable.
      speedEl.textContent = Math.round(s.speed01 * PHYS.topSpeedKmh);
      speedEl.classList.toggle("boost", !!s.overdrive);
    }
    // Tach + gear: green → gold → red as the revs climb to the redline.
    if (tachFill) {
      const rev = Math.max(0, Math.min(1, s.rev || 0));
      tachFill.style.width = (rev * 100).toFixed(1) + "%";
      tachFill.style.backgroundColor = rev > 0.88 ? "#ff5a7a" : rev > 0.70 ? "#ffd24a" : "#5ef08a";
      if (tachEl) tachEl.classList.toggle("redline", rev > 0.88);
    }
    if (gearEl) gearEl.textContent = s.gear || 1;

    // CHAIN: the count is the brag, the bar is the clock you are racing.
    if (comboEl) {
      if (s.chain >= 2) {
        comboEl.classList.add("show");
        if (comboN) comboN.textContent = "×" + s.chain;
        if (comboBar) comboBar.style.width = (Math.max(0, Math.min(1, s.chainTimer / CHAIN.window)) * 100) + "%";
      } else comboEl.classList.remove("show");
    }
    // Live drift timer — the slide is worth something, so it gets a number.
    if (driftEl) {
      const on = !!s.drifting && (s.driftT || 0) > 0.18;
      driftEl.classList.toggle("show", on);
      if (on && driftT) driftT.textContent = (s.driftT || 0).toFixed(1) + "s";
    }
    if (secName) secName.textContent = s.sectorName || "";
    if (secDist) secDist.textContent = Math.floor(s.dist || 0).toLocaleString() + " m";
    if (secBar) secBar.style.width = (Math.max(0, Math.min(1, s.sectorProgress || 0)) * 100).toFixed(1) + "%";
    if (nearmissEl) nearmissEl.style.opacity = s.nearMissTimer > 0 ? Math.min(1, s.nearMissTimer / 0.8).toFixed(2) : 0;
    if (crashEl) crashEl.style.opacity = (s.crashFlash > 0 ? Math.min(0.55, s.crashFlash) : 0).toFixed(3);

    // ── Rampage ──
    // The screen itself reports heat: a widening, warming edge wash that goes
    // white in overdrive. You should be able to feel your state peripherally.
    if (rampTintEl) {
      const h = Math.max(0, Math.min(1, s.heat || 0));
      rampTintEl.style.opacity = (0.04 + 0.20 * h * h).toFixed(3);
      rampTintEl.style.background = s.overdrive
        ? "radial-gradient(ellipse at center, rgba(255,255,255,0) 30%, rgba(255,245,215,0.85) 100%)"
        : "radial-gradient(ellipse at center, rgba(255,120,30,0) " + (58 - 24 * h).toFixed(0) +
          "%, rgba(255," + Math.round(150 - 70 * h) + ",40,0.9) 100%)";
    }
    if (rampMsgEl) {
      rampMsgEl.style.opacity = s.rampageMsgTimer > 0 ? Math.min(1, s.rampageMsgTimer / 0.5).toFixed(2) : 0;
      if (s.rampageMsgTimer > 0) rampMsgEl.textContent = s.rampageMsg;
    }
    // ── HEAT ── the one readout that matters. Colour is the tier, so the player
    // reads their state from the bar's hue without parsing a number.
    if (heatFill) {
      const h = Math.max(0, Math.min(1, s.heat || 0));
      const tier = TIERS[s.heatTier || 0];
      heatFill.style.width = (h * 100).toFixed(1) + "%";
      heatFill.style.backgroundColor = s.overdrive ? "#ffffff" : tier.color;
      heatFill.style.boxShadow = h > 0.6 ? "0 0 16px " + tier.color : "none";
      if (heatTier) heatTier.textContent = s.overdrive ? "OVERDRIVE" : tier.name;
      if (heatEl) heatEl.classList.toggle("flameout", (s.flameout || 0) > 0);
    }
  }

  function showGameOver(g) {
    const [, letter, qual, color] = gradeFor(g.score);
    if (goGradeLetter) { goGradeLetter.textContent = letter; goGradeLetter.style.color = color; }
    if (goGradeQual) { goGradeQual.textContent = qual; goGradeQual.style.color = color; }
    if (goScore) goScore.textContent = fmt(g.score);
    if (goBest) goBest.textContent = fmt(g.best);
    if (goNew) goNew.style.display = g.isNew ? "block" : "none";
    if (goPassed) goPassed.textContent = g.passed;
    if (goCoins) goCoins.textContent = g.coins || 0;
    if (goTime) goTime.textContent = Math.floor(g.time) + "S";
    if (goTop) goTop.textContent = g.topSpeed + " KM/H";
    if (goPeak) goPeak.textContent = Math.round((g.peakHeat || 0) * 100) + "%";
    if (goChain) goChain.textContent = g.chainBest || 0;
    if (goDist) goDist.textContent = Math.floor(g.dist || 0).toLocaleString() + " m";
    if (goDrift) goDrift.textContent = (g.bestDrift || 0).toFixed(1) + "S";
    if (goSlings) goSlings.textContent = g.slingshots || 0;
    // The sector is the headline — the one line of a run worth repeating.
    if (goSector) goSector.textContent = g.sectorName || "COAST RUN";
    if (goSectorIdx) goSectorIdx.textContent = "SECTOR " + (g.sector || 1);
    const r = g.rank;
    if (r) {
      if (goRankName) {
        goRankName.innerHTML = "RANK " + r.index + " · " + r.name +
          (g.rankedUp ? ' <span class="up">▲ UP</span>' : "");
      }
      if (goRankNext) goRankNext.textContent = r.atTop ? "MAX RANK" : (r.need - r.into).toLocaleString() + " → " + r.nextName;
      if (goRankBar) goRankBar.style.width = (r.progress * 100).toFixed(1) + "%";
    }
    if (goNitro) goNitro.textContent = g.nitros || 0;
    if (goAir) goAir.textContent = (g.bestAir || 0).toFixed(1) + "S";
    if (goPanel) goPanel.classList.add("show");
  }
  function hideGameOver() { if (goPanel) goPanel.classList.remove("show"); }

  return { update, showGameOver, hideGameOver, popup, clearPopups, sector, clearSector, tip, clearTip };
}
