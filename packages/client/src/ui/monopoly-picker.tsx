import { ALL_RESOURCES, type Resource } from '@settlement3/shared';
import { useDispatch } from '../hooks/use-game';

const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '🪵', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛏️',
};

export function MonopolyPicker() {
  const dispatchAction = useDispatch();

  function pick(res: Resource) {
    dispatchAction({ type: 'MONOPOLY_PICK', resource: res });
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="bg-stone-800 rounded-xl p-5 w-72 shadow-xl border border-white/10">
        <h3 className="font-semibold text-white text-sm mb-1">Monopoly</h3>
        <p className="text-xs text-stone-400 mb-3">Choose a resource to collect from all players</p>
        <div className="grid grid-cols-5 gap-2">
          {ALL_RESOURCES.map(res => (
            <button
              key={res}
              onClick={() => pick(res)}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
            >
              <span className="text-lg">{RESOURCE_ICONS[res]}</span>
              <span className="text-[10px] text-stone-300">{res}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
