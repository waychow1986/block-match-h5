import type { Board, MoveResult, Pos } from '../game/board';
import { ROWS } from '../game/levels';
import { animate } from './anim';
import { APPEAR_MS, FALL_MS, MOVE_SETTLE_MS, REMOVE_MS, SHIFT_MS } from './timing';

export const COLOR_NAMES = ['红', '黄', '绿', '蓝', '紫'] as const;

export function tileLabel(color: number, pos: Pos): string {
  return `${COLOR_NAMES[color]}色方块，第${ROWS - pos.row}行第${pos.col + 1}列`;
}

export type Schedule = (ms: number, fn: () => void) => void;

/**
 * Renders tiles as absolutely positioned buttons keyed by tile id (TD-002).
 * Accessible names and hit-testing always reflect the final board; the visual
 * position (CSS vars --c/--r) is staged through remove → fall → shift (TD-007).
 */
export class BoardView {
  readonly element: HTMLElement;
  private tiles = new Map<number, HTMLButtonElement>();
  private positions = new Map<HTMLElement, Pos>();
  private lit: HTMLElement[] = [];

  constructor(
    private readonly doc: Document,
    private readonly schedule: Schedule = (ms, fn) => void setTimeout(fn, ms),
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'board';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', '棋盘');
    this.element.setAttribute('aria-busy', 'false');
  }

  setBusy(busy: boolean): void {
    this.element.setAttribute('aria-busy', String(busy));
  }

  /** Board position of a tile element, or null when it is not a tile. */
  positionOf(el: Element | null): Pos | null {
    const tile = el?.closest?.('.tile');
    return tile ? (this.positions.get(tile as HTMLElement) ?? null) : null;
  }

  /** Marks exactly the given tiles as highlighted (AC-11); an empty list clears. */
  highlight(ids: number[]): void {
    for (const el of this.lit) el.removeAttribute('data-state');
    this.lit = ids.flatMap((id) => this.tiles.get(id) ?? []);
    for (const el of this.lit) el.dataset.state = 'highlighted';
  }

  /**
   * Makes the DOM match the board. Without `move` it jumps straight to the result
   * (new boards get an appear animation); with `move` removed tiles fade out and
   * moved tiles stay at `from`, then go to `afterFall` and `to` on the schedule.
   */
  sync(board: Board, move?: MoveResult): void {
    this.highlight([]);
    const alive = new Set<number>();
    const staged = new Map((move?.moved ?? []).map((m) => [m.id, m]));
    board.forEach((col, c) =>
      col.forEach((tile, r) => {
        alive.add(tile.id);
        let el = this.tiles.get(tile.id);
        if (!el) {
          el = this.doc.createElement('button');
          el.type = 'button';
          el.className = `tile color-${tile.color} appear`;
          el.dataset.color = String(tile.color);
          this.tiles.set(tile.id, el);
          this.element.append(el);
          const created = el;
          this.schedule(APPEAR_MS, () => created.classList.remove('appear'));
        }
        const pos = { col: c, row: r };
        this.positions.set(el, pos);
        if (!staged.has(tile.id)) place(el, pos);
        el.setAttribute('aria-label', tileLabel(tile.color, pos));
      }),
    );
    for (const [id, el] of this.tiles) {
      if (alive.has(id)) continue;
      this.tiles.delete(id);
      this.positions.delete(el);
      if (move) this.vanish(el);
      else el.remove();
    }
    if (!move || staged.size === 0) return;
    const els = [...staged.values()].flatMap((m) => {
      const el = this.tiles.get(m.id);
      return el ? [{ el, m }] : [];
    });
    this.schedule(REMOVE_MS, () => {
      this.element.style.setProperty('--move-ms', `${FALL_MS}ms`);
      for (const { el, m } of els) place(el, m.afterFall);
    });
    this.schedule(REMOVE_MS + FALL_MS, () => {
      this.element.style.setProperty('--move-ms', `${SHIFT_MS}ms`);
      for (const { el, m } of els) place(el, m.to);
    });
    this.schedule(MOVE_SETTLE_MS, () => this.element.style.removeProperty('--move-ms'));
  }

  /** Scale + fade out, then drop from the DOM; hidden from AT and hit-testing meanwhile. */
  private vanish(el: HTMLElement): void {
    el.classList.remove('tile', 'appear');
    el.classList.add('tile-ghost');
    el.removeAttribute('data-state');
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    animate(el, [{ scale: '1', opacity: 1 }, { scale: '0.2', opacity: 0 }], REMOVE_MS);
    this.schedule(REMOVE_MS, () => el.remove());
  }
}

function place(el: HTMLElement, pos: Pos): void {
  el.style.setProperty('--c', String(pos.col));
  el.style.setProperty('--r', String(ROWS - 1 - pos.row));
}
