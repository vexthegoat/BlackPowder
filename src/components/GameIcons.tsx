import React from 'react';
import { MapConfig, SoldierType, StructureType, WeatherType } from '../game/types';

export function CrestEmblem({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={className} aria-hidden="true">
      <circle cx="40" cy="40" r="36" stroke="#c8a45d" strokeWidth="1.5" strokeOpacity="0.45" />
      <circle cx="40" cy="40" r="30" stroke="#c8a45d" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.4" />
      {/* Crossed muskets */}
      <g stroke="#e8dcc4" strokeWidth="2.5" strokeLinecap="round">
        <line x1="16" y1="60" x2="62" y2="18" />
        <line x1="64" y1="60" x2="18" y2="18" />
      </g>
      {/* Stocks */}
      <g stroke="#9b6637" strokeWidth="4.5" strokeLinecap="round">
        <line x1="15" y1="61" x2="29" y2="48" />
        <line x1="65" y1="61" x2="51" y2="48" />
      </g>
      {/* Bayonet tips */}
      <path d="M62 18 L68 12 L64 20 Z" fill="#dce4ec" />
      <path d="M18 18 L12 12 L16 20 Z" fill="#dce4ec" />
      {/* Center brass sunburst */}
      <circle cx="40" cy="39" r="7" fill="#c8a45d" stroke="#241c12" strokeWidth="1.5" />
      <circle cx="40" cy="39" r="3" fill="#f7e5b4" />
    </svg>
  );
}

export function SoldierIcon({
  type,
  faction,
  className = 'w-7 h-7',
}: {
  type: SoldierType;
  faction: 'blue' | 'red';
  className?: string;
}) {
  const coat = faction === 'blue' ? '#2c589e' : '#b23232';
  const accent = type === 'skirmisher' ? (faction === 'blue' ? '#2e634c' : '#7a252d') : coat;

  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      {/* Hat */}
      {type === 'grenadier' ? (
        <rect x="9" y="2" width="10" height="9" rx="4.5" fill="#1c1b1d" stroke="#c8a45d" strokeWidth="1" />
      ) : type === 'officer' ? (
        <path d="M5 10 Q14 2 23 10 Z" fill="#1c1d22" stroke="#e2bd5d" strokeWidth="1.2" />
      ) : type === 'skirmisher' ? (
        <>
          <rect x="9" y="5.5" width="10" height="5" rx="2" fill="#1e2024" />
          <ellipse cx="14" cy="4" rx="1.6" ry="2.5" fill={faction === 'blue' ? '#5896e8' : '#e05252'} />
        </>
      ) : (
        <>
          <rect x="9.5" y="4" width="9" height="6.5" rx="1.2" fill="#1c1d21" />
          <rect x="13" y="6" width="2" height="2" fill="#e2bd5d" />
        </>
      )}
      {/* Face */}
      <circle cx="14" cy="12.5" r="3" fill="#e5bd99" stroke="#292018" strokeWidth="0.8" />
      {/* Coat */}
      <rect x="8.5" y="15.5" width="11" height="9.5" rx="2.5" fill={accent} stroke="#16171a" strokeWidth="1" />
      {/* Crossbelt / Trim */}
      <path d="M9.5 16.5 L18.5 24.5 M18.5 16.5 L9.5 24.5" stroke={type === 'officer' || type === 'grenadier' ? '#e5c15f' : '#efeae0'} strokeWidth="1.3" />
      {/* Weapon silhouette */}
      {type === 'officer' ? (
        <line x1="22" y1="6" x2="22" y2="24" stroke="#d4af5a" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <line x1="21.5" y1="5" x2="21.5" y2="24" stroke="#b9c2cc" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function StructureIcon({
  type,
  className = 'w-7 h-7',
}: {
  type: StructureType;
  className?: string;
}) {
  if (type === 'sandbag') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <rect x="4" y="15" width="9" height="6" rx="2.5" fill="#bea57a" stroke="#57472e" strokeWidth="1.2" />
        <rect x="14" y="15" width="9" height="6" rx="2.5" fill="#b49a6f" stroke="#57472e" strokeWidth="1.2" />
        <rect x="9" y="9.5" width="10" height="6" rx="2.5" fill="#cbb389" stroke="#57472e" strokeWidth="1.2" />
      </svg>
    );
  }
  if (type === 'barricade') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <path d="M6 22 L12 6 M12 22 L6 6 M16 22 L22 6 M22 22 L16 6" stroke="#855a34" strokeWidth="2.6" strokeLinecap="round" />
        <rect x="4" y="12.5" width="20" height="4" rx="1" fill="#a27044" stroke="#3c2511" strokeWidth="1.1" />
      </svg>
    );
  }
  if (type === 'stone_wall') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <rect x="4" y="8" width="20" height="13" rx="2" fill="#8b877e" stroke="#36342f" strokeWidth="1.4" />
        <path d="M4 14.5 H24 M12 8 V14.5 M17 14.5 V21" stroke="#45423c" strokeWidth="1.2" />
      </svg>
    );
  }
  if (type === 'powder_keg') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <rect x="7" y="5" width="14" height="18" rx="4" fill="#7c4a28" stroke="#2c180a" strokeWidth="1.4" />
        <rect x="7.5" y="11" width="13" height="6" fill="#be322b" />
        <circle cx="14" cy="14" r="2.2" fill="#f7c454" />
        <line x1="7" y1="8.5" x2="21" y2="8.5" stroke="#2c2e33" strokeWidth="1.6" />
        <line x1="7" y1="19.5" x2="21" y2="19.5" stroke="#2c2e33" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      <path d="M7 13 L23 11 L23 15 L7 17 Z" fill="#dca948" stroke="#4f370f" strokeWidth="1.2" />
      <circle cx="11" cy="17.5" r="4.5" fill="#46301b" stroke="#1e150c" strokeWidth="1.4" />
      <circle cx="11" cy="17.5" r="1.5" fill="#c89b44" />
    </svg>
  );
}

export function WeatherIcon({
  weather,
  className = 'w-4 h-4',
}: {
  weather: WeatherType;
  className?: string;
}) {
  if (weather === 'clear') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" fill="#f4c452" stroke="#d99a26" strokeWidth="1.5" />
        <path d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5M5.3 5.3L7 7M17 17L18.7 18.7M18.7 5.3L17 7M7 17L5.3 18.7" stroke="#f4c452" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (weather === 'rain') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M7 14h10a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 7.7 8.2 3 3 0 0 0 7 14Z" fill="#9fb2c7" />
        <path d="M9 17l-1.5 3.5M13 17l-1.5 3.5M17 17l-1.5 3.5" stroke="#7cb8f2" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (weather === 'fog') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M4 9h16M3 13h18M5 17h14" stroke="#cbd5d4" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (weather === 'snow') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5" stroke="#dcecfb" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6.5 13.5h11a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.2 7.7 3 3 0 0 0 6.5 13.5Z" fill="#7a8ca3" />
      <path d="M13 13.5l-3 4.5h3l-1.5 4 4.5-5.5h-3l1.5-3Z" fill="#f7cf54" />
    </svg>
  );
}

export function MapThumbnail({ map }: { map: MapConfig }) {
  return (
    <svg
      viewBox="0 0 180 100"
      className="w-full h-28 rounded border border-[#c8a45d]/25 block"
      aria-hidden="true"
    >
      <rect width="180" height="100" fill={map.palette.groundBase} />
      {map.features.map((f, idx) => {
        const x = f.x / 10;
        const y = f.y / 10;
        const w = f.width / 10;
        const h = f.height / 10;
        if (f.kind === 'ridge') {
          return (
            <rect
              key={idx}
              x={x}
              y={y}
              width={w}
              height={h}
              rx="4"
              fill={map.palette.ridgeColor}
              stroke="rgba(0,0,0,0.22)"
              strokeWidth="0.8"
            />
          );
        }
        if (f.kind === 'road') {
          return <rect key={idx} x={x} y={y} width={w} height={h} fill={map.palette.roadColor} />;
        }
        if (f.kind === 'river') {
          return <rect key={idx} x={x} y={y} width={w} height={h} fill={map.palette.waterColor} />;
        }
        if (f.kind === 'bridge') {
          return <rect key={idx} x={x} y={y} width={w} height={h} fill="#a49684" stroke="#4b4238" strokeWidth="0.8" />;
        }
        if (f.kind === 'stone_ruin') {
          return <rect key={idx} x={x} y={y} width={w} height={h} rx="1" fill="#827d73" />;
        }
        return (
          <circle
            key={idx}
            cx={x + w * 0.5}
            cy={y + h * 0.5}
            r={Math.max(2.5, w * 0.45)}
            fill={map.id === 'winter_crossroads' ? '#36584a' : '#2f4e2a'}
          />
        );
      })}
      {/* Opposing deployment indicators */}
      <line x1="22" y1="30" x2="22" y2="70" stroke="#5ea2f5" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="158" y1="30" x2="158" y2="70" stroke="#e45b55" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
