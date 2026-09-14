// SECTORS — the shape of a run.
//
// An endless racer with no structure is a toy: you drive until you die and the
// only thing you can say afterwards is a number. Sectors give the run an arc and
// a vocabulary. Each one is announced, changes the rules, and is the headline
// stat on the result screen — "I got to RED LINE" is a thing you can say to
// someone; "I scored 41,880" is not.
//
// Gated on DISTANCE rather than time, deliberately. Distance is what a racing
// game measures, and because speed is heat (src/heat.js), driving hot literally
// advances you through the game faster. The player who takes risks sees more of
// it, which is the same incentive the whole design runs on.
//
// Pure data + lookup: no DOM, no Three.js.

// night/oncoming/cops/density are the rules each sector turns on.
//   night     target nightfall level (the grade eases toward it)
//   oncoming  is the opposing carriageway live
//   cops      is the police helicopter allowed to sortie
//   density   multiplier applied ON TOP of the heat-driven density
// DENSITY IS A GARNISH HERE, NOT THE ESCALATION. It multiplies on top of the
// heat-driven figure, so the two compound — and a sector table that ran to 1.70
// meant the late game was tightening the road at the exact moment the player was
// hottest and therefore already had it tightened. What actually escalates a
// sector is its RULES: the lights go out, the left lane turns two-way, the
// helicopter shows up. Those make it harder without making it undriveable.
const SECTORS = [
  { z: 0,     name: "COAST RUN",  sub: "warm up",              night: 0.00, oncoming: false, cops: false, density: 1.00 },
  { z: 1200,  name: "RUSH HOUR",  sub: "the road fills up",    night: 0.10, oncoming: false, cops: false, density: 1.05 },
  { z: 3000,  name: "NIGHTFALL",  sub: "lights on",            night: 0.55, oncoming: false, cops: false, density: 1.09 },
  { z: 5200,  name: "WRONG WAY",  sub: "left lane goes two-way", night: 0.75, oncoming: true, cops: false, density: 1.12 },
  { z: 7800,  name: "AIR PATROL", sub: "you have been noticed", night: 0.90, oncoming: true, cops: true,  density: 1.16 },
  { z: 10800, name: "GRIDLOCK",   sub: "no room left",         night: 1.00, oncoming: true, cops: true,  density: 1.20 },
  { z: 14500, name: "BLACKOUT",   sub: "run on instinct",      night: 1.00, oncoming: true, cops: true,  density: 1.24 },
  { z: 19000, name: "RED LINE",   sub: "everything, at once",  night: 1.00, oncoming: true, cops: true,  density: 1.28 },
];

// Past the authored table the game keeps escalating on its own, so there is
// always a next sector to chase and no ceiling to brag against.
const ENDLESS_EVERY = 6000;
const ENDLESS_DENSITY_STEP = 0.03;
const ENDLESS_DENSITY_MAX = 1.45;

export const SECTOR_COUNT = SECTORS.length;

// 1-based sector index for a distance. Sector 1 is the opening.
export function sectorIndexAt(z) {
  let i = 0;
  for (let k = 0; k < SECTORS.length; k++) if (z >= SECTORS[k].z) i = k;
  if (z < SECTORS[SECTORS.length - 1].z) return i + 1;
  const past = z - SECTORS[SECTORS.length - 1].z;
  return SECTORS.length + Math.floor(past / ENDLESS_EVERY);
}

// Full rule set for a sector index (1-based). Beyond the table, OVERLOAD N.
export function sectorAt(index) {
  if (index <= SECTORS.length) {
    const s = SECTORS[Math.max(0, index - 1)];
    return { index, ...s, endless: false };
  }
  const over = index - SECTORS.length;
  const last = SECTORS[SECTORS.length - 1];
  return {
    index,
    name: "OVERLOAD " + over,
    sub: "how far can you take it",
    night: 1.0,
    oncoming: true,
    cops: true,
    density: Math.min(ENDLESS_DENSITY_MAX, last.density + over * ENDLESS_DENSITY_STEP),
    endless: true,
    z: last.z + over * ENDLESS_EVERY,
  };
}

// Distance at which the NEXT sector starts, for the HUD progress readout.
export function nextSectorZ(index) {
  if (index < SECTORS.length) return SECTORS[index].z;
  const over = index - SECTORS.length + 1;
  return SECTORS[SECTORS.length - 1].z + over * ENDLESS_EVERY;
}

// Where the CURRENT sector started — the pair gives you a 0..1 progress bar.
export function sectorStartZ(index) {
  if (index <= SECTORS.length) return SECTORS[Math.max(0, index - 1)].z;
  const over = index - SECTORS.length;
  return SECTORS[SECTORS.length - 1].z + over * ENDLESS_EVERY;
}
