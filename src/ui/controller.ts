import { findGroup, type MoveResult, type Pos } from '../game/board';
import { COLS, ROWS } from '../game/levels';
import { createGame, nextLevel, restart, tryRemove, type GameState } from '../game/game';
import type { Rng } from '../game/rng';
import type { HighScoreStore } from '../storage/highScore';
import { createSound, type Sound } from '../audio/sound';
import { BoardView } from './boardView';
import { Hud } from './hud';
import { attachTapInput } from './input';
import { Overlay } from './overlay';
import { FLOAT_MS, LEVEL_END_PAUSE_MS, MOVE_SETTLE_MS, SCORE_COUNT_MS } from './timing';

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
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private detachInput: () => void;
  private readonly unlockAudio = (): void => this.sound.unlock();

  constructor(
    private readonly doc: Document,
    private readonly rng: Rng,
    private readonly highScore: HighScoreStore,
  ) {
    this.state = createGame(rng);
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
    const tileOf = (el: Element | null): HTMLElement | null =>
      this.boardView.positionOf(el) ? (el!.closest('.tile') as HTMLElement) : null;
    this.detachInput = attachTapInput(
      this.boardView.element,
      tileOf,
      (tile) => this.onTap(tile),
      (tile) => this.highlight(tile),
    );
    // Audio may only start after a user gesture (A-11): create/resume it on the first press.
    doc.addEventListener('pointerdown', this.unlockAudio, true);
    this.render();
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

  private render(move?: MoveResult): void {
    this.boardView.sync(this.state.board, move);
    this.hud.update({
      level: this.state.level,
      score: this.state.score,
      target: this.state.target,
      highScore: this.highScore.value,
    });
  }

  private setBusy(b: boolean): void {
    this.busy = b;
    this.boardView.setBusy(b);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** Highlights the whole group under `tile` when it is removable (≥2); otherwise clears. */
  private highlight(tile: HTMLElement | null): void {
    const pos = tile && !this.busy && this.state.phase === 'playing' ? this.boardView.positionOf(tile) : null;
    const group = pos ? findGroup(this.state.board, pos) : [];
    const ids = group.length >= 2 ? group.map((p) => this.state.board[p.col]![p.row]!.id) : [];
    this.boardView.highlight(ids);
  }

  private onTap(tile: HTMLElement): void {
    if (this.busy || this.state.phase !== 'playing') return;
    const pos = this.boardView.positionOf(tile);
    if (!pos) return;
    const before = this.state.score;
    const outcome = tryRemove(this.state, pos);
    if (!outcome) return;
    this.state = outcome.state;
    this.highScore.offer(this.state.score);
    this.setBusy(true);
    this.render(outcome.result);
    this.hud.countScore(before, this.state.score, SCORE_COUNT_MS);
    this.showGain(outcome.result);
    this.sound.playRemove(outcome.result.removed.length);
    if (this.state.phase === 'playing') {
      this.later(MOVE_SETTLE_MS, () => this.setBusy(false));
      return;
    }
    this.later(MOVE_SETTLE_MS + LEVEL_END_PAUSE_MS, () => this.showOutcome());
  }

  /** "+N" float at the centre of the removed group, inside the board container (TD-007). */
  private showGain(result: MoveResult): void {
    const ps: Pos[] = result.removed.map((r) => r.pos);
    const cx = ps.reduce((s, p) => s + p.col, 0) / ps.length;
    const cy = ps.reduce((s, p) => s + p.row, 0) / ps.length;
    const el = this.doc.createElement('div');
    el.className = 'score-float';
    el.textContent = `+${result.gained}`;
    el.style.left = `${((cx + 0.5) / COLS) * 100}%`;
    el.style.top = `${((ROWS - 0.5 - cy) / ROWS) * 100}%`;
    this.wrap.append(el);
    this.later(FLOAT_MS, () => el.remove());
  }

  private showOutcome(): void {
    const kind = this.state.phase === 'levelCleared' ? 'levelCleared' : 'gameOver';
    if (kind === 'levelCleared') this.sound.playLevelCleared();
    else this.sound.playGameOver();
    this.overlay.show(kind, this.state.score, () => {
      this.state = kind === 'levelCleared' ? nextLevel(this.state, this.rng) : restart(this.state, this.rng);
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
    this.sound.setMuted(true);
    this.element.remove();
  }
}
