import { MapConfig, SoldierType, StructureType, WeatherType } from './types';

export const WORLD_WIDTH = 1800;
export const WORLD_HEIGHT = 1000;

export interface SoldierSpec {
  type: SoldierType;
  name: string;
  hotkey: string;
  role: string;
  maxHp: number;
  moveSpeed: number;
  range: number;
  aimTime: number;
  reloadTime: number;
  damage: number;
  accuracySpread: number; // radians
  projectileSpeed: number;
  radius: number;
  preferredStandOff: number;
}

export const SOLDIER_SPECS: Record<SoldierType, SoldierSpec> = {
  line: {
    type: 'line',
    name: 'Line Infantry',
    hotkey: '1',
    role: 'Balanced musket volley',
    maxHp: 100,
    moveSpeed: 54,
    range: 420,
    aimTime: 0.34,
    reloadTime: 2.6,
    damage: 42,
    accuracySpread: 0.085,
    projectileSpeed: 760,
    radius: 13,
    preferredStandOff: 275,
  },
  skirmisher: {
    type: 'skirmisher',
    name: 'Skirmisher',
    hotkey: '2',
    role: 'Long-range precision rifle',
    maxHp: 78,
    moveSpeed: 68,
    range: 590,
    aimTime: 0.42,
    reloadTime: 2.9,
    damage: 54,
    accuracySpread: 0.028,
    projectileSpeed: 940,
    radius: 12,
    preferredStandOff: 430,
  },
  grenadier: {
    type: 'grenadier',
    name: 'Grenadier',
    hotkey: '3',
    role: 'Heavy armor & carbine',
    maxHp: 175,
    moveSpeed: 44,
    range: 330,
    aimTime: 0.3,
    reloadTime: 2.4,
    damage: 68,
    accuracySpread: 0.11,
    projectileSpeed: 700,
    radius: 15,
    preferredStandOff: 210,
  },
  officer: {
    type: 'officer',
    name: 'Officer',
    hotkey: '4',
    role: 'Inspires faster reloads',
    maxHp: 120,
    moveSpeed: 60,
    range: 250,
    aimTime: 0.24,
    reloadTime: 1.65,
    damage: 34,
    accuracySpread: 0.095,
    projectileSpeed: 690,
    radius: 13,
    preferredStandOff: 190,
  },
};

export interface StructureSpec {
  type: StructureType;
  name: string;
  hotkey: string;
  role: string;
  maxHp: number;
  radius: number;
  material: 'wood' | 'stone' | 'sand';
}

export const STRUCTURE_SPECS: Record<StructureType, StructureSpec> = {
  sandbag: {
    type: 'sandbag',
    name: 'Sandbag',
    hotkey: '5',
    role: 'Absorbs musket fire',
    maxHp: 320,
    radius: 26,
    material: 'sand',
  },
  barricade: {
    type: 'barricade',
    name: 'Timber Barricade',
    hotkey: '6',
    role: 'Blocks advance & bullets',
    maxHp: 260,
    radius: 25,
    material: 'wood',
  },
  stone_wall: {
    type: 'stone_wall',
    name: 'Stone Bastion',
    hotkey: '7',
    role: 'Heavy fortified cover',
    maxHp: 620,
    radius: 28,
    material: 'stone',
  },
  powder_keg: {
    type: 'powder_keg',
    name: 'Powder Keg',
    hotkey: '8',
    role: 'Explodes when shot',
    maxHp: 45,
    radius: 16,
    material: 'wood',
  },
  cannon: {
    type: 'cannon',
    name: 'Field Cannon',
    hotkey: '9',
    role: 'Heavy cannonball salvo',
    maxHp: 380,
    radius: 24,
    material: 'wood',
  },
};

export interface WeatherConfig {
  id: WeatherType;
  name: string;
  shortName: string;
  description: string;
  windX: number;
  windY: number;
  reloadMultiplier: number; // >1 means slower
  accuracyMultiplier: number; // >1 means wider spread
  rangeMultiplier: number; // <1 means reduced visibility
  moveMultiplier: number;
  skyTint: string;
  ambientDarkness: number; // 0..1
  fogDensity: number; // 0..1
}

export const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  clear: {
    id: 'clear',
    name: 'Clear Skies',
    shortName: 'Clear',
    description: 'Dry powder and crisp visibility',
    windX: 28,
    windY: -8,
    reloadMultiplier: 1.0,
    accuracyMultiplier: 1.0,
    rangeMultiplier: 1.0,
    moveMultiplier: 1.0,
    skyTint: 'rgba(255, 245, 220, 0.0)',
    ambientDarkness: 0,
    fogDensity: 0,
  },
  rain: {
    id: 'rain',
    name: 'Driving Rain',
    shortName: 'Rain',
    description: 'Damp powder slows reloads slightly',
    windX: 85,
    windY: 14,
    reloadMultiplier: 1.18,
    accuracyMultiplier: 1.15,
    rangeMultiplier: 0.9,
    moveMultiplier: 0.92,
    skyTint: 'rgba(38, 56, 78, 0.24)',
    ambientDarkness: 0.18,
    fogDensity: 0.12,
  },
  fog: {
    id: 'fog',
    name: 'Rolling Fog',
    shortName: 'Fog',
    description: 'Thick mist cuts engagement range',
    windX: 18,
    windY: 4,
    reloadMultiplier: 1.05,
    accuracyMultiplier: 1.1,
    rangeMultiplier: 0.68,
    moveMultiplier: 0.96,
    skyTint: 'rgba(205, 214, 212, 0.28)',
    ambientDarkness: 0.08,
    fogDensity: 0.58,
  },
  snow: {
    id: 'snow',
    name: 'Winter Snow',
    shortName: 'Snow',
    description: 'Frost slows marching infantry',
    windX: 48,
    windY: 12,
    reloadMultiplier: 1.1,
    accuracyMultiplier: 1.08,
    rangeMultiplier: 0.88,
    moveMultiplier: 0.84,
    skyTint: 'rgba(218, 230, 245, 0.22)',
    ambientDarkness: 0.06,
    fogDensity: 0.16,
  },
  storm: {
    id: 'storm',
    name: 'Thunderstorm',
    shortName: 'Storm',
    description: 'Gale winds, lightning & thunder',
    windX: 165,
    windY: 24,
    reloadMultiplier: 1.25,
    accuracyMultiplier: 1.25,
    rangeMultiplier: 0.82,
    moveMultiplier: 0.88,
    skyTint: 'rgba(20, 28, 44, 0.36)',
    ambientDarkness: 0.32,
    fogDensity: 0.2,
  },
};

export const MAPS: MapConfig[] = [
  {
    id: 'waterloo',
    name: 'Meadows of Waterloo',
    subtitle: 'Open fields with a central farm lane',
    terrainSummary: 'Rolling pasture · Low stone ruin · Open sightlines',
    recommendedWeather: 'clear',
    palette: {
      groundBase: '#4d683b',
      groundAccent: '#425b31',
      roadColor: '#8d795c',
      waterColor: '#3a667c',
      ridgeColor: '#5c7244',
    },
    features: [
      { kind: 'road', x: 0, y: 465, width: 1800, height: 70 },
      { kind: 'ridge', x: 560, y: 180, width: 190, height: 140 },
      { kind: 'ridge', x: 1050, y: 670, width: 210, height: 150 },
      {
        kind: 'stone_ruin',
        x: 875,
        y: 340,
        width: 50,
        height: 95,
        blocksMovement: true,
        blocksBullets: true,
      },
      {
        kind: 'stone_ruin',
        x: 875,
        y: 565,
        width: 50,
        height: 95,
        blocksMovement: true,
        blocksBullets: true,
      },
      { kind: 'tree', x: 240, y: 140, width: 58, height: 58, blocksMovement: true },
      { kind: 'tree', x: 310, y: 195, width: 50, height: 50, blocksMovement: true },
      { kind: 'tree', x: 1480, y: 810, width: 62, height: 62, blocksMovement: true },
      { kind: 'tree', x: 1550, y: 745, width: 52, height: 52, blocksMovement: true },
    ],
  },
  {
    id: 'lodi_bridge',
    name: 'Bridge at Lodi',
    subtitle: 'Twin stone crossings over a deep river',
    terrainSummary: 'River divide · Two bridges · Chokepoint defense',
    recommendedWeather: 'fog',
    palette: {
      groundBase: '#45613e',
      groundAccent: '#3b5335',
      roadColor: '#8a7a61',
      waterColor: '#2d5870',
      ridgeColor: '#556e4b',
    },
    features: [
      {
        kind: 'river',
        x: 830,
        y: 0,
        width: 140,
        height: 1000,
        blocksMovement: true,
      },
      { kind: 'road', x: 0, y: 270, width: 1800, height: 64 },
      { kind: 'road', x: 0, y: 670, width: 1800, height: 64 },
      {
        kind: 'bridge',
        x: 805,
        y: 252,
        width: 190,
        height: 100,
        blocksMovement: false,
      },
      {
        kind: 'bridge',
        x: 805,
        y: 652,
        width: 190,
        height: 100,
        blocksMovement: false,
      },
      { kind: 'tree', x: 640, y: 115, width: 56, height: 56, blocksMovement: true },
      { kind: 'tree', x: 670, y: 850, width: 58, height: 58, blocksMovement: true },
      { kind: 'tree', x: 1130, y: 130, width: 54, height: 54, blocksMovement: true },
      { kind: 'tree', x: 1120, y: 870, width: 58, height: 58, blocksMovement: true },
    ],
  },
  {
    id: 'redoubt_ridge',
    name: 'Redoubt Ridge',
    subtitle: 'Highland plateau and fortified earthworks',
    terrainSummary: 'High ground · Twin stone bastions · Flank passes',
    recommendedWeather: 'storm',
    palette: {
      groundBase: '#53623d',
      groundAccent: '#485635',
      roadColor: '#7b6c55',
      waterColor: '#37586c',
      ridgeColor: '#69744d',
    },
    features: [
      { kind: 'ridge', x: 660, y: 210, width: 480, height: 580 },
      { kind: 'road', x: 0, y: 110, width: 1800, height: 56 },
      { kind: 'road', x: 0, y: 834, width: 1800, height: 56 },
      {
        kind: 'stone_ruin',
        x: 780,
        y: 260,
        width: 44,
        height: 140,
        blocksMovement: true,
        blocksBullets: true,
      },
      {
        kind: 'stone_ruin',
        x: 976,
        y: 600,
        width: 44,
        height: 140,
        blocksMovement: true,
        blocksBullets: true,
      },
      { kind: 'tree', x: 350, y: 490, width: 58, height: 58, blocksMovement: true },
      { kind: 'tree', x: 1440, y: 480, width: 58, height: 58, blocksMovement: true },
    ],
  },
  {
    id: 'winter_crossroads',
    name: 'Winter Crossroads',
    subtitle: 'Snow-dusted pines and ruined watchpost',
    terrainSummary: 'Frozen ground · Pine cover · Crossroads clash',
    recommendedWeather: 'snow',
    palette: {
      groundBase: '#7e8b8a',
      groundAccent: '#6f7c7c',
      roadColor: '#6f675d',
      waterColor: '#56788c',
      ridgeColor: '#8d9997',
    },
    features: [
      { kind: 'road', x: 0, y: 468, width: 1800, height: 64 },
      { kind: 'road', x: 868, y: 0, width: 64, height: 1000 },
      {
        kind: 'stone_ruin',
        x: 760,
        y: 355,
        width: 46,
        height: 75,
        blocksMovement: true,
        blocksBullets: true,
      },
      {
        kind: 'stone_ruin',
        x: 995,
        y: 570,
        width: 46,
        height: 75,
        blocksMovement: true,
        blocksBullets: true,
      },
      { kind: 'tree', x: 420, y: 220, width: 60, height: 60, blocksMovement: true },
      { kind: 'tree', x: 490, y: 280, width: 54, height: 54, blocksMovement: true },
      { kind: 'tree', x: 430, y: 740, width: 58, height: 58, blocksMovement: true },
      { kind: 'tree', x: 1320, y: 230, width: 58, height: 58, blocksMovement: true },
      { kind: 'tree', x: 1360, y: 730, width: 60, height: 60, blocksMovement: true },
      { kind: 'tree', x: 1290, y: 790, width: 52, height: 52, blocksMovement: true },
    ],
  },
];

export function getMapById(mapId: string): MapConfig {
  return MAPS.find((m) => m.id === mapId) ?? MAPS[0];
}
