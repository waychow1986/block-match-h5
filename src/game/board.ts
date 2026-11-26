import type { Rng } from './rng';
import { scoreFor } from './scoring';

export type ColorId = 0 | 1 | 2 | 3 | 4;
export interface Tile {
  id: number;
  color: ColorId;
}
/** Column-major: board[col][rowFromBottom]; only non-empty columns, each packed from the bottom. */
export type Board = Tile[][];
export interface Pos {
  col: number;
  row: number;
}
export interface MovedTile {
  id: number;
  from: Pos;
  afterFall: Pos;
  to: Pos;
}
export interface MoveResult {
  removed: { id: number; pos: Pos }[];
  /** Tiles whose position changed (falling and/or column shift). */
  moved: MovedTile[];
  gained: number;
  board: Board;
  levelEnded: boolean;
}

export function tileAt(board: Board, pos: Pos): Tile | undefined {
  return board[pos.col]?.[pos.row];
}

/** Builds a board from colour ids (columns left-to-right, each bottom-to-top). */
export function makeBoard(columns: number[][], firstId = 0): Board {
  let id = firstId;
  return columns.map((col) => col.map((c) => ({ id: id++, color: c as ColorId })));
}

export function findGroup(board: Board, pos: Pos): Pos[] {
  const start = tileAt(board, pos);
  if (!start) return [];
  const seen = new Set<string>([`${pos.col},${pos.row}`]);
  const stack: Pos[] = [pos];
  const group: Pos[] = [];
  while (stack.length) {
    const p = stack.pop()!;
    group.push(p);
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { col: p.col + dc, row: p.row + dr };
      const key = `${n.col},${n.row}`;
      if (seen.has(key)) continue;
      if (tileAt(board, n)?.color !== start.color) continue;
      seen.add(key);
      stack.push(n);
    }
  }
  return group;
}

export function hasMoves(board: Board): boolean {
  for (let c = 0; c < board.length; c++) {
    const col = board[c]!;
    for (let r = 0; r < col.length; r++) {
      const color = col[r]!.color;
      if (col[r + 1]?.color === color) return true;
      if (board[c + 1]?.[r]?.color === color) return true;
    }
  }
  return false;
}

/** Removes the group at pos; returns null when there is no group of at least 2 tiles. */
export function removeGroup(board: Board, pos: Pos): MoveResult | null {
  const group = findGroup(board, pos);
  if (group.length < 2) return null;
  const del = new Set(group.map((p) => `${p.col},${p.row}`));
  const removed = group.map((p) => ({ id: tileAt(board, p)!.id, pos: p }));
  const moved: MovedTile[] = [];
  const next: Board = [];
  board.forEach((col, c) => {
    const kept: { tile: Tile; from: Pos; afterFall: Pos }[] = [];
    col.forEach((tile, r) => {
      if (del.has(`${c},${r}`)) return;
      kept.push({ tile, from: { col: c, row: r }, afterFall: { col: c, row: kept.length } });
    });
    if (!kept.length) return;
    const newCol = next.length;
    for (const k of kept) {
      const to = { col: newCol, row: k.afterFall.row };
      if (to.col !== k.from.col || to.row !== k.from.row) {
        moved.push({ id: k.tile.id, from: k.from, afterFall: k.afterFall, to });
      }
    }
    next.push(kept.map((k) => k.tile));
  });
  return { removed, moved, gained: scoreFor(group.length), board: next, levelEnded: !hasMoves(next) };
}

const MAX_ATTEMPTS = 50;

/** Random full board with at least 2 colours and at least one removable group (TD-005). */
export function generateBoard(cols: number, rows: number, colors: number, rng: Rng, firstId = 0): Board {
  const roll = () => {
    let id = firstId;
    const b: Board = [];
    for (let c = 0; c < cols; c++) {
      const col: Tile[] = [];
      for (let r = 0; r < rows; r++) {
        col.push({ id: id++, color: Math.min(colors - 1, Math.floor(rng() * colors)) as ColorId });
      }
      b.push(col);
    }
    return b;
  };
  const valid = (b: Board) => new Set(b.flat().map((t) => t.color)).size >= 2 && hasMoves(b);
  let b = roll();
  for (let i = 1; i < MAX_ATTEMPTS && !valid(b); i++) b = roll();
  if (!valid(b)) {
    // Fallback for degenerate randomness: a bottom-left pair plus a second colour elsewhere.
    const base = b[0]![0]!.color;
    if (rows > 1) b[0]![1]!.color = base;
    else b[1]![0]!.color = base;
    b[cols - 1]![rows - 1]!.color = ((base + 1) % colors) as ColorId;
  }
  return b;
}
