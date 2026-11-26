import { findGroup, type Board, type Pos } from '../../src/game/board';

export function tileIn(root: HTMLElement, p: Pos): HTMLButtonElement {
  const label = new RegExp(`第${10 - p.row}行第${p.col + 1}列$`);
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

export function findMove(b: Board, min = 2): Pos | null {
  for (let c = 0; c < b.length; c++)
    for (let r = 0; r < b[c]!.length; r++) if (findGroup(b, { col: c, row: r }).length >= min) return { col: c, row: r };
  return null;
}

export function findSingle(b: Board): Pos | null {
  for (let c = 0; c < b.length; c++)
    for (let r = 0; r < b[c]!.length; r++) if (findGroup(b, { col: c, row: r }).length === 1) return { col: c, row: r };
  return null;
}

/** A removable group that has at least one tile above it in some column (so something falls). */
export function findMoveWithFall(b: Board): Pos | null {
  for (let c = 0; c < b.length; c++)
    for (let r = 0; r < b[c]!.length; r++) {
      const g = findGroup(b, { col: c, row: r });
      if (g.length >= 2 && g.some((p) => p.row < b[p.col]!.length - 1 && !g.some((q) => q.col === p.col && q.row > p.row)))
        return { col: c, row: r };
    }
  return null;
}

export function highlighted(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-state="highlighted"]')];
}
