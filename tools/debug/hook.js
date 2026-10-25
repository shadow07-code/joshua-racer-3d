// DEBUG BUILD hook — injected into _debug.html by mkdebug.py (never deployed).
// Sound OFF, rAF stubbed (frames step only when asked), no auto-pause, and
// helpers to steer, film and measure. Frames are POSTed to shotserver.py
// (localhost:8098) because the browser pane is often hidden and screenshots go stale.
try { localStorage.setItem("jr3d.sfx", "0"); localStorage.setItem("jr3d.tutorialSeen", "1"); } catch (e) {}
(function () {
  var cb = null, T = 0;
  window.requestAnimationFrame = function (f) { cb = f; return 1; };
  window.__step = function (n) { for (var i = 0; i < n; i++) { T += 1000 / 60; var f = cb; cb = null; if (f) f(T); } };
  window.addEventListener("blur", function (e) { e.stopImmediatePropagation(); }, true);
  window.addEventListener("pagehide", function (e) { e.stopImmediatePropagation(); }, true);
  document.addEventListener("visibilitychange", function (e) { e.stopImmediatePropagation(); }, true);
  var key = function (type, k) { window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true })); };
  var cur = 0;
  window.__steer = function (s) {
    if (s === cur) return;
    if (cur < 0) key("keyup", "ArrowLeft"); if (cur > 0) key("keyup", "ArrowRight");
    if (s < 0) key("keydown", "ArrowLeft"); if (s > 0) key("keydown", "ArrowRight");
    cur = s;
  };
})();
window.__post = function (name, dataUrl) {
  return fetch("http://127.0.0.1:8098/?name=" + encodeURIComponent(name), { method: "POST", body: dataUrl }).then(function (r) { return r.text(); });
};
// One frame (WebGL + speed-streak canvas) to shots/<name>.jpg.
window.__shot = function (name) {
  var gl = document.getElementById("game3d"), ln = document.getElementById("speed-lines");
  var c = document.createElement("canvas"); c.width = gl.width; c.height = gl.height; var g = c.getContext("2d");
  g.drawImage(gl, 0, 0); g.drawImage(ln, 0, 0, c.width, c.height);
  return window.__post(name, c.toDataURL("image/jpeg", 0.88));
};
// Start a race and settle it at `heat` on an empty road.
window.__boot = async function (heat) {
  for (var w = 0; w < 40 && !window.__jr3d; w++) await new Promise(function (r) { setTimeout(r, 100); });
  var sp = document.getElementById("splash-browser"); if (sp) sp.click(); __step(3);
  document.getElementById("title-play").click(); __step(2);
  document.getElementById("name-input").value = "TEST";
  document.getElementById("name-start").click(); __step(5);
  var J = window.__jr3d;
  window.__settle = function (h, frames) { frames = frames || 240; for (var i = 0; i < frames; i++) { J.setHeat(h); J.clearTraffic(); __step(1); } J.player.x = 0; J.player.vx = 0; __step(30); };
  __settle(heat == null ? 0.9 : heat, 420);
  return JSON.stringify({ state: J.state, sfx: document.getElementById("btn-sfx").textContent, speed: J.player.speed.toFixed(0) });
};
window.__lab = function () { var J = window.__jr3d, p = J.player, q = J.pose; return "x" + p.x.toFixed(0) + " vx" + p.vx.toFixed(0) + " yaw" + (q.yaw * 57.3).toFixed(0) + " fov" + J.camera.fov.toFixed(0); };
// Filmstrip: step `total` frames, grab the frames listed in `want`, tile at 450x210,
// label, save as shots/<o.save || title>.jpg.
// o: heat, clear (default true), steer(i), pre(i), label(i), cols (default 2).
window.__film = function (want, total, title, o) {
  o = o || {}; var J = window.__jr3d, gl = document.getElementById("game3d"), ln = document.getElementById("speed-lines");
  var W = 450, H = 210, cols = o.cols || 2, rows = Math.ceil(want.length / cols);
  var sh = document.createElement("canvas"); sh.width = W * cols; sh.height = H * rows; var g = sh.getContext("2d"), k = 0;
  for (var i = 0; i <= total; i++) {
    if (o.heat != null) J.setHeat(o.heat); if (o.clear !== false) J.clearTraffic(); if (o.pre) o.pre(i);
    __steer(o.steer ? o.steer(i) : 0); __step(1);
    if (want.indexOf(i) >= 0) {
      var x = (k % cols) * W, y = Math.floor(k / cols) * H;
      g.drawImage(gl, 0, 0, gl.width, gl.height, x, y, W, H); g.drawImage(ln, 0, 0, ln.width, ln.height, x, y, W, H);
      var t = title + " +" + Math.round(i / 60 * 1000) + "ms " + (o.label ? o.label(i) : __lab());
      g.fillStyle = "rgba(0,0,0,.7)"; g.fillRect(x, y, t.length * 7.6 + 10, 18); g.fillStyle = "#ff0"; g.font = "bold 13px monospace"; g.fillText(t, x + 4, y + 13);
      g.strokeStyle = "#000"; g.lineWidth = 2; g.strokeRect(x, y, W, H); k++;
    }
  }
  __steer(0);
  return window.__post(o.save || title, sh.toDataURL("image/jpeg", 0.9));
};
// Camera framing from the car's real size (~10 wide, 3.6 tall, 18 long) and traffic
// one lane over 60/125/250 ahead: [screen y %, car height px].
window.__frame = function () {
  var J = window.__jr3d, T = J.THREE, cam = J.camera, p = J.player, w = new T.Vector3();
  cam.updateMatrixWorld();
  var P = function (dz, x, y) { J.road.worldPos(p.z + dz, p.x + x, w); w.y += y; w.project(cam); return [(w.x + 1) / 2, (1 - w.y) / 2]; };
  var H = window.innerHeight, rl = P(-9, -5, 0), rr = P(-9, 5, 0), roof = P(0, 0, 3.6), mid = P(0, 0, 0);
  var row = function (d) { J.road.worldPos(p.z + d, 22.4, w); w.project(cam); var y0 = (1 - w.y) / 2; J.road.worldPos(p.z + d, 22.4, w); w.y += 5; w.project(cam); return [+(y0 * 100).toFixed(1), Math.round((y0 - (1 - w.y) / 2) * H)]; };
  return { fov: +cam.fov.toFixed(1), carW: +((rr[0] - rl[0]) * 100).toFixed(1), carX: +(mid[0] * 100).toFixed(1), carBot: +(rl[1] * 100).toFixed(1), carRoof: +(roof[1] * 100).toFixed(1), r60: row(60), r125: row(125), r250: row(250) };
};
// Veil: % of the band between 30% and 75% of screen height that is washed near-white
// (min channel >= 215) — bloom haze over the road and horizon.
window.__veil = function () {
  var gl = document.getElementById("game3d"), c = window.__veilC || (window.__veilC = document.createElement("canvas"));
  c.width = gl.width; c.height = gl.height; var g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(gl, 0, 0);
  var d = g.getImageData(0, 0, c.width, c.height).data, n = 0, tot = 0, y0 = Math.floor(c.height * 0.30), y1 = Math.floor(c.height * 0.75);
  for (var y = y0; y < y1; y++) for (var x = 0; x < c.width; x += 2) { var i = (y * c.width + x) * 4; tot++; if (Math.min(d[i], d[i + 1], d[i + 2]) >= 215) n++; }
  return n / tot * 100;
};
// Drive centred on an empty road at `heat`, sampling the veil every `every` frames.
window.__veilDrive = function (heat, n, every) {
  var J = window.__jr3d, v = [];
  for (var s = 0; s < n; s++) { for (var i = 0; i < every; i++) { J.setHeat(heat); J.clearTraffic(); J.player.x = 0; J.player.vx = 0; __step(1); } v.push(+window.__veil().toFixed(1)); }
  return v;
};
