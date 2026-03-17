import { useGameState, useDispatch } from '../hooks/use-game';
import type { DevCardType } from '@settlement3/shared';

const CARD_LABELS: Record<DevCardType, string> = {
  knight: 'Knight',
  victoryPoint: 'Victory Point',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
};

const CARD_DESCRIPTIONS: Record<DevCardType, string> = {
  knight: 'Move the robber and steal a resource',
  victoryPoint: '+1 Victory Point (automatic)',
  roadBuilding: 'Place 2 roads for free',
  yearOfPlenty: 'Take any 2 resources from the bank',
  monopoly: 'Take all of one resource from all players',
};

export function DevCardPanel({ onClose }: { onClose: () => void }) {
  const state = useGameState();
  const dispatchAction = useDispatch();
  const player = state.players[state.currentPlayerIndex];

  const playableCards = player.devCards.filter(
    d => d.type !== 'victoryPoint' && d.turnBought < state.turnNumber
  );

  // Group by type
  const grouped = new Map<DevCardType, number>();
  for (const card of playableCards) {
    grouped.set(card.type, (grouped.get(card.type) ?? 0) + 1);
  }

  const vpCount = player.devCards.filter(d => d.type === 'victoryPoint').length;

  function playCard(type: DevCardType) {
    const result = dispatchAction({ type: 'PLAY_DEV_CARD', cardType: type });
    if (result.success) onClose();
  }

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 bg-stone-800/95 backdrop-blur-sm rounded-xl p-4 w-80 shadow-xl border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white text-sm">Dev Cards</h3>
        <button onClick={onClose} className="text-stone-400 hover:text-white text-lg">&times;</button>
      </div>

      {vpCount > 0 && (
        <div className="mb-2 px-3 py-2 bg-yellow-900/30 rounded-lg border border-yellow-800/30">
          <span className="text-xs text-yellow-300">Victory Points: {vpCount}</span>
        </div>
      )}

      {grouped.size === 0 ? (
        <p className="text-xs text-stone-400">No playable dev cards</p>
      ) : (
        <div className="space-y-2">
          {Array.from(grouped.entries()).map(([type, count]) => (
            <button
              key={type}
              onClick={() => playCard(type)}
              className="w-full flex items-center justify-between px-3 py-2 bg-purple-900/40 hover:bg-purple-800/50 rounded-lg border border-purple-800/30 transition-colors"
            >
              <div className="text-left">
                <div className="text-sm text-white font-medium">{CARD_LABELS[type]} &times;{count}</div>
                <div className="text-xs text-stone-400">{CARD_DESCRIPTIONS[type]}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
