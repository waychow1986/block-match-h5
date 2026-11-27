/**
 * Helpers of the old tap-to-clear game, kept only so the not-yet-rewritten specs
 * (play/effects: batch 2; mute/layout: batch 3) still type-check. Delete with them.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export const COLOR_NAMES = ['红', '黄', '绿', '蓝', '紫'] as const;
export type Grid = (string | null)[][]; // grid[row-1][col-1], row 1 = top

export interface Cell {
  row: number;
  col: number;
}

export const board = (page: Page): Locator => page.getByRole('group', { name: '棋盘' });
export const stat = (page: Page, name: '当前分数' | '本关目标分数' | '当前关卡' | '历史最高分'): Locator =>
  page.getByRole('status', { name, exact: true });
export const tile = (page: Page, grid: Grid, c: Cell): Locator =>
  board(page).getByRole('button', { name: `${grid[c.row - 1]![c.col - 1]}色方块，第${c.row}行第${c.col}列`, exact: true });

export async function readNumber(page: Page, name: Parameters<typeof stat>[1]): Promise<number> {
  return Number(await stat(page, name).textContent());
}

/** Reads the board purely from tile accessible names. */
export async function readGrid(page: Page): Promise<Grid> {
  const labels = await board(page)
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const grid: Grid = Array.from({ length: 10 }, () => Array<string | null>(10).fill(null));
  for (const label of labels) {
    const m = /^(.)色方块，第(\d+)行第(\d+)列$/.exec(label);
    if (m) grid[Number(m[2]) - 1]![Number(m[3]) - 1] = m[1]!;
  }
  return grid;
}

export function groupAt(grid: Grid, start: Cell): Cell[] {
  const color = grid[start.row - 1]?.[start.col - 1];
  if (!color) return [];
  const seen = new Set<string>();
  const out: Cell[] = [];
  const stack = [start];
  while (stack.length) {
    const c = stack.pop()!;
    const key = `${c.row},${c.col}`;
    if (seen.has(key) || grid[c.row - 1]?.[c.col - 1] !== color) continue;
    seen.add(key);
    out.push(c);
    stack.push({ row: c.row + 1, col: c.col }, { row: c.row - 1, col: c.col }, { row: c.row, col: c.col + 1 }, { row: c.row, col: c.col - 1 });
  }
  return out;
}

export function findGroup(grid: Grid, pred: (size: number) => boolean = (n) => n >= 2): Cell | null {
  for (let row = 1; row <= 10; row++)
    for (let col = 1; col <= 10; col++) if (grid[row - 1]![col - 1] && pred(groupAt(grid, { row, col }).length)) return { row, col };
  return null;
}

const dialog = (page: Page): Locator => page.locator('[role="dialog"][aria-modal="true"]');

/** Waits until the move settled: board idle, or an end-of-level dialog is shown. */
export async function waitSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => (await dialog(page).count()) > 0 || (await board(page).getAttribute('aria-busy')) === 'false', {
      timeout: 15_000,
    })
    .toBe(true);
}

export async function activate(page: Page, target: Locator, touch: boolean): Promise<void> {
  if (touch) await target.tap();
  else await target.click();
}

/** Removes groups until the level ends; returns the dialog name ('过关' | '游戏结束'). */
export async function playToLevelEnd(page: Page, touch: boolean): Promise<string> {
  for (let i = 0; i < 200; i++) {
    if ((await dialog(page).count()) > 0) break;
    const grid = await readGrid(page);
    const cell = findGroup(grid);
    if (!cell) {
      await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
      break;
    }
    await activate(page, tile(page, grid, cell), touch);
    await waitSettled(page);
  }
  await expect(dialog(page)).toBeVisible();
  return (await dialog(page).getAttribute('aria-label')) ?? '';
}
