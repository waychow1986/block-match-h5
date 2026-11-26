export const COLS = 10;
export const ROWS = 10;
export const MAX_COLORS = 5;

/** Colours used on level L (1-based): 3, 4, 5, 5, … (TD-004). */
export function colorsFor(level: number): number {
  return Math.min(2 + level, MAX_COLORS);
}

/** Cumulative score threshold of level L: Σ (2000 + 500·(i−1)) for i = 1..L (TD-004). */
export function targetFor(level: number): number {
  return 2000 * level + 250 * level * (level - 1);
}
