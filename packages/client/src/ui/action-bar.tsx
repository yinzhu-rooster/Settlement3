import { useState } from 'react';
import { useGameState, useDispatch, usePlayerIndex, useIsMyTurn } from '../hooks/use-game';
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
  const [expanded, setExpanded] = useState(false);

  const myIndex = usePlayerIndex();
  const isMyTurn = useIsMyTurn();
  const player = state.players[myIndex];
  const currentPlayer = state.players[state.currentPlayerIndex];
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

  const showPostRoll = isMyTurn && isMainPhase && state.turnPhase === 'post_roll';
  const hasPlayableDevCards =
    player.devCards.filter(d => d.type !== 'victoryPoint' && d.turnBought < state.turnNumber).length > 0;

  return (
    <>
      <div className={`absolute bottom-0 left-0 right-0 z-10 bg-stone-900/90 backdrop-blur-sm text-white ${expanded ? 'bottom-sheet-open' : 'sm:bottom-sheet-open bottom-sheet-closed'}`}>
        {/* "Waiting for..." banner when it's not our turn (online) */}
        {!isMyTurn && (
          <div className="px-4 py-2 bg-stone-800/80 border-b border-white/5 text-center text-sm text-stone-400">
            Waiting for <span className="text-white font-medium">{currentPlayer.name}</span>...
          </div>
        )}

        {/* Mobile drag handle / toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="sm:hidden w-full flex flex-col items-center py-1.5 min-h-0"
          aria-label={expanded ? 'Collapse action bar' : 'Expand action bar'}
        >
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </button>

        {/* Collapsed mobile bar: key actions always visible */}
        <div className="sm:hidden flex items-center justify-between px-3 py-1.5">
          {isMyTurn && isMainPhase && state.turnPhase === 'pre_roll' && (
            <button
              onClick={() => doAction({ type: 'ROLL_DICE' })}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium text-sm transition-colors"
            >
              Roll Dice
            </button>
          )}
          {showPostRoll && (
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
          {isSetup && (
            <div className="text-xs text-stone-400">
              {isMyTurn ? 'Your turn' : `${currentPlayer.name}'s turn`}
            </div>
          )}
          <ResourceBar />
        </div>

        {/* Expanded content (always visible on sm+, toggled on mobile) */}
        <div className={`${expanded ? 'block' : 'hidden'} sm:block`}>
          <div className="hidden sm:block px-4 py-2 border-b border-white/10">
            <ResourceBar />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-3 sm:px-4 py-2 gap-2 sm:gap-0">
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Roll Dice -- hidden on mobile collapsed since it's in the collapsed bar */}
              {isMyTurn && isMainPhase && state.turnPhase === 'pre_roll' && (
                <button
                  onClick={() => doAction({ type: 'ROLL_DICE' })}
                  className="hidden sm:inline-flex px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium text-sm transition-colors"
                >
                  Roll Dice
                </button>
              )}

              {/* Build buttons (main phase, post-roll) */}
              {showPostRoll && (
                <>
                  <button
                    onClick={() => setBuildMode(buildMode === 'road' ? null : 'road')}
                    disabled={!canAfford(BUILDING_COSTS.road)}
                    className={`px-3 py-2 sm:py-1.5 rounded-lg text-sm transition-colors ${
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
                    className={`px-3 py-2 sm:py-1.5 rounded-lg text-sm transition-colors ${
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
                    className={`px-3 py-2 sm:py-1.5 rounded-lg text-sm transition-colors ${
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
                    className={`px-3 py-2 sm:py-1.5 rounded-lg text-sm transition-colors ${
                      canAfford(BUILDING_COSTS.devCard)
                        ? 'bg-purple-700 hover:bg-purple-600'
                        : 'bg-stone-800 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    Dev Card
                  </button>

                  <div className="hidden sm:block w-px h-6 bg-white/20 mx-1" />

                  <button
                    onClick={() => setShowTrade(!showTrade)}
                    className="px-3 py-2 sm:py-1.5 bg-stone-700 hover:bg-stone-600 rounded-lg text-sm transition-colors"
                  >
                    Trade
                  </button>

                  {hasPlayableDevCards && (
                    <button
                      onClick={() => setShowDevCards(!showDevCards)}
                      disabled={player.devCardsPlayedThisTurn >= 1}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-sm transition-colors ${
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
              {isMyTurn && isMainPhase && state.turnPhase === 'pre_roll' &&
                hasPlayableDevCards &&
                player.devCardsPlayedThisTurn === 0 && (
                  <button
                    onClick={() => setShowDevCards(!showDevCards)}
                    className="px-3 py-2 sm:py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm transition-colors"
                  >
                    Play Dev Card
                  </button>
                )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => doAction({ type: 'UNDO' })}
                className="px-3 py-2 sm:py-1.5 bg-stone-700 hover:bg-stone-600 rounded-lg text-xs transition-colors"
              >
                Undo
              </button>

              {showPostRoll && (
                <button
                  onClick={() => {
                    doAction({ type: 'END_TURN' });
                    setBuildMode(null);
                    setShowTrade(false);
                    setShowDevCards(false);
                    setExpanded(false);
                  }}
                  className="hidden sm:inline-flex px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg font-medium text-sm transition-colors"
                >
                  End Turn
                </button>
              )}

              {isSetup && (
                <div className="hidden sm:block text-xs text-stone-400">
                  {isMyTurn ? 'Your turn' : `${currentPlayer.name}'s turn`}
                </div>
              )}
            </div>
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
