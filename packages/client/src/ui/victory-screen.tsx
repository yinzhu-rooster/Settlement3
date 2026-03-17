import * as Dialog from '@radix-ui/react-dialog';
import { useGameState } from '../hooks/use-game';
import type { PlayerColor } from '@settlement3/shared';

const COLOR_TEXT: Record<PlayerColor, string> = {
  red: 'text-red-400',
  blue: 'text-blue-400',
  white: 'text-gray-200',
  orange: 'text-orange-400',
};

const COLOR_BG: Record<PlayerColor, string> = {
  red: 'from-red-950/90',
  blue: 'from-blue-950/90',
  white: 'from-gray-800/90',
  orange: 'from-orange-950/90',
};

export function VictoryScreen({ onNewGame }: { onNewGame: () => void }) {
  const state = useGameState();
  if (state.winner === null) return null;

  const winner = state.players[state.winner];
  const sorted = [...state.players].sort((a, b) => b.victoryPoints - a.victoryPoints);

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gradient-to-b ${COLOR_BG[winner.color]} to-stone-900/95 rounded-2xl p-8 w-96 shadow-2xl border border-white/10 text-center focus:outline-none`}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{winner.name} Wins!</Dialog.Title>
          <Dialog.Description className="sr-only">{winner.name} won with {winner.victoryPoints} Victory Points</Dialog.Description>

          <div className="text-4xl mb-2">&#127942;</div>
          <h2 className={`text-2xl font-bold mb-1 ${COLOR_TEXT[winner.color]}`} style={{ fontFamily: 'Playfair Display' }}>
            {winner.name} Wins!
          </h2>
          <p className="text-stone-400 text-sm mb-6">{winner.victoryPoints} Victory Points</p>

          {/* Scoreboard */}
          <div className="space-y-2 mb-6">
            {sorted.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                  p.id === state.winner ? 'bg-white/10' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-500 w-4">{i + 1}.</span>
                  <span className={`text-sm font-medium ${COLOR_TEXT[p.color]}`}>{p.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-stone-400">
                  {p.hasLongestRoad && <span title="Longest Road">&#128739;</span>}
                  {p.hasLargestArmy && <span title="Largest Army">&#9876;&#65039;</span>}
                  <span className="font-bold text-sm text-white">{p.victoryPoints} VP</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onNewGame}
            className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors"
          >
            New Game
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
