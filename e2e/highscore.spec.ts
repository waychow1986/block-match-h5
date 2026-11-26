import { expect, test } from '@playwright/test';
import { activate, findGroup, readGrid, readNumber, stat, tile, waitSettled } from './helpers';

const KEY = 'block-match.highScore';

test.describe('high score (AC-10)', () => {
  test('starts at 0, follows the score and survives closing and reopening', async ({ page, context, isMobile }) => {
    await page.goto('/');
    await expect(stat(page, '历史最高分')).toHaveText('0');

    for (let i = 0; i < 3; i++) {
      const grid = await readGrid(page);
      await activate(page, tile(page, grid, findGroup(grid)!), isMobile);
      await waitSettled(page);
    }
    const score = await readNumber(page, '当前分数');
    expect(score).toBeGreaterThan(0);
    await expect(stat(page, '历史最高分')).toHaveText(String(score));

    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(stat(reopened, '历史最高分')).toHaveText(String(score));
    await expect(stat(reopened, '当前分数')).toHaveText('0');
  });

  test('a lower score does not overwrite a higher stored value', async ({ page, isMobile }) => {
    await page.addInitScript(([k]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(k!, '999999');
        sessionStorage.setItem('seeded', '1');
      }
    }, [KEY]);
    await page.goto('/');
    await expect(stat(page, '历史最高分')).toHaveText('999999');
    const grid = await readGrid(page);
    await activate(page, tile(page, grid, findGroup(grid)!), isMobile);
    await waitSettled(page);
    expect(await readNumber(page, '当前分数')).toBeGreaterThan(0);
    await page.reload();
    await expect(stat(page, '历史最高分')).toHaveText('999999');
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('999999');
  });
});
