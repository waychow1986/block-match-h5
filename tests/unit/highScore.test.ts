import { describe, expect, it } from 'vitest';
import { HIGH_SCORE_KEY, createHighScoreStore, type StorageLike } from '../../src/storage/highScore';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('high score store', () => {
  it('reads 0 when nothing is saved', () => {
    expect(createHighScoreStore(memoryStorage()).value).toBe(0);
  });

  it('reads a saved non-negative integer', () => {
    expect(createHighScoreStore(memoryStorage({ [HIGH_SCORE_KEY]: '4520' })).value).toBe(4520);
  });

  it.each(['abc', '-5', '1.5', '', '1e3', 'NaN', '99999999999999999999'])('treats invalid value %j as 0', (v) => {
    expect(createHighScoreStore(memoryStorage({ [HIGH_SCORE_KEY]: v })).value).toBe(0);
  });

  it('only saves when the score exceeds the stored value', () => {
    const s = memoryStorage({ [HIGH_SCORE_KEY]: '100' });
    const store = createHighScoreStore(s);
    expect(store.offer(50)).toBe(false);
    expect(s.data[HIGH_SCORE_KEY]).toBe('100');
    expect(store.offer(120)).toBe(true);
    expect(store.value).toBe(120);
    expect(s.data[HIGH_SCORE_KEY]).toBe('120');
  });

  it('falls back to memory when storage throws on read and write', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = createHighScoreStore(broken);
    expect(store.value).toBe(0);
    expect(store.offer(300)).toBe(true);
    expect(store.value).toBe(300);
  });

  it('works when storage is unavailable', () => {
    const store = createHighScoreStore(null);
    expect(store.offer(10)).toBe(true);
    expect(store.value).toBe(10);
  });
});
