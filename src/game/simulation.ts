import {
  getMapById,
  SOLDIER_SPECS,
  STRUCTURE_SPECS,
  WEATHER_CONFIGS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import {
  Faction,
  FormationMode,
  MapConfig,
  Projectile,
  SimulationState,
  Soldier,
  SoldierType,
  Structure,
  StructureType,
  TerrainFeature,
  WeatherType,
} from './types';

export function createSimulation(
  mapId = 'waterloo',
  weather: WeatherType = 'clear'
): SimulationState {
  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    soldiers: [],
    structures: [],
    projectiles: [],
    nextId: 1,
    combatActive: false,
    weather,
    mapId,
    elapsedTime: 0,
    blueKills: 0,
    redKills: 0,
    lightningFlash: 0,
    nextLightningIn: 4.5,
    cameraShake: 0,
    soundEvents: [],
    visualEvents: [],
  };
}

export function clearBattlefield(sim: SimulationState): void {
  sim.soldiers = [];
  sim.structures = [];
  sim.projectiles = [];
  sim.blueKills = 0;
  sim.redKills = 0;
  sim.elapsedTime = 0;
  sim.cameraShake = 0;
  sim.soundEvents = [];
  sim.visualEvents = [];
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function distPointToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-6) return distSq(px, py, ax, ay);
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1);
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return distSq(px, py, cx, cy);
}

function pointInRect(
  px: number,
  py: number,
  r: TerrainFeature,
  pad = 0
): boolean {
  return (
    px >= r.x - pad &&
    px <= r.x + r.width + pad &&
    py >= r.y - pad &&
    py <= r.y + r.height + pad
  );
}

function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: TerrainFeature,
  pad = 0
): boolean {
  const minX = r.x - pad;
  const maxX = r.x + r.width + pad;
  const minY = r.y - pad;
  const maxY = r.y + r.height + pad;

  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;

  const pVals = [-dx, dx, -dy, dy];
  const qVals = [ax - minX, maxX - ax, ay - minY, maxY - ay];

  for (let i = 0; i < 4; i++) {
    const p = pVals[i];
    const q = qVals[i];
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

function getSidewaysWallBox(st: Structure): {
  kind: 'stone_ruin';
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (st.type !== 'stone_wall' && st.type !== 'barricade' && st.type !== 'sandbag') {
    return null;
  }
  const halfW = st.type === 'stone_wall' ? 26 : st.type === 'barricade' ? 24 : 22;
  const halfH = st.type === 'stone_wall' ? 13 : 10;
  return {
    kind: 'stone_ruin',
    x: st.x - halfW,
    y: st.y - halfH,
    width: halfW * 2,
    height: halfH * 2,
  };
}

export function hasLineOfSight(
  sim: SimulationState,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  map: MapConfig = getMapById(sim.mapId)
): boolean {
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (f.blocksBullets && segmentIntersectsRect(ax, ay, bx, by, f, 0)) {
      return false;
    }
  }

  for (let i = 0; i < sim.structures.length; i++) {
    const st = sim.structures[i];
    if (st.state === 'destroyed' || st.type !== 'stone_wall') continue;
    const box = getSidewaysWallBox(st);
    if (box && segmentIntersectsRect(ax, ay, bx, by, box, 0)) {
      return false;
    }
  }

  return true;
}

export function isPointBlockedByTerrain(
  x: number,
  y: number,
  map: MapConfig,
  radius = 10
): boolean {
  // Check bridges first so bridge deck overrides river blocking
  let onBridge = false;
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (f.kind === 'bridge' && pointInRect(x, y, f, -2)) {
      onBridge = true;
      break;
    }
  }

  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (!f.blocksMovement) continue;
    if (f.kind === 'river' && onBridge) continue;
    if (f.kind === 'tree') {
      const cx = f.x + f.width * 0.5;
      const cy = f.y + f.height * 0.5;
      const trunkR = f.width * 0.24 + radius;
      if (distSq(x, y, cx, cy) < trunkR * trunkR) return true;
    } else if (pointInRect(x, y, f, radius)) {
      return true;
    }
  }
  return false;
}

export function spawnSoldier(
  sim: SimulationState,
  type: SoldierType,
  faction: Faction,
  x: number,
  y: number
): Soldier {
  const spec = SOLDIER_SPECS[type];
  const cx = clamp(x, 32, sim.width - 32);
  const cy = clamp(y, 36, sim.height - 36);
  const soldier: Soldier = {
    id: sim.nextId++,
    type,
    faction,
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    facing: faction === 'blue' ? 0 : Math.PI,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    state: 'idle',
    stateTimer: 0,
    reloadProgress: 1,
    walkPhase: Math.random() * Math.PI * 2,
    recoil: 0,
    hitFlash: 0,
    deathProgress: 0,
    deathDir: Math.random() < 0.5 ? -1 : 1,
    corpseAge: 0,
    hatOffsetX: 0,
    hatOffsetY: 0,
    hatAngle: 0,
    targetId: null,
    bannerWave: Math.random() * Math.PI * 2,
    inspectedReloadSoundPlayed: false,
    woundSeverity: 0,
    bleedTimer: 0,
    flingVx: 0,
    flingVy: 0,
    flingHeight: 0,
    flingVz: 0,
    goreLevel: 0,
  };
  sim.soldiers.push(soldier);
  return soldier;
}

export function spawnFormation(
  sim: SimulationState,
  type: SoldierType,
  faction: Faction,
  x: number,
  y: number,
  mode: FormationMode
): Soldier[] {
  const map = getMapById(sim.mapId);
  const created: Soldier[] = [];

  if (mode === 'single') {
    const s = spawnSoldier(sim, type, faction, x, y);
    created.push(s);
    return created;
  }

  const spacingY = 30;
  const spacingX = 28;
  if (mode === 'line5') {
    for (let i = -2; i <= 2; i++) {
      const sx = clamp(x, 32, sim.width - 32);
      const sy = clamp(y + i * spacingY, 36, sim.height - 36);
      if (!isPointBlockedByTerrain(sx, sy, map, 10)) {
        created.push(spawnSoldier(sim, type, faction, sx, sy));
      }
    }
  } else {
    // double10: 2 columns x 5 rows
    const dir = faction === 'blue' ? -1 : 1;
    for (let col = 0; col < 2; col++) {
      for (let row = -2; row <= 2; row++) {
        const sx = clamp(x + col * dir * spacingX, 32, sim.width - 32);
        const sy = clamp(y + row * spacingY, 36, sim.height - 36);
        if (!isPointBlockedByTerrain(sx, sy, map, 10)) {
          created.push(spawnSoldier(sim, type, faction, sx, sy));
        }
      }
    }
  }
  return created;
}

export function spawnStructure(
  sim: SimulationState,
  type: StructureType,
  faction: Faction,
  x: number,
  y: number
): Structure {
  const spec = STRUCTURE_SPECS[type];
  const structure: Structure = {
    id: sim.nextId++,
    type,
    faction,
    x: clamp(x, 40, sim.width - 40),
    y: clamp(y, 40, sim.height - 40),
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    radius: spec.radius,
    angle: faction === 'blue' ? 0 : Math.PI,
    hitFlash: 0,
    recoil: 0,
    reloadTimer: 1.0 + Math.random() * 0.8,
    aimTimer: 0,
    state: 'idle',
    destroyedAge: 0,
  };
  sim.structures.push(structure);
  return structure;
}

export function eraseAt(
  sim: SimulationState,
  x: number,
  y: number,
  radius = 34
): boolean {
  let removed = false;
  for (let i = sim.soldiers.length - 1; i >= 0; i--) {
    const s = sim.soldiers[i];
    if (distSq(s.x, s.y, x, y) <= radius * radius) {
      sim.soldiers.splice(i, 1);
      removed = true;
    }
  }
  for (let i = sim.structures.length - 1; i >= 0; i--) {
    const st = sim.structures[i];
    const r = radius + st.radius * 0.5;
    if (distSq(st.x, st.y, x, y) <= r * r) {
      sim.structures.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

export function setupSkirmishPreset(sim: SimulationState): void {
  clearBattlefield(sim);
  const isBridgeMap = sim.mapId === 'lodi_bridge';

  if (isBridgeMap) {
    // Position forces facing across the two bridges
    spawnFormation(sim, 'line', 'blue', 540, 295, 'double10');
    spawnFormation(sim, 'line', 'blue', 540, 700, 'double10');
    spawnFormation(sim, 'skirmisher', 'blue', 410, 495, 'line5');
    spawnSoldier(sim, 'officer', 'blue', 475, 295);
    spawnSoldier(sim, 'officer', 'blue', 475, 700);
    spawnStructure(sim, 'sandbag', 'blue', 655, 275);
    spawnStructure(sim, 'sandbag', 'blue', 655, 330);
    spawnStructure(sim, 'cannon', 'blue', 595, 675);

    spawnFormation(sim, 'line', 'red', 1260, 295, 'double10');
    spawnFormation(sim, 'grenadier', 'red', 1260, 700, 'line5');
    spawnFormation(sim, 'skirmisher', 'red', 1390, 495, 'line5');
    spawnSoldier(sim, 'officer', 'red', 1325, 295);
    spawnStructure(sim, 'barricade', 'red', 1145, 275);
    spawnStructure(sim, 'barricade', 'red', 1145, 330);
    spawnStructure(sim, 'powder_keg', 'red', 1185, 700);
    spawnStructure(sim, 'cannon', 'red', 1205, 655);
  } else {
    // Classic Napoleonic two-rank battle line clash
    spawnFormation(sim, 'line', 'blue', 440, 370, 'double10');
    spawnFormation(sim, 'line', 'blue', 440, 630, 'double10');
    spawnFormation(sim, 'grenadier', 'blue', 515, 500, 'line5');
    spawnFormation(sim, 'skirmisher', 'blue', 330, 200, 'line5');
    spawnSoldier(sim, 'officer', 'blue', 385, 370);
    spawnSoldier(sim, 'officer', 'blue', 385, 630);

    spawnStructure(sim, 'sandbag', 'blue', 575, 445);
    spawnStructure(sim, 'sandbag', 'blue', 575, 555);
    spawnStructure(sim, 'cannon', 'blue', 485, 500);

    spawnFormation(sim, 'line', 'red', 1360, 370, 'double10');
    spawnFormation(sim, 'line', 'red', 1360, 630, 'double10');
    spawnFormation(sim, 'grenadier', 'red', 1285, 500, 'line5');
    spawnFormation(sim, 'skirmisher', 'red', 1470, 800, 'line5');
    spawnSoldier(sim, 'officer', 'red', 1415, 370);
    spawnSoldier(sim, 'officer', 'red', 1415, 630);

    spawnStructure(sim, 'barricade', 'red', 1225, 445);
    spawnStructure(sim, 'barricade', 'red', 1225, 555);
    spawnStructure(sim, 'powder_keg', 'red', 1210, 500);
    spawnStructure(sim, 'cannon', 'red', 1315, 500);
  }
}

function getMuzzlePosition(s: Soldier): { x: number; y: number } {
  const reach =
    s.type === 'skirmisher'
      ? 24
      : s.type === 'officer'
        ? 16
        : s.type === 'grenadier'
          ? 20
          : 21;
  return {
    x: s.x + Math.cos(s.facing) * reach,
    y: s.y - 8 + Math.sin(s.facing) * reach,
  };
}

function triggerPowderKegExplosion(
  sim: SimulationState,
  keg: Structure
): void {
  const blastRadius = 115;
  sim.visualEvents.push({
    kind: 'explosion',
    x: keg.x,
    y: keg.y,
    radius: blastRadius,
  });
  sim.soundEvents.push({
    kind: 'explosion',
    x: keg.x,
    y: keg.y,
  });
  sim.cameraShake = Math.min(1.0, sim.cameraShake + 0.72);

  for (let i = 0; i < sim.soldiers.length; i++) {
    const s = sim.soldiers[i];
    if (s.state === 'dying' || s.state === 'dead') continue;
    const d2 = distSq(s.x, s.y, keg.x, keg.y);
    if (d2 <= blastRadius * blastRadius) {
      const d = Math.sqrt(d2) || 1;
      const falloff = 1 - d / blastRadius;
      const dmg = 140 * falloff + 30;
      const blastAngle = Math.atan2(s.y - keg.y, s.x - keg.x);
      applySoldierDamage(sim, s, dmg, keg.faction === 'blue' ? 'blue' : 'red', blastAngle);
      applyBlastFling(
        s,
        Math.cos(blastAngle) * (120 + 135 * falloff),
        Math.sin(blastAngle) * (120 + 135 * falloff),
        12 + 12 * falloff
      );
    }
  }

  for (let i = 0; i < sim.structures.length; i++) {
    const st = sim.structures[i];
    if (st.id === keg.id || st.state === 'destroyed') continue;
    const d2 = distSq(st.x, st.y, keg.x, keg.y);
    if (d2 <= blastRadius * blastRadius) {
      st.hp -= 120;
      st.hitFlash = 1;
      if (st.hp <= 0) {
        st.hp = 0;
        st.state = 'destroyed';
        if (st.type === 'powder_keg') {
          triggerPowderKegExplosion(sim, st);
        }
      }
    }
  }
}

function applyBlastFling(
  target: Soldier,
  impulseVx: number,
  impulseVy: number,
  upSpeed: number
): void {
  const massFactor = target.type === 'grenadier' ? 0.78 : 1.0;
  target.flingVx += impulseVx * massFactor;
  target.flingVy += impulseVy * massFactor;
  target.flingVz = Math.max(target.flingVz, upSpeed * massFactor);
  if (target.state === 'aiming' || target.state === 'firing') {
    target.state = 'idle';
  }
}

function applySoldierDamage(
  sim: SimulationState,
  target: Soldier,
  damage: number,
  attackerFaction: Faction,
  hitAngle = 0
): void {
  if (target.state === 'dying' || target.state === 'dead') return;
  target.hp -= damage;
  target.hitFlash = 1;

  const fatal = target.hp <= 0;
  const intensity = clamp(damage / 42, 0.7, 2.2);

  sim.visualEvents.push({
    kind: 'blood_splatter',
    x: target.x,
    y: target.y + 4,
    angle: hitAngle,
    fatal,
    intensity,
  });

  if (fatal) {
    target.hp = 0;
    target.state = 'dying';
    target.deathProgress = 0;
    target.stateTimer = 0;
    target.goreLevel = damage >= 85 ? 2 : damage >= 48 ? 1 : 0;
    if (target.goreLevel === 2) {
      target.hatOffsetX += target.deathDir * 10;
      target.hatOffsetY += 8;
    }
    sim.soundEvents.push({
      kind: 'hit',
      x: target.x,
      y: target.y,
      fatal: true,
    });
    sim.soundEvents.push({
      kind: 'voice_death',
      soldierType: target.type,
      x: target.x,
      y: target.y,
    });
    sim.visualEvents.push({
      kind: 'death_dust',
      x: target.x,
      y: target.y,
    });
    if (attackerFaction === 'blue') {
      sim.blueKills++;
    } else {
      sim.redKills++;
    }
  } else {
    const hpRatio = target.hp / Math.max(1, target.maxHp);
    if (hpRatio <= 0.35) {
      target.woundSeverity = 2;
    } else if (hpRatio <= 0.75 || damage >= 20) {
      target.woundSeverity = Math.max(target.woundSeverity, 1) as 0 | 1 | 2;
    }
    sim.soundEvents.push({
      kind: 'hit',
      x: target.x,
      y: target.y,
      fatal: false,
    });
    sim.soundEvents.push({
      kind: 'voice_pain',
      soldierType: target.type,
      x: target.x,
      y: target.y,
    });
  }
}

function hasNearbyOfficer(sim: SimulationState, soldier: Soldier): boolean {
  if (soldier.type === 'officer') return false;
  const auraR2 = 165 * 165;
  for (let i = 0; i < sim.soldiers.length; i++) {
    const other = sim.soldiers[i];
    if (
      other.faction === soldier.faction &&
      other.type === 'officer' &&
      other.state !== 'dying' &&
      other.state !== 'dead' &&
      distSq(soldier.x, soldier.y, other.x, other.y) <= auraR2
    ) {
      return true;
    }
  }
  return false;
}

function findNearestEnemy(
  sim: SimulationState,
  x: number,
  y: number,
  myFaction: Faction,
  map: MapConfig
): { x: number; y: number; id: number; dist: number; hasLos: boolean } | null {
  let bestVisibleDist2 = Infinity;
  let bestVisible: { x: number; y: number; id: number } | null = null;
  let bestBlockedDist2 = Infinity;
  let bestBlocked: { x: number; y: number; id: number } | null = null;

  for (let i = 0; i < sim.soldiers.length; i++) {
    const s = sim.soldiers[i];
    if (s.faction === myFaction || s.state === 'dying' || s.state === 'dead') {
      continue;
    }
    const d2 = distSq(x, y, s.x, s.y);
    if (hasLineOfSight(sim, x, y, s.x, s.y, map)) {
      if (d2 < bestVisibleDist2) {
        bestVisibleDist2 = d2;
        bestVisible = { x: s.x, y: s.y, id: s.id };
      }
    } else if (d2 < bestBlockedDist2) {
      bestBlockedDist2 = d2;
      bestBlocked = { x: s.x, y: s.y, id: s.id };
    }
  }

  // Also target opposing cannons or powder kegs if no soldiers are closer
  if (!bestVisible && !bestBlocked) {
    for (let i = 0; i < sim.structures.length; i++) {
      const st = sim.structures[i];
      if (
        st.faction === myFaction ||
        st.state === 'destroyed' ||
        (st.type !== 'cannon' && st.type !== 'powder_keg')
      ) {
        continue;
      }
      const d2 = distSq(x, y, st.x, st.y);
      if (hasLineOfSight(sim, x, y, st.x, st.y, map)) {
        if (d2 < bestVisibleDist2) {
          bestVisibleDist2 = d2;
          bestVisible = { x: st.x, y: st.y, id: st.id };
        }
      } else if (d2 < bestBlockedDist2) {
        bestBlockedDist2 = d2;
        bestBlocked = { x: st.x, y: st.y, id: st.id };
      }
    }
  }

  if (bestVisible) {
    return {
      x: bestVisible.x,
      y: bestVisible.y,
      id: bestVisible.id,
      dist: Math.sqrt(bestVisibleDist2),
      hasLos: true,
    };
  }
  if (bestBlocked) {
    return {
      x: bestBlocked.x,
      y: bestBlocked.y,
      id: bestBlocked.id,
      dist: Math.sqrt(bestBlockedDist2),
      hasLos: false,
    };
  }
  return null;
}

function resolveMoveWaypoint(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  map: MapConfig,
  structures: Structure[]
): { wx: number; wy: number } {
  // 1. If a river separates x and targetX, steer toward the nearest bridge center
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (f.kind !== 'river') continue;
    const riverMid = f.x + f.width * 0.5;
    const onOppositeSides =
      (x < riverMid - f.width * 0.4 && targetX > riverMid + f.width * 0.4) ||
      (x > riverMid + f.width * 0.4 && targetX < riverMid - f.width * 0.4);
    if (onOppositeSides) {
      let bestBridge: TerrainFeature | null = null;
      let bestDist = Infinity;
      for (let j = 0; j < map.features.length; j++) {
        const b = map.features[j];
        if (b.kind !== 'bridge') continue;
        const bcx = b.x + b.width * 0.5;
        const bcy = b.y + b.height * 0.5;
        const d = distSq(x, y, bcx, bcy);
        if (d < bestDist) {
          bestDist = d;
          bestBridge = b;
        }
      }
      if (bestBridge) {
        return {
          wx: bestBridge.x + bestBridge.width * 0.5,
          wy: bestBridge.y + bestBridge.height * 0.5,
        };
      }
    }
  }

  // 2. If a stone_ruin wall blocks direct path, steer around nearest unobstructed edge
  const pad = 28;
  for (let i = 0; i < map.features.length; i++) {
    const f = map.features[i];
    if (!f.blocksBullets) continue;
    if (segmentIntersectsRect(x, y, targetX, targetY, f, 8)) {
      const candidates = [
        { wx: f.x + f.width * 0.5, wy: f.y - pad },
        { wx: f.x + f.width * 0.5, wy: f.y + f.height + pad },
        { wx: f.x - pad, wy: f.y + f.height * 0.5 },
        { wx: f.x + f.width + pad, wy: f.y + f.height * 0.5 },
      ];
      let bestCost = Infinity;
      let bestPt = candidates[0];
      for (let c = 0; c < candidates.length; c++) {
        const pt = candidates[c];
        if (pt.wx < 32 || pt.wx > WORLD_WIDTH - 32 || pt.wy < 32 || pt.wy > WORLD_HEIGHT - 32) {
          continue;
        }
        const cost =
          Math.hypot(pt.wx - x, pt.wy - y) +
          Math.hypot(targetX - pt.wx, targetY - pt.wy);
        if (cost < bestCost) {
          bestCost = cost;
          bestPt = pt;
        }
      }
      return bestPt;
    }
  }

  // 3. If a sideways player-built stone_wall blocks path, flank around nearest unobstructed edge
  for (let i = 0; i < structures.length; i++) {
    const st = structures[i];
    if (st.state === 'destroyed' || st.type !== 'stone_wall') continue;
    const box = getSidewaysWallBox(st);
    if (box && segmentIntersectsRect(x, y, targetX, targetY, box, 8)) {
      const candidates = [
        { wx: st.x, wy: box.y - pad },
        { wx: st.x, wy: box.y + box.height + pad },
        { wx: box.x - pad, wy: st.y },
        { wx: box.x + box.width + pad, wy: st.y },
      ];
      let bestCost = Infinity;
      let bestPt = candidates[0];
      for (let c = 0; c < candidates.length; c++) {
        const pt = candidates[c];
        if (pt.wx < 32 || pt.wx > WORLD_WIDTH - 32 || pt.wy < 32 || pt.wy > WORLD_HEIGHT - 32) {
          continue;
        }
        const cost =
          Math.hypot(pt.wx - x, pt.wy - y) +
          Math.hypot(targetX - pt.wx, targetY - pt.wy);
        if (cost < bestCost) {
          bestCost = cost;
          bestPt = pt;
        }
      }
      return bestPt;
    }
  }

  return { wx: targetX, wy: targetY };
}

function isBlockedByStructure(
  sim: SimulationState,
  x: number,
  y: number,
  radius: number
): boolean {
  for (let i = 0; i < sim.structures.length; i++) {
    const st = sim.structures[i];
    if (st.state === 'destroyed') continue;
    const box = getSidewaysWallBox(st);
    if (box) {
      if (pointInRect(x, y, box, radius * 0.85)) {
        return true;
      }
      continue;
    }
    const minR = st.radius * 0.72 + radius;
    if (distSq(x, y, st.x, st.y) < minR * minR) {
      return true;
    }
  }
  return false;
}

export function stepSimulation(
  sim: SimulationState,
  rawDt: number,
  rng: () => number = Math.random
): { thunderTriggered: boolean } {
  const dt = Math.min(rawDt, 0.05);
  sim.soundEvents = [];
  sim.visualEvents = [];

  let thunderTriggered = false;
  sim.cameraShake = Math.max(0, sim.cameraShake - dt * 2.4);

  // Weather lightning cycle
  if (sim.weather === 'storm') {
    sim.lightningFlash = Math.max(0, sim.lightningFlash - dt * 2.8);
    sim.nextLightningIn -= dt;
    if (sim.nextLightningIn <= 0) {
      sim.lightningFlash = 0.9;
      sim.nextLightningIn = 5.5 + rng() * 8.0;
      thunderTriggered = true;
    }
  } else {
    sim.lightningFlash = 0;
  }

  const map = getMapById(sim.mapId);
  const wCfg = WEATHER_CONFIGS[sim.weather];

  if (sim.combatActive) {
    sim.elapsedTime += dt;
  }

  // Update structures (decay flashes, operate cannons)
  for (let i = sim.structures.length - 1; i >= 0; i--) {
    const st = sim.structures[i];
    st.hitFlash = Math.max(0, st.hitFlash - dt * 5.0);
    st.recoil = Math.max(0, st.recoil - dt * 3.5);

    if (st.state === 'destroyed') {
      st.destroyedAge += dt;
      if (st.destroyedAge > 8) {
        sim.structures.splice(i, 1);
      }
      continue;
    }

    if (st.type === 'cannon' && sim.combatActive) {
      const target = findNearestEnemy(sim, st.x, st.y, st.faction, map);
      const cannonRange = 760 * wCfg.rangeMultiplier;

      if (st.state === 'reloading') {
        st.reloadTimer -= dt / wCfg.reloadMultiplier;
        if (st.reloadTimer <= 0) {
          st.state = 'idle';
        }
      } else if (st.state === 'firing') {
        st.aimTimer -= dt;
        if (st.aimTimer <= 0) {
          st.state = 'reloading';
          st.reloadTimer = 4.2;
        }
      } else if (target && target.dist <= cannonRange && target.hasLos) {
        const desiredAngle = Math.atan2(target.y - st.y, target.x - st.x);
        st.angle = desiredAngle;
        if (st.state === 'idle') {
          st.state = 'aiming';
          st.aimTimer = 0.55;
          sim.soundEvents.push({
            kind: 'voice_command',
            role: 'cannon',
            faction: st.faction,
            x: st.x,
            y: st.y,
          });
        } else if (st.state === 'aiming') {
          st.aimTimer -= dt;
          if (st.aimTimer <= 0) {
            st.state = 'firing';
            st.aimTimer = 0.25;
            st.recoil = 1;
            const muzzleX = st.x + Math.cos(st.angle) * 28;
            const muzzleY = st.y + Math.sin(st.angle) * 28;
            const spread = (rng() - 0.5) * 0.055 * wCfg.accuracyMultiplier;
            const shotAngle = st.angle + spread;
            const speed = 820;

            sim.projectiles.push({
              id: sim.nextId++,
              faction: st.faction,
              x: muzzleX,
              y: muzzleY,
              prevX: muzzleX,
              prevY: muzzleY,
              vx: Math.cos(shotAngle) * speed,
              vy: Math.sin(shotAngle) * speed,
              damage: 110,
              rangeLeft: cannonRange * 1.15,
              isCannonball: true,
              splashRadius: 52,
            });
            sim.visualEvents.push({
              kind: 'muzzle_flash',
              x: muzzleX,
              y: muzzleY,
              angle: shotAngle,
              scale: 1.5,
              isCannon: true,
            });
            sim.soundEvents.push({ kind: 'cannon', x: muzzleX, y: muzzleY });
            sim.cameraShake = Math.min(1, sim.cameraShake + 0.28);
          }
        }
      } else {
        st.state = 'idle';
      }
    }
  }

  // Update soldiers
  for (let i = 0; i < sim.soldiers.length; i++) {
    const s = sim.soldiers[i];
    s.hitFlash = Math.max(0, s.hitFlash - dt * 5.5);
    s.recoil = Math.max(0, s.recoil - dt * 4.5);
    s.bannerWave += dt * (4.5 + (sim.weather === 'storm' ? 4 : 0));

    // Apply artillery / blast fling arc & knockback momentum (applies to both living & newly blown-back corpses)
    if (
      Math.abs(s.flingVx) > 1.5 ||
      Math.abs(s.flingVy) > 1.5 ||
      s.flingHeight > 0 ||
      s.flingVz > 0
    ) {
      const nextFx = clamp(s.x + s.flingVx * dt, 24, sim.width - 24);
      const nextFy = clamp(s.y + s.flingVy * dt, 28, sim.height - 28);
      if (!isPointBlockedByTerrain(nextFx, s.y, map, 9)) {
        s.x = nextFx;
      } else {
        s.flingVx *= -0.25;
      }
      if (!isPointBlockedByTerrain(s.x, nextFy, map, 9)) {
        s.y = nextFy;
      } else {
        s.flingVy *= -0.25;
      }

      const wasAirborne = s.flingHeight > 0;
      s.flingHeight += s.flingVz * dt;
      s.flingVz -= 62 * dt;
      if (s.flingHeight <= 0) {
        s.flingHeight = 0;
        s.flingVz = 0;
        if (wasAirborne && Math.hypot(s.flingVx, s.flingVy) > 55) {
          sim.visualEvents.push({
            kind: 'death_dust',
            x: s.x,
            y: s.y,
          });
          if (s.woundSeverity > 0 || s.state === 'dying' || s.state === 'dead') {
            sim.visualEvents.push({
              kind: 'blood_splatter',
              x: s.x,
              y: s.y + 4,
              angle: Math.atan2(s.flingVy, s.flingVx),
              fatal: s.state === 'dying' || s.state === 'dead',
              intensity: s.goreLevel === 2 ? 1.45 : 0.85,
            });
          }
        }
      }
      const drag = Math.exp(-(s.flingHeight > 0 ? 2.6 : 9.5) * dt);
      s.flingVx *= drag;
      s.flingVy *= drag;
      if (Math.abs(s.flingVx) < 1.5) s.flingVx = 0;
      if (Math.abs(s.flingVy) < 1.5) s.flingVy = 0;
    }

    if (s.state === 'dying') {
      s.deathProgress = Math.min(1, s.deathProgress + dt / 0.55);
      s.hatOffsetX += s.deathDir * 14 * dt;
      s.hatOffsetY += 16 * dt;
      s.hatAngle += s.deathDir * 3.5 * dt;
      if (s.deathProgress >= 1) {
        s.state = 'dead';
        s.corpseAge = 0;
      }
      continue;
    }

    if (s.state === 'dead') {
      s.corpseAge += dt;
      continue;
    }

    const spec = SOLDIER_SPECS[s.type];

    // Wound bleeding progression while battle is active
    if (sim.combatActive && s.woundSeverity > 0) {
      if (s.woundSeverity === 2) {
        s.hp -= 3.0 * dt;
        s.bleedTimer += dt;
        if (s.bleedTimer >= 0.72) {
          s.bleedTimer = 0;
          sim.visualEvents.push({
            kind: 'blood_splatter',
            x: s.x,
            y: s.y + 4,
            angle: s.facing,
            fatal: false,
            intensity: 0.42,
          });
        }
        if (s.hp <= 0) {
          applySoldierDamage(
            sim,
            s,
            10,
            s.faction === 'blue' ? 'red' : 'blue',
            s.facing + Math.PI
          );
          continue;
        }
      } else if (s.state === 'walking') {
        s.bleedTimer += dt;
        if (s.bleedTimer >= 1.6) {
          s.bleedTimer = 0;
          sim.visualEvents.push({
            kind: 'blood_splatter',
            x: s.x,
            y: s.y + 4,
            angle: s.facing,
            fatal: false,
            intensity: 0.3,
          });
        }
      }
    }

    if (!sim.combatActive) {
      if (s.state === 'walking' || s.state === 'aiming' || s.state === 'firing') {
        s.state = 'idle';
      }
      s.vx = 0;
      s.vy = 0;
      continue;
    }

    if (s.state === 'reloading') {
      const officerBonus = hasNearbyOfficer(sim, s) ? 1.28 : 1.0;
      const woundReloadPenalty =
        s.woundSeverity === 2 ? 1.55 : s.woundSeverity === 1 ? 1.25 : 1.0;
      const effectiveReload =
        (spec.reloadTime * wCfg.reloadMultiplier * woundReloadPenalty) /
        officerBonus;
      s.reloadProgress = Math.min(1, s.reloadProgress + dt / effectiveReload);
      if (s.reloadProgress >= 0.45 && !s.inspectedReloadSoundPlayed) {
        s.inspectedReloadSoundPlayed = true;
        sim.soundEvents.push({ kind: 'reload', x: s.x, y: s.y });
      }
      if (s.reloadProgress >= 1) {
        s.state = 'idle';
        s.inspectedReloadSoundPlayed = false;
      }
      continue;
    }

    if (s.state === 'firing') {
      s.stateTimer -= dt;
      if (s.stateTimer <= 0) {
        s.state = 'reloading';
        s.reloadProgress = 0;
        s.inspectedReloadSoundPlayed = false;
      }
      continue;
    }

    const target = findNearestEnemy(sim, s.x, s.y, s.faction, map);
    if (!target) {
      s.state = 'idle';
      s.vx = 0;
      s.vy = 0;
      continue;
    }

    const effectiveRange = spec.range * wCfg.rangeMultiplier;
    const angleToTarget = Math.atan2(target.y - s.y, target.x - s.x);

    if (s.state === 'aiming') {
      s.facing = angleToTarget;
      s.stateTimer -= dt;
      if (target.dist > effectiveRange * 1.12 || !target.hasLos) {
        s.state = 'walking';
        continue;
      }
      if (s.stateTimer <= 0) {
        // Discharge weapon!
        s.state = 'firing';
        s.stateTimer = 0.18;
        s.recoil = 1;

        const woundAimMult =
          s.woundSeverity === 2 ? 1.75 : s.woundSeverity === 1 ? 1.35 : 1.0;
        const spread =
          (rng() - 0.5) *
          2 *
          spec.accuracySpread *
          wCfg.accuracyMultiplier *
          woundAimMult;
        const shotAngle = s.facing + spread;
        const muzzle = getMuzzlePosition(s);

        // Spawn bullet at soldier center->muzzle sweep so accidental/low-accuracy corner shots strike the wall visibly
        sim.projectiles.push({
          id: sim.nextId++,
          faction: s.faction,
          x: muzzle.x,
          y: muzzle.y,
          prevX: s.x,
          prevY: s.y,
          vx: Math.cos(shotAngle) * spec.projectileSpeed,
          vy: Math.sin(shotAngle) * spec.projectileSpeed,
          damage: spec.damage,
          rangeLeft: effectiveRange * 1.12,
          isCannonball: false,
          splashRadius: 0,
        });

        sim.visualEvents.push({
          kind: 'muzzle_flash',
          x: muzzle.x,
          y: muzzle.y,
          angle: shotAngle,
          scale: s.type === 'grenadier' ? 1.25 : s.type === 'officer' ? 0.78 : 1.0,
          isCannon: false,
        });
        sim.soundEvents.push({
          kind: 'musket',
          soldierType: s.type,
          x: muzzle.x,
          y: muzzle.y,
        });
      }
      continue;
    }

    // State is 'idle' or 'walking'
    if (target.dist <= effectiveRange && s.reloadProgress >= 1 && target.hasLos) {
      // Stop and aim
      const wasWalking = s.state === 'walking';
      s.state = 'aiming';
      s.stateTimer = spec.aimTime;
      s.facing = angleToTarget;
      s.vx = 0;
      s.vy = 0;
      if (s.type === 'officer' || (wasWalking && rng() < 0.14)) {
        sim.soundEvents.push({
          kind: 'voice_command',
          role: s.type === 'officer' ? 'officer' : 'fire',
          faction: s.faction,
          x: s.x,
          y: s.y,
        });
      }
    } else {
      // Advance toward target (respecting bridge & wall-flanking waypoints)
      s.state = 'walking';
      const wp = resolveMoveWaypoint(
        s.x,
        s.y,
        target.x,
        target.y,
        map,
        sim.structures
      );
      const moveAngle = Math.atan2(wp.wy - s.y, wp.wx - s.x);
      s.facing = moveAngle;

      // Soft separation from nearby living soldiers so ranks spread naturally
      let sepX = 0;
      let sepY = 0;
      for (let j = 0; j < sim.soldiers.length; j++) {
        if (i === j) continue;
        const other = sim.soldiers[j];
        if (other.state === 'dying' || other.state === 'dead') continue;
        const dx = s.x - other.x;
        const dy = s.y - other.y;
        const d2 = dx * dx + dy * dy;
        const minSep = spec.radius + 11;
        if (d2 > 0.01 && d2 < minSep * minSep) {
          const d = Math.sqrt(d2);
          const push = (minSep - d) / minSep;
          sepX += (dx / d) * push * 48;
          sepY += (dy / d) * push * 48;
        }
      }

      const woundMoveMult =
        s.woundSeverity === 2 ? 0.48 : s.woundSeverity === 1 ? 0.74 : 1.0;
      const speed = spec.moveSpeed * wCfg.moveMultiplier * woundMoveMult;
      const vx = Math.cos(moveAngle) * speed + sepX;
      const vy = Math.sin(moveAngle) * speed + sepY;

      const nextX = clamp(s.x + vx * dt, 24, sim.width - 24);
      const nextY = clamp(s.y + vy * dt, 28, sim.height - 28);

      let movedDist = 0;
      // Axis-separated obstacle sliding
      if (
        !isPointBlockedByTerrain(nextX, s.y, map, spec.radius * 0.7) &&
        !isBlockedByStructure(sim, nextX, s.y, spec.radius * 0.7)
      ) {
        movedDist += Math.abs(nextX - s.x);
        s.x = nextX;
      }
      if (
        !isPointBlockedByTerrain(s.x, nextY, map, spec.radius * 0.7) &&
        !isBlockedByStructure(sim, s.x, nextY, spec.radius * 0.7)
      ) {
        movedDist += Math.abs(nextY - s.y);
        s.y = nextY;
      }

      // Sync walk animation strictly to actual distance traveled
      s.walkPhase += movedDist * 0.22;
      s.vx = vx;
      s.vy = vy;
    }
  }

  // Update projectiles
  for (let i = sim.projectiles.length - 1; i >= 0; i--) {
    const p = sim.projectiles[i];
    p.prevX = p.x;
    p.prevY = p.y;

    const stepX = p.vx * dt;
    const stepY = p.vy * dt;
    p.x += stepX;
    p.y += stepY;
    const stepLen = Math.sqrt(stepX * stepX + stepY * stepY);
    p.rangeLeft -= stepLen;

    const projAngle = Math.atan2(p.vy, p.vx);
    let hit = false;

    // Out of bounds
    if (p.x < 0 || p.x > sim.width || p.y < 0 || p.y > sim.height) {
      sim.projectiles.splice(i, 1);
      continue;
    }

    // Terrain stone_ruin obstacle blocks bullets (swept segment prevents tunneling)
    for (let fIdx = 0; fIdx < map.features.length; fIdx++) {
      const f = map.features[fIdx];
      if (
        f.blocksBullets &&
        segmentIntersectsRect(p.prevX, p.prevY, p.x, p.y, f, 0)
      ) {
        sim.visualEvents.push({
          kind: 'impact',
          x: p.x,
          y: p.y,
          angle: projAngle,
          material: 'stone',
        });
        sim.soundEvents.push({
          kind: 'structure_hit',
          x: p.x,
          y: p.y,
          material: 'stone',
        });
        hit = true;
        break;
      }
    }
    if (hit) {
      sim.projectiles.splice(i, 1);
      continue;
    }

    // Structure collision (stone_wall blocks ALL bullets; other cover absorbs enemy bullets)
    for (let sIdx = 0; sIdx < sim.structures.length; sIdx++) {
      const st = sim.structures[sIdx];
      if (st.state === 'destroyed') continue;
      const isSolidWall = st.type === 'stone_wall';
      if (st.faction === p.faction && st.type !== 'powder_keg' && !isSolidWall) {
        continue;
      }
      const box = getSidewaysWallBox(st);
      const hitsStructure = box
        ? segmentIntersectsRect(p.prevX, p.prevY, p.x, p.y, box, 2)
        : distPointToSegmentSq(st.x, st.y, p.prevX, p.prevY, p.x, p.y) <=
          st.radius * st.radius;
      if (hitsStructure) {
        const spec = STRUCTURE_SPECS[st.type];
        if (st.faction !== p.faction || st.type === 'powder_keg') {
          st.hp -= p.damage;
          st.hitFlash = 1;
        }
        sim.visualEvents.push({
          kind: 'impact',
          x: p.x,
          y: p.y,
          angle: projAngle,
          material: spec.material,
        });
        sim.soundEvents.push({
          kind: 'structure_hit',
          x: p.x,
          y: p.y,
          material: spec.material,
        });

        if (st.hp <= 0) {
          st.hp = 0;
          st.state = 'destroyed';
          if (st.type === 'powder_keg') {
            triggerPowderKegExplosion(sim, st);
          }
        }
        hit = true;
        break;
      }
    }
    if (hit) {
      sim.projectiles.splice(i, 1);
      continue;
    }

    // Soldier collision (swept segment prevents bullet tunneling)
    for (let uIdx = 0; uIdx < sim.soldiers.length; uIdx++) {
      const s = sim.soldiers[uIdx];
      if (s.faction === p.faction || s.state === 'dying' || s.state === 'dead') {
        continue;
      }
      const spec = SOLDIER_SPECS[s.type];
      const hitR = spec.radius + (p.isCannonball ? 5 : 2);
      if (
        distPointToSegmentSq(s.x, s.y, p.prevX, p.prevY, p.x, p.y) <=
        hitR * hitR
      ) {
        if (p.isCannonball && p.splashRadius > 0) {
          // Anchor impact point just in front of struck soldier so high-speed frame steps never overshoot behind victim
          const impactX = s.x - Math.cos(projAngle) * 4;
          const impactY = s.y - Math.sin(projAngle) * 4;
          for (let k = 0; k < sim.soldiers.length; k++) {
            const other = sim.soldiers[k];
            if (
              other.faction === p.faction ||
              other.state === 'dying' ||
              other.state === 'dead'
            ) {
              continue;
            }
            const d2 = distSq(impactX, impactY, other.x, other.y);
            if (d2 <= p.splashRadius * p.splashRadius) {
              const d = Math.sqrt(d2);
              const falloff = 1 - d / p.splashRadius;
              const dmg = p.damage * (1 - (d / p.splashRadius) * 0.65);
              const splashAngle = d > 1 ? Math.atan2(other.y - impactY, other.x - impactX) : projAngle;
              applySoldierDamage(sim, other, dmg, p.faction, splashAngle);
              // Strongly bias fling along incoming cannonball momentum + outward radial scatter
              const dirX = Math.cos(projAngle) * 0.72 + Math.cos(splashAngle) * 0.28;
              const dirY = Math.sin(projAngle) * 0.72 + Math.sin(splashAngle) * 0.28;
              const norm = Math.hypot(dirX, dirY) || 1;
              const impulse = 135 + 145 * falloff;
              applyBlastFling(
                other,
                (dirX / norm) * impulse,
                (dirY / norm) * impulse,
                12 + 12 * falloff
              );
            }
          }
          sim.visualEvents.push({
            kind: 'impact',
            x: impactX,
            y: impactY,
            angle: projAngle,
            material: 'flesh',
          });
          sim.visualEvents.push({
            kind: 'cannon_impact',
            x: impactX,
            y: impactY,
          });
        } else {
          applySoldierDamage(sim, s, p.damage, p.faction, projAngle);
          sim.visualEvents.push({
            kind: 'impact',
            x: p.x,
            y: p.y,
            angle: projAngle,
            material: 'flesh',
          });
        }
        hit = true;
        break;
      }
    }

    if (hit) {
      sim.projectiles.splice(i, 1);
      continue;
    }

    if (p.rangeLeft <= 0) {
      if (p.isCannonball) {
        sim.visualEvents.push({
          kind: 'cannon_impact',
          x: p.x,
          y: p.y,
        });
      } else {
        sim.visualEvents.push({
          kind: 'impact',
          x: p.x,
          y: p.y,
          angle: projAngle,
          material: 'ground',
        });
      }
      sim.projectiles.splice(i, 1);
    }
  }

  return { thunderTriggered };
}

export function getLivingCounts(sim: SimulationState): {
  blue: number;
  red: number;
  structures: number;
} {
  let blue = 0;
  let red = 0;
  for (let i = 0; i < sim.soldiers.length; i++) {
    const s = sim.soldiers[i];
    if (s.state === 'dying' || s.state === 'dead') continue;
    if (s.faction === 'blue') blue++;
    else red++;
  }
  let structures = 0;
  for (let i = 0; i < sim.structures.length; i++) {
    if (sim.structures[i].state !== 'destroyed') structures++;
  }
  return { blue, red, structures };
}
