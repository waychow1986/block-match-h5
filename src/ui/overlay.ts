export type OverlayKind = 'levelCleared' | 'gameOver';

const TEXT: Record<OverlayKind, { title: string; action: string }> = {
  levelCleared: { title: '过关', action: '下一关' },
  gameOver: { title: '游戏结束', action: '重新开始' },
};

/** Modal prompt shown above the board when a level ends (FR-034, FR-035). */
export class Overlay {
  private current: HTMLElement | null = null;

  constructor(
    private readonly doc: Document,
    private readonly host: HTMLElement,
  ) {}

  get kind(): OverlayKind | null {
    return (this.current?.dataset.kind as OverlayKind | undefined) ?? null;
  }

  show(kind: OverlayKind, score: number, onAction: () => void): void {
    this.hide();
    const { title, action } = TEXT[kind];
    const dialog = this.doc.createElement('div');
    dialog.className = `overlay overlay-${kind}`;
    dialog.dataset.kind = kind;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', title);
    const card = this.doc.createElement('div');
    card.className = 'overlay-card';
    const h = this.doc.createElement('h2');
    h.className = 'overlay-title';
    h.textContent = title;
    const p = this.doc.createElement('p');
    p.className = 'overlay-score';
    p.textContent = `得分 ${score}`;
    const btn = this.doc.createElement('button');
    btn.type = 'button';
    btn.className = 'overlay-action';
    btn.textContent = action;
    btn.addEventListener('click', () => {
      this.hide();
      onAction();
    });
    card.append(h, p, btn);
    dialog.append(card);
    this.host.append(dialog);
    this.current = dialog;
    btn.focus();
  }

  hide(): void {
    this.current?.remove();
    this.current = null;
  }
}
