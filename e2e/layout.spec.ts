import { expect, test, type Page } from '@playwright/test';
import { activate, board, findSwap, readGrid, readNumber, tileAt, type Cell } from './helpers';

interface Metrics {
  scrollWidth: number;
  clientWidth: number;
  scrollX: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  vh: number;
  tilesInside: boolean;
  tiles: number;
}

async function measure(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    window.scrollTo(200, 0);
    const b = document.querySelector('[role="group"][aria-label="棋盘"]')!.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('[role="group"][aria-label="棋盘"] button')].map((t) => t.getBoundingClientRect());
    const vw = document.documentElement.clientWidth;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      scrollX: window.scrollX,
      left: b.left,
      right: b.right,
      top: b.top,
      bottom: b.bottom,
      width: b.width,
      vh: window.innerHeight,
      tilesInside: tiles.every((r) => r.left >= -0.5 && r.right <= vw + 0.5 && r.bottom <= window.innerHeight + 0.5),
      tiles: tiles.length,
    };
  });
}

async function expectFits(page: Page): Promise<Metrics> {
  const m = await measure(page);
  expect(m.tiles).toBe(64);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  expect(m.scrollX).toBe(0);
  expect(m.left).toBeGreaterThanOrEqual(0);
  expect(m.right).toBeLessThanOrEqual(m.clientWidth);
  expect(m.top).toBeGreaterThanOrEqual(0);
  expect(m.bottom).toBeLessThanOrEqual(m.vh);
  expect(m.tilesInside).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  await expect(page.getByRole('status', { name: '本关得分', exact: true })).toBeInViewport();
  return m;
}

test('AC-22 desktop windows: the whole board fits, scales with the window, no horizontal scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop sizes');
  const widths: number[] = [];
  for (const size of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    widths.push((await expectFits(page)).width);
  }
  expect(widths[2]!).toBeLessThan(widths[0]!);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const grid = await readGrid(page);
  for (const size of [
    { width: 800, height: 600 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    const m = await expectFits(page);
    expect(m.width).toBeCloseTo(widths[size.width === 800 ? 2 : 0]!, 0);
    expect(await readGrid(page)).toEqual(grid);
  }
});

test('AC-22 phone portrait: the whole board fits and a sideways swipe does not scroll the page', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone sizes');
  const widths: number[] = [];
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    widths.push((await expectFits(page)).width);
    const cdp = await page.context().newCDPSession(page);
    const y = size.height - 20;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: size.width - 20, y }] });
    for (let i = 1; i <= 5; i++)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: size.width - 20 - i * 60, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  }
  expect(widths[1]!).toBeLessThanOrEqual(widths[0]!);
});

test('AC-22 a single tap on a tile removes nothing and there is no switch to another game mode', async ({ page }, info) => {
  const touch = info.project.name === 'mobile';
  await page.goto('/');
  const grid = await readGrid(page);
  // A tile with at least two same-colour neighbours (would have been removed by the old tap-to-clear game).
  let target: Cell | null = null;
  for (let row = 1; row <= 8 && !target; row++)
    for (let col = 1; col <= 8 && !target; col++) {
      const c = grid[row - 1]![col - 1]!.color;
      const same = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ].filter(([r, q]) => grid[r! - 1]?.[q! - 1]?.color === c).length;
      if (same >= 2) target = { row, col };
    }
  target ??= findSwap(grid)![0];
  const score = await readNumber(page, '本关得分');
  const moves = await readNumber(page, '剩余步数');
  await activate(page, tileAt(page, target), touch);
  await page.waitForTimeout(2000);
  expect(await readGrid(page)).toEqual(grid);
  expect(await readNumber(page, '本关得分')).toBe(score);
  expect(await readNumber(page, '剩余步数')).toBe(moves);
  await expect(tileAt(page, target)).toHaveAttribute('aria-pressed', 'true');
  await expect(board(page).locator('[aria-pressed="true"]')).toHaveCount(1);
  const names = await page
    .locator('button, a')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-label') ?? ''} ${e.textContent ?? ''}`));
  expect(names.filter((n) => /玩法|模式/.test(n))).toEqual([]);
});
