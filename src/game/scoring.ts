/**
 * Points for one cascade round (TD-007): 10 × tiles removed in the round × round
 * number (1-based). Tiles cleared by special effects count as removed tiles.
 */
export function pointsFor(tiles: number, round: number): number {
  return 10 * tiles * round;
}
