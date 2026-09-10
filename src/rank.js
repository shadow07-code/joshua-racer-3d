// RANK — the reason to start a second run.
//
// A single-session score is a toy; a number that survives the session is a game.
// Every run banks its score as lifetime XP, and XP buys rank. Nothing about rank
// touches the simulation — it is deliberately NOT a power-up, because an arcade
// racer's leaderboard has to compare like with like. It is a record of how much
// road you have covered, and a title you can say out loud.
//
// Pure logic + localStorage; no DOM, no Three.js.

const XP_KEY = "jr3d.xp";
const RUNS_KEY = "jr3d.runs";

// Thresholds are cumulative lifetime score. A strong run is roughly 30–40k, so
// the first few ranks arrive inside the first handful of runs and the top of the
// ladder is a genuinely long haul.
const RANKS = [
  [0,       "ROOKIE"],
  [15000,   "LEARNER"],
  [45000,   "DRIVER"],
  [100000,  "QUICK"],
  [200000,  "RACER"],
  [350000,  "ACE"],
  [550000,  "VETERAN"],
  [800000,  "OUTLAW"],
  [1150000, "PHANTOM"],
  [1600000, "LEGEND"],
  [2200000, "IMMORTAL"],
  [3000000, "JOSHUA"],
];

export const MAX_RANK = RANKS.length;

function readInt(key) {
  try { return parseInt(localStorage.getItem(key), 10) || 0; } catch { return 0; }
}
function writeInt(key, v) {
  try { localStorage.setItem(key, String(Math.floor(v))); } catch {}
}

export function lifetimeXp() { return readInt(XP_KEY); }
export function totalRuns() { return readInt(RUNS_KEY); }

// Rank for an XP total: 1-based index, its name, and progress toward the next.
export function rankAt(xp) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k][0]) i = k;
  const atTop = i >= RANKS.length - 1;
  const base = RANKS[i][0];
  const next = atTop ? base : RANKS[i + 1][0];
  return {
    index: i + 1,
    name: RANKS[i][1],
    atTop,
    into: xp - base,
    need: atTop ? 0 : next - base,
    progress: atTop ? 1 : Math.max(0, Math.min(1, (xp - base) / (next - base))),
    nextName: atTop ? null : RANKS[i + 1][1],
  };
}

export function currentRank() { return rankAt(lifetimeXp()); }

// Bank a finished run. Returns what changed, so the result screen can celebrate
// a rank-up rather than silently ticking a bar.
export function bankRun(score) {
  const before = lifetimeXp();
  const after = before + Math.max(0, Math.floor(score));
  writeInt(XP_KEY, after);
  writeInt(RUNS_KEY, totalRuns() + 1);
  const r0 = rankAt(before), r1 = rankAt(after);
  return { xp: after, rank: r1, rankedUp: r1.index > r0.index, from: r0 };
}
