/** Animation durations in ms (TD-012). */
export const SWAP_MS = 160;
/** Invalid swap: out to the neighbour and back again. */
export const BOUNCE_MS = SWAP_MS * 2;
export const REMOVE_MS = 180;
/** Falling of the remaining tiles and drop-in of the refills. */
export const FALL_MS = 260;
export const SHUFFLE_MS = 420;
export const FLOAT_MS = 700;
export const APPEAR_MS = 220;
/** One cascade round (remove → fall and refill); the board is aria-busy="true" meanwhile. */
export const MOVE_SETTLE_MS = REMOVE_MS + FALL_MS;
/** Per-round score count-up of "本关得分". */
export const SCORE_COUNT_MS = MOVE_SETTLE_MS;
/** Pause after the final move of a level before the outcome overlay appears. */
export const LEVEL_END_PAUSE_MS = 300;
/** Inactivity before a valid swap is hinted (TD-016). */
export const HINT_DELAY_MS = 5000;
