/**
 * Pointer Events tap detection (TD-008): a tap counts only when pointerdown and
 * pointerup land on the same tile; pointercancel aborts the gesture.
 */
export function attachTapInput(
  board: HTMLElement,
  resolve: (el: Element | null) => HTMLElement | null,
  onTap: (tile: HTMLElement) => void,
): () => void {
  const doc = board.ownerDocument;
  let pressed: HTMLElement | null = null;
  let pointerId: number | null = null;

  const down = (e: PointerEvent): void => {
    if (e.button !== undefined && e.button > 0) return;
    pressed = resolve(e.target as Element | null);
    pointerId = e.pointerId;
    if (pressed) e.preventDefault();
  };
  const up = (e: PointerEvent): void => {
    if (!pressed || e.pointerId !== pointerId) return;
    const start = pressed;
    pressed = null;
    pointerId = null;
    const under = doc.elementFromPoint(e.clientX, e.clientY);
    if (resolve(under) === start) onTap(start);
  };
  const cancel = (): void => {
    pressed = null;
    pointerId = null;
  };

  board.addEventListener('pointerdown', down);
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', cancel);
  return () => {
    board.removeEventListener('pointerdown', down);
    board.removeEventListener('pointerup', up);
    board.removeEventListener('pointercancel', cancel);
  };
}
