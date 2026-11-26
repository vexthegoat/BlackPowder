import React from 'react';
import { Play, RotateCcw, Map, Home } from 'lucide-react';

interface PauseModalProps {
  blueCount: number;
  redCount: number;
  blueKills: number;
  redKills: number;
  onResume: () => void;
  onRestartPreset: () => void;
  onChangeMap: () => void;
  onMainMenu: () => void;
}

export function PauseModal({
  blueCount,
  redCount,
  blueKills,
  redKills,
  onResume,
  onRestartPreset,
  onChangeMap,
  onMainMenu,
}: PauseModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0d0c0a]/78"
    >
      <div className="w-full max-w-md rounded-lg border border-[#c8a45d]/35 bg-[#1b1915] text-[#f4ece0] shadow-2xl p-6">
        <h2 id="pause-title" className="font-display text-2xl font-bold text-[#f6eedf]">
          Campaign Paused
        </h2>
        <p className="text-xs text-[#b5a994] mt-1">
          Adjust regiments, switch maps, or return to the field.
        </p>

        {/* Battle tally */}
        <div className="grid grid-cols-2 gap-3 my-5">
          <div className="p-3 rounded border border-[#5b8fe0]/30 bg-[#172130]">
            <div className="text-[11px] uppercase tracking-wider text-[#90b7f5]">
              Blue Regiment
            </div>
            <div className="mt-1 font-mono-tabular text-xl font-semibold text-[#f3f7ff]">
              {blueCount} <span className="text-xs font-normal text-[#9ab0cf]">active</span>
            </div>
            <div className="text-[11px] font-mono-tabular text-[#8ca3c4] mt-0.5">
              {blueKills} enemy fallen
            </div>
          </div>

          <div className="p-3 rounded border border-[#db5c56]/30 bg-[#2d1818]">
            <div className="text-[11px] uppercase tracking-wider text-[#f0938e]">
              Red Regiment
            </div>
            <div className="mt-1 font-mono-tabular text-xl font-semibold text-[#fff3f2]">
              {redCount} <span className="text-xs font-normal text-[#d49e9b]">active</span>
            </div>
            <div className="text-[11px] font-mono-tabular text-[#c48d8a] mt-0.5">
              {redKills} enemy fallen
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded bg-[#c8a45d] hover:bg-[#d8b46d] text-[#17140e] font-semibold text-sm transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Resume Battle</span>
          </button>

          <button
            type="button"
            onClick={onRestartPreset}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded border border-[#c8a45d]/30 bg-[#221f1a] hover:bg-[#2c2821] text-[#eee4d1] font-medium text-sm transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-[#c8a45d]" />
            <span>Reset Skirmish</span>
          </button>

          <button
            type="button"
            onClick={onChangeMap}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded border border-[#c8a45d]/30 bg-[#221f1a] hover:bg-[#2c2821] text-[#eee4d1] font-medium text-sm transition-colors cursor-pointer"
          >
            <Map className="w-4 h-4 text-[#c8a45d]" />
            <span>Change Map &amp; Weather</span>
          </button>

          <button
            type="button"
            onClick={onMainMenu}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2 rounded text-[#b5a994] hover:text-[#f4ece0] hover:bg-[#24201b] text-sm transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
