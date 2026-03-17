import { useState } from 'react';
import { useGameState, useDispatch } from '../hooks/use-game';
import { useBuildMode } from '../hooks/use-build-mode';
import { BUILDING_COSTS, ALL_RESOURCES, type Resource, type DevCardType } from '@settlement3/shared';
import { ResourceBar } from './resource-bar';
import { TradePanel } from './trade-panel';
import { DevCardPanel } from './dev-card-panel';
import { DiscardDialog } from './discard-dialog';
import { RobberStealPanel } from './robber-steal-panel';
import { YearOfPlentyPicker } from './year-of-plenty-picker';
import { MonopolyPicker } from './monopoly-picker';
import { TradeResponseDialog } from './trade-response-dialog';
import { Toast } from './toast';

export function ActionBar() {
  const state = useGameState();
  const dispatchAction = useDispatch();
  const { buildMode, setBuildMode } = useBuildMode();
  const [showTrade, setShowTrade] = useState(false);
  const [showDevCards, setShowDevCards] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const player = state.players[state.currentPlayerIndex];
  const isSetup = state.gamePhase === 'setup_1' || state.gamePhase === 'setup_2';
  const isMainPhase = state.gamePhase === 'main';

  function doAction(action: Parameters<typeof dispatchAction>[0]) {
    const result = dispatchAction(action);
    if (!result.success) {
      setToast(result.error);
    }
  }

  function canAfford(costs: Partial<Record<Resource, number>>): boolean {
    return ALL_RESOURCES.every(r => (player.resources[r] ?? 0) >= (costs[r] ?? 0));
  }

  return (
    <>
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-stone-900/90 backdrop-blur-sm text-white">
        <div className="px-4 py-2 border-b border-white/10">
          <ResourceBar />
        </div>

        <div className="flex items-center justify-between px-4 py-2">
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Roll Dice */}
            {isMainPhase && state.turnPhase === 'pre_roll' && (
              <button
                onClick={() => doAction({ type: 'ROLL_DICE' })}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium text-sm transition-colors"
              >
                Roll Dice
              </button>
            )}

            {/* Build buttons (main phase, post-roll) */}
            {isMainPhase && state.turnPhase === 'post_roll' && (
              <>
                <button
                  onClick={() => setBuildMode(buildMode === 'road' ? null : 'road')}
                  disabled={!canAfford(BUILDING_COSTS.road)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    buildMode === 'road'
                      ? 'bg-blue-600 ring-2 ring-blue-400'
                      : canAfford(BUILDING_COSTS.road)
                        ? 'bg-stone-700 hover:bg-stone-600'
                        : 'bg-stone-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  Road
                </button>
                <button
                  onClick={() => setBuildMode(buildMode === 'settlement' ? null : 'settlement')}
                  disabled={!canAfford(BUILDING_COSTS.settlement)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    buildMode === 'settlement'
                      ? 'bg-blue-600 ring-2 ring-blue-400'
                      : canAfford(BUILDING_COSTS.settlement)
                        ? 'bg-stone-700 hover:bg-stone-600'
                        : 'bg-stone-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  Settlement
                </button>
                <button
                  onClick={() => setBuildMode(buildMode === 'city' ? null : 'city')}
                  disabled={!canAfford(BUILDING_COSTS.city)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    buildMode === 'city'
                      ? 'bg-blue-600 ring-2 ring-blue-400'
                      : canAfford(BUILDING_COSTS.city)
                        ? 'bg-stone-700 hover:bg-stone-600'
                        : 'bg-stone-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  City
                </button>
                <button
                  onClick={() => doAction({ type: 'BUY_DEV_CARD' })}
                  disabled={!canAfford(BUILDING_COSTS.devCard)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    canAfford(BUILDING_COSTS.devCard)
                      ? 'bg-purple-700 hover:bg-purple-600'
                      : 'bg-stone-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  Buy Dev Card
                </button>

                <div className="w-px h-6 bg-white/20 mx-1" />

                <button
                  onClick={() => setShowTrade(!showTrade)}
                  className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 rounded-lg text-sm transition-colors"
                >
                  Trade
                </button>

                {player.devCards.filter(d => d.type !== 'victoryPoint' && d.turnBought < state.turnNumber).length > 0 && (
                  <button
                    onClick={() => setShowDevCards(!showDevCards)}
                    disabled={player.devCardsPlayedThisTurn >= 1}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      player.devCardsPlayedThisTurn >= 1
                        ? 'bg-stone-800 opacity-40 cursor-not-allowed'
                        : 'bg-purple-700 hover:bg-purple-600'
                    }`}
                  >
                    Play Dev Card
                  </button>
                )}
              </>
            )}

            {/* Dev card pre-roll */}
            {isMainPhase && state.turnPhase === 'pre_roll' &&
              player.devCards.filter(d => d.type !== 'victoryPoint' && d.turnBought < state.turnNumber).length > 0 &&
              player.devCardsPlayedThisTurn === 0 && (
                <button
                  onClick={() => setShowDevCards(!showDevCards)}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm transition-colors"
                >
                  Play Dev Card
                </button>
              )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Undo */}
            <button
              onClick={() => doAction({ type: 'UNDO' })}
              className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 rounded-lg text-xs transition-colors"
            >
              Undo
            </button>

            {/* End Turn */}
            {isMainPhase && state.turnPhase === 'post_roll' && (
              <button
                onClick={() => {
                  doAction({ type: 'END_TURN' });
                  setBuildMode(null);
                  setShowTrade(false);
                  setShowDevCards(false);
                }}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg font-medium text-sm transition-colors"
              >
                End Turn
              </button>
            )}

            {/* Player switcher for local play */}
            {isSetup && (
              <div className="text-xs text-stone-400">
                {state.players[state.currentPlayerIndex].name}'s turn
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overlay panels */}
      {showTrade && (
        <TradePanel onClose={() => setShowTrade(false)} />
      )}
      {showDevCards && (
        <DevCardPanel onClose={() => setShowDevCards(false)} />
      )}
      <TradeResponseDialog />
      {state.turnPhase === 'robber_discard' && (
        <DiscardDialog />
      )}
      {state.turnPhase === 'robber_steal' && (
        <RobberStealPanel />
      )}
      {state.turnPhase === 'year_of_plenty' && (
        <YearOfPlentyPicker />
      )}
      {state.turnPhase === 'monopoly' && (
        <MonopolyPicker />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
