import { describe, expect, it } from 'vitest';
import { scoreFor } from '../../src/game/scoring';
import { mulberry32 } from '../../src/game/rng';

// AC-5 developer check (test plan TS-11).
const MAX_N = 100;

function* partitions(n: number, min = 2): Generator<number[]> {
  // All multisets of parts >= 2 summing to n, parts non-decreasing.
  if (n === 0) {
    yield [];
    return;
  }
  for (let p = min; p <= n; p++) {
    for (const rest of partitions(n - p, p)) yield [p, ...rest];
  }
}

describe('scoreFor (S(n))', () => {
  it('is positive and strictly increasing for n = 2..100', () => {
    let prev = 0;
    for (let n = 2; n <= MAX_N; n++) {
      const s = scoreFor(n);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('S(2N) >= 2 * (S(N) + S(N)) for every N with 2N <= 100', () => {
    for (let N = 2; 2 * N <= MAX_N; N++) {
      expect(scoreFor(2 * N)).toBeGreaterThanOrEqual(2 * (scoreFor(N) + scoreFor(N)));
    }
  });

  it('one removal beats every split into >= 2 groups (each >= 2) for all n <= 20', () => {
    let checked = 0;
    for (let n = 4; n <= 20; n++) {
      for (const parts of partitions(n)) {
        if (parts.length < 2) continue;
        const sum = parts.reduce((acc, p) => acc + scoreFor(p), 0);
        expect(scoreFor(n)).toBeGreaterThan(sum);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('one removal beats random splits for n <= 100', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 2000; i++) {
      const n = 4 + Math.floor(rng() * (MAX_N - 3));
      const parts: number[] = [];
      let left = n;
      while (left >= 4 && (parts.length === 0 || rng() < 0.7)) {
        const p = 2 + Math.floor(rng() * (left - 3));
        parts.push(p);
        left -= p;
      }
      parts.push(left);
      if (parts.length < 2 || parts.some((p) => p < 2)) continue;
      const sum = parts.reduce((acc, p) => acc + scoreFor(p), 0);
      expect(scoreFor(n)).toBeGreaterThan(sum);
    }
  });

  it('depends only on n', () => {
    expect(scoreFor(5)).toBe(scoreFor(5));
    expect(scoreFor(2)).toBe(40);
  });
});
