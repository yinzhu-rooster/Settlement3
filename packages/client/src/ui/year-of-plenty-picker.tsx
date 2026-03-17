import { useState } from 'react';
import { ALL_RESOURCES, type Resource } from '@settlement3/shared';
import { useDispatch } from '../hooks/use-game';
import { GameDialog } from './game-dialog';

const RESOURCE_ICONS: Record<Resource, string> = {
  wood: '\u{1FAB5}', brick: '\u{1F9F1}', sheep: '\u{1F411}', wheat: '\u{1F33E}', ore: '\u26CF\uFE0F',
};

export function YearOfPlentyPicker() {
  const dispatchAction = useDispatch();
  const [picks, setPicks] = useState<Resource[]>([]);

  function pick(res: Resource) {
    if (picks.length < 2) {
      const newPicks = [...picks, res];
      setPicks(newPicks);
      if (newPicks.length === 2) {
        dispatchAction({ type: 'YEAR_OF_PLENTY_PICK', resources: newPicks as [Resource, Resource] });
      }
    }
  }

  return (
    <GameDialog
      open
      title="Year of Plenty"
      description={`Pick ${2 - picks.length} resource${picks.length === 1 ? '' : 's'}`}
      className="w-72"
    >
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
      {picks.length > 0 && (
        <div className="mt-2 text-xs text-stone-400">
          Picked: {picks.map(r => RESOURCE_ICONS[r]).join(' ')}
        </div>
      )}
    </GameDialog>
  );
}
