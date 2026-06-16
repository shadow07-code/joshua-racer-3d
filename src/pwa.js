// PWA: service-worker registration, a heavy install funnel, and landscape-only
// enforcement.
//
// Reality check on "automatic" install: browsers do NOT allow silent installs.
// On Android/Chromium, tapping "Install" fires the OS's own install dialog (one
// confirm). On iOS Safari there is NO install API at all — we can only show the
// "Share → Add to Home Screen" steps. So this is the strongest funnel the
// platforms permit. "No" lets you keep playing in the browser (still landscape).
const INSTALLED_KEY = "jr3d.installed";

let stashedPrompt = null;
let modal, titleEl, msgEl, yesBtn, noBtn, gate;

export function initPwa() {
  registerServiceWorker();

  modal = document.getElementById("install-modal");
  titleEl = document.getElementById("install-title");
  msgEl = document.getElementById("install-msg");
  yesBtn = document.getElementById("install-yes");
  noBtn = document.getElementById("install-no");
  gate = document.getElementById("rotate-gate");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    stashedPrompt = e;
    // If the modal is already up with a fallback message, upgrade the CTA.
    if (modal && modal.classList.contains("show") && !isIos()) yesBtn.textContent = "INSTALL";
  });
  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
    stashedPrompt = null;
    hideModal();
    tryLockLandscape();
  });

  if (yesBtn) yesBtn.addEventListener("click", onYes);
  if (noBtn) noBtn.addEventListener("click", hideModal);

  // Landscape-only enforcement.
  const onOrient = () => updateOrientation();
  window.addEventListener("resize", onOrient);
  window.addEventListener("orientationchange", onOrient);
  updateOrientation();

  // Attempt an orientation lock on the first gesture (works in installed/
  // fullscreen contexts; harmlessly rejected elsewhere, e.g. iOS).
  const lockOnce = () => { tryLockLandscape(); window.removeEventListener("pointerdown", lockOnce); };
  window.addEventListener("pointerdown", lockOnce, { once: true });

  // Heavy install prompt on load (unless already installed).
  if (!isInstalled()) showInstallModal();
  else tryLockLandscape();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);
    }).catch(() => {});
  });
}

// ── Install modal ──
function showInstallModal() {
  if (!modal) return;
  if (isIos()) {
    titleEl.textContent = "INSTALL THE GAME";
    msgEl.innerHTML = "Best played installed in fullscreen landscape.<br>Tap <b>Share ⬆</b> then <b>“Add to Home Screen”</b>.";
    yesBtn.textContent = "GOT IT";
    noBtn.textContent = "Play in browser";
  } else {
    titleEl.textContent = "INSTALL THE GAME";
    msgEl.innerHTML = "Install Joshua Racer 3D for fullscreen, landscape play — like a real app.";
    yesBtn.textContent = stashedPrompt ? "INSTALL" : "INSTALL";
    noBtn.textContent = "Play in browser";
  }
  modal.classList.add("show");
}

function hideModal() { if (modal) modal.classList.remove("show"); }

async function onYes() {
  if (stashedPrompt) {
    stashedPrompt.prompt();
    try { await stashedPrompt.userChoice; } catch {}
    stashedPrompt = null;
    hideModal();
    tryLockLandscape();
  } else {
    // iOS / no native prompt — the on-screen instructions are the action.
    hideModal();
  }
}

// ── Landscape-only ──
function updateOrientation() {
  if (!gate) return;
  const portrait = window.innerHeight > window.innerWidth;
  gate.classList.toggle("show", portrait);
}

function tryLockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  } catch {}
}

// ── Platform helpers ──
function isIos() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         window.matchMedia("(display-mode: fullscreen)").matches ||
         window.navigator.standalone === true;
}
function isInstalled() {
  try { return isStandalone() || localStorage.getItem(INSTALLED_KEY) === "1"; }
  catch { return isStandalone(); }
}
