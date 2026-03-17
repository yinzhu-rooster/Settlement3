import { createContext, useContext, useSyncExternalStore, useCallback } from 'react';
import type { GameState, GameAction, ActionResult } from '@settlement3/shared';
import type { GameService } from '../services/game-service';

export const GameServiceContext = createContext<GameService | null>(null);

/** Context for the local player's index — set by App based on game mode. */
export const PlayerIndexContext = createContext<number | null>(null);

export function useGameService(): GameService {
  const service = useContext(GameServiceContext);
  if (!service) throw new Error('useGameService must be used within GameServiceProvider');
  return service;
}

export function useGameState(): GameState {
  const service = useGameService();
  return useSyncExternalStore(
    (cb) => service.subscribe(cb),
    () => service.getState()
  );
}

export function useDispatch(): (action: GameAction, actingPlayer?: number) => ActionResult {
  const service = useGameService();
  return useCallback(
    (action: GameAction, actingPlayer?: number) => service.dispatch(action, actingPlayer),
    [service]
  );
}

/**
 * Returns the local player's index.
 * - Online mode: fixed seat index from the server.
 * - Local mode: currentPlayerIndex (hot-seat — always the active player).
 */
export function usePlayerIndex(): number {
  const overrideIndex = useContext(PlayerIndexContext);
  const state = useGameState();
  // If a fixed player index is provided (online mode), use it.
  // Otherwise fall back to the current player index (local hot-seat).
  return overrideIndex ?? state.currentPlayerIndex;
}

/**
 * Returns true when it's the local player's turn.
 */
export function useIsMyTurn(): boolean {
  const playerIndex = usePlayerIndex();
  const state = useGameState();
  return playerIndex === state.currentPlayerIndex;
}
