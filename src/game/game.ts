import { findMoves, generateGrid, isValidSwap, type Grid, type Move, type Pos } from './board';
import { resolveSwap, type Resolution } from './cascade';
import { COLS, ROWS, colorsFor, movesFor, targetFor } from './levels';
import type { Rng } from './rng';

export type Phase = 'playing' | 'levelCleared' | 'levelFailed';

export interface GameState {
  level: number;
  score: number;
  target: number;
  movesLeft: number;
  colors: number;
  grid: Grid;
  phase: Phase;
  /** Next unused tile id; ids are unique within a page session. */
  nextId: number;
}

export type SwapOutcome = { kind: 'invalid' } | { kind: 'valid'; state: GameState; resolution: Resolution };

/** Fresh level with score 0 and a full move budget (AC-2, AC-13). */
export function createGame(rng: Rng, level = 1, firstId = 0): GameState {
  const colors = colorsFor(level);
  const grid = generateGrid(ROWS, COLS, colors, rng, firstId);
  return {
    level,
    score: 0,
    target: targetFor(level),
    movesLeft: movesFor(level),
    colors,
    grid,
    phase: 'playing',
    nextId: firstId + ROWS * COLS,
  };
}

/**
 * One player swap (AC-4, AC-6, AC-7, AC-8, AC-9). Invalid swaps and swaps
 * outside play leave the state untouched and cost no move. The level result is
 * decided after all cascades and any shuffle (TD-009, R1).
 */
export function swapTiles(state: GameState, a: Pos, b: Pos, rng: Rng): SwapOutcome {
  if (state.phase !== 'playing' || state.movesLeft <= 0) return { kind: 'invalid' };
  if (!isValidSwap(state.grid, a, b)) return { kind: 'invalid' };
  const { resolution, grid, nextId } = resolveSwap(state.grid, a, b, {
    colors: state.colors,
    rng,
    nextId: state.nextId,
  });
  const score = state.score + resolution.gained;
  const movesLeft = state.movesLeft - 1;
  const phase: Phase = score >= state.target ? 'levelCleared' : movesLeft === 0 ? 'levelFailed' : 'playing';
  return { kind: 'valid', state: { ...state, grid, score, movesLeft, phase, nextId }, resolution };
}

/** Next level after a clear; the level score starts again from 0. */
export function nextLevel(state: GameState, rng: Rng): GameState {
  return createGame(rng, state.level + 1, state.nextId);
}

/** Same level again from 0 with a new board (AC-11). */
export function retryLevel(state: GameState, rng: Rng): GameState {
  return createGame(rng, state.level, state.nextId);
}

/** The first valid swap in row-major order, rightward before downward (TD-016). */
export function hintMove(grid: Grid): Move | null {
  return findMoves(grid)[0] ?? null;
}
