import { expect, type Locator, type Page } from '@playwright/test';

export const COLOR_NAMES = ['红', '黄', '绿', '蓝', '紫', '橙'] as const;
export const SIZE = 8;

export type Kind = 'normal' | 'row' | 'col' | 'rainbow';
export interface TileInfo {
  kind: Kind;
  /** Colour name (红…橙); null for rainbow tiles. */
  color: string | null;
}
/** grid[row-1][col-1], row 1 = top, as read from accessible names. */
export type Grid = (TileInfo | null)[][];
export interface Cell {
  row: number;
  col: number;
}

export type StatName = '当前关卡' | '本关得分' | '本关目标分数' | '剩余步数' | '历史最高分';

export const board = (page: Page): Locator => page.getByRole('group', { name: '棋盘' });
export const stat = (page: Page, name: StatName): Locator => page.getByRole('status', { name, exact: true });
export const dialog = (page: Page): Locator => page.locator('[role="dialog"][aria-modal="true"]');

/** The tile button at a cell, matched by the position part of its accessible name. */
export const tileAt = (page: Page, c: Cell): Locator =>
  board(page).getByRole('button', { name: new RegExp(`，第${c.row}行第${c.col}列$`) });

export async function readNumber(page: Page, name: StatName): Promise<number> {
  return Number(await stat(page, name).textContent());
}

const NAME = /^(?:(.)色(方块|横向消除方块|纵向消除方块)|(彩色消除方块))，第(\d+)行第(\d+)列$/;

/** Reads the board purely from tile accessible names. */
export async function readGrid(page: Page): Promise<Grid> {
  const labels = await board(page)
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const grid: Grid = Array.from({ length: SIZE }, () => Array<TileInfo | null>(SIZE).fill(null));
  for (const label of labels) {
    const m = NAME.exec(label);
    if (!m) continue;
    const kind: Kind = m[3] ? 'rainbow' : m[2] === '横向消除方块' ? 'row' : m[2] === '纵向消除方块' ? 'col' : 'normal';
    grid[Number(m[4]) - 1]![Number(m[5]) - 1] = { kind, color: m[1] ?? null };
  }
  return grid;
}

function hasLine(grid: Grid): boolean {
  const color = (r: number, c: number): string | null => grid[r]?.[c]?.color ?? null;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const k = color(r, c);
      if (k === null) continue;
      if (k === color(r, c + 1) && k === color(r, c + 2)) return true;
      if (k === color(r + 1, c) && k === color(r + 2, c)) return true;
    }
  return false;
}

/** Whether swapping two adjacent cells is a valid move (TD-003). */
export function isValidSwap(grid: Grid, a: Cell, b: Cell): boolean {
  const ta = grid[a.row - 1]?.[a.col - 1];
  const tb = grid[b.row - 1]?.[b.col - 1];
  if (!ta || !tb || Math.abs(a.row - b.row) + Math.abs(a.col - b.col) !== 1) return false;
  if (ta.kind === 'rainbow' || tb.kind === 'rainbow') return ta.kind !== tb.kind;
  const next = grid.map((row) => row.slice());
  next[a.row - 1]![a.col - 1] = tb;
  next[b.row - 1]![b.col - 1] = ta;
  return hasLine(next);
}

/** First valid swap, row-major, rightward before downward. */
export function findSwap(grid: Grid): [Cell, Cell] | null {
  for (let row = 1; row <= SIZE; row++)
    for (let col = 1; col <= SIZE; col++)
      for (const b of [
        { row, col: col + 1 },
        { row: row + 1, col },
      ])
        if (isValidSwap(grid, { row, col }, b)) return [{ row, col }, b];
  return null;
}

export async function activate(page: Page, target: Locator, touch: boolean): Promise<void> {
  if (touch) await target.tap();
  else await target.click();
}

/** Swaps two adjacent tiles by tapping/clicking one and then the other (A-11). */
export async function tapSwap(page: Page, a: Cell, b: Cell, touch: boolean): Promise<void> {
  await activate(page, tileAt(page, a), touch);
  await activate(page, tileAt(page, b), touch);
}

/** Waits until the move settled: board idle, or an end-of-level dialog is shown. */
export async function waitSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => (await dialog(page).count()) > 0 || (await board(page).getAttribute('aria-busy')) === 'false', {
      timeout: 15_000,
    })
    .toBe(true);
}

/** Plays the first valid swap and waits for the board to settle. */
export async function playOneSwap(page: Page, touch: boolean): Promise<void> {
  const move = findSwap(await readGrid(page));
  expect(move, 'a valid swap exists').not.toBeNull();
  await tapSwap(page, move![0], move![1], touch);
  await waitSettled(page);
}

/** Tiles removed in the first round by swapping a and b (lines through the two cells; rainbow counts high). */
export function swapSize(grid: Grid, a: Cell, b: Cell): number {
  const ta = grid[a.row - 1]?.[a.col - 1];
  const tb = grid[b.row - 1]?.[b.col - 1];
  if (!ta || !tb) return 0;
  if (ta.kind === 'rainbow' || tb.kind === 'rainbow') return 2 * SIZE;
  const next = grid.map((row) => row.slice());
  next[a.row - 1]![a.col - 1] = tb;
  next[b.row - 1]![b.col - 1] = ta;
  const color = (r: number, c: number): string | null => next[r]?.[c]?.color ?? null;
  const run = (c: Cell, dr: number, dc: number): number => {
    const k = color(c.row - 1, c.col - 1);
    let n = 0;
    for (let r = c.row - 1 + dr, q = c.col - 1 + dc; k !== null && color(r, q) === k; r += dr, q += dc) n++;
    return n;
  };
  let total = 0;
  for (const c of [a, b]) {
    const h = run(c, 0, 1) + run(c, 0, -1) + 1;
    const v = run(c, 1, 0) + run(c, -1, 0) + 1;
    total += (h >= 3 ? h : 0) + (v >= 3 ? v : 0);
  }
  return total;
}

/** All valid swaps (rightward and downward pairs). */
export function allSwaps(grid: Grid): [Cell, Cell][] {
  const out: [Cell, Cell][] = [];
  for (let row = 1; row <= SIZE; row++)
    for (let col = 1; col <= SIZE; col++)
      for (const b of [
        { row, col: col + 1 },
        { row: row + 1, col },
      ])
        if (isValidSwap(grid, { row, col }, b)) out.push([{ row, col }, b]);
  return out;
}

/** "strong" picks the swap removing most tiles (lowest on the board on ties); "weak" the fewest (highest on ties). */
export function pickSwap(grid: Grid, strategy: 'strong' | 'weak'): [Cell, Cell] | null {
  const rank = (m: [Cell, Cell]): number => swapSize(grid, m[0], m[1]) * 100 + m[1].row;
  const swaps = allSwaps(grid).sort((x, y) => rank(x) - rank(y));
  return (strategy === 'strong' ? swaps.at(-1) : swaps[0]) ?? null;
}

/** Centre of a tile in page coordinates. */
export async function centreOf(page: Page, c: Cell): Promise<{ x: number; y: number; size: number }> {
  const box = (await tileAt(page, c).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, size: box.width };
}

/**
 * Drags (mouse) or swipes (touch, via CDP touch events) from a tile by (dCol, dRow)
 * tiles and releases (TD-011).
 */
export async function dragFrom(page: Page, from: Cell, dCol: number, dRow: number, touch: boolean): Promise<void> {
  const s = await centreOf(page, from);
  const to = { x: s.x + dCol * s.size, y: s.y + dRow * s.size };
  if (!touch) {
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y }] });
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: s.x + ((to.x - s.x) * i) / 6, y: s.y + ((to.y - s.y) * i) / 6 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Drags/swipes tile a onto its neighbour b. */
export async function dragSwap(page: Page, a: Cell, b: Cell, touch: boolean): Promise<void> {
  await dragFrom(page, a, b.col - a.col, b.row - a.row, touch);
}

/** Plays swaps with the strategy until a prompt shows; returns its name ("过关" / "本关失败"). */
export async function playToLevelEnd(page: Page, strategy: 'strong' | 'weak', touch: boolean, limit = 40): Promise<string> {
  for (let i = 0; i < limit; i++) {
    if ((await dialog(page).count()) > 0) break;
    const move = pickSwap(await readGrid(page), strategy);
    expect(move, 'a valid swap exists').not.toBeNull();
    if (i % 2 === 0) await dragSwap(page, move![0], move![1], touch);
    else await tapSwap(page, move![0], move![1], touch);
    await waitSettled(page);
  }
  await expect(dialog(page)).toHaveCount(1);
  return (await dialog(page).getAttribute('aria-label')) ?? '';
}
