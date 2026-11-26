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
  /** Decorative count-up of the score (TD-007); the status output always holds the final value. */
  private readonly count: HTMLElement;
  private frame = 0;

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
    this.count = doc.createElement('span');
    this.count.className = 'stat-count';
    this.count.setAttribute('aria-hidden', 'true');
    this.count.textContent = '0';
    this.outputs.get('score')!.after(this.count);
  }

  update(values: Partial<HudValues>): void {
    for (const [key, v] of Object.entries(values) as [keyof HudValues, number][]) {
      const out = this.outputs.get(key);
      if (out) out.textContent = String(v);
    }
    if (values.score !== undefined) {
      this.stopCount();
      this.count.textContent = String(values.score);
    }
  }

  /** Visually counts the score from `from` up to `to` over `ms` using animation frames. */
  countScore(from: number, to: number, ms: number): void {
    const win = this.doc.defaultView;
    this.stopCount();
    if (to <= from || !win?.requestAnimationFrame) return;
    const stat = this.count.parentElement!;
    stat.classList.add('counting');
    this.count.textContent = String(from);
    let start: number | null = null;
    const step = (t: number): void => {
      start ??= t;
      const k = Math.min(1, (t - start) / ms);
      this.count.textContent = String(Math.round(from + (to - from) * k));
      if (k < 1) this.frame = win.requestAnimationFrame(step);
      else this.stopCount();
    };
    this.frame = win.requestAnimationFrame(step);
  }

  stopCount(): void {
    if (this.frame) this.doc.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.count.parentElement?.classList.remove('counting');
  }
}
