import type { GameState, GameAction, ActionResult } from '@settlement3/shared';

export interface GameService {
  dispatch(action: GameAction, actingPlayer?: number): ActionResult;
  subscribe(listener: (state: GameState) => void): () => void;
  getState(): GameState;
}
