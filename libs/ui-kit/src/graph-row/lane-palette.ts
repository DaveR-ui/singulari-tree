// The Go core emits a numeric `Lane.color` palette slot (domain.proto); the
// renderer owns the slot → CSS color mapping so theming can change without a
// contract change.
export const LANE_PALETTE: readonly string[] = [
  '#0a84ff',
  '#ff9f0a',
  '#30d158',
  '#ff375f',
  '#bf5af2',
  '#64d2ff',
  '#ffd60a',
  '#5e5ce6',
];

/** Map a lane palette slot to a concrete color (wraps around, tolerant of junk). */
export function laneColor(slot: number): string {
  if (!Number.isFinite(slot) || slot < 0) return LANE_PALETTE[0];
  return LANE_PALETTE[Math.trunc(slot) % LANE_PALETTE.length];
}
