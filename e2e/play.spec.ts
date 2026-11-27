import { expect, test } from '@playwright/test';
import { activate, board, findGroup, groupAt, playToLevelEnd, readGrid, readNumber, stat, tile, waitSettled } from './legacyHelpers';

test.describe('play (AC-1..AC-7)', () => {
  test('plays from opening the page to the end of the level', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(board(page).getByRole('button')).toHaveCount(100);
    await expect(stat(page, '当前关卡')).toHaveText('1');
    await expect(stat(page, '当前分数')).toHaveText('0');
    await expect(stat(page, '本关目标分数')).toHaveText('2000');

    const grid = await readGrid(page);
    const cell = findGroup(grid)!;
    const n = groupAt(grid, cell).length;
    await activate(page, tile(page, grid, cell), isMobile);
    await waitSettled(page);
    await expect(stat(page, '当前分数')).toHaveText(String(10 * n * n));
    await expect(board(page).getByRole('button')).toHaveCount(100 - n);

    const outcome = await playToLevelEnd(page, isMobile);
    expect(['过关', '游戏结束']).toContain(outcome);
    const score = await readNumber(page, '当前分数');
    const dlg = page.getByRole('dialog', { name: outcome });
    await expect(dlg).toContainText(String(score));
    if (outcome === '过关') {
      expect(score).toBeGreaterThanOrEqual(2000);
      await activate(page, dlg.getByRole('button', { name: '下一关' }), isMobile);
      await expect(stat(page, '当前关卡')).toHaveText('2');
      await expect(stat(page, '本关目标分数')).toHaveText('4500');
    } else {
      await activate(page, dlg.getByRole('button', { name: '重新开始' }), isMobile);
      await expect(stat(page, '当前关卡')).toHaveText('1');
      await expect(stat(page, '当前分数')).toHaveText('0');
    }
    await expect(board(page).getByRole('button')).toHaveCount(100);
    await expect(board(page)).toHaveAttribute('aria-busy', 'false');
  });

  test('a single tile does nothing', async ({ page, isMobile }) => {
    await page.goto('/');
    const grid = await readGrid(page);
    const cell = findGroup(grid, (n) => n === 1);
    test.skip(!cell, 'board has no single tile');
    await activate(page, tile(page, grid, cell!), isMobile);
    await page.waitForTimeout(300);
    expect(await readGrid(page)).toEqual(grid);
    await expect(stat(page, '当前分数')).toHaveText('0');
  });

  test('pressing a group and releasing elsewhere does not remove it', async ({ page }) => {
    await page.goto('/');
    const grid = await readGrid(page);
    const cell = findGroup(grid)!;
    const from = (await tile(page, grid, cell).boundingBox())!;
    const bb = (await board(page).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width + 20, bb.y + bb.height + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await readGrid(page)).toEqual(grid);
    await expect(stat(page, '当前分数')).toHaveText('0');
  });
});
