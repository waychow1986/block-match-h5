/**
 * Pointer Events tap detection (TD-008): a tap counts only when pointerdown and
 * pointerup land on the same tile; pointercancel aborts the gesture. Release is
 * watched on the document so a press released outside the board is reset.
 *
 * Highlight requests (AC-11): mouse hover asks for the tile under the pointer;
 * a press of any pointer type asks for the pressed tile; `null` clears.
 */
export function attachTapInput(
  board: HTMLElement,
  resolve: (el: Element | null) => HTMLElement | null,
  onTap: (tile: HTMLElement) => void,
  onHighlight: (tile: HTMLElement | null) => void = () => undefined,
): () => void {
  const doc = board.ownerDocument;
  let pressed: HTMLElement | null = null;
  let pointerId: number | null = null;

  const down = (e: PointerEvent): void => {
    if (e.button !== undefined && e.button > 0) return;
    pressed = resolve(e.target as Element | null);
    pointerId = e.pointerId;
    onHighlight(pressed);
    if (pressed) e.preventDefault();
  };
  const up = (e: PointerEvent): void => {
    if (!pressed || e.pointerId !== pointerId) return;
    const start = pressed;
    pressed = null;
    pointerId = null;
    const under = resolve(doc.elementFromPoint(e.clientX, e.clientY));
    onHighlight(null);
    if (under === start) onTap(start);
    else if (e.pointerType === 'mouse' && under) onHighlight(under);
  };
  const cancel = (e: PointerEvent): void => {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    pressed = null;
    pointerId = null;
    onHighlight(null);
  };
  const over = (e: PointerEvent): void => {
    if (pressed || e.pointerType !== 'mouse') return;
    onHighlight(resolve(e.target as Element | null));
  };
  const leave = (): void => {
    if (!pressed) onHighlight(null);
  };

  board.addEventListener('pointerdown', down);
  board.addEventListener('pointerover', over);
  board.addEventListener('pointerleave', leave);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', cancel);
  return () => {
    board.removeEventListener('pointerdown', down);
    board.removeEventListener('pointerover', over);
    board.removeEventListener('pointerleave', leave);
    doc.removeEventListener('pointerup', up);
    doc.removeEventListener('pointercancel', cancel);
  };
}
