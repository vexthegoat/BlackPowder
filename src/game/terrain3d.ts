import { getMapById, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import { TerrainFeature, WeatherType } from './types';

export const SIM_TO_3D = 0.1;
export const WORLD_3D_WIDTH = WORLD_WIDTH * SIM_TO_3D; // 180
export const WORLD_3D_HEIGHT = WORLD_HEIGHT * SIM_TO_3D; // 100

export function simToWorld3D(simX: number, simY: number): { x: number; z: number } {
  return {
    x: simX * SIM_TO_3D - WORLD_3D_WIDTH * 0.5,
    z: simY * SIM_TO_3D - WORLD_3D_HEIGHT * 0.5,
  };
}

export function world3DToSim(wx: number, wz: number): { x: number; y: number } {
  return {
    x: (wx + WORLD_3D_WIDTH * 0.5) / SIM_TO_3D,
    y: (wz + WORLD_3D_HEIGHT * 0.5) / SIM_TO_3D,
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function rectInfluence(
  px: number,
  py: number,
  f: TerrainFeature,
  feather: number
): number {
  const dx = Math.max(f.x - px, 0, px - (f.x + f.width));
  const dy = Math.max(f.y - py, 0, py - (f.y + f.height));
  const dist = Math.hypot(dx, dy);
  return 1 - smoothstep(0, feather, dist);
}

/**
 * Deterministic 3D ground elevation in 3D world units (+Y up) for a simulation coordinate.
 * Pure math so both the 3D terrain mesh, 3D props, and 2D projected infantry share exact heights.
 */
export function terrainHeightAt(
  mapId: string,
  simX: number,
  simY: number
): number {
  const map = getMapById(mapId);

  // Subtle rolling pastoral relief
  let h =
    Math.sin(simX * 0.0052 + 0.4) * Math.cos(simY * 0.0068 - 0.3) * 0.55 +
    Math.sin(simX * 0.011 - simY * 0.009) * 0.22;

  // Apply ridges (elevated tactical plateaus)
  let ridgeLift = 0;
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (f.kind === 'ridge') {
      const inf = rectInfluence(simX, simY, f, 65);
      if (inf > 0) {
        const target = mapId === 'redoubt_ridge' ? 3.8 : 2.6;
        ridgeLift = Math.max(ridgeLift, inf * target);
      }
    }
  }
  h += ridgeLift;

  // Gently flatten road beds toward local elevation
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (f.kind === 'road') {
      const inf = rectInfluence(simX, simY, f, 24);
      if (inf > 0) {
        h *= 1 - inf * 0.42;
      }
    }
  }

  // Carve riverbeds and elevate arched stone bridges over the river
  let bridgeInf = 0;
  let bridgeCenterT = 0;
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (f.kind === 'bridge') {
      const inf = rectInfluence(simX, simY, f, 16);
      if (inf > bridgeInf) {
        bridgeInf = inf;
        const bx = (simX - f.x) / Math.max(1, f.width);
        bridgeCenterT = Math.sin(Math.max(0, Math.min(1, bx)) * Math.PI);
      }
    }
  }

  let riverChannelInf = 0;
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (f.kind === 'river') {
      const dx = Math.max(f.x - simX, 0, simX - (f.x + f.width));
      const inf = 1 - smoothstep(0, 42, dx);
      if (inf > riverChannelInf) {
        riverChannelInf = inf;
      }
    }
  }

  // Outside playable battlefield: rise into natural rolling valley hills (except along river gorge)
  const outX = Math.max(-simX, 0, simX - WORLD_WIDTH);
  const outY = Math.max(-simY, 0, simY - WORLD_HEIGHT);
  const outDist = Math.hypot(outX, outY);
  if (outDist > 0) {
    const rim = smoothstep(0, 420, outDist);
    const undulation =
      (Math.sin(simX * 0.008) * Math.cos(simY * 0.008) + 1) * 3.2;
    h += rim * (4.5 + undulation) * (1 - riverChannelInf);
  }

  if (riverChannelInf > 0) {
    const riverDepth = -2.8 * riverChannelInf;
    h = h * (1 - riverChannelInf) + riverDepth;
  }

  if (bridgeInf > 0) {
    const bridgeDeckH = 0.55 + bridgeCenterT * 0.95;
    h = h * (1 - bridgeInf) + bridgeDeckH * bridgeInf;
  }

  return h;
}

export interface Atmosphere3DConfig {
  skyHex: number;
  fogHex: number;
  fogDensity: number;
  sunHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
}

export function getAtmosphereConfig(
  mapId: string,
  weather: WeatherType
): Atmosphere3DConfig {
  const isWinter = mapId === 'winter_crossroads';

  if (weather === 'storm') {
    return {
      skyHex: 0x1d2633,
      fogHex: 0x1f2836,
      fogDensity: 0.0038,
      sunHex: 0x9db7d8,
      sunIntensity: 1.05,
      hemiSkyHex: 0x5c718f,
      hemiGroundHex: 0x262d24,
      hemiIntensity: 0.72,
    };
  }
  if (weather === 'rain') {
    return {
      skyHex: 0x3b4d5e,
      fogHex: 0x425466,
      fogDensity: 0.0032,
      sunHex: 0xc2d5e8,
      sunIntensity: 1.35,
      hemiSkyHex: 0x86a2be,
      hemiGroundHex: 0x323b2b,
      hemiIntensity: 0.78,
    };
  }
  if (weather === 'fog') {
    return {
      skyHex: 0x8d9a98,
      fogHex: 0x9aa6a4,
      fogDensity: 0.0056,
      sunHex: 0xdce2de,
      sunIntensity: 1.2,
      hemiSkyHex: 0xc8d4d1,
      hemiGroundHex: 0x495346,
      hemiIntensity: 0.85,
    };
  }
  if (weather === 'snow') {
    return {
      skyHex: 0x8d9dad,
      fogHex: 0x98a8b8,
      fogDensity: 0.0034,
      sunHex: 0xecf3fc,
      sunIntensity: 1.55,
      hemiSkyHex: 0xc8daec,
      hemiGroundHex: 0x5d6766,
      hemiIntensity: 0.88,
    };
  }

  // Clear skies
  return {
    skyHex: isWinter ? 0x93a8b8 : 0x7b98b2,
    fogHex: isWinter ? 0x98aab8 : 0x849aa8,
    fogDensity: 0.0019,
    sunHex: isWinter ? 0xf7f2e8 : 0xffe9c2,
    sunIntensity: 2.1,
    hemiSkyHex: isWinter ? 0xc2d8eb : 0xaad0f0,
    hemiGroundHex: isWinter ? 0x525d5b : 0x3f4c2f,
    hemiIntensity: 0.78,
  };
}
