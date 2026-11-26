import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGame, type GameHandle } from '../../src/app';
import { mulberry32 } from '../../src/game/rng';
import { findGroup, type Board, type Pos } from '../../src/game/board';
import { HIGH_SCORE_KEY } from '../../src/storage/highScore';
import { LEVEL_END_PAUSE_MS, MOVE_SETTLE_MS } from '../../src/ui/timing';

let root: HTMLElement;
let game: GameHandle;

function output(name: string): string {
  return root.querySelector(`output[aria-label="${name}"]`)!.textContent!;
}
function board(): HTMLElement {
  return root.querySelector('[role="group"][aria-label="棋盘"]')!;
}
function tileEl(p: Pos): HTMLButtonElement {
  const label = new RegExp(`第${10 - p.row}行第${p.col + 1}列$`);
  const el = [...root.querySelectorAll<HTMLButtonElement>('button.tile')].find((b) =>
    label.test(b.getAttribute('aria-label')!),
  );
  if (!el) throw new Error(`no tile at ${JSON.stringify(p)}`);
  return el;
}
function tap(el: Element): void {
  const doc = el.ownerDocument;
  const orig = doc.elementFromPoint;
  doc.elementFromPoint = () => el;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true }));
  doc.elementFromPoint = orig;
}
function findMove(b: Board, min = 2): Pos | null {
  for (let c = 0; c < b.length; c++)
    for (let r = 0; r < b[c]!.length; r++) if (findGroup(b, { col: c, row: r }).length >= min) return { col: c, row: r };
  return null;
}
function findSingle(b: Board): Pos | null {
  for (let c = 0; c < b.length; c++)
    for (let r = 0; r < b[c]!.length; r++) if (findGroup(b, { col: c, row: r }).length === 1) return { col: c, row: r };
  return null;
}
function settle(): void {
  vi.advanceTimersByTime(MOVE_SETTLE_MS + LEVEL_END_PAUSE_MS + 10);
}
function playToLevelEnd(): void {
  for (let i = 0; i < 200 && game.state.phase === 'playing'; i++) {
    const p = findMove(game.state.board)!;
    tap(tileEl(p));
    settle();
  }
}

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

describe('controller (AC-1..AC-10, AC-13)', () => {
  it('renders HUD and a full 10x10 board of named tile buttons', () => {
    expect(output('当前关卡')).toBe('1');
    expect(output('当前分数')).toBe('0');
    expect(output('本关目标分数')).toBe('2000');
    expect(output('历史最高分')).toBe('0');
    const tiles = root.querySelectorAll('button.tile');
    expect(tiles).toHaveLength(100);
    expect(tiles[0]!.getAttribute('aria-label')).toMatch(/^[红黄绿蓝紫]色方块，第\d+行第\d+列$/);
    expect(board().getAttribute('aria-busy')).toBe('false');
  });

  it('removing a group updates score and saves high score immediately', () => {
    const p = findMove(game.state.board)!;
    const n = findGroup(game.state.board, p).length;
    tap(tileEl(p));
    expect(output('当前分数')).toBe(String(10 * n * n));
    expect(output('历史最高分')).toBe(String(10 * n * n));
    expect(localStorage.getItem(HIGH_SCORE_KEY)).toBe(String(10 * n * n));
    expect(root.querySelectorAll('button.tile')).toHaveLength(100 - n);
  });

  it('tapping a single tile changes nothing', () => {
    const p = findSingle(game.state.board)!;
    tap(tileEl(p));
    expect(output('当前分数')).toBe('0');
    expect(root.querySelectorAll('button.tile')).toHaveLength(100);
    expect(board().getAttribute('aria-busy')).toBe('false');
  });

  it('ignores input while busy (no queue)', () => {
    const first = findMove(game.state.board)!;
    tap(tileEl(first));
    expect(board().getAttribute('aria-busy')).toBe('true');
    const scoreAfterFirst = game.state.score;
    const second = findMove(game.state.board);
    if (second) tap(tileEl(second));
    expect(game.state.score).toBe(scoreAfterFirst);
    vi.advanceTimersByTime(MOVE_SETTLE_MS + 10);
    if (game.state.phase === 'playing') expect(board().getAttribute('aria-busy')).toBe('false');
    expect(game.state.score).toBe(scoreAfterFirst);
  });

  it('requires pointerdown and pointerup on the same tile', () => {
    const p = findMove(game.state.board)!;
    const other = findSingle(game.state.board)!;
    const a = tileEl(p);
    const b = tileEl(other);
    const orig = document.elementFromPoint;
    document.elementFromPoint = () => b;
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    a.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    document.elementFromPoint = orig;
    expect(game.state.score).toBe(0);
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    a.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    expect(game.state.score).toBe(0);
  });

  it('shows the outcome dialog after the level ends and continues/restarts', () => {
    playToLevelEnd();
    const phase = game.state.phase;
    const dialog = root.querySelector('[role="dialog"][aria-modal="true"]')!;
    expect(dialog).not.toBeNull();
    // Dialog lives inside the board container so it covers the board.
    expect(dialog.closest('.board-wrap')).not.toBeNull();
    const finalScore = game.state.score;
    expect(dialog.textContent).toContain(String(finalScore));
    if (phase === 'levelCleared') {
      expect(dialog.getAttribute('aria-label')).toBe('过关');
      (dialog.querySelector('button') as HTMLButtonElement).click();
      expect(output('当前关卡')).toBe('2');
      expect(output('本关目标分数')).toBe('4500');
      expect(output('当前分数')).toBe(String(finalScore));
    } else {
      expect(dialog.getAttribute('aria-label')).toBe('游戏结束');
      (dialog.querySelector('button') as HTMLButtonElement).click();
      expect(output('当前关卡')).toBe('1');
      expect(output('当前分数')).toBe('0');
      expect(output('历史最高分')).toBe(String(finalScore));
    }
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelectorAll('button.tile')).toHaveLength(100);
    expect(board().getAttribute('aria-busy')).toBe('false');
  });

  it('game over offers restart that keeps the high score', () => {
    let sawGameOver = false;
    for (let i = 0; i < 30; i++) {
      playToLevelEnd();
      const dialog = root.querySelector('[role="dialog"][aria-modal="true"]')!;
      const btn = dialog.querySelector<HTMLButtonElement>('button')!;
      if (game.state.phase === 'gameOver') {
        sawGameOver = true;
        expect(dialog.getAttribute('aria-label')).toBe('游戏结束');
        expect(dialog.querySelector('h2')!.textContent).toBe('游戏结束');
        expect(dialog.textContent).not.toContain('过关');
        expect(dialog.textContent).toContain(String(game.state.score));
        expect(dialog.textContent).toContain(output('当前分数'));
        expect(btn.textContent).toBe('重新开始');
        expect(dialog.closest('.board-wrap')).not.toBeNull();
      } else {
        expect(dialog.getAttribute('aria-label')).toBe('过关');
        expect(btn.textContent).toBe('下一关');
      }
      btn.click();
      if (sawGameOver) break;
    }
    expect(sawGameOver).toBe(true);
    // Last click was 重新开始 when level went back to 1.
    expect(output('当前关卡')).toBe('1');
    expect(output('当前分数')).toBe('0');
    expect(Number(output('历史最高分'))).toBeGreaterThan(0);
    expect(localStorage.getItem(HIGH_SCORE_KEY)).toBe(output('历史最高分'));
  });

  it('loads a stored high score on mount and keeps the larger value', () => {
    game.destroy();
    root.replaceChildren();
    localStorage.setItem(HIGH_SCORE_KEY, '99999');
    game = mountGame(root, { rng: mulberry32(7) });
    expect(output('历史最高分')).toBe('99999');
    tap(tileEl(findMove(game.state.board)!));
    expect(localStorage.getItem(HIGH_SCORE_KEY)).toBe('99999');
    expect(output('历史最高分')).toBe('99999');
  });
});
