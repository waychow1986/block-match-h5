import { expect, test, type Page } from '@playwright/test';
import { board, dragSwap, findSwap, isValidSwap, readGrid, readNumber, tileAt, waitSettled, type Cell } from './helpers';

const isTouch = (name: string): boolean => name === 'mobile';
const hinted = (page: Page) => board(page).locator('[data-state="hint"]');

interface Sample {
  t: number;
  x: number;
  y: number;
  minOpacity: number;
  floats: string[];
}

/** Samples, on every animation frame for `ms`, a tile's position plus the lowest tile opacity and "+N" floats. */
async function startSampling(page: Page, cell: Cell, ms: number): Promise<void> {
  const label = await tileAt(page, cell).getAttribute('aria-label');
  await page.evaluate(
    ({ label, ms }) => {
      const out: Sample[] = [];
      (window as unknown as { __samples: Sample[] }).__samples = out;
      const el = [...document.querySelectorAll('.tile')].find((e) => e.getAttribute('aria-label') === label)!;
      const t0 = performance.now();
      const tick = (): void => {
        const r = el.getBoundingClientRect();
        const ops = [...document.querySelectorAll('.tile')].map((e) => Number(getComputedStyle(e).opacity));
        const floats = [...document.querySelectorAll('.score-float')].map((e) => e.textContent ?? '');
        out.push({ t: performance.now() - t0, x: r.x, y: r.y, minOpacity: Math.min(...ops), floats });
        if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { label, ms },
  );
}

async function samples(page: Page): Promise<Sample[]> {
  return page.evaluate(() => (window as unknown as { __samples: Sample[] }).__samples);
}

test.describe('AC-19 swap animation', () => {
  test('valid swap moves continuously, fades removed tiles and shows +N; invalid swap bounces', async ({ page }, info) => {
    const touch = isTouch(info.project.name);
    await page.goto('/');
    const grid = await readGrid(page);
    const [a, b] = findSwap(grid)!;
    const start = (await tileAt(page, a).boundingBox())!;
    const target = (await tileAt(page, b).boundingBox())!;
    const score0 = await readNumber(page, '本关得分');

    await startSampling(page, a, 1500);
    await dragSwap(page, a, b, touch);
    await waitSettled(page);
    await page.waitForTimeout(800);
    const s = await samples(page);
    const axis = a.row === b.row ? 'x' : 'y';
    const from = axis === 'x' ? start.x : start.y;
    const to = axis === 'x' ? target.x : target.y;
    const lo = Math.min(from, to) + 2;
    const hi = Math.max(from, to) - 2;
    expect(s.some((p) => p[axis] > lo && p[axis] < hi), 'an intermediate position during the swap').toBe(true);
    expect(s.some((p) => p.minOpacity > 0.05 && p.minOpacity < 0.95), 'removed tiles fade').toBe(true);
    const floats = new Set(s.flatMap((p) => p.floats));
    expect([...floats].some((f) => /^\+\d+$/.test(f))).toBe(true);
    expect(await readNumber(page, '本关得分')).toBeGreaterThan(score0);

    // Invalid swap: moves part-way and returns to its start.
    const g2 = await readGrid(page);
    let bad: [Cell, Cell] | null = null;
    for (let row = 1; row <= 8 && !bad; row++)
      for (let col = 1; col < 8 && !bad; col++) {
        const x = { row, col };
        const y = { row, col: col + 1 };
        if (g2[row - 1]![col - 1]?.kind === 'normal' && g2[row - 1]![col]?.kind === 'normal' && !isValidSwap(g2, x, y))
          bad = [x, y];
      }
    expect(bad).not.toBeNull();
    const home = (await tileAt(page, bad![0]).boundingBox())!;
    const width = home.width;
    await startSampling(page, bad![0], 800);
    await dragSwap(page, bad![0], bad![1], touch);
    await waitSettled(page);
    await page.waitForTimeout(400);
    const s2 = await samples(page);
    expect(s2.some((p) => p.x > home.x + 2 && p.x < home.x + width - 2), 'an intermediate bounce position').toBe(true);
    expect(Math.abs(s2.at(-1)!.x - home.x)).toBeLessThan(1);
    expect(await readGrid(page)).toEqual(g2);
  });
});

test.describe('AC-15 hint', () => {
  test('after 5 s without input a valid swap pair is hinted; pressing clears it', async ({ page }, info) => {
    const touch = isTouch(info.project.name);
    await page.clock.install();
    await page.goto('/');
    await expect(board(page).getByRole('button')).toHaveCount(64);
    await page.clock.runFor(4000);
    await expect(hinted(page)).toHaveCount(0);
    await page.clock.runFor(2000);
    await expect(hinted(page)).toHaveCount(2);
    const cells = await hinted(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    const pos = cells.map((l) => {
      const m = /第(\d+)行第(\d+)列$/.exec(l)!;
      return { row: Number(m[1]), col: Number(m[2]) };
    });
    expect(isValidSwap(await readGrid(page), pos[0]!, pos[1]!)).toBe(true);
    await expect(hinted(page).first()).toHaveAttribute('aria-describedby', /.+/);

    await tileAt(page, { row: 8, col: 8 })[touch ? 'tap' : 'click']();
    await expect(hinted(page)).toHaveCount(0);
    await page.clock.runFor(4000);
    await expect(hinted(page)).toHaveCount(0);
    await page.clock.runFor(2000);
    await expect(hinted(page)).toHaveCount(2);
  });
});
