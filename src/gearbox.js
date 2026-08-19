// Simulated 6-speed gearbox — the HEARTBEAT of a driving game.
//
// A single continuous engine sweep from idle to top speed has no rhythm: the
// machine never seems to work, shift, or recover. Splitting the speed range into
// progressively wider gear bands means the revs climb, snap back on an upshift,
// and climb again — the pulse that makes a car feel alive. Pure math (no audio,
// no DOM) so both the engine synth and the tachometer read the same source.

// Gear boundaries as a fraction of top speed. Bands widen with each gear (like
// real ratios): low gears flash past, top gear is a long, straining pull.
const BANDS = [0, 0.12, 0.27, 0.44, 0.63, 0.82, 1.0];
export const GEAR_COUNT = BANDS.length - 1;   // 6

// Revs right after an upshift. ~0.55 gives a ~45% drop — close to a real gearbox
// (~35%) and unmistakable, without the engine sounding like it fell off a cliff
// (a 0.34 floor dropped 62% and read as a stall).
const REV_FLOOR = 0.55;

// speed01 (0..1 of top speed) → { gear: 1..6, rev: 0..1 }.
export function gearAt(speed01) {
  const s = Math.max(0, Math.min(1, speed01));
  for (let i = 0; i < GEAR_COUNT; i++) {
    if (s < BANDS[i + 1] || i === GEAR_COUNT - 1) {
      const span = BANDS[i + 1] - BANDS[i];
      const within = Math.max(0, Math.min(1, (s - BANDS[i]) / span));
      return { gear: i + 1, rev: REV_FLOOR + (1 - REV_FLOOR) * within };
    }
  }
  return { gear: GEAR_COUNT, rev: 1 };
}
