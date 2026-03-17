import { useState } from 'react';
import { ALL_RESOURCES, type Resource, type TradeOffer, type PlayerColor } from '@settlement3/shared';
import { useGameState, useDispatch } from '../hooks/use-game';

const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '🪵', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛏️',
};

const COLOR_BG: Record<PlayerColor, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  white: 'bg-gray-200',
  orange: 'bg-orange-500',
};

/**
 * In hot-seat mode, after a trade offer is sent, this dialog cycles through
 * each eligible player and lets them accept, reject, or counter.
 */
export function TradeResponseDialog() {
  const state = useGameState();
  const dispatchAction = useDispatch();

  // Find open trades
  const openTrades: TradeOffer[] = [];
  for (const tid of Object.keys(state.activeTrades)) {
    const trade = state.activeTrades[tid];
    if (trade.status === 'open') openTrades.push(trade);
  }

  if (openTrades.length === 0) return null;

  // Show the most recent open trade
  const trade = openTrades[openTrades.length - 1];
  const offerer = state.players[trade.fromPlayer];

  // Find players who haven't responded yet
  const eligiblePlayers = state.players
    .filter(p => p.id !== trade.fromPlayer)
    .filter(p => trade.toPlayer === null || trade.toPlayer === p.id)
    .filter(p => !(p.id in trade.respondedBy));

  // If everyone has responded, nothing to show
  if (eligiblePlayers.length === 0) return null;

  // In hot-seat: show one player at a time
  const respondingPlayer = eligiblePlayers[0];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="bg-stone-800 rounded-xl p-5 w-96 shadow-xl border border-white/10">
        <TradeOfferCard
          trade={trade}
          offererName={offerer.name}
          offererColor={offerer.color}
          respondingPlayer={respondingPlayer}
          onAccept={() => dispatchAction({ type: 'TRADE_ACCEPT', tradeId: trade.id }, respondingPlayer.id)}
          onReject={() => dispatchAction({ type: 'TRADE_REJECT', tradeId: trade.id }, respondingPlayer.id)}
          onCounter={(offering, requesting) => dispatchAction({ type: 'TRADE_COUNTER', tradeId: trade.id, offering, requesting }, respondingPlayer.id)}
        />
      </div>
    </div>
  );
}

function TradeOfferCard({
  trade,
  offererName,
  offererColor,
  respondingPlayer,
  onAccept,
  onReject,
  onCounter,
}: {
  trade: TradeOffer;
  offererName: string;
  offererColor: PlayerColor;
  respondingPlayer: { id: number; name: string; color: PlayerColor; resources: Record<Resource, number> };
  onAccept: () => void;
  onReject: () => void;
  onCounter: (offering: Partial<Record<Resource, number>>, requesting: Partial<Record<Resource, number>>) => void;
}) {
  const [showCounter, setShowCounter] = useState(false);

  // Pre-populate counter with inverse of original trade
  const [counterOffering, setCounterOffering] = useState<Partial<Record<Resource, number>>>(() => ({ ...trade.requesting }));
  const [counterRequesting, setCounterRequesting] = useState<Partial<Record<Resource, number>>>(() => ({ ...trade.offering }));

  // Check if responder can afford the original trade
  const canAfford = ALL_RESOURCES.every(
    r => respondingPlayer.resources[r] >= (trade.requesting[r] ?? 0)
  );

  // Check if responder can afford their counter-offer
  const canAffordCounter = ALL_RESOURCES.every(
    r => respondingPlayer.resources[r] >= (counterOffering[r] ?? 0)
  );

  // Check counter-offer has at least something on each side
  const counterHasOffering = ALL_RESOURCES.some(r => (counterOffering[r] ?? 0) > 0);
  const counterHasRequesting = ALL_RESOURCES.some(r => (counterRequesting[r] ?? 0) > 0);
  const canSubmitCounter = canAffordCounter && counterHasOffering && counterHasRequesting;

  function adjustCounterOffer(res: Resource, delta: number) {
    setCounterOffering(prev => {
      const val = Math.max(0, Math.min(respondingPlayer.resources[res], (prev[res] ?? 0) + delta));
      return { ...prev, [res]: val };
    });
  }

  function adjustCounterRequest(res: Resource, delta: number) {
    setCounterRequesting(prev => {
      const val = Math.max(0, (prev[res] ?? 0) + delta);
      return { ...prev, [res]: val };
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full ${COLOR_BG[offererColor]}`} />
        <h3 className="font-semibold text-white text-sm">
          {offererName} offers a trade
        </h3>
      </div>

      {/* Trade details */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-stone-700/50 rounded-lg p-2.5">
          <div className="text-[10px] text-stone-400 mb-1.5 uppercase tracking-wide">They give</div>
          <ResourceList resources={trade.offering} />
        </div>
        <div className="bg-stone-700/50 rounded-lg p-2.5">
          <div className="text-[10px] text-stone-400 mb-1.5 uppercase tracking-wide">They want</div>
          <ResourceList resources={trade.requesting} />
        </div>
      </div>

      {/* Responding player */}
      <div className="flex items-center gap-2 mb-3 py-2 border-t border-white/10">
        <div className={`w-3 h-3 rounded-full ${COLOR_BG[respondingPlayer.color]}`} />
        <span className="text-sm text-white font-medium">{respondingPlayer.name}</span>
        <span className="text-xs text-stone-400">— your response?</span>
      </div>

      {/* Your hand (for reference) */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] text-stone-500">Your hand:</span>
        {ALL_RESOURCES.map(r => (
          respondingPlayer.resources[r] > 0 ? (
            <span key={r} className="text-xs text-stone-300">
              {RESOURCE_ICONS[r]}{respondingPlayer.resources[r]}
            </span>
          ) : null
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          disabled={!canAfford}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            canAfford
              ? 'bg-green-700 hover:bg-green-600 text-white'
              : 'bg-stone-700 text-stone-500 cursor-not-allowed'
          }`}
        >
          {canAfford ? 'Accept' : "Can't afford"}
        </button>
        <button
          onClick={() => setShowCounter(prev => !prev)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            showCounter
              ? 'bg-amber-600 text-white'
              : 'bg-amber-900/60 hover:bg-amber-800/60 text-amber-200'
          }`}
        >
          Counter
        </button>
        <button
          onClick={onReject}
          className="flex-1 py-2 bg-red-900/60 hover:bg-red-800/60 text-red-200 rounded-lg text-sm font-medium transition-colors"
        >
          Reject
        </button>
      </div>

      {/* Counter-offer form */}
      {showCounter && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-xs text-stone-400 mb-2 font-medium">Your counter-offer</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[10px] text-stone-400 mb-1 uppercase tracking-wide">You give</div>
              {ALL_RESOURCES.map(res => (
                <div key={res} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-white">{RESOURCE_ICONS[res]} {res}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => adjustCounterOffer(res, -1)} className="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-white text-xs transition-colors">-</button>
                    <span className="text-xs text-white w-4 text-center tabular-nums">{counterOffering[res] ?? 0}</span>
                    <button onClick={() => adjustCounterOffer(res, 1)} className="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-white text-xs transition-colors">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] text-stone-400 mb-1 uppercase tracking-wide">You want</div>
              {ALL_RESOURCES.map(res => (
                <div key={res} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-white">{RESOURCE_ICONS[res]} {res}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => adjustCounterRequest(res, -1)} className="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-white text-xs transition-colors">-</button>
                    <span className="text-xs text-white w-4 text-center tabular-nums">{counterRequesting[res] ?? 0}</span>
                    <button onClick={() => adjustCounterRequest(res, 1)} className="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-white text-xs transition-colors">+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => onCounter(counterOffering, counterRequesting)}
            disabled={!canSubmitCounter}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
              canSubmitCounter
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-stone-700 text-stone-500 cursor-not-allowed'
            }`}
          >
            {!canAffordCounter ? "Can't afford counter" : !counterHasOffering || !counterHasRequesting ? 'Select resources' : 'Send Counter-Offer'}
          </button>
        </div>
      )}
    </div>
  );
}

function ResourceList({ resources }: { resources: Partial<Record<Resource, number>> }) {
  const items = ALL_RESOURCES
    .filter(r => (resources[r] ?? 0) > 0)
    .map(r => ({ resource: r, amount: resources[r]! }));

  if (items.length === 0) {
    return <span className="text-xs text-stone-500">Nothing</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map(({ resource, amount }) => (
        <span key={resource} className="text-sm text-white">
          {RESOURCE_ICONS[resource]} {amount}
        </span>
      ))}
    </div>
  );
}
