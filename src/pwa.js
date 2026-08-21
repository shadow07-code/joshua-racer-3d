// PWA: service-worker registration, the install funnel, and landscape-only
// enforcement. The funnel mirrors the original Joshua 1 Racer's, which is the
// shape that actually converts:
//
//   1. A first-load SPLASH over the live title — shown ONCE per browser (not on
//      every visit, which is nagging), never in the installed app.
//   2. A PERSISTENT, gently pulsing "ADD TO HOME SCREEN" button on the title
//      screen, so the offer is always one tap away after the splash is gone.
//   3. A manual-instructions BANNER for the cases with no native prompt (iOS
//      Safari has no install API at all; Android sometimes withholds the prompt
//      until its engagement heuristic fires). Without this the button is a dead
//      end on exactly the platforms that need help most.
//
// Reality check: browsers never allow a silent install — the OS always shows its
// own confirm. This is the strongest funnel the platforms permit.
const INSTALLED_KEY = "jr3d.installed";
const SPLASH_SEEN_KEY = "jr3d.installSplashSeen";

let stashedPrompt = null;             // captured beforeinstallprompt event
let _installedThisSession = false;
let _splash, _splashInstall, _splashBrowser;
let _banner, _bannerMsg, _bannerYes, _bannerNo;
let _installBtn, _gate;

export function initPwa() {
  registerServiceWorker();

  _splash = document.getElementById("install-splash");
  _splashInstall = document.getElementById("splash-install");
  _splashBrowser = document.getElementById("splash-browser");
  _banner = document.getElementById("install-banner");
  _bannerMsg = document.getElementById("install-msg");
  _bannerYes = document.getElementById("install-yes");
  _bannerNo = document.getElementById("install-no");
  _installBtn = document.getElementById("btn-install");
  _gate = document.getElementById("rotate-gate");

  // Capture the Android/Chromium prompt so our own buttons can fire it later.
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); stashedPrompt = e; });

  window.addEventListener("appinstalled", () => {
    _installedThisSession = true;
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
    stashedPrompt = null;
    hideBanner();
    hideSplash();
    setInstallButtonVisible(false);
    tryLockLandscape();
  });

  if (_splashInstall) _splashInstall.addEventListener("click", (e) => { e.stopPropagation(); doInstall(); });
  if (_splashBrowser) _splashBrowser.addEventListener("click", (e) => { e.stopPropagation(); dismissSplash(); });
  if (_installBtn) _installBtn.addEventListener("click", (e) => { e.stopPropagation(); doInstall(); });
  if (_bannerYes) _bannerYes.addEventListener("click", (e) => { e.stopPropagation(); hideBanner(); });
  if (_bannerNo) _bannerNo.addEventListener("click", (e) => { e.stopPropagation(); hideBanner(); });

  // Landscape-only enforcement.
  const onOrient = () => updateOrientation();
  window.addEventListener("resize", onOrient);
  window.addEventListener("orientationchange", onOrient);
  updateOrientation();

  // Attempt an orientation lock on the first gesture (works in installed /
  // fullscreen contexts; harmlessly rejected elsewhere, e.g. iOS).
  window.addEventListener("pointerdown", function lockOnce() {
    tryLockLandscape();
    window.removeEventListener("pointerdown", lockOnce);
  }, { once: true });

  // First-load splash — once per browser, and never in the installed app.
  let seen = false;
  try { seen = localStorage.getItem(SPLASH_SEEN_KEY) === "1"; } catch {}
  if (shouldOfferInstall() && !seen && _splash) _splash.classList.add("show");
  else if (!shouldOfferInstall()) tryLockLandscape();
}

// Offer the install whenever we are NOT already running as the installed app and
// the user hasn't installed during this session. Deliberately NOT gated on the
// sticky INSTALLED_KEY: that flag survives an uninstall and would hide the CTA
// forever on a device where the app isn't actually installed any more.
function shouldOfferInstall() { return !isStandalone() && !_installedThisSession; }

// Fire the native prompt if we have it; otherwise fall back to real instructions.
// Either way the splash is dismissed so the title screen is reachable.
async function doInstall() {
  if (stashedPrompt) {
    stashedPrompt.prompt();
    try { await stashedPrompt.userChoice; } catch {}
    stashedPrompt = null;
    hideBanner();
    dismissSplash();
    tryLockLandscape();
  } else {
    // No native prompt (iOS always; Android until its heuristic fires). Drop the
    // splash first so the banner underneath is actually visible.
    dismissSplash();
    showBanner(isIos());
  }
}

// ── Splash ──
function dismissSplash() {
  try { localStorage.setItem(SPLASH_SEEN_KEY, "1"); } catch {}
  hideSplash();
}
function hideSplash() { if (_splash) _splash.classList.remove("show"); }

// ── Instruction banner ──
function showBanner(ios) {
  if (!_banner) return;
  if (_bannerMsg) {
    _bannerMsg.innerHTML = ios
      ? "Tap <b>Share&nbsp;⬆</b> then <b>“Add to Home Screen”</b>"
      : "Open the browser menu <b>⋮</b> → <b>“Install app”</b> / <b>“Add to Home screen”</b>";
  }
  _banner.classList.add("show");
}
function hideBanner() { if (_banner) _banner.classList.remove("show"); }

// ── Persistent title-screen button ──
// main.js calls this on every state change; it self-suppresses once installed.
export function setInstallButtonVisible(show) {
  if (!_installBtn) return;
  _installBtn.classList.toggle("show", !!show && shouldOfferInstall());
}

// ── Service worker ──
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

// ── Landscape-only ──
function updateOrientation() {
  if (!_gate) return;
  _gate.classList.toggle("show", window.innerHeight > window.innerWidth);
}
function tryLockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
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
