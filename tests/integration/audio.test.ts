import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGame, type GameHandle } from '../../src/app';
import { mulberry32 } from '../../src/game/rng';
import { SETTLE_ALL_MS, firstMove, pointer, tapSwap, tileIn } from './helpers';

/** Minimal stand-in for the browser's Web Audio API (happy-dom has none). */
class FakeParam {
  constructor(public value = 1) {}
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  cancelScheduledValues(): void {}
}
class FakeNode {
  connect<T>(n: T): T {
    return n;
  }
  disconnect(): void {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeOsc extends FakeNode {
  frequency = new FakeParam(440);
  type = 'sine';
  onended: (() => void) | null = null;
  started = false;
  stopsNow = 0;
  start(): void {
    log.starts++;
    this.started = true;
  }
  stop(when?: number): void {
    if (when === undefined) this.stopsNow++;
  }
}
class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  start(): void {
    log.silentStarts++;
  }
}
class FakeCtx {
  state = 'suspended';
  currentTime = 0;
  destination = new FakeNode();
  resumes = 0;
  constructor() {
    log.contexts.push(this);
  }
  createBuffer(channels: number, length: number, rate: number): object {
    return { channels, length, rate };
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    log.gains.push(g);
    return g;
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc();
    log.oscs.push(o);
    return o;
  }
  resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
}
let log: { starts: number; silentStarts: number; contexts: FakeCtx[]; oscs: FakeOsc[]; gains: FakeGain[] };

let root: HTMLElement;
let game: GameHandle;
const muteButton = (): HTMLButtonElement => root.querySelector('button[aria-label="静音"]')!;
const dialogButton = (): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>('[role="dialog"][aria-modal="true"] button');
const settle = (): void => {
  vi.advanceTimersByTime(SETTLE_ALL_MS);
};
const tapMove = (): void => tapSwap(root, ...firstMove(game.state.grid));

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  game = mountGame(root, { rng: mulberry32(42) });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  log = { starts: 0, silentStarts: 0, contexts: [], oscs: [], gains: [] };
  vi.stubGlobal('AudioContext', FakeCtx);
  mount();
});
afterEach(() => {
  game.destroy();
  root.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const touch = { pointerType: 'touch' } as const;
const running = (): boolean => log.contexts.some((c) => c.state === 'running');

describe('audio unlock only in user-activation events (TS-40, AC-21)', () => {
  it('a finger pointerdown alone neither creates nor resumes the AudioContext', () => {
    pointer(document.body, 'pointerdown', touch);
    pointer(document.body, 'pointermove', touch);
    pointer(document.body, 'pointercancel', touch);
    expect(log.contexts.every((c) => c.resumes === 0)).toBe(true);
    expect(running()).toBe(false);
    expect(log.silentStarts).toBe(0);
  });

  it.each([
    ['touchend', () => document.body.dispatchEvent(new Event('touchend', { bubbles: true }))],
    ['finger pointerup', () => pointer(document.body, 'pointerup', touch)],
    ['click', () => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))],
    ['keydown', () => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }))],
    ['mousedown', () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))],
  ])('%s resumes the AudioContext synchronously and plays a silent buffer', (_name, fire) => {
    pointer(document.body, 'pointerdown', touch);
    expect(running()).toBe(false);
    fire();
    expect(log.contexts).toHaveLength(1);
    expect(log.contexts[0]!.resumes).toBe(1);
    expect(log.contexts[0]!.state).toBe('running');
    expect(log.silentStarts).toBe(1);
    fire();
    expect(log.contexts[0]!.resumes).toBe(1);
  });

  it('a finger swipe that removes tiles before lifting is heard once the finger lifts', () => {
    const [a, b] = firstMove(game.state.grid);
    const el = tileIn(root, a);
    const dx = (b.col - a.col) * 40;
    const dy = (b.row - a.row) * 40;
    pointer(el, 'pointerdown', { ...touch, clientX: 100, clientY: 100 });
    pointer(el, 'pointermove', { ...touch, clientX: 100 + dx, clientY: 100 + dy });
    expect(running()).toBe(false);
    expect(log.starts).toBeGreaterThan(0);
    pointer(el, 'pointerup', { ...touch, clientX: 100 + dx, clientY: 100 + dy });
    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(log.contexts).toHaveLength(1);
    expect(log.contexts[0]!.state).toBe('running');
  });

  it('resumes again after the system suspends or interrupts audio (app switch)', () => {
    pointer(document.body, 'pointerup', touch);
    const ctx = log.contexts[0]!;
    ctx.state = 'interrupted';
    pointer(document.body, 'pointerdown', touch);
    expect(ctx.state).toBe('interrupted');
    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(ctx.state).toBe('running');
    expect(ctx.resumes).toBe(2);
    ctx.state = 'suspended';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.state).toBe('running');
  });

  it('stops listening after destroy', () => {
    game.destroy();
    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(log.contexts).toHaveLength(0);
    mount();
  });
});

describe('sound effects and mute (AC-14)', () => {
  it('plays a sound on removal after the first press', () => {
    tapMove();
    expect(log.contexts).toHaveLength(1);
    expect(log.contexts[0]!.state).toBe('running');
    expect(log.starts).toBeGreaterThan(0);
  });

  it('plays a sound when the level-cleared or level-failed dialog appears', () => {
    for (let i = 0; i < 200 && game.state.phase === 'playing'; i++) {
      tapMove();
      if (game.state.phase !== 'playing') break;
      settle();
    }
    const before = log.starts;
    expect(dialogButton()).toBeNull();
    settle();
    expect(dialogButton()).not.toBeNull();
    expect(log.starts).toBeGreaterThan(before);
  });

  it('plays a sound when the level-failed dialog appears (sound on)', () => {
    let before = -1;
    for (let level = 0; level < 30 && before < 0; level++) {
      for (let i = 0; i < 200 && game.state.phase === 'playing'; i++) {
        tapMove();
        if (game.state.phase !== 'playing') break;
        settle();
      }
      if (game.state.phase === 'levelFailed') {
        before = log.starts;
        expect(dialogButton()).toBeNull();
        settle();
      } else {
        settle();
        dialogButton()!.click();
      }
    }
    expect(before).toBeGreaterThanOrEqual(0);
    const dialog = root.querySelector('[role="dialog"][aria-modal="true"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('本关失败');
    expect(muteButton().getAttribute('aria-pressed')).toBe('false');
    expect(log.starts).toBeGreaterThan(before);
  });

  it('mute button stops playing sources, silences later moves, and unmute restores sound', () => {
    const btn = muteButton();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    tapMove();
    const playing = log.oscs.filter((o) => o.started);
    expect(playing.length).toBeGreaterThan(0);
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    for (const o of playing) expect(o.stopsNow).toBe(1);
    expect(log.gains[0]!.gain.value).toBe(0);

    settle();
    const starts = log.starts;
    const score = game.state.score;
    tapMove();
    settle();
    expect(log.starts).toBe(starts);
    expect(game.state.score).toBeGreaterThan(score);

    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(log.gains[0]!.gain.value).toBeGreaterThan(0);
    tapMove();
    expect(log.starts).toBeGreaterThan(starts);
  });

  it('mute persists across next level and retry', () => {
    pointer(document.body, 'pointerdown');
    muteButton().click();
    let sawRestart = false;
    for (let level = 0; level < 30 && !sawRestart; level++) {
      for (let i = 0; i < 200 && game.state.phase === 'playing'; i++) {
        tapMove();
        settle();
      }
      sawRestart = game.state.phase === 'levelFailed';
      dialogButton()!.click();
      expect(muteButton().getAttribute('aria-pressed')).toBe('true');
    }
    expect(sawRestart).toBe(true);
    tapMove();
    expect(log.starts).toBe(0);
  });

  it('works silently when the browser has no AudioContext', () => {
    game.destroy();
    root.remove();
    vi.stubGlobal('AudioContext', undefined);
    mount();
    expect(() => {
      tapMove();
      muteButton().click();
    }).not.toThrow();
    expect(muteButton().getAttribute('aria-pressed')).toBe('true');
    expect(log.contexts).toHaveLength(0);
  });
});
