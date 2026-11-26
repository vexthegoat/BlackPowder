import React from 'react';
import { X, Compass } from 'lucide-react';
import { MAPS, WEATHER_CONFIGS } from '../game/constants';
import { WeatherType } from '../game/types';
import { MapThumbnail, WeatherIcon } from './GameIcons';

interface MapSelectModalProps {
  selectedMapId: string;
  selectedWeather: WeatherType;
  onSelectMap: (mapId: string) => void;
  onSelectWeather: (weather: WeatherType) => void;
  onDeploy: () => void;
  onClose: () => void;
}

const WEATHER_ORDER: WeatherType[] = ['clear', 'rain', 'fog', 'snow', 'storm'];

export function MapSelectModal({
  selectedMapId,
  selectedWeather,
  onSelectMap,
  onSelectWeather,
  onDeploy,
  onClose,
}: MapSelectModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-select-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#0d0c0a]/80"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-lg border border-[#c8a45d]/35 bg-[#1b1915] text-[#f4ece0] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#c8a45d]/20">
          <div>
            <h2 id="map-select-title" className="font-display text-2xl font-bold text-[#f6eedf]">
              Select Battlefield &amp; Weather
            </h2>
            <p className="text-xs text-[#b7aa94] mt-0.5">
              Choose a theater of operations and atmospheric conditions before deploying your regiments.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map selection"
            className="p-2 rounded border border-[#c8a45d]/25 text-[#d4c8b2] hover:text-white hover:bg-[#2a261f] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto sandbox-scroll space-y-6">
          {/* Map grid */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c8a45d] mb-3">
              Battlefield Maps
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MAPS.map((map) => {
                const isSelected = map.id === selectedMapId;
                return (
                  <button
                    key={map.id}
                    type="button"
                    onClick={() => {
                      onSelectMap(map.id);
                      onSelectWeather(map.recommendedWeather);
                    }}
                    className={`text-left p-3.5 rounded-md border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#c8a45d] bg-[#28231b] shadow-[0_0_0_1px_rgba(200,164,93,0.45)]'
                        : 'border-[#c8a45d]/20 bg-[#211e19] hover:border-[#c8a45d]/50 hover:bg-[#26221c]'
                    }`}
                  >
                    <MapThumbnail map={map} />
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <span className="font-display text-base font-bold text-[#f4ece0]">
                        {map.name}
                      </span>
                      <span className="text-xs text-[#c8a45d] whitespace-nowrap shrink-0">
                        {isSelected ? 'Selected' : WEATHER_CONFIGS[map.recommendedWeather].name}
                      </span>
                    </div>
                    <p className="text-xs text-[#cbbda6] mt-1">{map.subtitle}</p>
                    <p className="text-[11px] text-[#9b8e78] mt-1.5">{map.terrainSummary}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weather Selection */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c8a45d] mb-2.5">
              Battlefield Weather
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {WEATHER_ORDER.map((wId) => {
                const w = WEATHER_CONFIGS[wId];
                const active = selectedWeather === wId;
                return (
                  <button
                    key={wId}
                    type="button"
                    onClick={() => onSelectWeather(wId)}
                    className={`flex flex-col items-start p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#c8a45d] bg-[#2a241b] text-[#f8f0e2]'
                        : 'border-[#c8a45d]/20 bg-[#201d18] text-[#cbbda6] hover:border-[#c8a45d]/45'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <WeatherIcon weather={wId} className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-semibold whitespace-nowrap">{w.name}</span>
                    </div>
                    <span className="text-[11px] text-[#9c8f79] mt-1.5 leading-snug">
                      {w.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-[#c8a45d]/20 bg-[#161411]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-[#c8a45d]/30 text-sm text-[#d4c8b2] hover:bg-[#25221c] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Back
          </button>

          <button
            type="button"
            data-deploy="true"
            onClick={onDeploy}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded bg-[#c8a45d] hover:bg-[#d8b46d] text-[#17140e] font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>Deploy to Battlefield</span>
          </button>
        </div>
      </div>
    </div>
  );
}
