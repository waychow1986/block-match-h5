import type { Grid, Pos, Tile } from '../game/board';
import { APPEAR_MS } from './timing';

export const COLOR_NAMES = ['红', '黄', '绿', '蓝', '紫', '橙'] as const;

/** Accessible tile name; rows and columns count from 1 at the top-left (design §接口契约). */
export function tileLabel(tile: Pick<Tile, 'kind' | 'color'>, pos: Pos): string {
  const where = `第${pos.row + 1}行第${pos.col + 1}列`;
  if (tile.kind === 'rainbow') return `彩色消除方块，${where}`;
  const color = COLOR_NAMES[tile.color ?? 0];
  if (tile.kind === 'row') return `${color}色横向消除方块，${where}`;
  if (tile.kind === 'col') return `${color}色纵向消除方块，${where}`;
  return `${color}色方块，${where}`;
}

let hintTextCount = 0;

export type Schedule = (ms: number, fn: () => void) => void;

/**
 * Renders tiles as absolutely positioned buttons keyed by tile id (TD-002).
 * Accessible names, data attributes and hit-testing always reflect the grid
 * passed to the last `sync`.
 */
export class BoardView {
  readonly element: HTMLElement;
  private tiles = new Map<number, HTMLButtonElement>();
  private positions = new Map<HTMLElement, Pos>();
  private readonly hintText: HTMLElement;

  constructor(
    private readonly doc: Document,
    private readonly schedule: Schedule = (ms, fn) => void setTimeout(fn, ms),
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'board';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', '棋盘');
    this.element.setAttribute('aria-busy', 'false');
    this.hintText = doc.createElement('span');
    this.hintText.id = `hint-text-${++hintTextCount}`;
    this.hintText.className = 'visually-hidden';
    this.hintText.textContent = '可交换提示';
    this.element.append(this.hintText);
  }

  setBusy(busy: boolean): void {
    this.element.setAttribute('aria-busy', String(busy));
  }

  /** Board position of a tile element, or null when it is not a tile. */
  positionOf(el: Element | null): Pos | null {
    const tile = el?.closest?.('.tile');
    return tile ? (this.positions.get(tile as HTMLElement) ?? null) : null;
  }

  /** Marks the tile with the given id as selected (A-11); null clears. */
  select(id: number | null): void {
    for (const [tid, el] of this.tiles) el.setAttribute('aria-pressed', String(tid === id));
  }

  /** Transition time of tile position changes made from now on (TD-012). */
  setMoveMs(ms: number): void {
    this.element.style.setProperty('--move-ms', `${ms}ms`);
  }

  /** Visually moves the tile with the given id (swap / bounce); names and hit-testing are unchanged. */
  moveTo(id: number, pos: Pos): void {
    const el = this.tiles.get(id);
    if (el) place(el, pos);
  }

  /** Starts the remove animation (fade and shrink) of the given tiles. */
  markRemoving(ids: number[]): void {
    for (const id of ids) this.tiles.get(id)?.classList.add('removing');
  }

  /**
   * Hint marks (TD-016): `data-state="hint"` and the accessible description
   * "可交换提示" on the given tiles; an empty list clears.
   */
  showHint(ids: number[]): void {
    for (const el of this.tiles.values())
      if (el.dataset.state === 'hint') {
        delete el.dataset.state;
        el.removeAttribute('aria-describedby');
      }
    for (const id of ids) {
      const el = this.tiles.get(id);
      if (!el) continue;
      el.dataset.state = 'hint';
      el.setAttribute('aria-describedby', this.hintText.id);
    }
  }

  /**
   * Makes the DOM match the grid. New tiles listed in `starts` are first placed
   * there (e.g. above the board) and then moved, so they slide in; other new
   * tiles get an appear animation.
   */
  sync(grid: Grid, starts?: ReadonlyMap<number, Pos>): void {
    const alive = new Set<number>();
    grid.forEach((row, r) =>
      row.forEach((tile, c) => {
        alive.add(tile.id);
        let el = this.tiles.get(tile.id);
        if (!el) {
          el = this.doc.createElement('button');
          el.type = 'button';
          el.className = 'tile appear';
          el.setAttribute('aria-pressed', 'false');
          this.tiles.set(tile.id, el);
          this.element.append(el);
          const start = starts?.get(tile.id);
          if (start) {
            el.className = 'tile';
            place(el, start);
            // Flush styles so the move to the final cell below is transitioned.
            void el.offsetWidth;
          } else {
            const created = el;
            this.schedule(APPEAR_MS, () => created.classList.remove('appear'));
          }
        }
        el.classList.remove(...COLOR_NAMES.map((_, k) => `color-${k}`));
        if (tile.color !== null) el.classList.add(`color-${tile.color}`);
        el.dataset.kind = tile.kind;
        if (tile.color === null) delete el.dataset.color;
        else el.dataset.color = String(tile.color);
        const pos = { row: r, col: c };
        this.positions.set(el, pos);
        place(el, pos);
        el.setAttribute('aria-label', tileLabel(tile, pos));
      }),
    );
    for (const [id, el] of this.tiles) {
      if (alive.has(id)) continue;
      this.tiles.delete(id);
      this.positions.delete(el);
      el.remove();
    }
  }
}

function place(el: HTMLElement, pos: Pos): void {
  el.style.setProperty('--c', String(pos.col));
  el.style.setProperty('--r', String(pos.row));
}
