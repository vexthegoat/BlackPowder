import React from 'react';
import { X } from 'lucide-react';
import { SOLDIER_SPECS, STRUCTURE_SPECS } from '../game/constants';
import { SoldierIcon, StructureIcon } from './GameIcons';

interface FieldManualModalProps {
  onClose: () => void;
}

export function FieldManualModal({ onClose }: FieldManualModalProps) {
  const soldiers = Object.values(SOLDIER_SPECS);
  const structures = Object.values(STRUCTURE_SPECS);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0d0c0a]/82"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-[#c8a45d]/35 bg-[#1b1915] text-[#f4ece0] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#c8a45d]/20">
          <h2 id="manual-title" className="font-display text-2xl font-bold text-[#f6eedf]">
            Field Manual &amp; Controls
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close field manual"
            className="p-2 rounded border border-[#c8a45d]/25 text-[#d4c8b2] hover:text-white hover:bg-[#2a261f] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto sandbox-scroll space-y-6 text-sm">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c8a45d] mb-2.5">
              Infantry Regiments
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {soldiers.map((spec) => (
                <div
                  key={spec.type}
                  className="flex items-center gap-3 p-3 rounded border border-[#c8a45d]/20 bg-[#221f1a]"
                >
                  <SoldierIcon type={spec.type} faction="blue" className="w-9 h-9 shrink-0" />
                  <div>
                    <div className="font-semibold text-[#f4ece0]">
                      {spec.name} <span className="text-xs text-[#c8a45d]">[{spec.hotkey}]</span>
                    </div>
                    <div className="text-xs text-[#b5a994]">
                      {spec.role} · {spec.maxHp} HP · Range {spec.range}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c8a45d] mb-2.5">
              Fortifications &amp; Artillery
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {structures.map((spec) => (
                <div
                  key={spec.type}
                  className="flex items-center gap-3 p-3 rounded border border-[#c8a45d]/20 bg-[#221f1a]"
                >
                  <StructureIcon type={spec.type} className="w-9 h-9 shrink-0" />
                  <div>
                    <div className="font-semibold text-[#f4ece0]">
                      {spec.name} <span className="text-xs text-[#c8a45d]">[{spec.hotkey}]</span>
                    </div>
                    <div className="text-xs text-[#b5a994]">
                      {spec.role} · {spec.maxHp} HP
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded border border-[#c8a45d]/20 bg-[#171512] text-xs text-[#cbbda6] space-y-1.5">
            <div className="font-semibold text-[#e8dcc4]">Battlefield Controls</div>
            <p>Left Click: Place selected unit, formation, or fortification · Right Click: Erase unit or structure</p>
            <p>Right-Drag / Shift+Drag: Orbit &amp; tilt 3D terrain · WASD / Arrow Keys / Middle-Drag: Pan · Wheel: Zoom · R: Reset view</p>
            <p>Space: Engage / Hold Fire · Q / E: Switch Blue / Red · 1–9: Quick-select unit or structure · Esc: Pause</p>
          </div>
        </div>
      </div>
    </div>
  );
}
