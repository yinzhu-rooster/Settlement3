import { useGameState } from '../hooks/use-game';
import type { PlayerColor } from '@settlement3/shared';

const COLOR_CLASSES: Record<PlayerColor, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  white: 'bg-gray-200',
  orange: 'bg-orange-500',
};

const COLOR_TEXT: Record<PlayerColor, string> = {
  red: 'text-red-500',
  blue: 'text-blue-500',
  white: 'text-gray-400',
  orange: 'text-orange-500',
};

export function TopBar() {
  const state = useGameState();
  const { players, currentPlayerIndex, gamePhase, turnPhase, turnNumber, diceRoll, winner } = state;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-stone-900/80 backdrop-blur-sm text-white">
      {/* Player indicators */}
      <div className="flex items-center gap-3">
        {players.map((p, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
              i === currentPlayerIndex ? 'bg-white/15 ring-1 ring-white/30' : 'opacity-60'
            }`}
          >
            <div className={`w-3 h-3 rounded-full ${COLOR_CLASSES[p.color]}`} />
            <span className="text-xs font-medium">{p.name}</span>
            <span className={`text-xs font-bold ${COLOR_TEXT[p.color]}`}>{p.victoryPoints} VP</span>
          </div>
        ))}
      </div>

      {/* Game info */}
      <div className="flex items-center gap-4">
        {diceRoll && (
          <div className="flex items-center gap-1 text-sm">
            <span className="font-mono bg-white/10 px-2 py-0.5 rounded">{diceRoll[0]}</span>
            <span>+</span>
            <span className="font-mono bg-white/10 px-2 py-0.5 rounded">{diceRoll[1]}</span>
            <span className="ml-1 font-bold">= {diceRoll[0] + diceRoll[1]}</span>
          </div>
        )}
        <div className="text-xs text-stone-400">
          {gamePhase === 'finished' && winner !== null ? (
            <span className="text-yellow-400 font-bold">{players[winner].name} wins!</span>
          ) : gamePhase === 'setup_1' || gamePhase === 'setup_2' ? (
            <span>Setup Phase {gamePhase === 'setup_1' ? '1' : '2'}</span>
          ) : (
            <span>Turn {turnNumber}</span>
          )}
          <span className="mx-1">|</span>
          <PhaseLabel phase={turnPhase} />
        </div>
      </div>
    </div>
  );
}

function PhaseLabel({ phase }: { phase: string }) {
  const labels: Record<string, string> = {
    setup_settlement: 'Place Settlement',
    setup_road: 'Place Road',
    pre_roll: 'Roll Dice',
    post_roll: 'Build / Trade',
    robber_discard: 'Discard Cards',
    robber_move: 'Move Robber',
    robber_steal: 'Steal Resource',
    road_building_1: 'Free Road (1/2)',
    road_building_2: 'Free Road (2/2)',
    year_of_plenty: 'Pick 2 Resources',
    monopoly: 'Pick Resource Type',
  };
  return <span>{labels[phase] ?? phase}</span>;
}
