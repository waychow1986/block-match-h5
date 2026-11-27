/** Animation durations in ms (TD-007). */
export const REMOVE_MS = 180;
export const FALL_MS = 240;
export const SHIFT_MS = 200;
export const SCORE_COUNT_MS = 400;
export const FLOAT_MS = 700;
export const APPEAR_MS = 220;
/** Whole move sequence (remove → fall → shift); the board is aria-busy="true" meanwhile. */
export const MOVE_SETTLE_MS = REMOVE_MS + FALL_MS + SHIFT_MS;
/** Pause after the final move of a level before the outcome overlay appears. */
export const LEVEL_END_PAUSE_MS = 300;
