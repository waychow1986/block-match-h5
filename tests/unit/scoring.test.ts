import { describe, expect, it } from 'vitest';
import { pointsFor } from '../../src/game/scoring';

describe('round scoring (AC-7)', () => {
  it('gives positive points for a round', () => {
    expect(pointsFor(3, 1)).toBeGreaterThan(0);
  });

  it('the same number of tiles scores strictly more in each later round', () => {
    for (const n of [3, 4, 5, 8, 15])
      for (let round = 1; round < 10; round++) expect(pointsFor(n, round + 1)).toBeGreaterThan(pointsFor(n, round));
  });

  it('more tiles in the same round score more', () => {
    expect(pointsFor(4, 1)).toBeGreaterThan(pointsFor(3, 1));
  });
});
