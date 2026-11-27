import { mulberry32, randomSeed, type Rng } from './game/rng';
import type { GameState } from './game/game';
import { browserStorage, createHighScoreStore } from './storage/highScore';
import { GameController } from './ui/controller';

export interface MountOptions {
  /** Injectable randomness for tests; defaults to a crypto-seeded generator. */
  rng?: Rng;
}

export interface GameHandle {
  readonly state: GameState;
  destroy(): void;
}

export function mountGame(root: HTMLElement, options: MountOptions = {}): GameHandle {
  const rng = options.rng ?? mulberry32(randomSeed());
  const controller = new GameController(root.ownerDocument, rng, createHighScoreStore(browserStorage()));
  root.append(controller.element);
  return {
    get state() {
      return controller.state;
    },
    destroy: () => controller.destroy(),
  };
}
