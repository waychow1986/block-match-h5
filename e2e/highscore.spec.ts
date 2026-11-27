import { expect, test } from '@playwright/test';
import { playOneSwap, readNumber, stat } from './helpers';

const KEY = 'swap-match.highScore';
const OLD_KEY = 'block-match.highScore';

test.describe('high score (AC-18)', () => {
  test('starts at 0, follows the level score and survives closing and reopening', async ({ page, context, isMobile }) => {
    await page.goto('/');
    await expect(stat(page, '历史最高分')).toHaveText('0');

    for (let i = 0; i < 3; i++) await playOneSwap(page, isMobile);
    const score = await readNumber(page, '本关得分');
    expect(score).toBeGreaterThan(0);
    await expect(stat(page, '历史最高分')).toHaveText(String(score));
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(String(score));

    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(stat(reopened, '历史最高分')).toHaveText(String(score));
    await expect(stat(reopened, '本关得分')).toHaveText('0');
  });

  test('a lower score does not overwrite a higher stored value; the old game key is ignored', async ({
    page,
    isMobile,
  }) => {
    await page.addInitScript(
      ([k, old]) => {
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem(k!, '999999');
          localStorage.setItem(old!, '1234567');
          sessionStorage.setItem('seeded', '1');
        }
      },
      [KEY, OLD_KEY],
    );
    await page.goto('/');
    await expect(stat(page, '历史最高分')).toHaveText('999999');
    await playOneSwap(page, isMobile);
    expect(await readNumber(page, '本关得分')).toBeGreaterThan(0);
    await page.reload();
    await expect(stat(page, '历史最高分')).toHaveText('999999');
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('999999');
    expect(await page.evaluate((k) => localStorage.getItem(k), OLD_KEY)).toBe('1234567');
  });
});
