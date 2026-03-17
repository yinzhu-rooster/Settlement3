import { useState } from 'react';
import { ALL_RESOURCES, type Resource } from '@settlement3/shared';
import { useGameState, useDispatch } from '../hooks/use-game';

const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '🪵', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛏️',
};

export function TradePanel({ onClose }: { onClose: () => void }) {
  const state = useGameState();
  const dispatchAction = useDispatch();
  const player = state.players[state.currentPlayerIndex];

  const [offering, setOffering] = useState<Partial<Record<Resource, number>>>({});
  const [requesting, setRequesting] = useState<Partial<Record<Resource, number>>>({});
  const [tradeType, setTradeType] = useState<'player' | 'bank'>('player');

  function adjustOffer(res: Resource, delta: number) {
    setOffering(prev => {
      const val = Math.max(0, Math.min(player.resources[res], (prev[res] ?? 0) + delta));
      return { ...prev, [res]: val };
    });
  }

  function adjustRequest(res: Resource, delta: number) {
    setRequesting(prev => {
      const val = Math.max(0, (prev[res] ?? 0) + delta);
      return { ...prev, [res]: val };
    });
  }

  function sendOffer() {
    const result = dispatchAction({
      type: 'TRADE_OFFER',
      toPlayer: null,
      offering,
      requesting,
    });
    if (result.success) onClose();
  }

  function doBankTrade(giving: Resource, receiving: Resource) {
    dispatchAction({ type: 'BANK_TRADE', giving, receiving });
  }

  // Calculate trade ratios
  function getTradeRatio(res: Resource): number {
    if (player.ports.includes(res)) return 2;
    if (player.ports.includes('generic')) return 3;
    return 4;
  }

  return (
    <>
      {/* Mobile: full-screen overlay backdrop */}
      <div className="sm:hidden fixed inset-0 z-20 bg-black/60" onClick={onClose} />

      <div className="fixed inset-0 z-20 flex flex-col bg-stone-800 text-white sm:absolute sm:inset-auto sm:bottom-24 sm:left-4 sm:right-4 sm:bg-stone-800/95 sm:backdrop-blur-sm sm:rounded-xl sm:max-w-lg sm:mx-auto sm:shadow-xl sm:border sm:border-white/10 sm:flex-none">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-4 sm:mb-0 border-b border-white/10 sm:border-0">
          <h3 className="font-semibold text-white text-base sm:text-sm">Trade</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTradeType('player')}
              className={`px-3 py-2 sm:px-2 sm:py-1 rounded text-sm sm:text-xs ${tradeType === 'player' ? 'bg-white/20' : 'bg-white/5'} text-white`}
            >
              Player
            </button>
            <button
              onClick={() => setTradeType('bank')}
              className={`px-3 py-2 sm:px-2 sm:py-1 rounded text-sm sm:text-xs ${tradeType === 'bank' ? 'bg-white/20' : 'bg-white/5'} text-white`}
            >
              Bank
            </button>
            <button onClick={onClose} className="text-stone-400 hover:text-white text-2xl sm:text-lg ml-2 p-1">&times;</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tradeType === 'player' ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4 sm:mb-3">
                <div>
                  <div className="text-sm sm:text-xs text-stone-400 mb-2 sm:mb-1">Offering</div>
                  {ALL_RESOURCES.map(res => (
                    <div key={res} className="flex items-center justify-between py-1.5 sm:py-0.5">
                      <span className="text-sm sm:text-xs text-white">{RESOURCE_ICONS[res]} {res}</span>
                      <div className="flex items-center gap-2 sm:gap-1">
                        <button
                          onClick={() => adjustOffer(res, -1)}
                          className="w-8 h-8 sm:w-5 sm:h-5 rounded bg-stone-700 text-white text-sm sm:text-xs flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="text-sm sm:text-xs text-white w-5 sm:w-4 text-center tabular-nums">{offering[res] ?? 0}</span>
                        <button
                          onClick={() => adjustOffer(res, 1)}
                          className="w-8 h-8 sm:w-5 sm:h-5 rounded bg-stone-700 text-white text-sm sm:text-xs flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-sm sm:text-xs text-stone-400 mb-2 sm:mb-1">Requesting</div>
                  {ALL_RESOURCES.map(res => (
                    <div key={res} className="flex items-center justify-between py-1.5 sm:py-0.5">
                      <span className="text-sm sm:text-xs text-white">{RESOURCE_ICONS[res]} {res}</span>
                      <div className="flex items-center gap-2 sm:gap-1">
                        <button
                          onClick={() => adjustRequest(res, -1)}
                          className="w-8 h-8 sm:w-5 sm:h-5 rounded bg-stone-700 text-white text-sm sm:text-xs flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="text-sm sm:text-xs text-white w-5 sm:w-4 text-center tabular-nums">{requesting[res] ?? 0}</span>
                        <button
                          onClick={() => adjustRequest(res, 1)}
                          className="w-8 h-8 sm:w-5 sm:h-5 rounded bg-stone-700 text-white text-sm sm:text-xs flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3 sm:space-y-2">
              <div className="text-sm sm:text-xs text-stone-400 mb-2">
                Trade resources with the bank at the shown ratios
              </div>
              {ALL_RESOURCES.map(givingRes => {
                const ratio = getTradeRatio(givingRes);
                const canTrade = player.resources[givingRes] >= ratio;
                return (
                  <div key={givingRes} className="flex items-center gap-2">
                    <span className="text-sm sm:text-xs text-white w-20">
                      {RESOURCE_ICONS[givingRes]} {ratio}:1
                    </span>
                    <div className="flex items-center gap-1.5 sm:gap-1 flex-wrap">
                      {ALL_RESOURCES.filter(r => r !== givingRes).map(receivingRes => (
                        <button
                          key={receivingRes}
                          onClick={() => doBankTrade(givingRes, receivingRes)}
                          disabled={!canTrade}
                          className={`px-3 py-2 sm:px-2 sm:py-1 rounded text-sm sm:text-xs ${
                            canTrade ? 'bg-stone-700 hover:bg-stone-600 text-white' : 'bg-stone-800 text-stone-600 cursor-not-allowed'
                          }`}
                        >
                          {RESOURCE_ICONS[receivingRes]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer action (player trade) */}
        {tradeType === 'player' && (
          <div className="p-4 border-t border-white/10 sm:border-0 sm:pt-0">
            <button
              onClick={sendOffer}
              className="w-full py-3 sm:py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium text-white transition-colors"
            >
              Send Offer to All
            </button>
          </div>
        )}
      </div>
    </>
  );
}
