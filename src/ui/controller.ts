import { isAdjacent, samePos, tileAt, type Pos } from '../game/board';
import { refillStart, type RoundStep } from '../game/cascade';
import { COLS, ROWS } from '../game/levels';
import { createGame, hintMove, nextLevel, retryLevel, swapTiles, type GameState } from '../game/game';
import type { Rng } from '../game/rng';
import type { MaxStore } from '../storage/highScore';
import { createSound, type Sound } from '../audio/sound';
import { BoardView } from './boardView';
import { Hud } from './hud';
import { attachSwapInput } from './input';
import { Overlay } from './overlay';
import {
  FALL_MS,
  FLOAT_MS,
  HINT_DELAY_MS,
  LEVEL_END_PAUSE_MS,
  MOVE_SETTLE_MS,
  REMOVE_MS,
  SCORE_COUNT_MS,
  SHUFFLE_MS,
  SWAP_MS,
} from './timing';

const ICON_SOUND =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_MUTED =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** Glue between game rules and the DOM. Input is ignored (not queued) while busy. */
export class GameController {
  state: GameState;
  readonly hud: Hud;
  readonly boardView: BoardView;
  readonly overlay: Overlay;
  readonly element: HTMLElement;
  readonly muteButton: HTMLButtonElement;
  private readonly wrap: HTMLElement;
  private readonly sound: Sound;
  private busy = false;
  /** First tile of a tap-tap swap (A-11). */
  private selected: Pos | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private detachInput: () => void;
  private readonly unlockAudio = (): void => this.sound.unlock();
  /** Any press or key restarts the idle countdown; a press also clears a shown hint (TD-016). */
  private readonly onActivity = (e: Event): void => {
    if (e.type === 'pointerdown') this.boardView.showHint([]);
    this.restartHint();
  };

  constructor(
    private readonly doc: Document,
    private readonly rng: Rng,
    private readonly highScore: MaxStore,
    private readonly reachedLevel: MaxStore,
  ) {
    this.state = createGame(rng, Math.max(1, reachedLevel.value));
    this.sound = createSound(doc.defaultView);
    this.element = doc.createElement('main');
    this.element.className = 'game';
    this.hud = new Hud(doc);
    this.muteButton = this.createMuteButton();
    this.hud.element.append(this.muteButton);
    const area = doc.createElement('div');
    area.className = 'board-area';
    this.wrap = doc.createElement('div');
    this.wrap.className = 'board-wrap';
    this.boardView = new BoardView(doc, (ms, fn) => this.later(ms, fn));
    this.wrap.append(this.boardView.element);
    area.append(this.wrap);
    this.overlay = new Overlay(doc, this.wrap);
    this.element.append(this.hud.element, area);
    this.detachInput = attachSwapInput(this.boardView.element, ROWS, COLS, {
      positionOf: (el) => this.boardView.positionOf(el),
      onTap: (tile) => this.onTap(tile),
      onSwap: (from, to) => this.onDragSwap(from, to),
    });
    // Audio may only start after a user gesture (A-11): create/resume it on the first press.
    doc.addEventListener('pointerdown', this.unlockAudio, true);
    doc.addEventListener('pointerdown', this.onActivity, true);
    doc.addEventListener('keydown', this.onActivity, true);
    this.render();
    this.restartHint();
  }

  private createMuteButton(): HTMLButtonElement {
    const btn = this.doc.createElement('button');
    btn.type = 'button';
    btn.className = 'mute';
    btn.setAttribute('aria-label', '静音');
    const paint = (): void => {
      btn.setAttribute('aria-pressed', String(this.sound.muted));
      btn.innerHTML = this.sound.muted ? ICON_MUTED : ICON_SOUND;
    };
    btn.addEventListener('click', () => {
      this.sound.setMuted(!this.sound.muted);
      paint();
    });
    paint();
    return btn;
  }

  private render(): void {
    this.boardView.sync(this.state.grid);
    this.selected = null;
    this.boardView.select(null);
    this.hud.update({
      level: this.state.level,
      score: this.state.score,
      target: this.state.target,
      movesLeft: this.state.movesLeft,
      highScore: this.highScore.value,
    });
  }

  private setBusy(b: boolean): void {
    // aria-busy="false" promises final HUD values, even if animation frames were throttled.
    if (!b) this.hud.stopCount();
    this.busy = b;
    this.boardView.setBusy(b);
    this.restartHint();
  }

  /**
   * Idle hint (TD-016): counts 5 s only while the board is still, no prompt is
   * shown and the level is in progress; then marks the first valid swap.
   */
  private restartHint(): void {
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hintTimer = null;
    if (this.busy || this.state.phase !== 'playing') return;
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      if (this.busy || this.state.phase !== 'playing') return;
      const move = hintMove(this.state.grid);
      if (move) this.boardView.showHint(move.map((p) => tileAt(this.state.grid, p)!.id));
    }, HINT_DELAY_MS);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /**
   * Tap selection (A-11): the first tap selects, tapping it again deselects,
   * an adjacent tap tries the swap, a non-adjacent tap moves the selection.
   */
  private onTap(tile: HTMLElement): void {
    if (this.busy || this.state.phase !== 'playing') return;
    const pos = this.boardView.positionOf(tile);
    if (!pos) return;
    const first = this.selected;
    if (!first || (!samePos(first, pos) && !isAdjacent(first, pos))) {
      this.selected = pos;
      this.boardView.select(tileAt(this.state.grid, pos)!.id);
      return;
    }
    this.selected = null;
    this.boardView.select(null);
    if (!samePos(first, pos)) this.trySwap(first, pos);
  }

  /** Drag / swipe (TD-011): swaps with the neighbour and clears any tap selection. */
  private onDragSwap(from: Pos, to: Pos): void {
    if (this.busy || this.state.phase !== 'playing') return;
    this.selected = null;
    this.boardView.select(null);
    this.trySwap(from, to);
  }

  /**
   * Plays a swap (TD-012). Invalid: the tiles move out and back, nothing else
   * changes (AC-5). Valid: moves and high score update at once, then each
   * cascade round is played (remove → fall and refill) with its own "+N" float.
   */
  private trySwap(a: Pos, b: Pos): void {
    const ta = tileAt(this.state.grid, a)!;
    const tb = tileAt(this.state.grid, b)!;
    this.setBusy(true);
    this.boardView.setMoveMs(SWAP_MS);
    this.boardView.moveTo(ta.id, b);
    this.boardView.moveTo(tb.id, a);
    const outcome = swapTiles(this.state, a, b, this.rng);
    if (outcome.kind === 'invalid') {
      this.later(SWAP_MS, () => {
        this.boardView.moveTo(ta.id, a);
        this.boardView.moveTo(tb.id, b);
      });
      this.later(SWAP_MS * 2, () => this.setBusy(false));
      return;
    }
    let score = this.state.score;
    this.state = outcome.state;
    this.highScore.offer(this.state.score);
    if (this.state.phase === 'levelCleared') this.reachedLevel.offer(this.state.level + 1);
    this.hud.update({ movesLeft: this.state.movesLeft, highScore: this.highScore.value });
    const { steps, shuffle } = outcome.resolution;
    // The first removal sound starts with the swap itself, so it answers the gesture at once.
    if (steps[0]) this.sound.playRemove(steps[0].removed.length);
    let t = SWAP_MS;
    steps.forEach((step, i) => {
      const from = score;
      score += step.gained;
      const to = score;
      this.later(t, () => this.playRound(step, from, to, i > 0));
      t += MOVE_SETTLE_MS;
    });
    if (shuffle) {
      this.later(t, () => {
        this.boardView.setMoveMs(SHUFFLE_MS);
        this.boardView.sync(shuffle.grid);
      });
      t += SHUFFLE_MS;
    }
    if (this.state.phase === 'playing') {
      this.later(t, () => {
        this.render();
        this.setBusy(false);
      });
      return;
    }
    this.later(t, () => this.render());
    this.later(t + LEVEL_END_PAUSE_MS, () => this.showOutcome());
  }

  /** One cascade round: removal with sound, float and score count, then fall and refill. */
  private playRound(step: RoundStep, from: number, to: number, withSound: boolean): void {
    this.boardView.markRemoving(step.removed.map((r) => r.id));
    if (withSound) this.sound.playRemove(step.removed.length);
    this.hud.countScore(from, to, SCORE_COUNT_MS);
    this.showGain(step);
    this.later(REMOVE_MS, () => {
      const starts = new Map<number, Pos>();
      for (const s of step.spawned) starts.set(s.tile.id, s.pos);
      for (const r of step.refills) starts.set(r.tile.id, refillStart(r));
      this.boardView.setMoveMs(FALL_MS);
      this.boardView.sync(step.grid, starts);
    });
  }

  /** "+N" float at the centre of the tiles removed in a round, inside the board container (TD-012). */
  private showGain(step: RoundStep): void {
    const ps: Pos[] = step.removed.map((r) => r.pos);
    if (ps.length === 0 || step.gained <= 0) return;
    const cx = ps.reduce((s, p) => s + p.col, 0) / ps.length;
    const cy = ps.reduce((s, p) => s + p.row, 0) / ps.length;
    const el = this.doc.createElement('div');
    el.className = 'score-float';
    el.textContent = `+${step.gained}`;
    el.style.left = `${((cx + 0.5) / COLS) * 100}%`;
    el.style.top = `${((cy + 0.5) / ROWS) * 100}%`;
    this.wrap.append(el);
    this.later(FLOAT_MS, () => el.remove());
  }

  private showOutcome(): void {
    this.hud.stopCount();
    const kind = this.state.phase === 'levelCleared' ? 'levelCleared' : 'levelFailed';
    if (kind === 'levelCleared') this.sound.playLevelCleared();
    else this.sound.playGameOver();
    this.overlay.show(kind, this.state.level, this.state.score, () => {
      this.state = kind === 'levelCleared' ? nextLevel(this.state, this.rng) : retryLevel(this.state, this.rng);
      this.render();
      this.setBusy(false);
    });
  }

  destroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.hud.stopCount();
    this.detachInput();
    this.doc.removeEventListener('pointerdown', this.unlockAudio, true);
    this.doc.removeEventListener('pointerdown', this.onActivity, true);
    this.doc.removeEventListener('keydown', this.onActivity, true);
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.sound.setMuted(true);
    this.element.remove();
  }
}
