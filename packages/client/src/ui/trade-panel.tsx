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
    <div className="absolute bottom-24 left-4 right-4 z-20 bg-stone-800/95 backdrop-blur-sm rounded-xl p-4 max-w-lg mx-auto shadow-xl border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white text-sm">Trade</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTradeType('player')}
            className={`px-2 py-1 rounded text-xs ${tradeType === 'player' ? 'bg-white/20' : 'bg-white/5'} text-white`}
          >
            Player
          </button>
          <button
            onClick={() => setTradeType('bank')}
            className={`px-2 py-1 rounded text-xs ${tradeType === 'bank' ? 'bg-white/20' : 'bg-white/5'} text-white`}
          >
            Bank
          </button>
          <button onClick={onClose} className="text-stone-400 hover:text-white text-lg ml-2">&times;</button>
        </div>
      </div>

      {tradeType === 'player' ? (
        <>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-xs text-stone-400 mb-1">Offering</div>
              {ALL_RESOURCES.map(res => (
                <div key={res} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-white">{RESOURCE_ICONS[res]} {res}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => adjustOffer(res, -1)} className="w-5 h-5 rounded bg-stone-700 text-white text-xs">-</button>
                    <span className="text-xs text-white w-4 text-center tabular-nums">{offering[res] ?? 0}</span>
                    <button onClick={() => adjustOffer(res, 1)} className="w-5 h-5 rounded bg-stone-700 text-white text-xs">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs text-stone-400 mb-1">Requesting</div>
              {ALL_RESOURCES.map(res => (
                <div key={res} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-white">{RESOURCE_ICONS[res]} {res}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => adjustRequest(res, -1)} className="w-5 h-5 rounded bg-stone-700 text-white text-xs">-</button>
                    <span className="text-xs text-white w-4 text-center tabular-nums">{requesting[res] ?? 0}</span>
                    <button onClick={() => adjustRequest(res, 1)} className="w-5 h-5 rounded bg-stone-700 text-white text-xs">+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={sendOffer}
            className="w-full py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium text-white transition-colors"
          >
            Send Offer to All
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-stone-400 mb-2">
            Trade resources with the bank at the shown ratios
          </div>
          {ALL_RESOURCES.map(givingRes => {
            const ratio = getTradeRatio(givingRes);
            const canTrade = player.resources[givingRes] >= ratio;
            return (
              <div key={givingRes} className="flex items-center gap-2">
                <span className="text-xs text-white w-20">
                  {RESOURCE_ICONS[givingRes]} {ratio}:1
                </span>
                {ALL_RESOURCES.filter(r => r !== givingRes).map(receivingRes => (
                  <button
                    key={receivingRes}
                    onClick={() => doBankTrade(givingRes, receivingRes)}
                    disabled={!canTrade}
                    className={`px-2 py-1 rounded text-xs ${
                      canTrade ? 'bg-stone-700 hover:bg-stone-600 text-white' : 'bg-stone-800 text-stone-600 cursor-not-allowed'
                    }`}
                  >
                    {RESOURCE_ICONS[receivingRes]}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
