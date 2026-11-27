import { describe, expect, it } from 'vitest';
import {
  HIGH_SCORE_KEY,
  LEVEL_KEY,
  createHighScoreStore,
  createLevelStore,
  type StorageLike,
} from '../../src/storage/highScore';

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

  it('does not overwrite a higher value saved by another page after creation', () => {
    const s = memoryStorage();
    const store = createHighScoreStore(s);
    s.data[HIGH_SCORE_KEY] = '5000';
    expect(store.offer(300)).toBe(false);
    expect(s.data[HIGH_SCORE_KEY]).toBe('5000');
    expect(store.value).toBe(5000);
    expect(store.offer(6000)).toBe(true);
    expect(s.data[HIGH_SCORE_KEY]).toBe('6000');
  });

  it('uses the in-memory value when re-reading storage fails', () => {
    let reads = 0;
    const data: Record<string, string> = { [HIGH_SCORE_KEY]: '100' };
    const flaky: StorageLike = {
      getItem: (k) => {
        if (reads++ > 0) throw new Error('SecurityError');
        return data[k] ?? null;
      },
      setItem: (k, v) => {
        data[k] = v;
      },
    };
    const store = createHighScoreStore(flaky);
    expect(store.offer(50)).toBe(false);
    expect(store.offer(150)).toBe(true);
    expect(data[HIGH_SCORE_KEY]).toBe('150');
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

describe('new game keys (AC-14, AC-18)', () => {
  it('uses the swap-match keys and ignores the old block-match high score', () => {
    expect(HIGH_SCORE_KEY).toBe('swap-match.highScore');
    expect(LEVEL_KEY).toBe('swap-match.level');
    const s = memoryStorage({ 'block-match.highScore': '9000' });
    const store = createHighScoreStore(s);
    expect(store.value).toBe(0);
    expect(store.offer(10)).toBe(true);
    expect(s.data['block-match.highScore']).toBe('9000');
    expect(s.data['swap-match.highScore']).toBe('10');
  });

  it.each([
    [undefined, 1],
    ['0', 1],
    ['abc', 1],
    ['-2', 1],
    ['3', 3],
  ])('level store reads %j as %d', (raw, expected) => {
    const s = memoryStorage(raw === undefined ? {} : { [LEVEL_KEY]: raw });
    expect(createLevelStore(s).value).toBe(expected);
  });

  it('level store only ever increases', () => {
    const s = memoryStorage({ [LEVEL_KEY]: '4' });
    const store = createLevelStore(s);
    expect(store.offer(3)).toBe(false);
    expect(store.offer(5)).toBe(true);
    expect(s.data[LEVEL_KEY]).toBe('5');
  });

  it('level store works without storage', () => {
    const store = createLevelStore(null);
    expect(store.value).toBe(1);
    expect(store.offer(2)).toBe(true);
    expect(store.value).toBe(2);
  });
});
