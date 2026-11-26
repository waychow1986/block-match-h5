import { generateBoard, removeGroup, type Board, type MoveResult, type Pos } from './board';
import { COLS, ROWS, colorsFor, targetFor } from './levels';
import type { Rng } from './rng';

export type Phase = 'playing' | 'levelCleared' | 'gameOver';
export interface GameState {
  level: number;
  score: number;
  target: number;
  colors: number;
  board: Board;
  phase: Phase;
  /** Next unused tile id; keeps ids unique within a page session. */
  nextId: number;
}

function startLevel(level: number, score: number, rng: Rng, firstId: number): GameState {
  const colors = colorsFor(level);
  const board = generateBoard(COLS, ROWS, colors, rng, firstId);
  return { level, score, target: targetFor(level), colors, board, phase: 'playing', nextId: firstId + COLS * ROWS };
}

export function createGame(rng: Rng): GameState {
  return startLevel(1, 0, rng, 0);
}

/** Level end decision (FR-017): reaching the target exactly counts as cleared. */
export function levelOutcome(score: number, target: number): Phase {
  return score >= target ? 'levelCleared' : 'gameOver';
}

export function tryRemove(state: GameState, pos: Pos): { state: GameState; result: MoveResult } | null {
  if (state.phase !== 'playing') return null;
  const result = removeGroup(state.board, pos);
  if (!result) return null;
  const score = state.score + result.gained;
  const phase = result.levelEnded ? levelOutcome(score, state.target) : 'playing';
  return { state: { ...state, score, board: result.board, phase }, result };
}

export function nextLevel(state: GameState, rng: Rng): GameState {
  return startLevel(state.level + 1, state.score, rng, state.nextId);
}

export function restart(state: GameState, rng: Rng): GameState {
  return startLevel(1, 0, rng, state.nextId);
}
