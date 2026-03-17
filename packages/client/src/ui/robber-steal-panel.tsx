import { useGameState, useDispatch } from '../hooks/use-game';
import type { PlayerColor } from '@settlement3/shared';
import { GameDialog } from './game-dialog';

const COLOR_CLASSES: Record<PlayerColor, string> = {
  red: 'bg-red-500 hover:bg-red-400',
  blue: 'bg-blue-500 hover:bg-blue-400',
  white: 'bg-gray-200 hover:bg-gray-100 text-stone-900',
  orange: 'bg-orange-500 hover:bg-orange-400',
};

export function RobberStealPanel() {
  const state = useGameState();
  const dispatchAction = useDispatch();
  const targets = state.robberStealTargets;

  return (
    <GameDialog open title="Steal from whom?" className="w-72">
      <div className="space-y-2">
        {targets.map(pid => {
          const p = state.players[pid];
          return (
            <button
              key={pid}
              onClick={() => dispatchAction({ type: 'ROBBER_STEAL', targetPlayer: pid })}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors ${COLOR_CLASSES[p.color]}`}
            >
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
    </GameDialog>
  );
}
