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
  for (const [, trade] of state.activeTrades) {
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
    .filter(p => !trade.respondedBy.has(p.id));

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
}: {
  trade: TradeOffer;
  offererName: string;
  offererColor: PlayerColor;
  respondingPlayer: { id: number; name: string; color: PlayerColor; resources: Record<Resource, number> };
  onAccept: () => void;
  onReject: () => void;
}) {
  // Check if responder can afford it
  const canAfford = ALL_RESOURCES.every(
    r => respondingPlayer.resources[r] >= (trade.requesting[r] ?? 0)
  );

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
          onClick={onReject}
          className="flex-1 py-2 bg-red-900/60 hover:bg-red-800/60 text-red-200 rounded-lg text-sm font-medium transition-colors"
        >
          Reject
        </button>
      </div>
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
