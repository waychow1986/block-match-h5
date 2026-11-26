import { describe, expect, it } from 'vitest';
import { makeBoard } from '../../src/game/board';
import { createGame, nextLevel, restart, tryRemove, type GameState } from '../../src/game/game';
import { colorsFor, targetFor } from '../../src/game/levels';
import { mulberry32 } from '../../src/game/rng';

// AC-7 developer check (test plan TS-16), plus AC-8 restart.
function state(partial: Partial<GameState>): GameState {
  return { ...createGame(mulberry32(1)), ...partial };
}

// Removing the [0,0] pair yields S(2) = 40 and leaves no group.
const endingBoard = () => makeBoard([[0, 0], [1]]);

describe('level end decision', () => {
  it('score exactly equal to target after the last removal -> level cleared', () => {
    const s = state({ score: 2000 - 40, target: 2000, board: endingBoard() });
    const out = tryRemove(s, { col: 0, row: 0 })!;
    expect(out.state.score).toBe(2000);
    expect(out.state.phase).toBe('levelCleared');
  });

  it('score target - 1 -> game over', () => {
    const s = state({ score: 2000 - 41, target: 2000, board: endingBoard() });
    const out = tryRemove(s, { col: 0, row: 0 })!;
    expect(out.state.score).toBe(1999);
    expect(out.state.phase).toBe('gameOver');
  });

  it('score above target -> level cleared', () => {
    const s = state({ score: 5000, target: 2000, board: endingBoard() });
    expect(tryRemove(s, { col: 0, row: 0 })!.state.phase).toBe('levelCleared');
  });

  it('does not end while a group remains even if the target is reached', () => {
    const s = state({ score: 5000, target: 2000, board: makeBoard([[0, 0], [1, 1]]) });
    const out = tryRemove(s, { col: 0, row: 0 })!;
    expect(out.result.levelEnded).toBe(false);
    expect(out.state.phase).toBe('playing');
  });

  it('a cleared (empty) board ends the level', () => {
    const s = state({ score: 0, target: 2000, board: makeBoard([[0, 0]]) });
    const out = tryRemove(s, { col: 0, row: 0 })!;
    expect(out.state.board).toEqual([]);
    expect(out.state.phase).toBe('gameOver');
    expect(out.state.score).toBe(40);
  });

  it('single tile and empty cell: no change, score unchanged', () => {
    const s = state({ score: 100, board: makeBoard([[0, 1], [1, 0]]) });
    expect(tryRemove(s, { col: 0, row: 0 })).toBeNull();
    expect(tryRemove(s, { col: 9, row: 9 })).toBeNull();
  });

  it('ignores removal attempts when not playing', () => {
    const s = state({ phase: 'gameOver', board: makeBoard([[0, 0], [1, 1]]) });
    expect(tryRemove(s, { col: 0, row: 0 })).toBeNull();
  });
});

describe('level progression and restart', () => {
  it('starts at level 1 with score 0 and level-1 parameters', () => {
    const g = createGame(mulberry32(7));
    expect(g).toMatchObject({ level: 1, score: 0, target: targetFor(1), colors: colorsFor(1), phase: 'playing' });
    expect(g.board).toHaveLength(10);
  });

  it('next level keeps the score, increments level and uses new parameters', () => {
    const s = state({ score: 2300, phase: 'levelCleared', board: [] });
    const n = nextLevel(s, mulberry32(3));
    expect(n).toMatchObject({ level: 2, score: 2300, target: targetFor(2), colors: colorsFor(2), phase: 'playing' });
    expect(n.board.flat()).toHaveLength(100);
  });

  it('restart returns to level 1 with score 0 and a fresh board', () => {
    const s = state({ level: 4, score: 9000, target: targetFor(4), phase: 'gameOver', board: [] });
    const r = restart(s, mulberry32(9));
    expect(r).toMatchObject({ level: 1, score: 0, target: targetFor(1), colors: colorsFor(1), phase: 'playing' });
    expect(r.board.flat()).toHaveLength(100);
  });

  it('tile ids stay unique across levels', () => {
    const g = createGame(mulberry32(5));
    const n = nextLevel({ ...g, phase: 'levelCleared' }, mulberry32(6));
    const ids = new Set([...g.board.flat(), ...n.board.flat()].map((t) => t.id));
    expect(ids.size).toBe(200);
  });
});
