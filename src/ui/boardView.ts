import type { Board, Pos } from '../game/board';
import { ROWS } from '../game/levels';

export const COLOR_NAMES = ['红', '黄', '绿', '蓝', '紫'] as const;

export function tileLabel(color: number, pos: Pos): string {
  return `${COLOR_NAMES[color]}色方块，第${ROWS - pos.row}行第${pos.col + 1}列`;
}

/** Renders tiles as absolutely positioned buttons keyed by tile id (TD-002). */
export class BoardView {
  readonly element: HTMLElement;
  private tiles = new Map<number, HTMLButtonElement>();
  private positions = new Map<HTMLElement, Pos>();

  constructor(private readonly doc: Document) {
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

  /** Makes the DOM match the board: removes vanished tiles, creates new ones, updates positions. */
  sync(board: Board): void {
    const alive = new Set<number>();
    board.forEach((col, c) =>
      col.forEach((tile, r) => {
        alive.add(tile.id);
        let el = this.tiles.get(tile.id);
        if (!el) {
          el = this.doc.createElement('button');
          el.type = 'button';
          el.className = `tile color-${tile.color}`;
          el.dataset.color = String(tile.color);
          this.tiles.set(tile.id, el);
          this.element.append(el);
        }
        const pos = { col: c, row: r };
        this.positions.set(el, pos);
        el.style.setProperty('--c', String(c));
        el.style.setProperty('--r', String(ROWS - 1 - r));
        el.setAttribute('aria-label', tileLabel(tile.color, pos));
      }),
    );
    for (const [id, el] of this.tiles) {
      if (alive.has(id)) continue;
      el.remove();
      this.tiles.delete(id);
      this.positions.delete(el);
    }
  }
}
