import {
  type GameState,
  type GameAction,
  type GameConfig,
  type ActionResult,
  createInitialState,
  dispatch as rulesDispatch,
} from '@settlement3/shared';
import type { GameService } from './game-service';

export class LocalGameService implements GameService {
  private state: GameState;
  private listeners: Set<(state: GameState) => void> = new Set();

  constructor(config?: Partial<GameConfig>, seed?: number) {
    this.state = createInitialState(config, seed);
  }

  dispatch(action: GameAction, actingPlayer?: number): ActionResult {
    const result = rulesDispatch(this.state, action, actingPlayer);
    if (result.success) {
      this.state = result.state;
      this.notify();
    }
    return result;
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): GameState {
    return this.state;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
