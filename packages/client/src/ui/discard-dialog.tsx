import { useState } from 'react';
import { ALL_RESOURCES, type Resource } from '@settlement3/shared';
import { useGameState, useDispatch } from '../hooks/use-game';

const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '🪵', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛏️',
};

export function DiscardDialog() {
  const state = useGameState();
  const dispatchAction = useDispatch();

  // Show for each player that needs to discard
  // In local mode, we show one at a time
  const discardPlayerIds = [...state.playersNeedingToDiscard];
  const currentDiscardPlayer = discardPlayerIds[0];

  if (currentDiscardPlayer === undefined) return null;

  return <DiscardForPlayer playerId={currentDiscardPlayer} />;
}

function DiscardForPlayer({ playerId }: { playerId: number }) {
  const state = useGameState();
  const dispatchAction = useDispatch();
  const player = state.players[playerId];
  const total = ALL_RESOURCES.reduce((s, r) => s + player.resources[r], 0);
  const mustDiscard = Math.floor(total / 2);

  const [selected, setSelected] = useState<Record<Resource, number>>({
    wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0,
  });

  const totalSelected = Object.values(selected).reduce((a, b) => a + b, 0);

  function adjust(res: Resource, delta: number) {
    setSelected(prev => ({
      ...prev,
      [res]: Math.max(0, Math.min(player.resources[res], prev[res] + delta)),
    }));
  }

  function confirm() {
    dispatchAction({ type: 'DISCARD_RESOURCES', resources: selected }, playerId);
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="bg-stone-800 rounded-xl p-5 w-80 shadow-xl border border-white/10">
        <h3 className="font-semibold text-white text-sm mb-1">
          {player.name}: Discard {mustDiscard} cards
        </h3>
        <p className="text-xs text-stone-400 mb-3">
          You have {total} cards. Select {mustDiscard} to discard.
        </p>

        <div className="space-y-1 mb-3">
          {ALL_RESOURCES.map(res => (
            <div key={res} className="flex items-center justify-between">
              <span className="text-xs text-white">
                {RESOURCE_ICONS[res]} {res} ({player.resources[res]})
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => adjust(res, -1)} className="w-5 h-5 rounded bg-stone-700 text-white text-xs">-</button>
                <span className="text-xs text-white w-4 text-center tabular-nums">{selected[res]}</span>
                <button onClick={() => adjust(res, 1)} className="w-5 h-5 rounded bg-stone-700 text-white text-xs">+</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-stone-400">
            Selected: {totalSelected} / {mustDiscard}
          </span>
        </div>

        <button
          onClick={confirm}
          disabled={totalSelected !== mustDiscard}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            totalSelected === mustDiscard
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-stone-700 text-stone-500 cursor-not-allowed'
          }`}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
