import { ALL_RESOURCES, type Resource } from '@settlement3/shared';
import { useGameState, usePlayerIndex } from '../hooks/use-game';

const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '🪵',
  brick: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛏️',
};

const RESOURCE_COLORS: Record<Resource, string> = {
  wood: 'bg-green-700',
  brick: 'bg-red-700',
  sheep: 'bg-emerald-400',
  wheat: 'bg-yellow-500',
  ore: 'bg-gray-500',
};

export function ResourceBar() {
  const state = useGameState();
  const myIndex = usePlayerIndex();
  const player = state.players[myIndex];

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {ALL_RESOURCES.map((res) => (
        <div
          key={res}
          className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg ${RESOURCE_COLORS[res]} text-white shadow-sm`}
        >
          <span className="text-xs sm:text-sm">{RESOURCE_ICONS[res]}</span>
          <span className="text-xs sm:text-sm font-bold tabular-nums">{player.resources[res]}</span>
        </div>
      ))}
    </div>
  );
}
