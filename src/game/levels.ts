export const COLS = 8;
export const ROWS = 8;
export const MAX_COLORS = 6;
/** Moves never drop below this floor; later levels only raise the target (Q2, TD-006). */
export const MIN_MOVES = 20;

/** Colours used on level L (1-based): 5 on levels 1–5, then 6 (TD-006). */
export function colorsFor(level: number): number {
  return level <= 5 ? 5 : MAX_COLORS;
}

/** Move limit of level L: 30, 28, 26, 24, 22, then 20 (TD-006). */
export function movesFor(level: number): number {
  return Math.max(MIN_MOVES, 32 - 2 * level);
}

/** Per-level target score: 1500…2500 on levels 1–5, then 2750, 2900, … (TD-006). */
export function targetFor(level: number): number {
  return level <= 5 ? 1250 + 250 * level : 1850 + 150 * level;
}
