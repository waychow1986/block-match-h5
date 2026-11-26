export const HIGH_SCORE_KEY = 'block-match.highScore';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface HighScoreStore {
  readonly value: number;
  /** Records score if it beats the current high score; returns whether it did. */
  offer(score: number): boolean;
}

function parse(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : 0;
}

export function createHighScoreStore(storage: StorageLike | null): HighScoreStore {
  let value = 0;
  try {
    value = parse(storage?.getItem(HIGH_SCORE_KEY) ?? null);
  } catch {
    value = 0;
  }
  return {
    get value() {
      return value;
    },
    offer(score: number) {
      // Re-read so a higher value saved by another page is never overwritten.
      try {
        value = Math.max(value, parse(storage?.getItem(HIGH_SCORE_KEY) ?? null));
      } catch {
        // Read failed: compare against the in-memory value only.
      }
      if (score <= value) return false;
      value = score;
      try {
        storage?.setItem(HIGH_SCORE_KEY, String(score));
      } catch {
        // Storage unavailable: keep the in-memory value only (A-10).
      }
      return true;
    },
  };
}

export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
