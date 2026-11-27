import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGame, type GameHandle } from '../../src/app';
import { mulberry32 } from '../../src/game/rng';

let root: HTMLElement;
let game: GameHandle;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
  game = mountGame(root, { rng: mulberry32(7) });
});
afterEach(() => {
  game.destroy();
  root.remove();
  vi.useRealTimers();
});

describe('title and how-to-play (AC-16, AC-17, AC-22)', () => {
  it('shows the game name as the only level-1 heading, above the HUD, and in the document title', () => {
    const h1 = root.querySelectorAll('h1');
    expect(h1).toHaveLength(1);
    expect(h1[0]!.textContent).toBe('方块换换');
    const hud = root.querySelector('output[aria-label="当前关卡"]')!;
    expect(h1[0]!.compareDocumentPosition(hud) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(readFileSync('index.html', 'utf8')).toMatch(/<title>方块换换<\/title>/);
  });

  it('has a labelled "怎么玩" region below the board explaining swap rules and the silent-mode note', () => {
    const region = root.querySelector<HTMLElement>('section[aria-labelledby]')!;
    expect(region).not.toBeNull();
    const heading = root.ownerDocument.getElementById(region.getAttribute('aria-labelledby')!)!;
    expect(heading.textContent).toBe('怎么玩');
    expect(region.contains(heading)).toBe(true);
    const text = region.textContent!;
    for (const words of ['交换', '相邻', '3 个及以上同色', '连成一线', '静音'])
      expect(text).toContain(words);
    expect(text).toContain('手机处于静音模式等系统原因时听不到声音。');
    expect(region.hidden).toBe(false);
    expect(region.closest('details')).toBeNull();
    const board = root.querySelector('[role="group"][aria-label="棋盘"]')!;
    expect(board.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers no switch to another game mode', () => {
    const controls = [...root.querySelectorAll('button, a')].map((e) => `${e.getAttribute('aria-label') ?? ''}${e.textContent}`);
    expect(controls.filter((t) => /玩法|模式/.test(t))).toEqual([]);
  });
});
