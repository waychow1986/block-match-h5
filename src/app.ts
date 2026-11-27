import { mulberry32, randomSeed, type Rng } from './game/rng';
import type { GameState } from './game/game';
import { browserStorage, createHighScoreStore, createLevelStore, type StorageLike } from './storage/highScore';
import { GameController } from './ui/controller';

export interface MountOptions {
  /** Injectable randomness for tests; defaults to a crypto-seeded generator. */
  rng?: Rng;
  /** Injectable storage for tests; defaults to localStorage (null when unavailable). */
  storage?: StorageLike | null;
}

export interface GameHandle {
  readonly state: GameState;
  destroy(): void;
}

export function mountGame(root: HTMLElement, options: MountOptions = {}): GameHandle {
  const rng = options.rng ?? mulberry32(randomSeed());
  const storage = options.storage !== undefined ? options.storage : browserStorage();
  const controller = new GameController(
    root.ownerDocument,
    rng,
    createHighScoreStore(storage),
    createLevelStore(storage),
  );
  root.append(controller.element);
  return {
    get state() {
      return controller.state;
    },
    destroy: () => controller.destroy(),
  };
}
