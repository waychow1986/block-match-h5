import { describe, expect, it } from 'vitest';
import {
  findLines,
  findMoves,
  generateGrid,
  gridText,
  isPlayable,
  isValidSwap,
  parseGrid,
  shuffleGrid,
} from '../../src/game/board';
import { mulberry32 } from '../../src/game/rng';

const p = (row: number, col: number) => ({ row, col });

describe('lines', () => {
  it('finds horizontal and vertical runs of 3 or more', () => {
    const g = parseGrid(['0001', '1232', '1342', '1452']);
    const lines = findLines(g);
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.dir === 'h')!.cells).toEqual([p(0, 0), p(0, 1), p(0, 2)]);
    expect(lines.filter((l) => l.dir === 'v').map((l) => l.cells[0])).toEqual([p(1, 0), p(1, 3)]);
  });

  it('special tiles match by colour, rainbow tiles never match', () => {
    expect(findLines(parseGrid(['0A0', '123', '231']))).toHaveLength(1);
    expect(findLines(parseGrid(['***', '123', '231']))).toHaveLength(0);
  });
});

describe('swap validity (AC-4, TD-003)', () => {
  const g = parseGrid(['0010', '2341', '3412', '4123']);

  it('an adjacent swap forming a line is valid', () => {
    expect(isValidSwap(g, p(0, 2), p(0, 3))).toBe(true);
  });

  it('a swap forming no line is invalid', () => {
    expect(isValidSwap(g, p(1, 0), p(1, 1))).toBe(false);
  });

  it('non-adjacent, diagonal, same-cell and off-board swaps are invalid', () => {
    expect(isValidSwap(g, p(0, 1), p(0, 3))).toBe(false);
    expect(isValidSwap(g, p(0, 2), p(1, 3))).toBe(false);
    expect(isValidSwap(g, p(0, 2), p(0, 2))).toBe(false);
    expect(isValidSwap(g, p(0, 3), p(0, 4))).toBe(false);
  });

  it('a rainbow swapped with any non-rainbow tile is valid; two rainbows are not (AC-9)', () => {
    const r = parseGrid(['*1', '*2']);
    expect(isValidSwap(r, p(0, 0), p(0, 1))).toBe(true);
    expect(isValidSwap(r, p(0, 0), p(1, 0))).toBe(false);
  });

  it('findMoves lists valid swaps row-major, rightward before downward', () => {
    const moves = findMoves(g);
    expect(moves[0]).toEqual([p(0, 2), p(0, 3)]);
    for (const [a, b] of moves) expect(isValidSwap(g, a, b)).toBe(true);
  });
});

describe('generation and shuffling (A-10, TD-008)', () => {
  it('generates 8 x 8 playable boards with the level colours and unique ids', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const colors = seed % 2 ? 5 : 6;
      const g = generateGrid(8, 8, colors, mulberry32(seed), 100);
      expect(g).toHaveLength(8);
      for (const row of g) expect(row).toHaveLength(8);
      expect(isPlayable(g)).toBe(true);
      const tiles = g.flat();
      expect(tiles.every((t) => t.kind === 'normal' && t.color! < colors)).toBe(true);
      expect(new Set(tiles.map((t) => t.id)).size).toBe(64);
      expect(Math.min(...tiles.map((t) => t.id))).toBe(100);
    }
  });

  it('shuffles a dead board into a playable one keeping the same tiles', () => {
    const dead = parseGrid(['01201', '12012', '20120', '01201', '1201C']);
    expect(findMoves(dead)).toHaveLength(0);
    const next = shuffleGrid(dead, 3, mulberry32(7));
    expect(isPlayable(next)).toBe(true);
    const ids = (g: typeof dead) => g.flat().map((t) => t.id).sort((x, y) => x - y);
    expect(ids(next)).toEqual(ids(dead));
  });

  it('parseGrid and gridText round-trip', () => {
    const rows = ['0Aa*', '5Ff1'];
    expect(gridText(parseGrid(rows))).toEqual(rows);
  });
});
