// Joshua Racer 3D — service worker.
// Network-first for the app shell (HTML/JS/manifest) so deploys roll out live;
// cache-first for heavy static assets (vendored Three.js, music, icons). Falls
// back to cache when offline so the installed PWA still launches.
const VERSION = "jr3d-v12";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./vendor/three.module.js",
  "./assets/audio/redline_at_midnight.mp3",
  "./src/main.js",
  "./src/config.js",
  "./src/input.js",
  "./src/comfort.js",
  "./src/music.js",
  "./src/audio.js",
  "./src/pwa.js",
  "./src/scoring.js",
  "./src/hud.js",
  "./src/ui.js",
  "./src/leaderboard.js",
  "./src/juice.js",
  "./src/entities/player.js",
  "./src/entities/traffic.js",
  "./src/entities/cops.js",
  "./src/render3d/vehicles.js",
  "./src/render3d/cops3d.js",
  "./src/render3d/scene.js",
  "./src/render3d/road.js",
  "./src/render3d/models.js",
  "./src/render3d/camera.js",
  "./src/render3d/scenery.js",
  "./src/render3d/environment.js",
  "./src/render3d/zones.js",
  "./src/render3d/effects.js",
  "./src/render3d/postfx.js",
  "./vendor/jsm/postprocessing/EffectComposer.js",
  "./vendor/jsm/postprocessing/Pass.js",
  "./vendor/jsm/postprocessing/RenderPass.js",
  "./vendor/jsm/postprocessing/ShaderPass.js",
  "./vendor/jsm/postprocessing/MaskPass.js",
  "./vendor/jsm/postprocessing/UnrealBloomPass.js",
  "./vendor/jsm/postprocessing/OutputPass.js",
  "./vendor/jsm/geometries/RoundedBoxGeometry.js",
  "./vendor/jsm/shaders/CopyShader.js",
  "./vendor/jsm/shaders/LuminosityHighPassShader.js",
  "./vendor/jsm/shaders/OutputShader.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(ASSETS.map((url) =>
        fetch(new Request(url, { cache: "reload" }))
          .then((res) => { if (res && res.ok) return cache.put(url, res); })
          .catch(() => {})
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never cache the dynamic leaderboard API — always go to the network.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  // App shell — network-first so a fresh deploy is picked up immediately.
  const isShell = sameOrigin && (
    req.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".webmanifest")
  );

  if (isShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Static assets (icons, music, fonts) — cache-first for speed/offline.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && sameOrigin) {
          const clone = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
