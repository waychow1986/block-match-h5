import { createGame, nextLevel, restart, tryRemove, type GameState } from '../game/game';
import type { Rng } from '../game/rng';
import type { HighScoreStore } from '../storage/highScore';
import { BoardView } from './boardView';
import { Hud } from './hud';
import { attachTapInput } from './input';
import { Overlay } from './overlay';
import { LEVEL_END_PAUSE_MS, MOVE_SETTLE_MS } from './timing';

/** Glue between game rules and the DOM. Input is ignored (not queued) while busy. */
export class GameController {
  state: GameState;
  readonly hud: Hud;
  readonly boardView: BoardView;
  readonly overlay: Overlay;
  readonly element: HTMLElement;
  private busy = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private detachInput: () => void;

  constructor(
    doc: Document,
    private readonly rng: Rng,
    private readonly highScore: HighScoreStore,
  ) {
    this.state = createGame(rng);
    this.element = doc.createElement('main');
    this.element.className = 'game';
    this.hud = new Hud(doc);
    const wrap = doc.createElement('div');
    wrap.className = 'board-wrap';
    this.boardView = new BoardView(doc);
    wrap.append(this.boardView.element);
    this.overlay = new Overlay(doc, wrap);
    this.element.append(this.hud.element, wrap);
    this.detachInput = attachTapInput(
      this.boardView.element,
      (el) => (this.boardView.positionOf(el) ? (el!.closest('.tile') as HTMLElement) : null),
      (tile) => this.onTap(tile),
    );
    this.render();
  }

  private render(): void {
    this.boardView.sync(this.state.board);
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

  private onTap(tile: HTMLElement): void {
    if (this.busy || this.state.phase !== 'playing') return;
    const pos = this.boardView.positionOf(tile);
    if (!pos) return;
    const outcome = tryRemove(this.state, pos);
    if (!outcome) return;
    this.state = outcome.state;
    this.highScore.offer(this.state.score);
    this.setBusy(true);
    this.render();
    if (this.state.phase === 'playing') {
      this.later(MOVE_SETTLE_MS, () => this.setBusy(false));
      return;
    }
    this.later(MOVE_SETTLE_MS + LEVEL_END_PAUSE_MS, () => this.showOutcome());
  }

  private showOutcome(): void {
    const kind = this.state.phase === 'levelCleared' ? 'levelCleared' : 'gameOver';
    this.overlay.show(kind, this.state.score, () => {
      this.state = kind === 'levelCleared' ? nextLevel(this.state, this.rng) : restart(this.state, this.rng);
      this.render();
      this.setBusy(false);
    });
  }

  destroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.detachInput();
    this.element.remove();
  }
}
