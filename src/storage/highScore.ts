export const HIGH_SCORE_KEY = 'swap-match.highScore';
/** Highest level reached (TD-013); a cleared level L stores L + 1. */
export const LEVEL_KEY = 'swap-match.level';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MaxStore {
  readonly value: number;
  /** Records n if it beats the current value; returns whether it did. */
  offer(n: number): boolean;
}
export type HighScoreStore = MaxStore;

function parse(raw: string | null, min: number): number {
  if (raw === null || !/^\d+$/.test(raw)) return min;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? Math.max(min, n) : min;
}

/**
 * A never-decreasing integer kept under one storage key. Invalid or missing
 * values read as `min`; storage failures fall back to memory (TD-013).
 */
export function createMaxStore(storage: StorageLike | null, key: string, min: number): MaxStore {
  let value = min;
  try {
    value = parse(storage?.getItem(key) ?? null, min);
  } catch {
    value = min;
  }
  return {
    get value() {
      return value;
    },
    offer(score: number) {
      // Re-read so a higher value saved by another page is never overwritten.
      try {
        value = Math.max(value, parse(storage?.getItem(key) ?? null, min));
      } catch {
        // Read failed: compare against the in-memory value only.
      }
      if (score <= value) return false;
      value = score;
      try {
        storage?.setItem(key, String(score));
      } catch {
        // Storage unavailable: keep the in-memory value only (A-10).
      }
      return true;
    },
  };
}

export function createHighScoreStore(storage: StorageLike | null): MaxStore {
  return createMaxStore(storage, HIGH_SCORE_KEY, 0);
}

export function createLevelStore(storage: StorageLike | null): MaxStore {
  return createMaxStore(storage, LEVEL_KEY, 1);
}

export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
