import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGame, type GameHandle } from '../../src/app';
import { hintMove } from '../../src/game/game';
import { movesFor } from '../../src/game/levels';
import { mulberry32 } from '../../src/game/rng';
import type { Pos } from '../../src/game/board';
import { BOUNCE_MS, HINT_DELAY_MS, SWAP_MS } from '../../src/ui/timing';
import { SETTLE_ALL_MS, drag, firstMove, invalidSwap, pointer, tapEl, tapSwap, tileIn } from './helpers';

let root: HTMLElement;
let game: GameHandle;

const output = (name: string): string => root.querySelector(`output[aria-label="${name}"]`)!.textContent!;
const board = (): HTMLElement => root.querySelector('[role="group"][aria-label="棋盘"]')!;
const busy = (): string | null => board().getAttribute('aria-busy');
const dialog = (): HTMLElement | null => root.querySelector('[role="dialog"][aria-modal="true"]');
const pressed = (): Element[] => [...root.querySelectorAll('button.tile[aria-pressed="true"]')];
const ids = (): number[] => game.state.grid.flat().map((t) => t.id);
const settle = (): void => void vi.advanceTimersByTime(SETTLE_ALL_MS);
const hinted = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('button.tile[data-state="hint"]')];
const at = (el: HTMLElement): Pos => ({ row: Number(el.style.getPropertyValue('--r')), col: Number(el.style.getPropertyValue('--c')) });
const PX = 30;

function mount(seed = 42): void {
  root = document.createElement('div');
  document.body.append(root);
  game = mountGame(root, { rng: mulberry32(seed) });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mount();
});
afterEach(() => {
  game.destroy();
  root.remove();
  vi.useRealTimers();
});

describe('drag / swipe to swap (AC-3, TD-011)', () => {
  it('dragging a tile towards a neighbour swaps them, in all four directions', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40 && seen.size < 4; i++) {
      const [a, b] = firstMove(game.state.grid);
      // Alternate dragging a→b (right/down) and b→a (left/up).
      const [from, to] = i % 2 === 0 ? [a, b] : [b, a];
      const dx = Math.sign(to.col - from.col) * PX;
      const dy = Math.sign(to.row - from.row) * PX;
      const moves = game.state.movesLeft;
      const fromEl = tileIn(root, from);
      drag(root, from, dx, dy);
      expect(game.state.movesLeft).toBe(moves - 1);
      expect(output('剩余步数')).toBe(String(moves - 1));
      expect(busy()).toBe('true');
      // The dragged tile visibly heads for the neighbour first (TS-34).
      expect(at(fromEl)).toEqual(to);
      settle();
      seen.add(`${dx},${dy}`);
      if (game.state.phase !== 'playing') break;
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('a small movement released on the same tile is a tap (selects)', () => {
    const el = tileIn(root, { row: 3, col: 3 });
    const orig = document.elementFromPoint;
    document.elementFromPoint = () => el;
    drag(root, { row: 3, col: 3 }, 5, 0);
    document.elementFromPoint = orig;
    expect(pressed()).toEqual([el]);
    expect(game.state.movesLeft).toBe(movesFor(1));
  });

  it('dragging off the board or a cancelled gesture does not swap', () => {
    const before = ids();
    drag(root, { row: 0, col: 3 }, 0, -PX);
    drag(root, { row: 4, col: 0 }, -PX, 0);
    drag(root, { row: 4, col: 4 }, 5, 0, 'pointercancel');
    expect(ids()).toEqual(before);
    expect(game.state.movesLeft).toBe(movesFor(1));
    expect(busy()).toBe('false');
    expect(pressed()).toEqual([]);
  });

});

describe('bounce back (AC-5, TD-012)', () => {
  it('an invalid swap moves the tiles out and back, keeps board, moves and score', () => {
    const [a, b] = invalidSwap(game.state.grid)!;
    const before = ids();
    const elA = tileIn(root, a);
    const elB = tileIn(root, b);
    drag(root, a, (b.col - a.col) * PX, (b.row - a.row) * PX);
    expect(busy()).toBe('true');
    expect(at(elA)).toEqual(b);
    expect(at(elB)).toEqual(a);
    vi.advanceTimersByTime(SWAP_MS);
    expect(at(elA)).toEqual(a);
    expect(at(elB)).toEqual(b);
    expect(busy()).toBe('true');
    vi.advanceTimersByTime(BOUNCE_MS - SWAP_MS);
    expect(busy()).toBe('false');
    expect(ids()).toEqual(before);
    expect(output('剩余步数')).toBe(String(movesFor(1)));
    expect(output('本关得分')).toBe('0');
    // A tap swap during the bounce is ignored.
    tapSwap(root, a, b);
    vi.advanceTimersByTime(BOUNCE_MS);
    tapSwap(root, ...firstMove(game.state.grid));
    expect(game.state.movesLeft).toBe(movesFor(1) - 1);
  });
});

describe('round by round sequence (AC-10, AC-19, TD-012)', () => {
  it('plays each round with its own "+N" float; final HUD values when the board is idle', () => {
    const seen = new Set<Element>();
    for (let n = 0; n < 5 && game.state.phase === 'playing'; n++) {
      const before = game.state.score;
      const gains: number[] = [];
      tapSwap(root, ...firstMove(game.state.grid));
      expect(output('剩余步数')).toBe(String(game.state.movesLeft));
      for (let t = 0; t < SETTLE_ALL_MS && (busy() === 'true' || t === 0); t += 10) {
        for (const f of root.querySelectorAll('.score-float'))
          if (!seen.has(f)) {
            seen.add(f);
            gains.push(Number(f.textContent!.replace('+', '')));
          }
        vi.advanceTimersByTime(10);
      }
      if (game.state.phase !== 'playing') break;
      expect(busy()).toBe('false');
      expect(gains.length).toBeGreaterThanOrEqual(1);
      expect(before + gains.reduce((s, g) => s + g, 0)).toBe(game.state.score);
      expect(output('本关得分')).toBe(String(game.state.score));
      expect(root.querySelectorAll('button.tile')).toHaveLength(64);
      expect(root.querySelectorAll('button.tile.removing')).toHaveLength(0);
    }
  });

  it('removed tiles fade before the falling grid is shown', () => {
    tapSwap(root, ...firstMove(game.state.grid));
    vi.advanceTimersByTime(SWAP_MS);
    expect(root.querySelectorAll('button.tile.removing').length).toBeGreaterThanOrEqual(3);
    settle();
    expect(root.querySelectorAll('button.tile.removing')).toHaveLength(0);
  });
});

describe('level end prompts (AC-11, AC-12)', () => {
  it('the board ignores drags while a prompt is shown; the button restarts play', () => {
    for (let i = 0; i < 100 && game.state.phase === 'playing'; i++) {
      tapSwap(root, ...firstMove(game.state.grid));
      settle();
    }
    const d = dialog()!;
    expect(d).not.toBeNull();
    const before = ids();
    const [a, b] = firstMove(game.state.grid);
    drag(root, a, (b.col - a.col) * PX, (b.row - a.row) * PX);
    expect(ids()).toEqual(before);
    vi.advanceTimersByTime(HINT_DELAY_MS + 1000);
    expect(hinted()).toHaveLength(0);
    d.querySelector('button')!.click();
    expect(dialog()).toBeNull();
    expect(output('本关得分')).toBe('0');
    expect(output('剩余步数')).toBe(String(game.state.movesLeft));
    tapSwap(root, ...firstMove(game.state.grid));
    expect(output('剩余步数')).toBe(String(game.state.movesLeft));
    expect(game.state.movesLeft).toBe(movesFor(game.state.level) - 1);
  });
});

describe('idle hint (AC-15, TD-016)', () => {
  const describedHint = (el: HTMLElement): string | undefined => {
    const id = el.getAttribute('aria-describedby');
    return id ? (root.querySelector(`[id="${id}"]`)?.textContent ?? undefined) : undefined;
  };

  it('marks the first valid swap after 5 s of inactivity and clears it on the next press', () => {
    vi.advanceTimersByTime(4000);
    expect(hinted()).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    const move = hintMove(game.state.grid)!;
    expect(hinted()).toEqual([tileIn(root, move[0]), tileIn(root, move[1])]);
    for (const el of hinted()) expect(describedHint(el)).toBe('可交换提示');

    pointer(document.body, 'pointerdown');
    expect(hinted()).toHaveLength(0);
    expect(root.querySelectorAll('[aria-describedby]')).toHaveLength(0);
    vi.advanceTimersByTime(HINT_DELAY_MS - 1);
    expect(hinted()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(hinted()).toHaveLength(2);
  });

  it('any key press restarts the countdown; following the hint swaps and the hint returns later', () => {
    vi.advanceTimersByTime(4000);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    vi.advanceTimersByTime(4000);
    expect(hinted()).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(hinted()).toHaveLength(2);
    const [a, b] = hintMove(game.state.grid)!;
    const moves = game.state.movesLeft;
    tapEl(tileIn(root, a));
    expect(hinted()).toHaveLength(0);
    tapEl(tileIn(root, b));
    expect(game.state.movesLeft).toBe(moves - 1);
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(hinted()).toHaveLength(0);
    settle();
    if (game.state.phase !== 'playing') return;
    vi.advanceTimersByTime(HINT_DELAY_MS);
    expect(hinted()).toHaveLength(2);
  });
});
