// Environment zones along the endless road — deterministic from z (no state, so
// it's pruneable and consistent). The world cycles through a fixed supersection
// so the player drives open coast → tunnel → coast → ... forever. Bridge zones
// can slot in later.
const SUPER = 3400;
// [startOffset, endOffset, type] within one supersection.
const PATTERN = [
  [0, 1500, "coast"],
  [1500, 2080, "tunnel"],
  [2080, 3400, "coast"],
];

export function zoneAt(z) {
  const base = Math.floor(z / SUPER) * SUPER;
  const p = z - base;
  for (const seg of PATTERN) {
    if (p >= seg[0] && p < seg[1]) return { type: seg[2], z0: base + seg[0], z1: base + seg[1] };
  }
  return { type: "coast", z0: base, z1: base + SUPER };
}

export function zoneTypeAt(z) { return zoneAt(z).type; }
