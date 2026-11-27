export type OverlayKind = 'levelCleared' | 'levelFailed';

const TEXT: Record<OverlayKind, { title: string; action: string }> = {
  levelCleared: { title: '过关', action: '下一关' },
  levelFailed: { title: '本关失败', action: '重玩本关' },
};

/** Modal prompt shown above the board when a level ends (FR-061, FR-062, A-17). */
export class Overlay {
  private current: HTMLElement | null = null;

  constructor(
    private readonly doc: Document,
    private readonly host: HTMLElement,
  ) {}

  get kind(): OverlayKind | null {
    return (this.current?.dataset.kind as OverlayKind | undefined) ?? null;
  }

  show(kind: OverlayKind, level: number, score: number, onAction: () => void): void {
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
    const lv = this.doc.createElement('p');
    lv.className = 'overlay-level';
    lv.textContent = `第 ${level} 关`;
    const p = this.doc.createElement('p');
    p.className = 'overlay-score';
    p.textContent = `本关得分 ${score}`;
    const btn = this.doc.createElement('button');
    btn.type = 'button';
    btn.className = 'overlay-action';
    btn.textContent = action;
    btn.addEventListener('click', () => {
      this.hide();
      onAction();
    });
    card.append(h, lv, p, btn);
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
