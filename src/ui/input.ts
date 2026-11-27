import type { Pos } from '../game/board';

/** Share of the tile edge a pointer must travel before a drag counts (TD-011). */
export const DRAG_RATIO = 0.35;
/** Minimum drag distance in px, whatever the tile size. */
export const DRAG_MIN_PX = 8;

export interface SwapInputHandlers {
  /** Position of a tile element, or null when the element is not a tile. */
  positionOf: (el: Element | null) => Pos | null;
  onTap: (tile: HTMLElement) => void;
  /** A drag/swipe from `from` towards the adjacent `to` (always on the board). */
  onSwap: (from: Pos, to: Pos) => void;
}

/**
 * Pointer Events swap input (TD-011). A press on a tile starts a gesture; once
 * the pointer has moved past the threshold, the main axis picks the neighbour
 * and the gesture ends (dragging off the board swaps nothing). Released below
 * the threshold on the pressed tile it is a tap. pointercancel aborts.
 */
export function attachSwapInput(board: HTMLElement, rows: number, cols: number, h: SwapInputHandlers): () => void {
  const doc = board.ownerDocument;
  let gesture: { id: number; tile: HTMLElement; pos: Pos; x: number; y: number } | null = null;

  const end = (): void => {
    if (gesture) {
      try {
        board.releasePointerCapture?.(gesture.id);
      } catch {
        // Capture may already be gone.
      }
    }
    gesture = null;
  };

  const down = (e: PointerEvent): void => {
    if (e.button !== undefined && e.button > 0) return;
    const target = e.target as Element | null;
    const pos = h.positionOf(target);
    if (!pos) return;
    e.preventDefault();
    gesture = { id: e.pointerId, tile: target!.closest('.tile') as HTMLElement, pos, x: e.clientX, y: e.clientY };
    try {
      board.setPointerCapture?.(e.pointerId);
    } catch {
      // Not every pointer can be captured; document listeners still see it.
    }
  };

  const move = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    const size = gesture.tile.getBoundingClientRect().width;
    const threshold = Math.max(DRAG_MIN_PX, size * DRAG_RATIO);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    const from = gesture.pos;
    end();
    const to =
      Math.abs(dx) >= Math.abs(dy)
        ? { row: from.row, col: from.col + Math.sign(dx) }
        : { row: from.row + Math.sign(dy), col: from.col };
    if (to.row < 0 || to.col < 0 || to.row >= rows || to.col >= cols) return;
    h.onSwap(from, to);
  };

  const up = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const { tile } = gesture;
    end();
    const under = doc.elementFromPoint(e.clientX, e.clientY);
    if (under && tile.contains(under)) h.onTap(tile);
  };

  const cancel = (e: PointerEvent): void => {
    if (gesture && e.pointerId === gesture.id) end();
  };

  board.addEventListener('pointerdown', down);
  doc.addEventListener('pointermove', move);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', cancel);
  return () => {
    board.removeEventListener('pointerdown', down);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', up);
    doc.removeEventListener('pointercancel', cancel);
  };
}
