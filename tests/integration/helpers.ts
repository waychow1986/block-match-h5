import { findMoves, type Grid, type Pos } from '../../src/game/board';
import { MAX_ROUNDS } from '../../src/game/cascade';
import { LEVEL_END_PAUSE_MS, MOVE_SETTLE_MS } from '../../src/ui/timing';

/** Tile button whose accessible name ends with "第{row+1}行第{col+1}列". */
export function tileIn(root: HTMLElement, p: Pos): HTMLButtonElement {
  const label = new RegExp(`第${p.row + 1}行第${p.col + 1}列$`);
  const el = [...root.querySelectorAll<HTMLButtonElement>('button.tile')].find((b) =>
    label.test(b.getAttribute('aria-label')!),
  );
  if (!el) throw new Error(`no tile at ${JSON.stringify(p)}`);
  return el;
}

export function pointer(el: Element, type: string, init: PointerEventInit = {}): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init }));
}

/** Full tap: down and up on the same element. */
export function tapEl(el: Element, init: PointerEventInit = {}): void {
  const doc = el.ownerDocument;
  const orig = doc.elementFromPoint;
  doc.elementFromPoint = () => el;
  pointer(el, 'pointerdown', init);
  pointer(el, 'pointerup', init);
  doc.elementFromPoint = orig;
}

/** Swaps two tiles by tapping one and then the other (A-11). */
export function tapSwap(root: HTMLElement, a: Pos, b: Pos): void {
  tapEl(tileIn(root, a));
  tapEl(tileIn(root, b));
}

/** First valid swap on the grid. */
export function firstMove(grid: Grid): [Pos, Pos] {
  const move = findMoves(grid)[0];
  if (!move) throw new Error('no valid swap');
  return move;
}

/** An adjacent swap that forms no line, or null. */
export function invalidSwap(grid: Grid): [Pos, Pos] | null {
  const valid = new Set(findMoves(grid).map(([a, b]) => `${a.row},${a.col}-${b.row},${b.col}`));
  for (let row = 0; row < grid.length; row++)
    for (let col = 0; col + 1 < grid[row]!.length; col++)
      if (!valid.has(`${row},${col}-${row},${col + 1}`)) return [{ row, col }, { row, col: col + 1 }];
  return null;
}

/** Enough fake time for any cascade sequence plus the level-end pause. */
export const SETTLE_ALL_MS = MAX_ROUNDS * MOVE_SETTLE_MS + LEVEL_END_PAUSE_MS + 10;
