import React from 'react';
import { Volume2, VolumeX, BookOpen, Play } from 'lucide-react';
import { CrestEmblem } from './GameIcons';

interface MainMenuProps {
  muted: boolean;
  onPlay: () => void;
  onOpenManual: () => void;
  onToggleMute: () => void;
}

export function MainMenu({
  muted,
  onPlay,
  onOpenManual,
  onToggleMute,
}: MainMenuProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none"
      style={{
        background:
          'linear-gradient(95deg, rgba(16, 15, 13, 0.92) 0%, rgba(16, 15, 13, 0.72) 42%, rgba(16, 15, 13, 0.22) 100%)',
      }}
    >
      {/* Top right quiet audio toggle */}
      <div className="flex justify-end p-6 pointer-events-auto">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute battlefield audio' : 'Mute battlefield audio'}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded border border-[#c8a45d]/35 bg-[#1b1915]/90 text-[#e8dcc4] hover:border-[#c8a45d]/75 hover:bg-[#25221c] transition-colors text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4 text-[#c8a45d]" /> : <Volume2 className="w-4 h-4 text-[#c8a45d]" />}
          <span>{muted ? 'Audio Muted' : 'Audio On'}</span>
        </button>
      </div>

      {/* Left-third asymmetric title lockup over calm negative space */}
      <div className="px-10 md:px-16 max-w-xl pointer-events-auto my-auto">
        <div className="mb-5">
          <CrestEmblem className="w-16 h-16" />
        </div>

        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#f6eedf] leading-[1.06] text-balance drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
          Blackpowder Sandbox
        </h1>

        <p className="mt-4 text-base text-[#cfc3ae] leading-relaxed max-w-md">
          Command 18th-century infantry lines, erect field fortifications, and test volley tactics across shifting weather.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <button
            type="button"
            data-start="true"
            onClick={onPlay}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded bg-[#c8a45d] hover:bg-[#d8b46d] active:scale-[0.99] text-[#17140e] font-semibold text-base tracking-wide shadow-lg transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Play</span>
          </button>

          <button
            type="button"
            onClick={onOpenManual}
            className="inline-flex items-center gap-2 px-5 py-3.5 rounded border border-[#c8a45d]/40 bg-[#1c1a16]/90 hover:bg-[#27241e] hover:border-[#c8a45d]/70 text-[#eee4d1] font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#c8a45d]" />
            <span>Field Manual</span>
          </button>
        </div>
      </div>

      {/* Flat borderless control hint line in bottom safe margin */}
      <div className="px-10 md:px-16 pb-6">
        <p className="text-xs text-[#b5a994] tracking-wide">
          Click to Place Units · Drag or WASD Pan · Wheel Zoom · Space Engage · Enter to Start
        </p>
      </div>
    </div>
  );
}
