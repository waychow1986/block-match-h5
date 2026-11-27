import { describe, expect, it } from 'vitest';
import { findLines, findMoves, isPlayable, isValidSwap, parseGrid, type Grid } from '../../src/game/board';
import { createGame, hintMove, nextLevel, retryLevel, swapTiles, type GameState } from '../../src/game/game';
import { colorsFor, movesFor, targetFor } from '../../src/game/levels';
import { mulberry32 } from '../../src/game/rng';

const p = (row: number, col: number) => ({ row, col });

// 8 x 8 board without lines; swapping (7,2)<->(7,3) makes a line of three 0s.
const FIXED = parseGrid([
  '12341234',
  '23412341',
  '34123412',
  '41234123',
  '12341234',
  '23412341',
  '34123412',
  '00102340',
]);

function withGrid(state: GameState, grid: Grid, patch: Partial<GameState> = {}): GameState {
  return { ...state, grid, nextId: 1000, ...patch };
}

describe('a new level (AC-2, AC-13)', () => {
  it('starts with score 0, the level target and moves, and a playable 8 x 8 board', () => {
    for (const level of [1, 5, 6, 12]) {
      const s = createGame(mulberry32(level), level);
      expect(s).toMatchObject({
        level,
        score: 0,
        target: targetFor(level),
        movesLeft: movesFor(level),
        colors: colorsFor(level),
        phase: 'playing',
      });
      expect(s.grid).toHaveLength(8);
      expect(isPlayable(s.grid)).toBe(true);
      expect(new Set(s.grid.flat().map((t) => t.color)).size).toBeLessThanOrEqual(colorsFor(level));
    }
  });
});

describe('swapping (AC-4, AC-7)', () => {
  const base = withGrid(createGame(mulberry32(1)), FIXED);

  it('an invalid swap changes nothing and costs no move', () => {
    for (const [a, b] of [
      [p(0, 0), p(0, 1)],
      [p(0, 0), p(1, 1)],
      [p(0, 0), p(0, 2)],
    ] as const) {
      expect(swapTiles(base, a, b, mulberry32(2))).toEqual({ kind: 'invalid' });
    }
    expect(base.movesLeft).toBe(movesFor(1));
  });

  it('a valid swap costs one move and adds the resolution points', () => {
    const out = swapTiles(base, p(7, 2), p(7, 3), mulberry32(2));
    expect(out.kind).toBe('valid');
    if (out.kind !== 'valid') return;
    expect(out.state.movesLeft).toBe(base.movesLeft - 1);
    expect(out.resolution.gained).toBeGreaterThan(0);
    expect(out.state.score).toBe(base.score + out.resolution.gained);
    expect(out.state.phase).toBe('playing');
    expect(out.state.nextId).toBeGreaterThan(base.nextId);
  });
});

describe('swapping a rainbow tile through swapTiles (AC-9, FR-043)', () => {
  it('a swap with a neighbour that forms no line is valid, costs one move and clears that colour', () => {
    const grid = parseGrid(['1231', '2*12', '3123', '4521']);
    expect(findLines(parseGrid(['1231', '21*2', '3123', '4521']))).toHaveLength(0);
    const base = withGrid(createGame(mulberry32(1)), grid, { target: Number.MAX_SAFE_INTEGER });
    const out = swapTiles(base, p(1, 1), p(1, 2), mulberry32(2));
    expect(out.kind).toBe('valid');
    if (out.kind !== 'valid') return;
    expect(out.state.movesLeft).toBe(base.movesLeft - 1);
    const removed = new Set(out.resolution.steps[0]!.removed.map((r) => r.id));
    for (const t of grid.flat()) if (t.color === 1 || t.kind === 'rainbow') expect(removed.has(t.id)).toBe(true);
    expect(out.state.score).toBe(base.score + out.resolution.gained);
  });
});

describe('a dead board after a swap (AC-14)', () => {
  // Refill colours 0,1,2 (bottom up) leave this 3 x 3 board without a valid swap.
  const shuffleRng = mulberry32(5);
  let i = 0;
  const refillThenRandom = () => (i < 3 ? (i++ + 0.5) / 4 : shuffleRng());

  it('is shuffled within the same move: one move spent, score up by the rounds only', () => {
    const base = withGrid(createGame(mulberry32(1)), parseGrid(['023', '302', '120']), {
      colors: 4,
      score: 70,
      target: Number.MAX_SAFE_INTEGER,
    });
    const out = swapTiles(base, p(1, 1), p(1, 2), refillThenRandom);
    expect(out.kind).toBe('valid');
    if (out.kind !== 'valid') return;
    expect(out.resolution.shuffle).not.toBeNull();
    expect(out.state.grid).toBe(out.resolution.shuffle!.grid);
    expect(isPlayable(out.state.grid)).toBe(true);
    expect(out.state.movesLeft).toBe(base.movesLeft - 1);
    const rounds = out.resolution.steps.reduce((sum, s) => sum + s.gained, 0);
    expect(out.state.score).toBe(70 + rounds);
    expect(out.state.phase).toBe('playing');
  });
});

describe('level outcome (AC-11, TD-009)', () => {
  const base = withGrid(createGame(mulberry32(1)), FIXED);

  it('reaching the target on the last move clears the level (R1)', () => {
    const s = { ...base, movesLeft: 1, score: base.target - 1 };
    const out = swapTiles(s, p(7, 2), p(7, 3), mulberry32(2));
    expect(out.kind === 'valid' && out.state.phase).toBe('levelCleared');
    expect(out.kind === 'valid' && out.state.movesLeft).toBe(0);
  });

  it('TS-23: on the last move, exactly reaching the target clears; one point short fails', () => {
    const dry = swapTiles({ ...base, movesLeft: 1, score: 0 }, p(7, 2), p(7, 3), mulberry32(2));
    if (dry.kind !== 'valid') throw new Error('expected a valid swap');
    const gain = dry.resolution.gained;
    const exact = swapTiles({ ...base, movesLeft: 1, score: base.target - gain }, p(7, 2), p(7, 3), mulberry32(2));
    expect(exact.kind === 'valid' && [exact.state.score, exact.state.movesLeft, exact.state.phase]).toEqual([
      base.target,
      0,
      'levelCleared',
    ]);
    const short = swapTiles({ ...base, movesLeft: 1, score: base.target - gain - 1 }, p(7, 2), p(7, 3), mulberry32(2));
    expect(short.kind === 'valid' && [short.state.score, short.state.phase]).toEqual([base.target - 1, 'levelFailed']);
  });

  it('TS-23: a cascade after the last move that crosses the target clears the level', () => {
    // Bottom-left: swapping (7,2)<->(7,3) removes three 0s; the falling column forms 1-1-1 in round 2.
    const chain = withGrid(
      createGame(mulberry32(1)),
      parseGrid(['12341234', '23412341', '34123412', '41234123', '34231234', '42342341', '21153412', '00104123']),
    );
    expect(findLines(chain.grid)).toHaveLength(0);
    const dry = swapTiles({ ...chain, movesLeft: 1, score: 0 }, p(7, 2), p(7, 3), mulberry32(2));
    if (dry.kind !== 'valid') throw new Error('expected a valid swap');
    expect(dry.resolution.steps.length).toBeGreaterThanOrEqual(2);
    const first = dry.resolution.steps[0]!.gained;
    const s = { ...chain, movesLeft: 1, score: chain.target - first - 1 };
    const out = swapTiles(s, p(7, 2), p(7, 3), mulberry32(2));
    expect(out.kind === 'valid' && out.state.movesLeft).toBe(0);
    expect(out.kind === 'valid' && out.state.score).toBeGreaterThan(chain.target);
    expect(out.kind === 'valid' && out.state.phase).toBe('levelCleared');
  });

  it('running out of moves below the target fails the level', () => {
    const s = { ...base, movesLeft: 1, score: 0 };
    const out = swapTiles(s, p(7, 2), p(7, 3), mulberry32(2));
    expect(out.kind === 'valid' && out.state.phase).toBe('levelFailed');
  });

  it('reaching the target with moves left clears the level', () => {
    const s = { ...base, score: base.target - 1 };
    const out = swapTiles(s, p(7, 2), p(7, 3), mulberry32(2));
    expect(out.kind === 'valid' && out.state.phase).toBe('levelCleared');
  });

  it('no swap is accepted once the level has ended', () => {
    for (const phase of ['levelCleared', 'levelFailed'] as const)
      expect(swapTiles({ ...base, phase }, p(7, 2), p(7, 3), mulberry32(2)).kind).toBe('invalid');
    expect(swapTiles({ ...base, movesLeft: 0 }, p(7, 2), p(7, 3), mulberry32(2)).kind).toBe('invalid');
  });

  it('next level raises the level and resets the score; retry keeps the level', () => {
    const cleared = { ...base, level: 3, score: 5000, phase: 'levelCleared' as const };
    const next = nextLevel(cleared, mulberry32(3));
    expect(next).toMatchObject({ level: 4, score: 0, movesLeft: movesFor(4), target: targetFor(4), phase: 'playing' });
    const again = retryLevel({ ...cleared, phase: 'levelFailed' }, mulberry32(4));
    expect(again).toMatchObject({ level: 3, score: 0, movesLeft: movesFor(3), target: targetFor(3), phase: 'playing' });
    const ids = [...next.grid.flat(), ...again.grid.flat()].map((t) => t.id);
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(cleared.nextId);
  });
});

describe('the board stays playable (AC-6)', () => {
  it('after every valid swap in random play the board has no line and a valid swap', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rng = mulberry32(seed);
      let s = createGame(rng, seed % 8 || 1);
      s = { ...s, target: Number.MAX_SAFE_INTEGER };
      for (let turn = 0; turn < 15 && s.phase === 'playing'; turn++) {
        const moves = findMoves(s.grid);
        const [a, b] = moves[Math.floor(rng() * moves.length)]!;
        const out = swapTiles(s, a, b, rng);
        expect(out.kind).toBe('valid');
        if (out.kind !== 'valid') return;
        s = out.state;
        expect(s.grid).toHaveLength(8);
        expect(s.grid.every((row) => row.length === 8 && row.every(Boolean))).toBe(true);
        expect(findLines(s.grid)).toHaveLength(0);
        expect(findMoves(s.grid).length).toBeGreaterThan(0);
        expect(new Set(s.grid.flat().map((t) => t.id)).size).toBe(64);
      }
    }
  });

  it('hintMove returns the first valid swap', () => {
    const hint = hintMove(FIXED)!;
    expect(hint).toEqual(findMoves(FIXED)[0]);
    expect(isValidSwap(FIXED, hint[0], hint[1])).toBe(true);
  });
});
