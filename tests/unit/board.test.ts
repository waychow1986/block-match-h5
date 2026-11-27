import { describe, expect, it } from 'vitest';
import {
  findGroup,
  generateBoard,
  hasMoves,
  makeBoard,
  removeGroup,
  type Board,
} from '../../src/game/board';
import { mulberry32 } from '../../src/game/rng';

// Columns are listed left-to-right, each column bottom-to-top.
const colors = (b: Board) => b.map((col) => col.map((t) => t.color));

describe('findGroup', () => {
  // col0: 0 0 1   col1: 0 1 1   col2: 1 0 0
  const b = makeBoard([
    [0, 0, 1],
    [0, 1, 1],
    [1, 0, 0],
  ]);

  it('collects 4-connected same-colour tiles from any member', () => {
    const g = findGroup(b, { col: 1, row: 0 });
    expect(g.map((p) => `${p.col},${p.row}`).sort()).toEqual(['0,0', '0,1', '1,0']);
  });

  it('does not join diagonal neighbours', () => {
    // (0,2) colour 1 touches (1,2) colour 1 horizontally, (1,1) colour 1 vertically; (2,0) colour 1 is only diagonal to (1,1)
    const g = findGroup(b, { col: 2, row: 0 });
    expect(g).toHaveLength(1);
  });

  it('returns an empty list for an empty position', () => {
    expect(findGroup(b, { col: 5, row: 0 })).toEqual([]);
    expect(findGroup(b, { col: 0, row: 7 })).toEqual([]);
  });
});

describe('removeGroup', () => {
  it('returns null for a single tile and for an empty cell (board unchanged)', () => {
    const b = makeBoard([
      [0, 1],
      [2, 0],
    ]);
    expect(removeGroup(b, { col: 0, row: 0 })).toBeNull();
    expect(removeGroup(b, { col: 3, row: 3 })).toBeNull();
    expect(colors(b)).toEqual([
      [0, 1],
      [2, 0],
    ]);
  });

  it('removes only the group, drops tiles above and keeps other same-colour tiles', () => {
    // col0: 0 1 2 ; col1: 0 2 1 ; col2: 1 1 0 (the 0 at col2 top is same colour but not connected)
    const b = makeBoard([
      [0, 1, 2],
      [0, 2, 1],
      [1, 1, 0],
    ]);
    const r = removeGroup(b, { col: 0, row: 0 })!;
    expect(r.removed).toHaveLength(2);
    expect(r.gained).toBe(40);
    expect(colors(r.board)).toEqual([
      [1, 2],
      [2, 1],
      [1, 1, 0],
    ]);
    const moved = r.moved.find((m) => m.from.col === 0 && m.from.row === 2)!;
    expect(moved.afterFall).toEqual({ col: 0, row: 1 });
    expect(moved.to).toEqual({ col: 0, row: 1 });
  });

  it('shifts columns right of an emptied column to the left, preserving order', () => {
    const b = makeBoard([[1, 2], [0, 0], [2, 1], [1]]);
    const r = removeGroup(b, { col: 1, row: 1 })!;
    expect(colors(r.board)).toEqual([[1, 2], [2, 1], [1]]);
    const m = r.moved.find((x) => x.from.col === 3)!;
    expect(m.afterFall).toEqual({ col: 3, row: 0 });
    expect(m.to).toEqual({ col: 2, row: 0 });
  });

  it('handles two adjacent columns emptied at once and the rightmost column emptied', () => {
    const b = makeBoard([[1], [0, 0], [0], [2]]);
    const r = removeGroup(b, { col: 2, row: 0 })!;
    expect(colors(r.board)).toEqual([[1], [2]]);
    const b2 = makeBoard([[1, 2], [0, 0]]);
    const r2 = removeGroup(b2, { col: 1, row: 0 })!;
    expect(colors(r2.board)).toEqual([[1, 2]]);
    expect(r2.moved).toEqual([]);
  });

  it('reports levelEnded when no group remains, including an empty board', () => {
    expect(removeGroup(makeBoard([[0, 0], [1]]), { col: 0, row: 0 })!.levelEnded).toBe(true);
    expect(removeGroup(makeBoard([[0, 0]]), { col: 0, row: 0 })!.board).toEqual([]);
    expect(removeGroup(makeBoard([[0, 0], [1, 1]]), { col: 0, row: 0 })!.levelEnded).toBe(false);
  });

  it('keeps tile ids stable for moved tiles and does not mutate the input', () => {
    const b = makeBoard([[0, 0, 1], [2]]);
    const topId = b[0]![2]!.id;
    const r = removeGroup(b, { col: 0, row: 0 })!;
    expect(r.board[0]![0]!.id).toBe(topId);
    expect(b[0]).toHaveLength(3);
  });
});

describe('hasMoves', () => {
  it('detects horizontal and vertical pairs only', () => {
    expect(hasMoves(makeBoard([[0, 1], [1, 0]]))).toBe(false);
    expect(hasMoves(makeBoard([[0, 1], [0, 2]]))).toBe(true);
    expect(hasMoves(makeBoard([[0, 0], [1]]))).toBe(true);
    expect(hasMoves(makeBoard([[0], [1, 1]]))).toBe(true);
    expect(hasMoves([])).toBe(false);
  });
});

describe('generateBoard', () => {
  it('fills every cell, uses only level colours, has >= 2 colours and a move', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const k = 3 + (seed % 3);
      const b = generateBoard(10, 10, k, mulberry32(seed));
      expect(b).toHaveLength(10);
      const seen = new Set<number>();
      for (const col of b) {
        expect(col).toHaveLength(10);
        for (const t of col) {
          expect(t.color).toBeLessThan(k);
          seen.add(t.color);
        }
      }
      expect(seen.size).toBeGreaterThanOrEqual(2);
      expect(hasMoves(b)).toBe(true);
    }
  });

  it('falls back to a valid board when the rng is degenerate', () => {
    const b = generateBoard(4, 4, 3, () => 0);
    const seen = new Set(b.flat().map((t) => t.color));
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(hasMoves(b)).toBe(true);
    expect(new Set(b.flat().map((t) => t.id)).size).toBe(16);
  });
});
