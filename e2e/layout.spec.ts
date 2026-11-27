import { expect, test, type Page } from '@playwright/test';
import { activate, board, findGroup, readGrid, readNumber, stat, tile, waitSettled } from './helpers';

async function expectFits(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    window.scrollTo(100, 0);
    const b = document.querySelector('[role="group"][aria-label="棋盘"]')!.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('.board button.tile')].map((t) => t.getBoundingClientRect());
    const vw = document.documentElement.clientWidth;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      scrollX: window.scrollX,
      board: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width },
      tilesInside: tiles.every((r) => r.left >= -0.5 && r.right <= vw + 0.5),
      vh: window.innerHeight,
    };
  });
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  expect(m.scrollX).toBe(0);
  expect(m.board.left).toBeGreaterThanOrEqual(0);
  expect(m.board.right).toBeLessThanOrEqual(m.clientWidth);
  expect(m.board.top).toBeGreaterThanOrEqual(0);
  expect(m.board.bottom).toBeLessThanOrEqual(m.vh);
  expect(m.tilesInside).toBe(true);
  for (const name of ['当前分数', '本关目标分数', '当前关卡', '历史最高分'] as const) await expect(stat(page, name)).toBeVisible();
  await expect(page.getByRole('button', { name: '静音', exact: true })).toBeVisible();
}

const boardWidth = async (page: Page): Promise<number> => (await board(page).boundingBox())!.width;

test('AC-15 desktop window sizes: fits, scales and stays playable after resizing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop sizes');
  const widths: number[] = [];
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 600, height: 800 },
    { width: 375, height: 700 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expectFits(page);
    widths.push(await boardWidth(page));
  }
  expect(widths.at(-1)!).toBeLessThan(widths[0]!);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  for (let i = 0; i < 3; i++) {
    const g = await readGrid(page);
    await activate(page, tile(page, g, findGroup(g)!), false);
    await waitSettled(page);
  }
  const grid = await readGrid(page);
  const score = await readNumber(page, '当前分数');
  for (const size of [
    { width: 600, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await expectFits(page);
    expect(await readGrid(page)).toEqual(grid);
    expect(await readNumber(page, '当前分数')).toBe(score);
    expect(await readNumber(page, '当前关卡')).toBe(1);
  }
  await activate(page, tile(page, grid, findGroup(grid)!), false);
  await waitSettled(page);
  expect(await readNumber(page, '当前分数')).toBeGreaterThan(score);
});

test('AC-15 phone portrait sizes: fits, no horizontal scroll, mute and tap work', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone sizes');
  for (const size of [
    { width: 412, height: 915 },
    { width: 360, height: 740 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expectFits(page);
    const mute = page.getByRole('button', { name: '静音', exact: true });
    await mute.tap();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    const grid = await readGrid(page);
    await tile(page, grid, findGroup(grid)!).tap();
    await waitSettled(page);
    expect(await readNumber(page, '当前分数')).toBeGreaterThan(0);
    await expectFits(page);
  }
});
