import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGame, type GameHandle } from '../../src/app';
import { mulberry32 } from '../../src/game/rng';
import { movesFor, targetFor } from '../../src/game/levels';
import { HIGH_SCORE_KEY, LEVEL_KEY } from '../../src/storage/highScore';
import { MOVE_SETTLE_MS } from '../../src/ui/timing';
import { SETTLE_ALL_MS, firstMove, invalidSwap, tapEl, tapSwap, tileIn } from './helpers';

let root: HTMLElement;
let game: GameHandle;

const output = (name: string): string => root.querySelector(`output[aria-label="${name}"]`)!.textContent!;
const board = (): HTMLElement => root.querySelector('[role="group"][aria-label="棋盘"]')!;
const dialog = (): HTMLElement | null => root.querySelector('[role="dialog"][aria-modal="true"]');
const pressed = (): Element[] => [...root.querySelectorAll('button.tile[aria-pressed="true"]')];
const settle = (): void => void vi.advanceTimersByTime(SETTLE_ALL_MS);

function mount(seed = 42): void {
  root = document.createElement('div');
  document.body.append(root);
  game = mountGame(root, { rng: mulberry32(seed) });
}

/** Plays the first valid swap until the level ends; returns the phase reached. */
function playToLevelEnd(): string {
  for (let i = 0; i < 100 && game.state.phase === 'playing'; i++) {
    tapSwap(root, ...firstMove(game.state.grid));
    settle();
  }
  return game.state.phase;
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

describe('HUD and board (AC-2, AC-13)', () => {
  it('shows level, level score, target, moves left and high score, and 64 named tiles', () => {
    expect(output('当前关卡')).toBe('1');
    expect(output('本关得分')).toBe('0');
    expect(output('本关目标分数')).toBe(String(targetFor(1)));
    expect(output('剩余步数')).toBe(String(movesFor(1)));
    expect(output('历史最高分')).toBe('0');
    const tiles = [...root.querySelectorAll('button.tile')];
    expect(tiles).toHaveLength(64);
    for (const t of tiles) {
      expect(t.getAttribute('aria-label')).toMatch(/^[红黄绿蓝紫橙]色方块，第[1-8]行第[1-8]列$/);
      expect(t.getAttribute('data-kind')).toBe('normal');
      expect(t.getAttribute('data-color')).toMatch(/^[0-4]$/);
    }
    expect(tileIn(root, { row: 0, col: 0 }).getAttribute('aria-label')).toMatch(/第1行第1列$/);
    expect(board().getAttribute('aria-busy')).toBe('false');
  });
});

describe('tap to swap (A-11, AC-4)', () => {
  it('first tap selects, tapping it again deselects, a non-adjacent tap moves the selection', () => {
    const a = tileIn(root, { row: 0, col: 0 });
    tapEl(a);
    expect(pressed()).toEqual([a]);
    tapEl(a);
    expect(pressed()).toEqual([]);
    tapEl(a);
    const far = tileIn(root, { row: 5, col: 5 });
    tapEl(far);
    expect(pressed()).toEqual([far]);
    expect(output('剩余步数')).toBe(String(movesFor(1)));
  });

  it('an adjacent swap that forms no line costs no move and keeps the board', () => {
    const [a, b] = invalidSwap(game.state.grid)!;
    const before = game.state.grid.flat().map((t) => t.id);
    tapSwap(root, a, b);
    expect(game.state.grid.flat().map((t) => t.id)).toEqual(before);
    expect(output('剩余步数')).toBe(String(movesFor(1)));
    expect(output('本关得分')).toBe('0');
    expect(pressed()).toEqual([]);
  });

  it('a valid swap costs one move, scores, and saves the high score under the new key (AC-18)', () => {
    tapSwap(root, ...firstMove(game.state.grid));
    const score = game.state.score;
    expect(score).toBeGreaterThan(0);
    expect(output('剩余步数')).toBe(String(movesFor(1) - 1));
    expect(output('历史最高分')).toBe(String(score));
    expect(localStorage.getItem(HIGH_SCORE_KEY)).toBe(String(score));
    expect(localStorage.getItem('block-match.highScore')).toBeNull();
    settle();
    expect(board().getAttribute('aria-busy')).toBe('false');
    expect(output('本关得分')).toBe(String(score));
    expect(root.querySelectorAll('button.tile')).toHaveLength(64);
  });

  it('ignores swaps while busy (no queue, A-12)', () => {
    tapSwap(root, ...firstMove(game.state.grid));
    expect(board().getAttribute('aria-busy')).toBe('true');
    const moves = game.state.movesLeft;
    tapSwap(root, ...firstMove(game.state.grid));
    expect(game.state.movesLeft).toBe(moves);
    settle();
    expect(game.state.movesLeft).toBe(moves);
    expect(MOVE_SETTLE_MS).toBeGreaterThan(0);
  });
});

describe('level end (AC-11, AC-12, AC-14)', () => {
  it('clearing a level stores the reached level; failing offers a retry of the same level', () => {
    let sawClear = false;
    let sawFail = false;
    for (let i = 0; i < 20 && !(sawClear && sawFail); i++) {
      const level = game.state.level;
      const phase = playToLevelEnd();
      const d = dialog()!;
      expect(d.closest('.board-wrap')).not.toBeNull();
      expect(d.textContent).toContain(`第 ${level} 关`);
      expect(d.textContent).toContain(`本关得分 ${game.state.score}`);
      const btn = d.querySelector('button')!;
      if (phase === 'levelCleared') {
        sawClear = true;
        expect(d.getAttribute('aria-label')).toBe('过关');
        expect(btn.textContent).toBe('下一关');
        expect(localStorage.getItem(LEVEL_KEY)).toBe(String(level + 1));
        btn.click();
        expect(output('当前关卡')).toBe(String(level + 1));
      } else {
        sawFail = true;
        expect(d.getAttribute('aria-label')).toBe('本关失败');
        expect(btn.textContent).toBe('重玩本关');
        btn.click();
        expect(output('当前关卡')).toBe(String(level));
        expect(output('剩余步数')).toBe(String(movesFor(level)));
      }
      expect(output('本关得分')).toBe('0');
      expect(dialog()).toBeNull();
      expect(board().getAttribute('aria-busy')).toBe('false');
    }
    expect(sawClear || sawFail).toBe(true);
  });

  it('starts at the stored reached level and shows the stored high score (AC-14)', () => {
    game.destroy();
    root.remove();
    localStorage.setItem(LEVEL_KEY, '4');
    localStorage.setItem(HIGH_SCORE_KEY, '99999');
    mount(7);
    expect(output('当前关卡')).toBe('4');
    expect(output('本关目标分数')).toBe(String(targetFor(4)));
    expect(output('剩余步数')).toBe(String(movesFor(4)));
    expect(output('历史最高分')).toBe('99999');
    tapSwap(root, ...firstMove(game.state.grid));
    expect(localStorage.getItem(HIGH_SCORE_KEY)).toBe('99999');
  });

  it('starts at level 1 when storage is unavailable', () => {
    game.destroy();
    root.remove();
    root = document.createElement('div');
    document.body.append(root);
    game = mountGame(root, { rng: mulberry32(3), storage: null });
    expect(output('当前关卡')).toBe('1');
    tapSwap(root, ...firstMove(game.state.grid));
    expect(Number(output('历史最高分'))).toBeGreaterThan(0);
  });
});
