import { expect, test } from '@playwright/test';
import { board } from './helpers';

test('AC-16 visible game title and "怎么玩" explanation', async ({ page }) => {
  await page.goto('/');
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toBeVisible();
  await expect(title).not.toHaveText('');
  const intro = page.getByRole('region', { name: '怎么玩' });
  await intro.scrollIntoViewIfNeeded();
  await expect(intro).toBeVisible();
  for (const words of ['交换', '相邻', '3 个及以上同色', '连成一线', '静音']) await expect(intro).toContainText(words);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('AC-17 page title and texts name no existing match-3 game', async ({ page }) => {
  await page.goto('/');
  const text = `${await page.title()}\n${await page.locator('body').innerText()}\n${(
    await page.locator('[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  ).join('\n')}`;
  for (const name of [
    'Candy Crush',
    '糖果传奇',
    '开心消消乐',
    'Bejeweled',
    '宝石迷阵',
    '梦幻家园',
    'Homescapes',
    'Gardenscapes',
    'Toon Blast',
    'Royal Match',
    '天天爱消除',
  ])
    expect(text.toLowerCase()).not.toContain(name.toLowerCase());
});

test('AC-8 AC-9 row, column and rainbow tiles look different from normal tiles and each other', async ({ page }) => {
  await page.goto('/');
  // Renders one tile of each kind with the page's own styles (special tiles are rare on a fresh board).
  const looks = await board(page).evaluate((b) => {
    const sample = b.querySelector('button')!;
    return (['normal', 'row', 'col', 'rainbow'] as const).map((kind) => {
      const el = sample.cloneNode() as HTMLElement;
      el.removeAttribute('aria-label');
      el.dataset.kind = kind;
      b.append(el);
      const s = getComputedStyle(el);
      const a = getComputedStyle(el, '::after');
      const look = { kind, bg: s.backgroundImage, after: `${a.content}|${a.backgroundImage}|${a.clipPath}|${a.backgroundColor}` };
      el.remove();
      return look;
    });
  });
  const [normal, row, col, rainbow] = looks;
  expect(normal!.after).toMatch(/^none\|/);
  // 180deg (top-to-bottom) is the default direction, which browsers omit from computed values.
  expect(row!.after).toMatch(/linear-gradient\((180deg|rgba)/);
  expect(col!.after).toContain('linear-gradient(90deg');
  expect(rainbow!.bg).toContain('conic-gradient');
  expect(rainbow!.after).toContain('polygon');
  expect(rainbow!.after).toContain('rgb(255, 255, 255)');
  expect(new Set(looks.map((l) => `${l.bg}#${l.after}`)).size).toBe(4);
});
