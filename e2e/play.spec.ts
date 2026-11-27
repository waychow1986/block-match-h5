import { expect, test, type Page } from '@playwright/test';
import {
  board,
  dialog,
  dragFrom,
  dragSwap,
  findSwap,
  isValidSwap,
  playToLevelEnd,
  readGrid,
  readNumber,
  stat,
  tapSwap,
  tileAt,
  waitSettled,
  type Cell,
  type Grid,
  type StatName,
} from './helpers';

const STATS: StatName[] = ['当前关卡', '本关得分', '本关目标分数', '剩余步数', '历史最高分'];
const isTouch = (name: string): boolean => name === 'mobile';

/** An adjacent pair whose swap forms no line (and involves no rainbow tile). */
function invalidPair(grid: Grid): [Cell, Cell] | null {
  for (let row = 1; row <= 8; row++)
    for (let col = 1; col < 8; col++) {
      const a = { row, col };
      const b = { row, col: col + 1 };
      const ta = grid[row - 1]![col - 1];
      const tb = grid[row - 1]![col];
      if (ta?.kind === 'normal' && tb?.kind === 'normal' && !isValidSwap(grid, a, b)) return [a, b];
    }
  return null;
}

async function readStats(page: Page): Promise<number[]> {
  return Promise.all(STATS.map((s) => readNumber(page, s)));
}

test.describe('AC-1 AC-10 opening', () => {
  test('8x8 board of 64 tiles and the five info fields', async ({ page }) => {
    await page.goto('/');
    await expect(board(page).getByRole('button')).toHaveCount(64);
    for (const s of STATS) await expect(stat(page, s)).toBeVisible();
    expect(await readNumber(page, '当前关卡')).toBe(1);
    expect(await readNumber(page, '本关得分')).toBe(0);
    expect(await readNumber(page, '本关目标分数')).toBe(1500);
    expect(await readNumber(page, '剩余步数')).toBe(30);
    expect(findSwap(await readGrid(page))).not.toBeNull();
  });
});

test.describe('AC-3 AC-5 swapping', () => {
  test('drag/swipe and tap-tap swaps cost one move; an invalid swap bounces back', async ({ page }, info) => {
    const touch = isTouch(info.project.name);
    await page.goto('/');

    // Drag (mouse) or swipe (finger).
    let move = findSwap(await readGrid(page))!;
    await dragSwap(page, move[0], move[1], touch);
    await expect(board(page)).toHaveAttribute('aria-busy', 'true');
    await waitSettled(page);
    expect(await readNumber(page, '剩余步数')).toBe(29);
    expect(await readNumber(page, '本关得分')).toBeGreaterThan(0);

    // Click/tap one tile, then a neighbour.
    move = findSwap(await readGrid(page))!;
    await tapSwap(page, move[0], move[1], touch);
    await waitSettled(page);
    expect(await readNumber(page, '剩余步数')).toBe(28);

    // A tiny movement is a tap, not a swap.
    const before = await readGrid(page);
    await dragFrom(page, { row: 4, col: 4 }, 0.05, 0, touch);
    await expect(tileAt(page, { row: 4, col: 4 })).toHaveAttribute('aria-pressed', 'true');
    // Tapping a non-adjacent tile only moves the selection.
    await tileAt(page, { row: 1, col: 1 })[touch ? 'tap' : 'click']();
    await expect(tileAt(page, { row: 1, col: 1 })).toHaveAttribute('aria-pressed', 'true');
    await expect(tileAt(page, { row: 4, col: 4 })).not.toHaveAttribute('aria-pressed', 'true');
    await tileAt(page, { row: 1, col: 1 })[touch ? 'tap' : 'click']();
    expect(await readGrid(page)).toEqual(before);
    expect(await readNumber(page, '剩余步数')).toBe(28);

    // Invalid swap: tiles bounce back; board, moves and score unchanged.
    const stats = await readStats(page);
    const bad = invalidPair(before)!;
    expect(bad).not.toBeNull();
    await dragSwap(page, bad[0], bad[1], touch);
    await waitSettled(page);
    expect(await readGrid(page)).toEqual(before);
    expect(await readStats(page)).toEqual(stats);
  });
});

test.describe('AC-11 AC-12 level end', () => {
  test('strong strategy clears level 1; 下一关 starts level 2', async ({ page }, info) => {
    const touch = isTouch(info.project.name);
    await page.goto('/');
    expect(await playToLevelEnd(page, 'strong', touch)).toBe('过关');
    expect(await readNumber(page, '本关得分')).toBeGreaterThanOrEqual(1500);
    const before = await readGrid(page);
    await dragFrom(page, { row: 4, col: 4 }, 1, 0, touch).catch(() => undefined);
    expect(await readGrid(page)).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem('swap-match.level'))).toBe('2');
    await dialog(page).getByRole('button', { name: '下一关' })[touch ? 'tap' : 'click']();
    await expect(dialog(page)).toHaveCount(0);
    expect(await readNumber(page, '当前关卡')).toBe(2);
    expect(await readNumber(page, '本关得分')).toBe(0);
    expect(await readNumber(page, '剩余步数')).toBe(28);
  });

  test('weak strategy fails level 5; 重玩本关 restarts it', async ({ page }, info) => {
    const touch = isTouch(info.project.name);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('swap-match.level', '5');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('/');
    expect(await readNumber(page, '当前关卡')).toBe(5);
    expect(await playToLevelEnd(page, 'weak', touch)).toBe('本关失败');
    expect(await readNumber(page, '剩余步数')).toBe(0);
    expect(await readNumber(page, '本关得分')).toBeLessThan(2500);
    await dialog(page).getByRole('button', { name: '重玩本关' })[touch ? 'tap' : 'click']();
    await expect(dialog(page)).toHaveCount(0);
    expect(await readNumber(page, '当前关卡')).toBe(5);
    expect(await readNumber(page, '本关得分')).toBe(0);
    expect(await readNumber(page, '剩余步数')).toBe(22);
  });
});
