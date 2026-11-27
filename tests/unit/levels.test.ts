import { describe, expect, it } from 'vitest';
import { colorsFor, targetFor, MAX_COLORS } from '../../src/game/levels';

// AC-9 developer check (test plan TS-19).
const MAX_L = 200;
const required = (L: number) => targetFor(L) - (L === 1 ? 0 : targetFor(L - 1));

describe('level parameters', () => {
  it('level 1 has at least 2 colors and a positive target', () => {
    expect(colorsFor(1)).toBeGreaterThanOrEqual(2);
    expect(targetFor(1)).toBeGreaterThan(0);
  });

  it('for L = 1..200: colors never decrease, targets strictly increase, required points never decrease', () => {
    for (let L = 1; L < MAX_L; L++) {
      expect(colorsFor(L + 1)).toBeGreaterThanOrEqual(colorsFor(L));
      expect(targetFor(L + 1)).toBeGreaterThan(targetFor(L));
      // previous target of level 1 counts as 0 (G2 I15)
      expect(required(L + 1)).toBeGreaterThanOrEqual(required(L));
    }
  });

  it('colors reach a cap and stay there; targets keep rising afterwards', () => {
    let capLevel = 0;
    for (let L = 1; L <= MAX_L; L++) {
      expect(colorsFor(L)).toBeLessThanOrEqual(MAX_COLORS);
      if (capLevel === 0 && colorsFor(L) === MAX_COLORS) capLevel = L;
    }
    expect(capLevel).toBeGreaterThan(1);
    for (let L = capLevel; L < MAX_L; L++) {
      expect(colorsFor(L + 1)).toBe(MAX_COLORS);
      expect(targetFor(L + 1)).toBeGreaterThan(targetFor(L));
    }
  });

  it('matches the documented values', () => {
    expect([1, 2, 3, 4].map(colorsFor)).toEqual([3, 4, 5, 5]);
    expect([1, 2, 3, 4, 5].map(targetFor)).toEqual([2000, 4500, 7500, 11000, 15000]);
  });
});
