export type Faction = 'blue' | 'red';

export type SoldierType = 'line' | 'skirmisher' | 'grenadier' | 'officer';

export type StructureType =
  | 'sandbag'
  | 'barricade'
  | 'stone_wall'
  | 'powder_keg'
  | 'cannon';

export type WeatherType = 'clear' | 'rain' | 'fog' | 'snow' | 'storm';

export type GameScreen = 'title' | 'map_select' | 'playing' | 'paused';

export type PlacementCategory = 'infantry' | 'build' | 'erase';

export type FormationMode = 'single' | 'line5' | 'double10';

export type SoldierState =
  | 'idle'
  | 'walking'
  | 'aiming'
  | 'firing'
  | 'reloading'
  | 'dying'
  | 'dead';

export interface Soldier {
  id: number;
  type: SoldierType;
  faction: Faction;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number; // radians
  hp: number;
  maxHp: number;
  state: SoldierState;
  stateTimer: number;
  reloadProgress: number; // 0..1
  walkPhase: number;
  recoil: number; // 0..1
  hitFlash: number; // 0..1
  deathProgress: number; // 0..1
  deathDir: number; // -1 or 1 topple direction
  corpseAge: number;
  hatOffsetX: number;
  hatOffsetY: number;
  hatAngle: number;
  targetId: number | null;
  bannerWave: number;
  inspectedReloadSoundPlayed: boolean;
  woundSeverity: 0 | 1 | 2; // 0 = healthy, 1 = wounded, 2 = critically bleeding
  bleedTimer: number;
  flingVx: number;
  flingVy: number;
  flingHeight: number;
  flingVz: number;
  goreLevel: 0 | 1 | 2;
}

export interface Structure {
  id: number;
  type: StructureType;
  faction: Faction;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  angle: number;
  hitFlash: number;
  recoil: number;
  reloadTimer: number;
  aimTimer: number;
  state: 'idle' | 'aiming' | 'firing' | 'reloading' | 'destroyed';
  destroyedAge: number;
}

export interface Projectile {
  id: number;
  faction: Faction;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  rangeLeft: number;
  isCannonball: boolean;
  splashRadius: number;
}

export interface TerrainFeature {
  kind: 'road' | 'river' | 'bridge' | 'ridge' | 'stone_ruin' | 'tree';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  blocksMovement?: boolean;
  blocksBullets?: boolean;
  slowFactor?: number;
}

export interface MapConfig {
  id: string;
  name: string;
  subtitle: string;
  terrainSummary: string;
  recommendedWeather: WeatherType;
  palette: {
    groundBase: string;
    groundAccent: string;
    roadColor: string;
    waterColor: string;
    ridgeColor: string;
  };
  features: TerrainFeature[];
}

export type SimSoundEvent =
  | { kind: 'musket'; soldierType: SoldierType; x: number; y: number }
  | { kind: 'cannon'; x: number; y: number }
  | { kind: 'reload'; x: number; y: number }
  | { kind: 'hit'; x: number; y: number; fatal: boolean }
  | { kind: 'explosion'; x: number; y: number }
  | { kind: 'structure_hit'; x: number; y: number; material: 'wood' | 'stone' | 'sand' }
  | {
      kind: 'voice_command';
      role: 'officer' | 'cannon' | 'advance' | 'fire';
      faction: Faction;
      x: number;
      y: number;
    }
  | { kind: 'voice_death'; soldierType: SoldierType; x: number; y: number }
  | { kind: 'voice_pain'; soldierType: SoldierType; x: number; y: number };

export type SimVisualEvent =
  | {
      kind: 'muzzle_flash';
      x: number;
      y: number;
      angle: number;
      scale: number;
      isCannon: boolean;
    }
  | {
      kind: 'explosion';
      x: number;
      y: number;
      radius: number;
    }
  | {
      kind: 'impact';
      x: number;
      y: number;
      angle: number;
      material: 'flesh' | 'wood' | 'stone' | 'sand' | 'ground';
    }
  | {
      kind: 'death_dust';
      x: number;
      y: number;
    }
  | {
      kind: 'cannon_impact';
      x: number;
      y: number;
    }
  | {
      kind: 'blood_splatter';
      x: number;
      y: number;
      angle: number;
      fatal: boolean;
      intensity: number;
    };

export interface SimulationState {
  width: number;
  height: number;
  soldiers: Soldier[];
  structures: Structure[];
  projectiles: Projectile[];
  nextId: number;
  combatActive: boolean;
  weather: WeatherType;
  mapId: string;
  elapsedTime: number;
  blueKills: number;
  redKills: number;
  lightningFlash: number; // 0..1
  nextLightningIn: number;
  cameraShake: number;
  soundEvents: SimSoundEvent[];
  visualEvents: SimVisualEvent[];
}
