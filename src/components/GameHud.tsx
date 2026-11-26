import React from 'react';
import {
  Play,
  Pause,
  Trash2,
  Map,
  Volume2,
  VolumeX,
  Eraser,
  Swords,
  Shield,
  SlidersHorizontal,
  Compass,
} from 'lucide-react';
import {
  getMapById,
  SOLDIER_SPECS,
  STRUCTURE_SPECS,
  WEATHER_CONFIGS,
} from '../game/constants';
import {
  Faction,
  FormationMode,
  PlacementCategory,
  SoldierType,
  StructureType,
  WeatherType,
} from '../game/types';
import { SoldierIcon, StructureIcon, WeatherIcon } from './GameIcons';

interface GameHudProps {
  mapId: string;
  weather: WeatherType;
  combatActive: boolean;
  simSpeed: 1 | 2;
  muted: boolean;
  blueCount: number;
  redCount: number;
  faction: Faction;
  category: PlacementCategory;
  soldierType: SoldierType;
  structureType: StructureType;
  formation: FormationMode;
  onToggleCombat: () => void;
  onToggleSpeed: () => void;
  onChangeWeather: (w: WeatherType) => void;
  onLoadPreset: () => void;
  onClearField: () => void;
  onOpenMaps: () => void;
  onToggleMute: () => void;
  onOpenPause: () => void;
  onResetCamera: () => void;
  onChangeFaction: (f: Faction) => void;
  onChangeCategory: (c: PlacementCategory) => void;
  onSelectSoldier: (t: SoldierType) => void;
  onSelectStructure: (t: StructureType) => void;
  onChangeFormation: (m: FormationMode) => void;
}

const WEATHER_ORDER: WeatherType[] = ['clear', 'rain', 'fog', 'snow', 'storm'];
const SOLDIER_LIST = Object.values(SOLDIER_SPECS);
const STRUCTURE_LIST = Object.values(STRUCTURE_SPECS);

export function GameHud({
  mapId,
  weather,
  combatActive,
  simSpeed,
  muted,
  blueCount,
  redCount,
  faction,
  category,
  soldierType,
  structureType,
  formation,
  onToggleCombat,
  onToggleSpeed,
  onChangeWeather,
  onLoadPreset,
  onClearField,
  onOpenMaps,
  onToggleMute,
  onOpenPause,
  onResetCamera,
  onChangeFaction,
  onChangeCategory,
  onSelectSoldier,
  onSelectStructure,
  onChangeFormation,
}: GameHudProps) {
  const map = getMapById(mapId);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
      {/* Top Battlefield Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Force Tally & Map */}
        <div className="pointer-events-auto flex items-center gap-3 px-3.5 py-2 rounded-md border border-[#c8a45d]/30 bg-[#181612]/92 shadow-lg">
          <div className="hidden lg:block pr-2.5 border-r border-[#c8a45d]/20">
            <div className="font-display text-xs font-bold text-[#f4ece0] whitespace-nowrap">
              {map.name}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5" aria-label={`Blue forces: ${blueCount}`}>
              <span className="w-2.5 h-2.5 rounded-sm bg-[#4682df] inline-block" aria-hidden="true" />
              <span className="text-[#a8c5f5] font-medium whitespace-nowrap">Blue</span>
              <span className="font-mono-tabular text-sm font-semibold text-[#f3f7ff]">
                {blueCount}
              </span>
            </div>

            <span className="text-[#8a7d68]" aria-hidden="true">vs</span>

            <div className="flex items-center gap-1.5" aria-label={`Red forces: ${redCount}`}>
              <span className="w-2.5 h-2.5 rounded-sm bg-[#d94d48] inline-block" aria-hidden="true" />
              <span className="text-[#f0a5a1] font-medium whitespace-nowrap">Red</span>
              <span className="font-mono-tabular text-sm font-semibold text-[#fff3f2]">
                {redCount}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Engage + Speed + Weather */}
        <div className="pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[#c8a45d]/30 bg-[#181612]/92 shadow-lg">
          <button
            type="button"
            onClick={onToggleCombat}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              combatActive
                ? 'bg-[#b73934] hover:bg-[#c9443e] text-[#fff6f5]'
                : 'bg-[#c8a45d] hover:bg-[#d8b46d] text-[#17140e]'
            }`}
          >
            {combatActive ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Hold Fire</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Engage</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleSpeed}
            aria-label={`Simulation speed ${simSpeed}x`}
            className="px-2.5 py-1.5 rounded border border-[#c8a45d]/25 bg-[#23201a] hover:bg-[#2d2921] text-[#e8dcc4] font-mono-tabular text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            {simSpeed}x
          </button>

          <div className="h-5 w-px bg-[#c8a45d]/20 mx-0.5 hidden sm:block" aria-hidden="true" />

          {/* Weather Controls */}
          <div className="flex items-center gap-1" role="group" aria-label="Weather controls">
            {WEATHER_ORDER.map((wId) => {
              const cfg = WEATHER_CONFIGS[wId];
              const active = weather === wId;
              return (
                <button
                  key={wId}
                  type="button"
                  onClick={() => onChangeWeather(wId)}
                  title={`${cfg.name}: ${cfg.description}`}
                  aria-label={`Weather: ${cfg.name}`}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#352f23] text-[#f7eedc] border border-[#c8a45d]/65'
                      : 'text-[#b5a994] hover:text-[#f2e8d7] hover:bg-[#24211b] border border-transparent'
                  }`}
                >
                  <WeatherIcon weather={wId} className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{cfg.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Skirmish Preset, Clear, Maps, Mute, Pause */}
        <div className="pointer-events-auto flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-[#c8a45d]/30 bg-[#181612]/92 shadow-lg">
          <button
            type="button"
            onClick={onLoadPreset}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#c8a45d]/25 bg-[#23201a] hover:bg-[#2e2920] text-[#e8dcc4] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Swords className="w-3.5 h-3.5 text-[#c8a45d]" />
            <span>Skirmish</span>
          </button>

          <button
            type="button"
            onClick={onClearField}
            aria-label="Clear battlefield"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#c8a45d]/20 hover:bg-[#2b221e] hover:border-[#d6574f]/50 text-[#cbbda6] hover:text-[#f7d5d2] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <button
            type="button"
            onClick={onOpenMaps}
            aria-label="Select map"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#c8a45d]/20 hover:bg-[#26221b] text-[#cbbda6] hover:text-[#f4ece0] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Map className="w-3.5 h-3.5 text-[#c8a45d]" />
            <span className="hidden sm:inline">Maps</span>
          </button>

          <button
            type="button"
            onClick={onResetCamera}
            title="Reset 3D Camera View [R]"
            aria-label="Reset camera view"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-[#c8a45d]/20 hover:bg-[#26221b] text-[#cbbda6] hover:text-[#f4ece0] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-[#c8a45d]" />
            <span className="hidden md:inline">View</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="p-1.5 rounded border border-[#c8a45d]/20 hover:bg-[#26221b] text-[#d4c8b2] cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenPause}
            aria-label="Pause menu"
            className="p-1.5 rounded border border-[#c8a45d]/20 hover:bg-[#26221b] text-[#d4c8b2] cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Unified Infantry & Build Menu Dock */}
      <div className="flex justify-center">
        <div className="pointer-events-auto max-w-full flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-[#c8a45d]/35 bg-[#181612]/94 shadow-2xl">
          {/* Dock Controls Row: Faction, Category Tabs, Formation Brush */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#c8a45d]/18">
            {/* Faction Toggle */}
            <div className="flex items-center gap-1 p-0.5 rounded bg-[#11100d] border border-[#c8a45d]/20" role="group" aria-label="Active faction">
              <button
                type="button"
                onClick={() => onChangeFaction('blue')}
                aria-pressed={faction === 'blue'}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  faction === 'blue'
                    ? 'bg-[#285499] text-[#f3f7ff]'
                    : 'text-[#9ba8bd] hover:text-[#dce7f8]'
                }`}
              >
                Blue Regiment
              </button>
              <button
                type="button"
                onClick={() => onChangeFaction('red')}
                aria-pressed={faction === 'red'}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  faction === 'red'
                    ? 'bg-[#a32929] text-[#fff4f4]'
                    : 'text-[#bfa2a0] hover:text-[#fae0df]'
                }`}
              >
                Red Regiment
              </button>
            </div>

            {/* Category Tabs: Infantry vs Build Menu vs Erase */}
            <div className="flex items-center gap-1 p-0.5 rounded bg-[#11100d] border border-[#c8a45d]/20" role="tablist" aria-label="Placement mode">
              <button
                type="button"
                role="tab"
                aria-selected={category === 'infantry'}
                onClick={() => onChangeCategory('infantry')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  category === 'infantry'
                    ? 'bg-[#c8a45d] text-[#17140e]'
                    : 'text-[#cbbda6] hover:text-[#f6eedf]'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Infantry</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={category === 'build'}
                onClick={() => onChangeCategory('build')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  category === 'build'
                    ? 'bg-[#c8a45d] text-[#17140e]'
                    : 'text-[#cbbda6] hover:text-[#f6eedf]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Build Menu</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={category === 'erase'}
                onClick={() => onChangeCategory('erase')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  category === 'erase'
                    ? 'bg-[#b73934] text-[#fff4f4]'
                    : 'text-[#cbbda6] hover:text-[#f6eedf]'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Erase</span>
              </button>
            </div>

            {/* Formation Brush (active for infantry) */}
            <div className="flex items-center gap-1 p-0.5 rounded bg-[#11100d] border border-[#c8a45d]/20" role="group" aria-label="Formation size">
              {(
                [
                  { id: 'single', label: '1 Unit' },
                  { id: 'line5', label: 'Line (5)' },
                  { id: 'double10', label: 'Rank (10)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={category !== 'infantry'}
                  onClick={() => onChangeFormation(m.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    category !== 'infantry'
                      ? 'opacity-40 cursor-not-allowed text-[#8c8170]'
                      : formation === m.id
                        ? 'bg-[#352f23] text-[#f6eedf] border border-[#c8a45d]/50 cursor-pointer'
                        : 'text-[#b5a994] hover:text-[#f0e5d3] cursor-pointer'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item Cards Row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {category === 'infantry' &&
              SOLDIER_LIST.map((spec) => {
                const selected = soldierType === spec.type;
                return (
                  <button
                    key={spec.type}
                    type="button"
                    onClick={() => onSelectSoldier(spec.type)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded border text-left transition-colors shrink-0 cursor-pointer ${
                      selected
                        ? 'border-[#c8a45d] bg-[#2a241b] text-[#f8f0e2]'
                        : 'border-[#c8a45d]/20 bg-[#201d18] text-[#cbbda6] hover:border-[#c8a45d]/45'
                    }`}
                  >
                    <SoldierIcon type={spec.type} faction={faction} className="w-7 h-7 shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                        <span>{spec.name}</span>
                        <span className="font-mono-tabular text-[10px] text-[#c8a45d]">
                          [{spec.hotkey}]
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9b8e78] whitespace-nowrap">
                        {spec.role}
                      </div>
                    </div>
                  </button>
                );
              })}

            {category === 'build' &&
              STRUCTURE_LIST.map((spec) => {
                const selected = structureType === spec.type;
                return (
                  <button
                    key={spec.type}
                    type="button"
                    onClick={() => onSelectStructure(spec.type)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded border text-left transition-colors shrink-0 cursor-pointer ${
                      selected
                        ? 'border-[#c8a45d] bg-[#2a241b] text-[#f8f0e2]'
                        : 'border-[#c8a45d]/20 bg-[#201d18] text-[#cbbda6] hover:border-[#c8a45d]/45'
                    }`}
                  >
                    <StructureIcon type={spec.type} className="w-7 h-7 shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                        <span>{spec.name}</span>
                        <span className="font-mono-tabular text-[10px] text-[#c8a45d]">
                          [{spec.hotkey}]
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9b8e78] whitespace-nowrap">
                        {spec.role}
                      </div>
                    </div>
                  </button>
                );
              })}

            {category === 'erase' && (
              <div className="px-3 py-2 text-xs text-[#e0b4b0]">
                Click or drag across the battlefield to remove placed infantry or fortifications (Right-click also erases anytime).
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
