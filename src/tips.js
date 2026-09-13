// CONTEXTUAL TIPS — teach the game while it is being played, once each, forever.
//
// The tutorial card now has to explain heat, the slipstream, shaves, drifting,
// NOS, dash, chains, sectors and overdrive. Nobody reads that, and a wall of
// text on the title screen is the worst possible place to learn a feel. So the
// card keeps only the one-line premise and everything else is taught at the
// moment it first becomes relevant: the first time you tuck in behind a car, the
// first time the bar runs low, the first time you have enough to burn.
//
// Each tip fires ONCE EVER (persisted), so a returning player never sees them
// again. Pure logic + localStorage, no DOM.

const KEY = "jr3d.tips";

function seen() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); }
}
function remember(id) {
  try {
    const s = seen();
    s.add(id);
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {}
}

// True the first time this id is ever asked for; false forever after.
export function tipOnce(id) {
  const s = seen();
  if (s.has(id)) return false;
  remember(id);
  return true;
}

// Wipe the record — used when the player replays the tutorial.
export function resetTips() {
  try { localStorage.removeItem(KEY); } catch {}
}

export const TIPS = {
  brake:    "BRAKE — hold it to match a car's pace and sit in its tow",
  draft:    "TAILGATE — hold the slipstream, then break out late",
  slingshot:"SLINGSHOT — shave the car you were towing off for double",
  lowHeat:  "BURNING OUT — take a risk or the run ends",
  nos:      "HOLD NOS — burn heat for speed",
  drift:    "SLIDE — commit to the cut and the drift scores",
  chain:    "CHAIN — keep taking risks, a crash resets it",
  oncoming: "LEFT LANE IS TWO-WAY — head-on shaves pay double",
};
