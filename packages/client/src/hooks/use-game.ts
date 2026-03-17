import { createContext, useContext, useSyncExternalStore, useCallback } from 'react';
import type { GameState, GameAction, ActionResult } from '@settlement3/shared';
import type { GameService } from '../services/game-service';

export const GameServiceContext = createContext<GameService | null>(null);

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
