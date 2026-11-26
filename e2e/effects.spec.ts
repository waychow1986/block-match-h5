import { expect, test, type Page } from '@playwright/test';
import { board, findGroup, groupAt, readGrid, readNumber, tile, waitSettled, type Cell, type Grid } from './helpers';

const highlightedCount = (page: Page): Promise<number> => board(page).locator('[data-state="highlighted"]').count();

/** A removable group whose topmost cell in some column has a tile above it (so that tile falls). */
function groupWithFall(grid: Grid): { cell: Cell; above: Cell } | null {
  for (let row = 1; row <= 10; row++)
    for (let col = 1; col <= 10; col++) {
      const g = groupAt(grid, { row, col });
      if (g.length < 2) continue;
      for (const c of g) {
        const isTop = !g.some((o) => o.col === c.col && o.row < c.row);
        if (isTop && c.row > 1 && grid[c.row - 2]![c.col - 1]) return { cell: c, above: { row: c.row - 1, col: c.col } };
      }
    }
  return null;
}

test.describe('AC-11 highlighting', () => {
  test('mouse hover and press highlight the whole group; singles and release outside do not', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'mouse only');
    await page.goto('/');
    const grid = await readGrid(page);
    const start = findGroup(grid)!;
    const group = groupAt(grid, start);
    const target = tile(page, grid, start);
    const before = await target.evaluate((el) => getComputedStyle(el).filter);

    await target.hover();
    await expect.poll(() => highlightedCount(page)).toBe(group.length);
    for (const c of group) await expect(tile(page, grid, c)).toHaveAttribute('data-state', 'highlighted');
    expect(await target.evaluate((el) => getComputedStyle(el).filter)).not.toBe(before);

    const single = findGroup(grid, (n) => n === 1)!;
    await tile(page, grid, single).hover();
    await expect.poll(() => highlightedCount(page)).toBe(0);
    await page.mouse.down();
    expect(await highlightedCount(page)).toBe(0);
    await page.mouse.up();

    await target.hover();
    await page.mouse.down();
    await expect.poll(() => highlightedCount(page)).toBe(group.length);
    await page.mouse.move(2, 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => highlightedCount(page)).toBe(0);
    expect(await readNumber(page, '当前分数')).toBe(0);
  });

  test('touch press-and-hold highlights the group; lifting removes it', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'touch only');
    await page.goto('/');
    const grid = await readGrid(page);
    const start = findGroup(grid)!;
    const n = groupAt(grid, start).length;
    const box = (await tile(page, grid, start).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const point = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
    await page.waitForTimeout(500);
    expect(await highlightedCount(page)).toBe(n);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitSettled(page);
    expect(await readNumber(page, '当前分数')).toBe(10 * n * n);
    expect(await highlightedCount(page)).toBe(0);
  });
});

test('AC-12 removal, fall and score are animated through intermediate states', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop sampling');
  await page.goto('/');
  const grid = await readGrid(page);
  const pick = groupWithFall(grid)!;
  const n = groupAt(grid, pick.cell).length;
  const removed = tile(page, grid, pick.cell);
  const falling = tile(page, grid, pick.above);
  await removed.evaluate((r, f) => {
    const w = window as unknown as { samples: { opacity: number; top: number; float: string | null }[] };
    w.samples = [];
    const t0 = performance.now();
    const step = (): void => {
      w.samples.push({
        opacity: r.isConnected ? Number(getComputedStyle(r).opacity) : -1,
        top: (f as HTMLElement).getBoundingClientRect().top,
        float: document.querySelector('.score-float')?.textContent ?? null,
      });
      if (performance.now() - t0 < 1500) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, await falling.elementHandle());
  const topBefore = (await falling.boundingBox())!.y;
  await removed.click();
  await page.waitForTimeout(1600);
  const samples = await page.evaluate(
    () => (window as unknown as { samples: { opacity: number; top: number; float: string | null }[] }).samples,
  );
  const topAfter = samples.at(-1)!.top;
  expect(topAfter).toBeGreaterThan(topBefore + 1);
  expect(samples.some((s) => s.opacity > 0 && s.opacity < 1)).toBe(true);
  expect(samples.some((s) => s.top > topBefore + 1 && s.top < topAfter - 1)).toBe(true);
  expect(samples.some((s) => s.float === `+${10 * n * n}`)).toBe(true);
});
