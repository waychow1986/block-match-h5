export interface HudValues {
  score: number;
  target: number;
  level: number;
  highScore: number;
}

const FIELDS: { key: keyof HudValues; label: string }[] = [
  { key: 'level', label: '当前关卡' },
  { key: 'score', label: '当前分数' },
  { key: 'target', label: '本关目标分数' },
  { key: 'highScore', label: '历史最高分' },
];

export class Hud {
  readonly element: HTMLElement;
  private outputs = new Map<keyof HudValues, HTMLOutputElement>();
  private frame = 0;
  /** Final value of the score count-up in progress, or null when not counting (TD-007). */
  private countTo: number | null = null;

  constructor(private readonly doc: Document) {
    this.element = doc.createElement('header');
    this.element.className = 'hud';
    for (const f of FIELDS) {
      const stat = doc.createElement('div');
      stat.className = `stat stat-${f.key}`;
      const label = doc.createElement('span');
      label.className = 'stat-label';
      label.textContent = f.label;
      label.setAttribute('aria-hidden', 'true');
      const out = doc.createElement('output');
      out.className = 'stat-value';
      out.setAttribute('role', 'status');
      out.setAttribute('aria-label', f.label);
      out.textContent = '0';
      stat.append(label, out);
      this.element.append(stat);
      this.outputs.set(f.key, out);
    }
  }

  update(values: Partial<HudValues>): void {
    if (values.score !== undefined) this.stopCount();
    for (const [key, v] of Object.entries(values) as [keyof HudValues, number][]) {
      const out = this.outputs.get(key);
      if (out) out.textContent = String(v);
    }
  }

  /**
   * Counts the "当前分数" status text from `from` up to `to` over `ms` using
   * animation frames, passing through intermediate values (TD-007).
   */
  countScore(from: number, to: number, ms: number): void {
    const win = this.doc.defaultView;
    this.stopCount();
    const out = this.outputs.get('score')!;
    if (to <= from || !win?.requestAnimationFrame) {
      out.textContent = String(to);
      return;
    }
    this.countTo = to;
    out.textContent = String(from);
    let start: number | null = null;
    const step = (t: number): void => {
      start ??= t;
      const k = Math.min(1, (t - start) / ms);
      out.textContent = String(Math.round(from + (to - from) * k));
      if (k < 1) this.frame = win.requestAnimationFrame(step);
      else this.stopCount();
    };
    this.frame = win.requestAnimationFrame(step);
  }

  /** Ends any count-up in progress and shows its final value. */
  stopCount(): void {
    if (this.frame) this.doc.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.countTo !== null) this.outputs.get('score')!.textContent = String(this.countTo);
    this.countTo = null;
  }
}
