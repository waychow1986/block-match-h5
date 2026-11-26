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

  constructor(doc: Document) {
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
    for (const [key, v] of Object.entries(values) as [keyof HudValues, number][]) {
      const out = this.outputs.get(key);
      if (out) out.textContent = String(v);
    }
  }
}
