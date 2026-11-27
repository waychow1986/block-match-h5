import type { Rng } from './rng';

export type ColorId = 0 | 1 | 2 | 3 | 4 | 5; // 红 黄 绿 蓝 紫 橙
export type TileKind = 'normal' | 'row' | 'col' | 'rainbow';
/** `row` clears its whole row, `col` its whole column; `rainbow` has no colour (TD-002). */
export interface Tile {
  id: number;
  kind: TileKind;
  color: ColorId | null;
}
/** Row-major: grid[row][col], row 0 is the top row; always full (TD-002). */
export type Grid = Tile[][];
export interface Pos {
  row: number;
  col: number;
}
export interface Line {
  dir: 'h' | 'v';
  color: ColorId;
  cells: Pos[];
}
export type Move = [Pos, Pos];

const MAX_GENERATE = 100;
const MAX_SHUFFLE = 500;

export function tileAt(grid: Grid, p: Pos): Tile | undefined {
  return grid[p.row]?.[p.col];
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.row === b.row && a.col === b.col;
}

export function isAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function inside(grid: Grid, p: Pos): boolean {
  return p.row >= 0 && p.row < grid.length && p.col >= 0 && p.col < (grid[0]?.length ?? 0);
}

/**
 * Builds a grid from text rows (tests and fixtures): `0`–`5` normal tiles,
 * `A`–`F` row-clearing tiles of colour 0–5, `a`–`f` column-clearing tiles,
 * `*` rainbow tiles. Ids are assigned row by row from `firstId`.
 */
export function parseGrid(rows: string[], firstId = 0): Grid {
  let id = firstId;
  return rows.map((line) =>
    [...line].map((ch): Tile => {
      if (ch === '*') return { id: id++, kind: 'rainbow', color: null };
      if (/[0-5]/.test(ch)) return { id: id++, kind: 'normal', color: Number(ch) as ColorId };
      if (/[A-F]/.test(ch)) return { id: id++, kind: 'row', color: (ch.charCodeAt(0) - 65) as ColorId };
      if (/[a-f]/.test(ch)) return { id: id++, kind: 'col', color: (ch.charCodeAt(0) - 97) as ColorId };
      throw new Error(`bad tile ${ch}`);
    }),
  );
}

/** Inverse of parseGrid (ids dropped). */
export function gridText(grid: Grid): string[] {
  return grid.map((row) =>
    row
      .map((t) => {
        if (t.kind === 'rainbow') return '*';
        if (t.kind === 'row') return String.fromCharCode(65 + t.color!);
        if (t.kind === 'col') return String.fromCharCode(97 + t.color!);
        return String(t.color);
      })
      .join(''),
  );
}

/** Every maximal straight run of ≥3 same-coloured tiles; rainbow tiles never match (A-8). */
export function findLines(grid: Grid): Line[] {
  const lines: Line[] = [];
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const scan = (dir: 'h' | 'v', outer: number, inner: number, at: (o: number, i: number) => Pos): void => {
    for (let o = 0; o < outer; o++) {
      let i = 0;
      while (i < inner) {
        const color = tileAt(grid, at(o, i))!.color;
        let j = i + 1;
        while (j < inner && color !== null && tileAt(grid, at(o, j))!.color === color) j++;
        if (color !== null && j - i >= 3) {
          const cells: Pos[] = [];
          for (let k = i; k < j; k++) cells.push(at(o, k));
          lines.push({ dir, color, cells });
        }
        i = j;
      }
    }
  };
  scan('h', rows, cols, (o, i) => ({ row: o, col: i }));
  scan('v', cols, rows, (o, i) => ({ row: i, col: o }));
  return lines;
}

export function swapped(grid: Grid, a: Pos, b: Pos): Grid {
  const next = cloneGrid(grid);
  const ta = tileAt(grid, a)!;
  next[a.row]![a.col] = tileAt(grid, b)!;
  next[b.row]![b.col] = ta;
  return next;
}

/**
 * Valid swap (TD-003): adjacent; exactly one side rainbow, or the swap forms a
 * line of ≥3. Two rainbow tiles never swap (A-9).
 */
export function isValidSwap(grid: Grid, a: Pos, b: Pos): boolean {
  if (!inside(grid, a) || !inside(grid, b) || !isAdjacent(a, b)) return false;
  const ra = tileAt(grid, a)!.kind === 'rainbow';
  const rb = tileAt(grid, b)!.kind === 'rainbow';
  if (ra && rb) return false;
  if (ra || rb) return true;
  return findLines(swapped(grid, a, b)).length > 0;
}

/** All valid swaps, scanned row-major, rightward before downward (TD-016). */
export function findMoves(grid: Grid): Move[] {
  const moves: Move[] = [];
  for (let row = 0; row < grid.length; row++)
    for (let col = 0; col < grid[row]!.length; col++) {
      const p = { row, col };
      for (const q of [
        { row, col: col + 1 },
        { row: row + 1, col },
      ])
        if (isValidSwap(grid, p, q)) moves.push([p, q]);
    }
  return moves;
}

export function hasMove(grid: Grid): boolean {
  return findMoves(grid).length > 0;
}

/** A playable resting board: no line on it and at least one valid swap (A-10). */
export function isPlayable(grid: Grid): boolean {
  return findLines(grid).length === 0 && hasMove(grid);
}

export function randomColor(colors: number, rng: Rng): ColorId {
  return Math.min(colors - 1, Math.floor(rng() * colors)) as ColorId;
}

/** Random full board without lines and with at least one valid swap (TD-008). */
export function generateGrid(rows: number, cols: number, colors: number, rng: Rng, firstId = 0): Grid {
  const roll = (): Grid => {
    let id = firstId;
    const grid: Grid = [];
    for (let r = 0; r < rows; r++) {
      const row: Tile[] = [];
      grid.push(row);
      for (let c = 0; c < cols; c++) {
        const banned = new Set<ColorId | null>();
        if (c >= 2 && row[c - 1]!.color === row[c - 2]!.color) banned.add(row[c - 1]!.color);
        if (r >= 2 && grid[r - 1]![c]!.color === grid[r - 2]![c]!.color) banned.add(grid[r - 1]![c]!.color);
        const allowed = [...Array(colors).keys()].filter((k) => !banned.has(k as ColorId));
        const color = allowed[Math.min(allowed.length - 1, Math.floor(rng() * allowed.length))] as ColorId;
        row.push({ id: id++, kind: 'normal', color });
      }
    }
    return grid;
  };
  let grid = roll();
  for (let i = 1; i < MAX_GENERATE && !isPlayable(grid); i++) grid = roll();
  return isPlayable(grid) ? grid : shuffleGrid(grid, colors, rng);
}

/**
 * Rearranges the existing tiles (Fisher–Yates) until the board is playable
 * (TD-008, A-10). As a last resort normal tiles are recoloured in place while
 * special tiles keep their positions.
 */
export function shuffleGrid(grid: Grid, colors: number, rng: Rng): Grid {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const tiles = grid.flat();
  const layout = (list: Tile[]): Grid =>
    Array.from({ length: rows }, (_, r) => list.slice(r * cols, (r + 1) * cols));
  for (let attempt = 0; attempt < MAX_SHUFFLE; attempt++) {
    const list = tiles.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    const next = layout(list);
    if (isPlayable(next)) return next;
  }
  let next = grid;
  for (let attempt = 0; attempt < MAX_SHUFFLE && !isPlayable(next); attempt++)
    next = grid.map((row) => row.map((t) => (t.kind === 'normal' ? { ...t, color: randomColor(colors, rng) } : t)));
  return next;
}
