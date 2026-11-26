import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGame, type GameHandle } from '../../src/app';
import { mulberry32 } from '../../src/game/rng';
import { findGroup } from '../../src/game/board';
import { ROWS } from '../../src/game/levels';
import { FALL_MS, FLOAT_MS, MOVE_SETTLE_MS, REMOVE_MS, SCORE_COUNT_MS } from '../../src/ui/timing';
import { findMove, findMoveWithFall, findSingle, highlighted, pointer, tapEl, tileIn } from './helpers';

let root: HTMLElement;
let game: GameHandle;

const board = (): HTMLElement => root.querySelector('[role="group"][aria-label="棋盘"]')!;
const tile = (p: { col: number; row: number }): HTMLButtonElement => tileIn(root, p);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
  game = mountGame(root, { rng: mulberry32(42) });
});
afterEach(() => {
  game.destroy();
  root.remove();
  vi.useRealTimers();
});

describe('group highlighting (AC-11)', () => {
  it('mouse hover highlights exactly the whole group; singles and leaving the board clear it', () => {
    const p = findMove(game.state.board)!;
    const group = findGroup(game.state.board, p).map((q) => tile(q));
    pointer(tile(p), 'pointerover');
    expect(new Set(highlighted(root))).toEqual(new Set(group));

    pointer(tile(findSingle(game.state.board)!), 'pointerover');
    expect(highlighted(root)).toHaveLength(0);

    pointer(tile(p), 'pointerover');
    expect(highlighted(root).length).toBe(group.length);
    pointer(board(), 'pointerover');
    expect(highlighted(root)).toHaveLength(0);

    pointer(tile(p), 'pointerover');
    board().dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse' }));
    expect(highlighted(root)).toHaveLength(0);
  });

  it('touch hover does not highlight; pressing highlights for any pointer type', () => {
    const p = findMove(game.state.board)!;
    const n = findGroup(game.state.board, p).length;
    pointer(tile(p), 'pointerover', { pointerType: 'touch' });
    expect(highlighted(root)).toHaveLength(0);
    pointer(tile(p), 'pointerdown', { pointerType: 'touch' });
    expect(highlighted(root)).toHaveLength(n);
  });

  it('pressing a single tile highlights nothing', () => {
    pointer(tile(findSingle(game.state.board)!), 'pointerdown', { pointerType: 'touch' });
    expect(highlighted(root)).toHaveLength(0);
  });

  it('releasing a press outside the board clears the highlight and removes nothing', () => {
    const p = findMove(game.state.board)!;
    pointer(tile(p), 'pointerdown');
    expect(highlighted(root).length).toBeGreaterThan(1);
    const orig = document.elementFromPoint;
    document.elementFromPoint = () => document.body;
    pointer(document.body, 'pointerup');
    document.elementFromPoint = orig;
    expect(highlighted(root)).toHaveLength(0);
    expect(game.state.score).toBe(0);
    // The gesture was fully reset: a following tap on another tile works normally.
    tapEl(tile(p));
    expect(game.state.score).toBeGreaterThan(0);
  });

  it('a completed tap leaves no highlight behind', () => {
    tapEl(tile(findMove(game.state.board)!), { pointerType: 'touch' });
    expect(highlighted(root)).toHaveLength(0);
    vi.advanceTimersByTime(MOVE_SETTLE_MS + 10);
    expect(highlighted(root)).toHaveLength(0);
  });
});

describe('move animations (AC-12)', () => {
  it('total settle time is the sum of the staged animations', () => {
    expect(MOVE_SETTLE_MS).toBeGreaterThanOrEqual(REMOVE_MS + FALL_MS);
  });

  it('removed tiles fade out before leaving the DOM and are hidden from assistive tech', () => {
    const p = findMove(game.state.board)!;
    const removed = findGroup(game.state.board, p).map((q) => tile(q));
    tapEl(tile(p));
    expect(board().getAttribute('aria-busy')).toBe('true');
    for (const el of removed) {
      expect(el.isConnected).toBe(true);
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.classList.contains('tile')).toBe(false);
    }
    vi.advanceTimersByTime(REMOVE_MS + 10);
    for (const el of removed) expect(el.isConnected).toBe(false);
  });

  it('falling tiles move through their after-fall position before the final one', () => {
    const b = game.state.board;
    const p = findMoveWithFall(b)!;
    const group = findGroup(b, p);
    const top = group.filter((q) => q.col === p.col).reduce((a, q) => (q.row > a.row ? q : a));
    const above = tile({ col: p.col, row: top.row + 1 });
    const startR = above.style.getPropertyValue('--r');
    tapEl(tile(p));
    // Still at its start position while the group fades out.
    expect(above.style.getPropertyValue('--r')).toBe(startR);
    vi.advanceTimersByTime(REMOVE_MS + 5);
    const fallen = Number(above.style.getPropertyValue('--r'));
    expect(fallen).toBeGreaterThan(Number(startR));
    expect(fallen).toBeLessThanOrEqual(ROWS - 1);
    vi.advanceTimersByTime(MOVE_SETTLE_MS);
    expect(board().getAttribute('aria-busy')).toBe('false');
  });

  it('shows a "+N" float inside the board container and removes it later', () => {
    const p = findMove(game.state.board)!;
    const n = findGroup(game.state.board, p).length;
    tapEl(tile(p));
    const float = root.querySelector('.board-wrap .score-float');
    expect(float?.textContent).toBe(`+${10 * n * n}`);
    vi.advanceTimersByTime(FLOAT_MS + 20);
    expect(root.querySelector('.score-float')).toBeNull();
  });

  it('the visible score counts up through intermediate values while the status text is final', () => {
    const p = findMove(game.state.board)!;
    const n = findGroup(game.state.board, p).length;
    const gained = 10 * n * n;
    tapEl(tile(p));
    expect(root.querySelector('output[aria-label="当前分数"]')!.textContent).toBe(String(gained));
    const shown = root.querySelector<HTMLElement>('.stat-score .stat-count')!;
    expect(shown.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(SCORE_COUNT_MS / 2);
    const mid = Number(shown.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(gained);
    vi.advanceTimersByTime(SCORE_COUNT_MS);
    expect(shown.textContent).toBe(String(gained));
  });
});
