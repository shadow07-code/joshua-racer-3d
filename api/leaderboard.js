// Global leaderboard API — Vercel serverless function (Node, zero deps).
//
// GET  /api/leaderboard           → { entries: [{ rank, name, score, time, passed, topSpeed }] }
// POST /api/leaderboard  {body}   → submit a run, returns the refreshed top 20
//
// Storage: Upstash Redis via its REST API. A sorted set holds the best score per
// name (ZADD ... GT), and a parallel hash holds per-name run metadata (time /
// cars passed / top speed) for display. No npm dependencies — uses global fetch
// (Node 18+/20 on Vercel).
//
// Env vars (injected by Vercel when an Upstash/KV store is connected):
//   UPSTASH_REDIS_REST_URL  / UPSTASH_REDIS_REST_TOKEN     (Upstash integration)
//   KV_REST_API_URL         / KV_REST_API_TOKEN            (Vercel KV alias)

const LB_KEY = "jr3d:lb:v1";
const META_KEY = "jr3d:lb:meta:v1";
const TOP_N = 20;

// Validation bounds — lenient; only blocks absurd/forged values, not tight policing.
const SCORE_CAP = 1_000_000_000;        // hard ceiling
const PLAUSIBLE_PER_SEC = 100_000;       // very generous per-second rate
const PLAUSIBLE_MARGIN = 100_000;        // flat allowance for short runs
const NAME_MAX = 12;

const RL_MAX = 30;                        // max writes per IP per window
const RL_WINDOW_SEC = 60;

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

// Run a single Redis command, e.g. redis(cfg, ["ZADD", key, "GT", "10", "BOB"]).
async function redis(cfg, command) {
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const j = await r.json();
  return j.result;
}

// Run several commands in one round-trip via the pipeline endpoint.
async function pipeline(cfg, commands) {
  const r = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis pipeline ${r.status}`);
  const j = await r.json();
  return j.map((x) => x.result);
}

function sanitizeName(raw) {
  let s = String(raw == null ? "" : raw).toUpperCase();
  s = s.replace(/[^A-Z0-9 ]/g, "");      // keep only letters, digits, spaces
  s = s.replace(/\s+/g, " ").trim();      // collapse + trim whitespace
  s = s.slice(0, NAME_MAX).trim();
  return s || "AAA";
}

function toInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Build the ranked entries array from a WITHSCORES flat list + a meta map.
function buildEntries(flat, metaList) {
  const entries = [];
  for (let i = 0; i < flat.length; i += 2) {
    const name = flat[i];
    const score = toInt(flat[i + 1]);
    let meta = {};
    const rawMeta = metaList ? metaList[i / 2] : null;
    if (rawMeta) { try { meta = JSON.parse(rawMeta) || {}; } catch {} }
    entries.push({
      rank: entries.length + 1,
      name,
      score,
      time: toInt(meta.time),
      passed: toInt(meta.passed),
      topSpeed: toInt(meta.topSpeed),
    });
  }
  return entries;
}

async function readTop(cfg) {
  const flat = await redis(cfg, ["ZREVRANGE", LB_KEY, "0", String(TOP_N - 1), "WITHSCORES"]);
  const names = [];
  for (let i = 0; i < flat.length; i += 2) names.push(flat[i]);
  let metaList = null;
  if (names.length) metaList = await redis(cfg, ["HMGET", META_KEY, ...names]);
  return buildEntries(flat, metaList);
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = async function handler(req, res) {
  const cfg = getRedisConfig();
  if (!cfg) {
    res.status(503).json({ error: "leaderboard not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const entries = await readTop(cfg);
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
      res.status(200).json({ entries });
      return;
    }

    if (req.method === "POST") {
      // Body may arrive parsed (Vercel) or as a raw string.
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};

      const name = sanitizeName(body.name);
      const score = toInt(body.score);
      const time = toInt(body.time);
      const passed = toInt(body.passed);
      const topSpeed = toInt(body.topSpeed);

      // Plausibility checks — block forged / absurd scores.
      if (score > SCORE_CAP || score > time * PLAUSIBLE_PER_SEC + PLAUSIBLE_MARGIN) {
        res.status(400).json({ error: "implausible score" });
        return;
      }

      // Light per-IP rate limit.
      const rlKey = `jr3d:rl:${clientIp(req)}`;
      const count = await redis(cfg, ["INCR", rlKey]);
      if (count === 1) await redis(cfg, ["EXPIRE", rlKey, String(RL_WINDOW_SEC)]);
      if (count > RL_MAX) {
        res.status(429).json({ error: "rate limited" });
        return;
      }

      const meta = JSON.stringify({ time, passed, topSpeed, ts: Date.now() });
      await pipeline(cfg, [
        ["ZADD", LB_KEY, "GT", String(score), name],
        ["HSET", META_KEY, name, meta],
      ]);

      const entries = await readTop(cfg);
      res.status(200).json({ ok: true, entries });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    res.status(502).json({ error: "leaderboard upstream error" });
  }
}
