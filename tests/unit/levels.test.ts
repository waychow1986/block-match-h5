import { describe, expect, it } from 'vitest';
import { COLS, MIN_MOVES, ROWS, colorsFor, movesFor, targetFor } from '../../src/game/levels';

// AC-2, AC-13 developer check (test plan TS-26).
const MAX_L = 200;

describe('level parameters', () => {
  it('the board is 8 x 8', () => {
    expect(ROWS).toBe(8);
    expect(COLS).toBe(8);
  });

  it('every level uses 5 or 6 colours (AC-2)', () => {
    for (let L = 1; L <= MAX_L; L++) expect([5, 6]).toContain(colorsFor(L));
  });

  it('for L = 1..200: targets strictly increase and moves never increase (AC-13)', () => {
    for (let L = 1; L < MAX_L; L++) {
      expect(targetFor(L + 1)).toBeGreaterThan(targetFor(L));
      expect(movesFor(L + 1)).toBeLessThanOrEqual(movesFor(L));
    }
  });

  it('level 5 has fewer moves than level 1 (AC-13)', () => {
    expect(movesFor(5)).toBeLessThan(movesFor(1));
  });

  it('moves stop at the floor once reached, while targets keep rising (Q2)', () => {
    const floorLevel = [...Array(MAX_L).keys()].map((i) => i + 1).find((L) => movesFor(L) === MIN_MOVES)!;
    expect(floorLevel).toBeGreaterThan(1);
    for (let L = floorLevel; L <= MAX_L; L++) expect(movesFor(L)).toBe(MIN_MOVES);
    expect(MIN_MOVES).toBeGreaterThan(0);
  });
});
