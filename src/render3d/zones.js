// Environment zones along the endless road — deterministic from z (no state, so
// it's pruneable and consistent). The world cycles through a fixed supersection
// so the player drives open coast → tunnel → coast → bridge → coast → ... forever.
const SUPER = 4200;
// [startOffset, endOffset, type] within one supersection.
const PATTERN = [
  [0, 1400, "coast"],
  [1400, 1980, "tunnel"],
  [1980, 2760, "coast"],
  [2760, 3560, "bridge"],
  [3560, 4200, "coast"],
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

const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// Smooth 0..1 membership of `type` around z, ramping across `fade` world units
// centred on each zone boundary (0.5 exactly at the seam, continuous either
// side). Geometry that can't just pop into existence — the sand causeway sinking
// away at a bridge mouth — leans on this instead of a hard in/out test.
export function zoneBlend(z, type, fade = 44) {
  const zn = zoneAt(z);
  const half = fade / 2;
  if (zn.type === type) {
    const d = Math.min(z - zn.z0, zn.z1 - z);          // distance inside from the nearer edge
    return smooth(0.5 + Math.min(d, half) / fade);
  }
  const dLo = z - zn.z0, dHi = zn.z1 - z;
  if (dLo < half && zoneTypeAt(zn.z0 - 1) === type) return smooth(0.5 - dLo / fade);
  if (dHi < half && zoneTypeAt(zn.z1 + 1) === type) return smooth(0.5 - dHi / fade);
  return 0;
}
