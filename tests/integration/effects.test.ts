import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGame, type GameHandle } from '../../src/app';
import { mulberry32 } from '../../src/game/rng';
import { findGroup, makeBoard, removeGroup } from '../../src/game/board';
import { ROWS } from '../../src/game/levels';
import { BoardView } from '../../src/ui/boardView';
import { FALL_MS, FLOAT_MS, MOVE_SETTLE_MS, REMOVE_MS, SCORE_COUNT_MS, SHIFT_MS } from '../../src/ui/timing';
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

  it('the "当前分数" status text itself counts up through intermediate values to the final one', () => {
    const p = findMove(game.state.board)!;
    const n = findGroup(game.state.board, p).length;
    const gained = 10 * n * n;
    const status = root.querySelector<HTMLElement>('[role="status"][aria-label="当前分数"]')!;
    tapEl(tile(p));
    const seen = new Set<number>([Number(status.textContent)]);
    for (let t = 0; t < SCORE_COUNT_MS; t += 40) {
      vi.advanceTimersByTime(40);
      seen.add(Number(status.textContent));
    }
    const mids = [...seen].filter((v) => v > 0 && v < gained);
    expect(mids.length).toBeGreaterThanOrEqual(2);
    vi.advanceTimersByTime(MOVE_SETTLE_MS);
    expect(board().getAttribute('aria-busy')).toBe('false');
    expect(status.textContent).toBe(String(gained));
  });

  it('the score text is final once the board is no longer busy, even without animation frames', () => {
    const p = findMove(game.state.board)!;
    const n = findGroup(game.state.board, p).length;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    try {
      tapEl(tile(p));
      vi.advanceTimersByTime(MOVE_SETTLE_MS + 10);
    } finally {
      window.requestAnimationFrame = raf;
    }
    expect(board().getAttribute('aria-busy')).toBe('false');
    expect(root.querySelector('[role="status"][aria-label="当前分数"]')!.textContent).toBe(String(10 * n * n));
  });
});

describe('column shift animation (AC-12)', () => {
  it('right-hand columns stay in place during remove and fall, then shift left with a non-zero transition', () => {
    // Column 0 is a removable pair; removing it empties the column so columns 1 and 2 shift left.
    const start = makeBoard([[0, 0], [1, 2, 3], [4]]);
    const view = new BoardView(document, (ms, fn) => void setTimeout(fn, ms));
    root.append(view.element);
    view.sync(start);
    const move = removeGroup(start, { col: 0, row: 0 })!;
    expect(move.moved.length).toBe(4);
    const byId = (id: number): HTMLElement => {
      const pos = move.moved.find((m) => m.id === id)!.to;
      return [...view.element.querySelectorAll<HTMLElement>('button.tile')].find(
        (b) => view.positionOf(b)?.col === pos.col && view.positionOf(b)?.row === pos.row,
      )!;
    };
    view.sync(move.board, move);
    const col = (id: number): string => byId(id).style.getPropertyValue('--c');
    for (const m of move.moved) {
      expect(m.afterFall.col).toBe(m.from.col);
      expect(m.to.col).toBe(m.from.col - 1);
      expect(col(m.id)).toBe(String(m.from.col));
    }

    vi.advanceTimersByTime(REMOVE_MS + 5);
    for (const m of move.moved) expect(col(m.id)).toBe(String(m.afterFall.col));
    expect(parseFloat(view.element.style.getPropertyValue('--move-ms'))).toBe(FALL_MS);

    vi.advanceTimersByTime(FALL_MS);
    for (const m of move.moved) expect(col(m.id)).toBe(String(m.to.col));
    const shiftMs = parseFloat(view.element.style.getPropertyValue('--move-ms'));
    expect(shiftMs).toBe(SHIFT_MS);
    expect(shiftMs).toBeGreaterThan(0);

    vi.advanceTimersByTime(MOVE_SETTLE_MS);
    view.element.remove();
  });
});
