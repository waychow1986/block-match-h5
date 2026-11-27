import { expect, type Locator, type Page } from '@playwright/test';

export const COLOR_NAMES = ['红', '黄', '绿', '蓝', '紫', '橙'] as const;
export const SIZE = 8;

export type Kind = 'normal' | 'row' | 'col' | 'rainbow';
export interface TileInfo {
  kind: Kind;
  /** Colour name (红…橙); null for rainbow tiles. */
  color: string | null;
}
/** grid[row-1][col-1], row 1 = top, as read from accessible names. */
export type Grid = (TileInfo | null)[][];
export interface Cell {
  row: number;
  col: number;
}

export type StatName = '当前关卡' | '本关得分' | '本关目标分数' | '剩余步数' | '历史最高分';

export const board = (page: Page): Locator => page.getByRole('group', { name: '棋盘' });
export const stat = (page: Page, name: StatName): Locator => page.getByRole('status', { name, exact: true });
export const dialog = (page: Page): Locator => page.locator('[role="dialog"][aria-modal="true"]');

/** The tile button at a cell, matched by the position part of its accessible name. */
export const tileAt = (page: Page, c: Cell): Locator =>
  board(page).getByRole('button', { name: new RegExp(`，第${c.row}行第${c.col}列$`) });

export async function readNumber(page: Page, name: StatName): Promise<number> {
  return Number(await stat(page, name).textContent());
}

const NAME = /^(?:(.)色(方块|横向消除方块|纵向消除方块)|(彩色消除方块))，第(\d+)行第(\d+)列$/;

/** Reads the board purely from tile accessible names. */
export async function readGrid(page: Page): Promise<Grid> {
  const labels = await board(page)
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const grid: Grid = Array.from({ length: SIZE }, () => Array<TileInfo | null>(SIZE).fill(null));
  for (const label of labels) {
    const m = NAME.exec(label);
    if (!m) continue;
    const kind: Kind = m[3] ? 'rainbow' : m[2] === '横向消除方块' ? 'row' : m[2] === '纵向消除方块' ? 'col' : 'normal';
    grid[Number(m[4]) - 1]![Number(m[5]) - 1] = { kind, color: m[1] ?? null };
  }
  return grid;
}

function hasLine(grid: Grid): boolean {
  const color = (r: number, c: number): string | null => grid[r]?.[c]?.color ?? null;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const k = color(r, c);
      if (k === null) continue;
      if (k === color(r, c + 1) && k === color(r, c + 2)) return true;
      if (k === color(r + 1, c) && k === color(r + 2, c)) return true;
    }
  return false;
}

/** Whether swapping two adjacent cells is a valid move (TD-003). */
export function isValidSwap(grid: Grid, a: Cell, b: Cell): boolean {
  const ta = grid[a.row - 1]?.[a.col - 1];
  const tb = grid[b.row - 1]?.[b.col - 1];
  if (!ta || !tb || Math.abs(a.row - b.row) + Math.abs(a.col - b.col) !== 1) return false;
  if (ta.kind === 'rainbow' || tb.kind === 'rainbow') return ta.kind !== tb.kind;
  const next = grid.map((row) => row.slice());
  next[a.row - 1]![a.col - 1] = tb;
  next[b.row - 1]![b.col - 1] = ta;
  return hasLine(next);
}

/** First valid swap, row-major, rightward before downward. */
export function findSwap(grid: Grid): [Cell, Cell] | null {
  for (let row = 1; row <= SIZE; row++)
    for (let col = 1; col <= SIZE; col++)
      for (const b of [
        { row, col: col + 1 },
        { row: row + 1, col },
      ])
        if (isValidSwap(grid, { row, col }, b)) return [{ row, col }, b];
  return null;
}

export async function activate(page: Page, target: Locator, touch: boolean): Promise<void> {
  if (touch) await target.tap();
  else await target.click();
}

/** Swaps two adjacent tiles by tapping/clicking one and then the other (A-11). */
export async function tapSwap(page: Page, a: Cell, b: Cell, touch: boolean): Promise<void> {
  await activate(page, tileAt(page, a), touch);
  await activate(page, tileAt(page, b), touch);
}

/** Waits until the move settled: board idle, or an end-of-level dialog is shown. */
export async function waitSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => (await dialog(page).count()) > 0 || (await board(page).getAttribute('aria-busy')) === 'false', {
      timeout: 15_000,
    })
    .toBe(true);
}

/** Plays the first valid swap and waits for the board to settle. */
export async function playOneSwap(page: Page, touch: boolean): Promise<void> {
  const move = findSwap(await readGrid(page));
  expect(move, 'a valid swap exists').not.toBeNull();
  await tapSwap(page, move![0], move![1], touch);
  await waitSettled(page);
}
