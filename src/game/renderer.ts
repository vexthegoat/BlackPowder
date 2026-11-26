import { SOLDIER_SPECS, STRUCTURE_SPECS, WEATHER_CONFIGS } from './constants';
import { BattlefieldScene3D, ProjectedPoint, SoldierVisibility } from './map3d';
import { ParticlePool } from './particles';
import {
  Faction,
  FormationMode,
  PlacementCategory,
  SimulationState,
  Soldier,
  SoldierType,
  StructureType,
} from './types';

export interface HoverPreview {
  active: boolean;
  worldX: number;
  worldY: number;
  category: PlacementCategory;
  soldierType: SoldierType;
  structureType: StructureType;
  faction: Faction;
  formation: FormationMode;
}

interface ProjectedSoldierEntry {
  soldier: Soldier;
  sx: number;
  sy: number;
  ndcZ: number;
  scale: number;
  screenFacing: number;
  visibility: SoldierVisibility;
}

const _ptA: ProjectedPoint = { sx: 0, sy: 0, ndcZ: 0, scale: 1, visible: false };
const _ptB: ProjectedPoint = { sx: 0, sy: 0, ndcZ: 0, scale: 1, visible: false };
const _ptAim: ProjectedPoint = { sx: 0, sy: 0, ndcZ: 0, scale: 1, visible: false };
const _ptRing: ProjectedPoint = { sx: 0, sy: 0, ndcZ: 0, scale: 1, visible: false };

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function getSoldierPalette(type: SoldierType, faction: Faction) {
  const isBlue = faction === 'blue';
  if (type === 'skirmisher') {
    return {
      coat: isBlue ? '#284a3c' : '#5e2329',
      trim: isBlue ? '#3b73c4' : '#c93a3a',
      trousers: '#33363b',
      hat: '#1e2024',
      plume: isBlue ? '#4b8fe2' : '#d84545',
    };
  }
  if (type === 'grenadier') {
    return {
      coat: isBlue ? '#1c3768' : '#8d1e1e',
      trim: '#e2bd5d',
      trousers: '#e5e0d5',
      hat: '#171516',
      plume: isBlue ? '#4882dc' : '#dc4242',
    };
  }
  if (type === 'officer') {
    return {
      coat: isBlue ? '#1a386b' : '#9c2020',
      trim: '#ecc562',
      trousers: '#ebe7de',
      hat: '#1b1d22',
      plume: '#f5e4b3',
    };
  }
  // Line infantry
  return {
    coat: isBlue ? '#234782' : '#9e2626',
    trim: '#ece8df',
    trousers: '#e6e1d7',
    hat: '#1d1e22',
    plume: isBlue ? '#679df0' : '#ef6b6b',
  };
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return `rgb(${r},${g},${bl})`;
}

function drawTerrainProjectedCircle(
  ctx: CanvasRenderingContext2D,
  scene3d: BattlefieldScene3D,
  simX: number,
  simY: number,
  radius: number,
  height3D: number,
  segments: number
): void {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    scene3d.projectSimToScreen(
      simX + Math.cos(a) * radius,
      simY + Math.sin(a) * radius,
      height3D,
      _ptRing
    );
    if (!started) {
      ctx.moveTo(_ptRing.sx, _ptRing.sy);
      started = true;
    } else {
      ctx.lineTo(_ptRing.sx, _ptRing.sy);
    }
  }
  ctx.closePath();
}

function drawSoldier2D(
  ctx: CanvasRenderingContext2D,
  s: Soldier,
  time: number,
  sx: number,
  sy: number,
  projScale: number,
  screenFacing: number,
  scene3d: BattlefieldScene3D,
  visibility: SoldierVisibility,
  canvasWidth: number
): void {
  const pal = getSoldierPalette(s.type, s.faction);
  const unitScale =
    s.type === 'grenadier' ? 1.12 : s.type === 'skirmisher' ? 0.96 : 1.0;
  const totalScale = unitScale * projScale;
  const facingRight = Math.cos(screenFacing) >= 0;
  const dir = facingRight ? 1 : -1;

  // Officer aura ring projected onto the 3D terrain relief
  if (s.type === 'officer' && s.state !== 'dying' && s.state !== 'dead') {
    ctx.save();
    ctx.strokeStyle =
      s.faction === 'blue'
        ? 'rgba(92, 150, 235, 0.2)'
        : 'rgba(225, 86, 86, 0.2)';
    ctx.lineWidth = Math.max(1, 1.5 * projScale);
    ctx.setLineDash([6 * projScale, 6 * projScale]);
    drawTerrainProjectedCircle(ctx, scene3d, s.x, s.y, 165, 0.08, 24);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  if (visibility === 'head_only') {
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, sy - 19 * totalScale);
    ctx.clip();
  } else if (visibility === 'waist_up') {
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, sy - 4 * totalScale);
    ctx.clip();
  }

  ctx.save();
  ctx.translate(sx, sy);

  // Ground shadow & permanent rotting corpse state
  const isDeadOrDying = s.state === 'dying' || s.state === 'dead';
  const rot = s.state === 'dead' ? Math.min(1, s.corpseAge / 24) : 0;

  // Decay stain directly beneath corpse
  if (isDeadOrDying) {
    const stainAlpha =
      s.state === 'dead'
        ? Math.min(0.55, 0.25 + rot * 0.3)
        : s.deathProgress * 0.25;
    ctx.fillStyle =
      rot > 0.45
        ? `rgba(54, 42, 30, ${stainAlpha})`
        : `rgba(105, 22, 22, ${stainAlpha})`;
    ctx.beginPath();
    ctx.ellipse(
      s.deathDir * 3 * projScale,
      4 * projScale,
      (11 + rot * 4) * totalScale,
      (5 + rot * 2) * totalScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Anchor ground shadow on terrain while lifting airborne flung bodies upward
  const flingLiftPx = s.flingHeight * 3.8 * projScale;
  const shadowScale = Math.max(0.55, 1 - s.flingHeight * 0.08);
  ctx.fillStyle = 'rgba(10, 14, 8, 0.36)';
  ctx.beginPath();
  ctx.ellipse(
    0,
    (isDeadOrDying ? 3 : 6) * projScale,
    (isDeadOrDying ? 15 : 9) * totalScale * shadowScale,
    (isDeadOrDying ? 5.5 : 4.2) * totalScale * shadowScale,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Severed gore fragment beside catastrophically blasted corpses (goreLevel === 2)
  if (isDeadOrDying && s.goreLevel === 2 && s.flingHeight <= 0.1) {
    const dp = s.state === 'dead' ? 1 : s.deathProgress;
    ctx.save();
    ctx.globalAlpha = dp;
    ctx.strokeStyle = 'rgba(110, 10, 14, 0.78)';
    ctx.lineWidth = 2.2 * totalScale;
    ctx.beginPath();
    ctx.moveTo(s.deathDir * 4 * totalScale, 1 * totalScale);
    ctx.lineTo(s.deathDir * 14 * totalScale, 4 * totalScale);
    ctx.stroke();

    ctx.fillStyle = lerpColor(pal.trousers, '#4b3b2d', rot);
    ctx.fillRect(s.deathDir * 12 * totalScale, 2.5 * totalScale, 4.5 * totalScale, 2.5 * totalScale);
    ctx.fillStyle = '#18181a';
    ctx.fillRect(s.deathDir * 15.5 * totalScale, 2.3 * totalScale, 2.5 * totalScale, 3 * totalScale);
    ctx.fillStyle = 'rgba(135, 12, 16, 0.9)';
    ctx.beginPath();
    ctx.arc(s.deathDir * 11.8 * totalScale, 3.8 * totalScale, 1.8 * totalScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Lift body along airborne arc and anchor feet
  ctx.translate(0, -6 * totalScale - flingLiftPx);

  // Death topple & blast tumble rotation
  if (isDeadOrDying) {
    const dp = s.state === 'dead' ? 1 : s.deathProgress;
    const eased = 1 - Math.pow(1 - dp, 2.2);
    ctx.translate(0, eased * 5 * totalScale);
    const tumble = s.flingHeight > 0.1 ? s.flingHeight * 0.42 : 0;
    ctx.rotate(s.deathDir * (eased * (Math.PI * 0.48) + tumble));
  } else if (s.flingHeight > 0.1) {
    ctx.rotate(s.deathDir * Math.sin(s.flingHeight * 0.9) * 0.55);
  }

  ctx.scale(dir * totalScale, totalScale);

  // Walking kinematics (with visible limp & hunched droop when wounded)
  const isWalking = s.state === 'walking';
  const isAiming = s.state === 'aiming';
  const isFiring = s.state === 'firing';
  const isReloading = s.state === 'reloading';
  const woundHunch = !isDeadOrDying && s.woundSeverity === 2 ? 1.8 : 0;
  const crouchOffset =
    (s.type === 'skirmisher' && (isAiming || isFiring) ? 4.5 : 0) + woundHunch;
  const walkSin = isWalking ? Math.sin(s.walkPhase) : 0;
  const limpBias =
    !isDeadOrDying && isWalking && s.woundSeverity > 0
      ? Math.max(0, -walkSin) * (s.woundSeverity === 2 ? 2.4 : 1.2)
      : 0;
  const bobY = (isWalking ? -Math.abs(walkSin) * 2.4 : 0) + limpBias;

  // Officer regimental banner (drawn behind torso)
  if (s.type === 'officer' && !isDeadOrDying) {
    ctx.save();
    ctx.translate(-4, -8 + bobY);
    ctx.strokeStyle = '#5a3d1f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(-2, -30);
    ctx.stroke();

    ctx.fillStyle = '#e7c15a';
    ctx.beginPath();
    ctx.arc(-2, -31, 2.2, 0, Math.PI * 2);
    ctx.fill();

    const wave1 = Math.sin(s.bannerWave) * 2.5;
    const wave2 = Math.cos(s.bannerWave * 1.3) * 3.0;
    ctx.fillStyle = s.faction === 'blue' ? '#244b8f' : '#a82828';
    ctx.strokeStyle = '#e7c15a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -29);
    ctx.quadraticCurveTo(-11, -30 + wave1, -20, -27 + wave2);
    ctx.lineTo(-19, -15 + wave2 * 0.8);
    ctx.quadraticCurveTo(-10, -17 + wave1, -2, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Legs
  ctx.lineCap = 'round';
  const legSpread = isWalking
    ? walkSin * 5.5
    : isAiming || isFiring
      ? 4.2
      : 2.2;

  const decayedCoat =
    rot <= 0.55
      ? lerpColor(pal.coat, '#52593e', rot / 0.55)
      : lerpColor('#52593e', '#3d392d', (rot - 0.55) / 0.45);
  const decayedTrousers = lerpColor(pal.trousers, '#524b3c', rot);
  const decayedTrim = lerpColor(pal.trim, '#6d6652', rot);
  const decayedSkin =
    rot <= 0.55
      ? lerpColor('#e6bf9c', '#889474', rot / 0.55)
      : lerpColor('#889474', '#cfc8b0', (rot - 0.55) / 0.45);

  // Back leg
  ctx.strokeStyle = isDeadOrDying ? decayedTrousers : pal.trousers;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-1, -1 + bobY + crouchOffset);
  ctx.lineTo(-legSpread - 1, 8);
  ctx.stroke();
  ctx.strokeStyle = '#18181a';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(-legSpread - 1, 6);
  ctx.lineTo(-legSpread + 1, 9);
  ctx.stroke();

  // Front leg
  ctx.strokeStyle = isDeadOrDying ? decayedTrousers : pal.trousers;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(1, -1 + bobY + crouchOffset);
  ctx.lineTo(legSpread + 1, 8);
  ctx.stroke();
  if (!isDeadOrDying && s.woundSeverity > 0) {
    ctx.strokeStyle =
      s.woundSeverity === 2 ? 'rgba(135, 16, 20, 0.85)' : 'rgba(135, 16, 20, 0.55)';
    ctx.lineWidth = s.woundSeverity === 2 ? 2.1 : 1.4;
    ctx.beginPath();
    ctx.moveTo(1.2, 0.8 + bobY + crouchOffset);
    ctx.lineTo(legSpread * 0.6 + 1, 5.2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#18181a';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(legSpread + 1, 6);
  ctx.lineTo(legSpread + 3, 9);
  ctx.stroke();

  // Torso / Coat
  const woundLean =
    !isDeadOrDying && s.woundSeverity > 0
      ? s.woundSeverity === 2
        ? 0.16 + walkSin * 0.11
        : 0.08 + walkSin * 0.05
      : 0;
  const recoilLean =
    (isFiring
      ? -s.recoil * 0.18
      : isAiming
        ? 0.12
        : isWalking
          ? 0.08
          : 0) + woundLean;
  ctx.save();
  ctx.translate(0, -1 + bobY + crouchOffset);
  ctx.rotate(recoilLean);

  ctx.fillStyle =
    s.hitFlash > 0.15 ? '#ffffff' : isDeadOrDying ? decayedCoat : pal.coat;
  ctx.strokeStyle = '#15161a';
  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, -5.5, -13, 11, 14, 3);
  ctx.fill();
  ctx.stroke();

  // Crossbelt / sash
  ctx.strokeStyle =
    s.hitFlash > 0.15 ? '#ffffff' : isDeadOrDying ? decayedTrim : pal.trim;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-4, -12);
  ctx.lineTo(4, -1);
  if (s.type !== 'skirmisher') {
    ctx.moveTo(4, -12);
    ctx.lineTo(-4, -1);
  }
  ctx.stroke();

  // Visible soaked crimson wound stains & lethal gore gashes on uniform
  if (!isDeadOrDying && s.woundSeverity > 0 && s.hitFlash <= 0.15) {
    ctx.fillStyle = 'rgba(138, 16, 22, 0.86)';
    ctx.beginPath();
    ctx.ellipse(-2.1, -7.8, 2.3, 1.9, 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (s.woundSeverity === 2) {
      ctx.fillStyle = 'rgba(98, 10, 14, 0.9)';
      ctx.beginPath();
      ctx.ellipse(2.0, -3.6, 2.6, 2.2, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-2.8, -6.2, 1.4, 4.8);
    }
  } else if (isDeadOrDying && s.goreLevel >= 1 && s.hitFlash <= 0.15) {
    ctx.fillStyle = 'rgba(116, 10, 14, 0.92)';
    ctx.beginPath();
    ctx.ellipse(0.4, -7.2, s.goreLevel === 2 ? 4.2 : 2.9, s.goreLevel === 2 ? 3.5 : 2.3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    if (s.goreLevel === 2) {
      ctx.fillStyle = 'rgba(72, 6, 8, 0.95)';
      ctx.beginPath();
      ctx.ellipse(-1.2, -4.4, 3.0, 2.4, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Exposed bone glint in catastrophic blast wound
      ctx.strokeStyle = 'rgba(225, 214, 195, 0.78)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(-2.0, -8.0);
      ctx.lineTo(1.8, -6.5);
      ctx.stroke();
    }
  }

  // Exposed ribcage at late rot
  if (rot > 0.6) {
    ctx.strokeStyle = `rgba(212, 204, 180, ${(rot - 0.6) * 2.1})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-2.5, -9);
    ctx.lineTo(2.5, -9);
    ctx.moveTo(-2.8, -6.5);
    ctx.lineTo(2.8, -6.5);
    ctx.moveTo(-2.2, -4);
    ctx.lineTo(2.2, -4);
    ctx.stroke();
  }

  // Epaulettes
  if (s.type === 'grenadier' || s.type === 'officer') {
    ctx.fillStyle = isDeadOrDying
      ? lerpColor('#e4bd5c', '#6e6346', rot)
      : '#e4bd5c';
    ctx.fillRect(-6.5, -13, 3.5, 3);
    ctx.fillRect(3, -13, 3.5, 3);
  }

  // Head
  ctx.fillStyle =
    s.hitFlash > 0.15 ? '#ffffff' : isDeadOrDying ? decayedSkin : '#e6bf9c';
  ctx.strokeStyle = '#2d231b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0.5, -17, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (rot > 0.65) {
    ctx.fillStyle = `rgba(28, 24, 20, ${(rot - 0.65) * 2.4})`;
    ctx.beginPath();
    ctx.arc(-0.8, -17.3, 0.9, 0, Math.PI * 2);
    ctx.arc(1.8, -17.3, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hat
  ctx.save();
  if (isDeadOrDying) {
    ctx.translate(s.hatOffsetX * dir, -s.hatOffsetY * 0.35);
    ctx.rotate(s.hatAngle);
  }
  if (s.type === 'grenadier') {
    ctx.fillStyle = pal.hat;
    drawRoundedRect(ctx, -4.5, -31, 9.5, 13, 4.5);
    ctx.fill();
    ctx.fillStyle = '#e2bd5d';
    ctx.fillRect(-1.5, -24, 4, 3);
    ctx.fillStyle = pal.plume;
    ctx.beginPath();
    ctx.arc(-3, -29, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.type === 'officer') {
    ctx.fillStyle = pal.hat;
    ctx.beginPath();
    ctx.moveTo(-7.5, -19);
    ctx.quadraticCurveTo(0, -28, 7.5, -19);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e7c15a';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (s.type === 'skirmisher') {
    ctx.fillStyle = pal.hat;
    drawRoundedRect(ctx, -4.5, -24, 9, 5.5, 2);
    ctx.fill();
    ctx.fillRect(-1, -20, 7, 1.8);
    ctx.fillStyle = pal.plume;
    ctx.beginPath();
    ctx.ellipse(0, -26, 2, 3.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = pal.hat;
    drawRoundedRect(ctx, -4.5, -27, 9, 8.5, 1.5);
    ctx.fill();
    ctx.fillRect(0, -20, 6.5, 1.8);
    ctx.fillStyle = '#e3be60';
    ctx.fillRect(1, -24, 2.6, 2.6);
    ctx.fillStyle = pal.plume;
    ctx.beginPath();
    ctx.arc(0, -28.5, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Weapon & Arms Animation
  if (isDeadOrDying) {
    ctx.save();
    ctx.translate(4, 5);
    ctx.rotate(0.35);
    ctx.fillStyle = lerpColor('#6c4727', '#4a3525', rot);
    ctx.fillRect(-6, -1.2, 18, 2.4);
    ctx.fillStyle = lerpColor('#9aa2aa', '#6a5343', rot);
    ctx.fillRect(10, -0.8, 9, 1.6);
    ctx.restore();
  } else if (isReloading) {
    const p = s.reloadProgress;
    ctx.save();
    ctx.translate(5.5, -5);
    ctx.rotate(-Math.PI * 0.44);

    ctx.fillStyle = '#6a4424';
    ctx.fillRect(-4, -1.5, 17, 3);
    ctx.fillStyle = '#a7b0b8';
    ctx.fillRect(10, -1, 12, 2);

    if (p >= 0.28 && p <= 0.78) {
      const pump = Math.abs(Math.sin(((p - 0.28) / 0.5) * Math.PI * 2));
      const ramOffset = 10 + pump * 12;
      ctx.strokeStyle = '#dce3ea';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ramOffset, 0);
      ctx.lineTo(ramOffset + 12, 0);
      ctx.stroke();

      ctx.fillStyle = '#e6bf9c';
      ctx.beginPath();
      ctx.arc(ramOffset + 7, 1.5, 2.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const handY = p < 0.28 ? 5 : 1;
      ctx.fillStyle = '#e6bf9c';
      ctx.beginPath();
      ctx.arc(6, handY, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(245, 215, 130, 0.75)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 10 - bobY, 7, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
  } else {
    let localAimAngle = 0;
    if (isAiming || isFiring) {
      let pitch = facingRight ? screenFacing : Math.PI - screenFacing;
      while (pitch > Math.PI) pitch -= Math.PI * 2;
      while (pitch < -Math.PI) pitch += Math.PI * 2;
      pitch = Math.max(-0.65, Math.min(0.65, pitch));
      localAimAngle = pitch - (isFiring ? s.recoil * 0.28 : 0);
    } else if (isWalking) {
      localAimAngle = -0.58 + Math.sin(s.walkPhase) * 0.09;
    } else {
      localAimAngle = -0.45 + Math.sin(time * 1.8 + s.id) * 0.025;
    }

    ctx.save();
    ctx.translate(2, -8);
    ctx.rotate(localAimAngle);

    if (s.type === 'officer') {
      ctx.fillStyle = '#6c4727';
      ctx.fillRect(-1, -1, 7, 2.5);
      ctx.fillStyle = '#b4bcc4';
      ctx.fillRect(5, -1.2, 8, 2.1);
    } else {
      const barrelLen =
        s.type === 'skirmisher' ? 15 : s.type === 'grenadier' ? 11 : 12;
      const stockLen = s.type === 'skirmisher' ? 14 : 13;

      ctx.fillStyle = s.type === 'skirmisher' ? '#4a301a' : '#714927';
      ctx.fillRect(-4, -1.3, stockLen, 2.8);
      ctx.fillStyle = s.type === 'skirmisher' ? '#4d545c' : '#a8b2bc';
      ctx.fillRect(stockLen - 6, -1.1, barrelLen, 2.1);

      if (s.type === 'line' || s.type === 'grenadier') {
        ctx.fillStyle = '#dce4ec';
        ctx.beginPath();
        ctx.moveTo(stockLen + barrelLen - 7, -1.2);
        ctx.lineTo(stockLen + barrelLen + 1, -0.5);
        ctx.lineTo(stockLen + barrelLen - 7, 0.4);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.fillStyle = '#e6bf9c';
    ctx.beginPath();
    ctx.arc(4, 0.5, 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore(); // end torso
  ctx.restore(); // end soldier transform
  ctx.restore(); // end 3D wall occlusion clip

  // Buzzing flies over decaying corpses (unclipped above ground)
  if (s.state === 'dead' && rot > 0.18 && rot < 0.92) {
    ctx.save();
    ctx.fillStyle = 'rgba(26, 26, 22, 0.78)';
    for (let f = 0; f < 3; f++) {
      const fx =
        sx + Math.sin(time * (6.5 + f * 1.4) + s.id + f * 2.1) * 11 * projScale;
      const fy =
        sy -
        5 * projScale +
        Math.cos(time * (7.8 + f * 1.2) + s.id * 2 + f) * 5 * projScale;
      ctx.fillRect(fx, fy, 1.8 * projScale, 1.8 * projScale);
    }
    ctx.restore();
  }

  // Subtle health bar & wound status pips only when injured & alive
  if (!isDeadOrDying && s.hp < s.maxHp) {
    const ratio = Math.max(0, s.hp / s.maxHp);
    const barY = sy - 39 * totalScale;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 12, 10, 0.72)';
    ctx.fillRect(sx - 10 * projScale, barY, 20 * projScale, 3 * projScale);
    ctx.fillStyle = s.faction === 'blue' ? '#5ea2f5' : '#eb5a53';
    ctx.fillRect(
      sx - 9.5 * projScale,
      barY + 0.5 * projScale,
      19 * ratio * projScale,
      2 * projScale
    );

    if (s.woundSeverity > 0) {
      const pulse =
        s.woundSeverity === 2 ? 0.65 + Math.sin(time * 8 + s.id) * 0.35 : 0.9;
      ctx.fillStyle = `rgba(218, 36, 42, ${pulse})`;
      ctx.beginPath();
      ctx.arc(
        sx + 12.6 * projScale,
        barY + 1.5 * projScale,
        1.7 * projScale,
        0,
        Math.PI * 2
      );
      ctx.fill();
      if (s.woundSeverity === 2) {
        ctx.beginPath();
        ctx.arc(
          sx + 16.5 * projScale,
          barY + 1.5 * projScale,
          1.7 * projScale,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawProjectedParticles(
  ctx: CanvasRenderingContext2D,
  pool: ParticlePool,
  scene3d: BattlefieldScene3D,
  sim: SimulationState
): void {
  for (let i = 0; i < pool.pool.length; i++) {
    const p = pool.pool[i];
    if (!p.active) continue;

    let h3d = 0.75;
    if (p.kind === 'dust' || p.kind === 'splash' || p.kind === 'shockwave') {
      h3d = 0.16;
    } else if (p.kind === 'smoke') {
      h3d = 1.05 + (p.age / p.maxAge) * 1.4;
    } else if (p.kind === 'flash' || p.kind === 'glow') {
      h3d = 1.15;
    }

    if (p.kind !== 'smoke' && scene3d.isPointOccluded3D(p.x, p.y, h3d, sim.structures)) {
      continue;
    }

    scene3d.projectSimToScreen(p.x, p.y, h3d, _ptA);
    if (!_ptA.visible) continue;

    const projScale = Math.max(0.32, Math.min(2.6, _ptA.scale));
    const t = p.age / p.maxAge;
    const size = (p.size + (p.endSize - p.size) * t) * projScale;
    const alpha = p.alpha * (1 - t);

    if (p.kind === 'glow') {
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.beginPath();
      ctx.arc(_ptA.sx, _ptA.sy, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.45;
      ctx.beginPath();
      ctx.arc(_ptA.sx, _ptA.sy, size * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === 'splash') {
      ctx.save();
      ctx.globalAlpha = alpha * 0.72;
      ctx.strokeStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.lineWidth = Math.max(0.8, projScale);
      ctx.beginPath();
      ctx.ellipse(_ptA.sx, _ptA.sy, size, size * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'smoke' || p.kind === 'dust') {
      ctx.save();
      ctx.globalAlpha = alpha * (p.kind === 'smoke' ? 0.65 : 0.7);
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.beginPath();
      ctx.arc(_ptA.sx, _ptA.sy, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === 'flash') {
      scene3d.projectSimToScreen(
        p.x + Math.cos(p.rotation) * 12,
        p.y + Math.sin(p.rotation) * 12,
        h3d,
        _ptAim
      );
      const dx = _ptAim.sx - _ptA.sx;
      const dy = _ptAim.sy - _ptA.sy;
      const screenRot =
        dx * dx + dy * dy > 0.001 ? Math.atan2(dy, dx) : p.rotation;

      ctx.save();
      ctx.translate(_ptA.sx, _ptA.sy);
      ctx.rotate(screenRot);
      ctx.globalAlpha = Math.min(1, alpha * 1.15);

      ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, 0.72)`;
      ctx.beginPath();
      ctx.ellipse(size * 0.35, 0, size, size * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 252, 228, 0.95)';
      ctx.beginPath();
      ctx.ellipse(size * 0.2, 0, size * 0.52, size * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === 'shockwave') {
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.lineWidth = (3 * (1 - t) + 1) * projScale;
      ctx.beginPath();
      ctx.arc(_ptA.sx, _ptA.sy, size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.translate(_ptA.sx, _ptA.sy);
      ctx.rotate(p.rotation);
      ctx.fillRect(-size * 0.5, -size * 0.5, size, size);
      ctx.restore();
    }
  }
}

function drawWeatherScreenOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sim: SimulationState,
  pool: ParticlePool
): void {
  const wCfg = WEATHER_CONFIGS[sim.weather];
  const scaleX = width / Math.max(1, sim.width);
  const scaleY = height / Math.max(1, sim.height);

  // Soft drifting fog wisps over viewport (radial gradients blend seamlessly over 3D fog)
  if (wCfg.fogDensity > 0) {
    ctx.save();
    for (let i = 0; i < pool.fogClouds.length; i++) {
      const fc = pool.fogClouds[i];
      const cxFog = fc.x * scaleX;
      const cyFog = fc.y * scaleY;
      const rFog = Math.max(fc.radiusX * scaleX, fc.radiusY * scaleY);
      const grad = ctx.createRadialGradient(cxFog, cyFog, rFog * 0.08, cxFog, cyFog, rFog);
      const peakAlpha = fc.alpha * wCfg.fogDensity * 0.95;
      grad.addColorStop(0, `rgba(218, 226, 224, ${peakAlpha})`);
      grad.addColorStop(1, 'rgba(218, 226, 224, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cxFog, cyFog, rFog, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Rain streaks
  if (sim.weather === 'rain' || sim.weather === 'storm') {
    const count = sim.weather === 'storm' ? 340 : 210;
    const dx = sim.weather === 'storm' ? 7 : 3.2;
    ctx.save();
    ctx.strokeStyle =
      sim.weather === 'storm'
        ? 'rgba(195, 218, 240, 0.42)'
        : 'rgba(190, 212, 235, 0.34)';
    ctx.lineWidth = sim.weather === 'storm' ? 1.5 : 1.1;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const wp = pool.weatherParticles[i];
      const wx = wp.x * scaleX;
      const wy = wp.y * scaleY;
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + dx, wy + wp.length);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Snowflakes
  if (sim.weather === 'snow') {
    ctx.save();
    ctx.fillStyle = 'rgba(244, 249, 255, 0.8)';
    for (let i = 0; i < 240; i++) {
      const wp = pool.weatherParticles[i];
      ctx.globalAlpha = wp.alpha;
      ctx.beginPath();
      ctx.arc(wp.x * scaleX, wp.y * scaleY, wp.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Lightning flash overlay
  if (sim.lightningFlash > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(225, 240, 255, ${sim.lightningFlash * 0.42})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Atmospheric edge vignette
  const vigAlpha =
    sim.weather === 'storm' ? 0.38 : sim.weather === 'fog' ? 0.28 : 0.2;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const innerR = Math.min(width, height) * 0.4;
  const outerR = Math.hypot(cx, cy) * 1.05;
  const vig = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  vig.addColorStop(0, 'rgba(10, 10, 8, 0)');
  vig.addColorStop(1, `rgba(10, 10, 8, ${vigAlpha})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
}

function drawProjectedPlacementPreview(
  ctx: CanvasRenderingContext2D,
  scene3d: BattlefieldScene3D,
  preview: HoverPreview
): void {
  if (!preview.active) return;
  ctx.save();

  if (preview.category === 'erase') {
    ctx.strokeStyle = 'rgba(235, 85, 75, 0.92)';
    ctx.fillStyle = 'rgba(235, 85, 75, 0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    drawTerrainProjectedCircle(
      ctx,
      scene3d,
      preview.worldX,
      preview.worldY,
      34,
      0.14,
      20
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  const color =
    preview.faction === 'blue'
      ? 'rgba(92, 152, 245, 0.85)'
      : 'rgba(232, 88, 82, 0.85)';
  const fill =
    preview.faction === 'blue'
      ? 'rgba(92, 152, 245, 0.24)'
      : 'rgba(232, 88, 82, 0.24)';

  if (preview.category === 'infantry') {
    const spec = SOLDIER_SPECS[preview.soldierType];
    const offsets: Array<{ dx: number; dy: number }> = [];
    if (preview.formation === 'single') {
      offsets.push({ dx: 0, dy: 0 });
    } else if (preview.formation === 'line5') {
      for (let r = -2; r <= 2; r++) offsets.push({ dx: 0, dy: r * 30 });
    } else {
      const dir = preview.faction === 'blue' ? -1 : 1;
      for (let c = 0; c < 2; c++) {
        for (let r = -2; r <= 2; r++) {
          offsets.push({ dx: c * dir * 28, dy: r * 30 });
        }
      }
    }

    // Range arc projected onto 3D ground
    ctx.strokeStyle =
      preview.faction === 'blue'
        ? 'rgba(92, 152, 245, 0.22)'
        : 'rgba(232, 88, 82, 0.22)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 6]);
    drawTerrainProjectedCircle(
      ctx,
      scene3d,
      preview.worldX,
      preview.worldY,
      spec.range,
      0.14,
      28
    );
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = fill;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i];
      const wx = preview.worldX + off.dx;
      const wy = preview.worldY + off.dy;
      scene3d.projectSimToScreen(wx, wy, 0.14, _ptA);
      if (!_ptA.visible) continue;
      const r = 11 * Math.max(0.35, Math.min(2.2, _ptA.scale));
      ctx.beginPath();
      ctx.ellipse(_ptA.sx, _ptA.sy, r, r * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (
    preview.structureType === 'sandbag' ||
    preview.structureType === 'barricade' ||
    preview.structureType === 'stone_wall'
  ) {
    const halfW =
      preview.structureType === 'stone_wall'
        ? 26
        : preview.structureType === 'barricade'
          ? 24
          : 22;
    const halfH = preview.structureType === 'stone_wall' ? 13 : 10;
    const corners: Array<[number, number]> = [
      [preview.worldX - halfW, preview.worldY - halfH],
      [preview.worldX + halfW, preview.worldY - halfH],
      [preview.worldX + halfW, preview.worldY + halfH],
      [preview.worldX - halfW, preview.worldY + halfH],
    ];
    ctx.fillStyle = fill;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < corners.length; i++) {
      scene3d.projectSimToScreen(corners[i][0], corners[i][1], 0.16, _ptA);
      if (i === 0) ctx.moveTo(_ptA.sx, _ptA.sy);
      else ctx.lineTo(_ptA.sx, _ptA.sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    const spec = STRUCTURE_SPECS[preview.structureType];
    ctx.fillStyle = fill;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    drawTerrainProjectedCircle(
      ctx,
      scene3d,
      preview.worldX,
      preview.worldY,
      spec.radius,
      0.16,
      20
    );
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function renderInfantryOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sim: SimulationState,
  pool: ParticlePool,
  scene3d: BattlefieldScene3D,
  preview: HoverPreview | null,
  time: number
): void {
  ctx.clearRect(0, 0, width, height);

  // Project and depth-sort dead soldiers first (farther NDC Z first)
  const deadProjected: ProjectedSoldierEntry[] = [];
  const activeProjected: ProjectedSoldierEntry[] = [];

  for (let i = 0; i < sim.soldiers.length; i++) {
    const s = sim.soldiers[i];
    scene3d.projectSimToScreen(s.x, s.y, 0.05, _ptA);
    if (!_ptA.visible) continue;

    const isCorpse = s.state === 'dead' || s.state === 'dying';
    let visibility = scene3d.getSoldierVisibility3D(
      s.x,
      s.y,
      isCorpse,
      sim.structures,
      s.flingHeight * 0.14
    );
    if (
      visibility !== 'hidden' &&
      isCorpse &&
      s.flingHeight <= 0.05 &&
      scene3d.isPointOccluded3D(s.x - 7, s.y, 0.25, sim.structures) &&
      scene3d.isPointOccluded3D(s.x + 7, s.y, 0.25, sim.structures)
    ) {
      visibility = 'hidden';
    }
    if (visibility === 'hidden') continue;

    scene3d.projectSimToScreen(
      s.x + Math.cos(s.facing) * 14,
      s.y + Math.sin(s.facing) * 14,
      0.05,
      _ptAim
    );
    const dx = _ptAim.sx - _ptA.sx;
    const dy = _ptAim.sy - _ptA.sy;
    const screenFacing =
      dx * dx + dy * dy > 0.001 ? Math.atan2(dy, dx) : s.facing;

    const entry: ProjectedSoldierEntry = {
      soldier: s,
      sx: _ptA.sx,
      sy: _ptA.sy,
      ndcZ: _ptA.ndcZ,
      scale: Math.max(0.32, Math.min(2.6, _ptA.scale)),
      screenFacing,
      visibility,
    };

    if (s.state === 'dead') {
      deadProjected.push(entry);
    } else {
      activeProjected.push(entry);
    }
  }

  deadProjected.sort((a, b) => b.ndcZ - a.ndcZ);
  for (let i = 0; i < deadProjected.length; i++) {
    const e = deadProjected[i];
    drawSoldier2D(
      ctx,
      e.soldier,
      time,
      e.sx,
      e.sy,
      e.scale,
      e.screenFacing,
      scene3d,
      e.visibility,
      width
    );
  }

  activeProjected.sort((a, b) => b.ndcZ - a.ndcZ);
  for (let i = 0; i < activeProjected.length; i++) {
    const e = activeProjected[i];
    drawSoldier2D(
      ctx,
      e.soldier,
      time,
      e.sx,
      e.sy,
      e.scale,
      e.screenFacing,
      scene3d,
      e.visibility,
      width
    );
  }

  // Subtle HP bars over damaged 3D structures (hidden if occluded behind taller wall/ridge)
  for (let i = 0; i < sim.structures.length; i++) {
    const st = sim.structures[i];
    if (st.state === 'destroyed') continue;
    const hpRatio = st.hp / st.maxHp;
    if (hpRatio >= 0.99) continue;

    const h3d =
      st.type === 'stone_wall' ? 3.5 : st.type === 'cannon' ? 2.7 : 2.1;
    if (scene3d.isPointOccluded3D(st.x, st.y, h3d, sim.structures)) continue;
    scene3d.projectSimToScreen(st.x, st.y, h3d, _ptA);
    if (!_ptA.visible) continue;
    const sc = Math.max(0.35, Math.min(2.2, _ptA.scale));
    ctx.save();
    ctx.fillStyle = 'rgba(12, 14, 12, 0.72)';
    ctx.fillRect(_ptA.sx - 16 * sc, _ptA.sy - 6 * sc, 32 * sc, 4 * sc);
    ctx.fillStyle = hpRatio > 0.45 ? '#d9a441' : '#d6453a';
    ctx.fillRect(
      _ptA.sx - 15 * sc,
      _ptA.sy - 5 * sc,
      30 * hpRatio * sc,
      2 * sc
    );
    ctx.restore();
  }

  // Projectiles flying above 3D terrain relief (hidden if behind 3D walls/hills)
  for (let i = 0; i < sim.projectiles.length; i++) {
    const p = sim.projectiles[i];
    if (scene3d.isPointOccluded3D(p.x, p.y, 1.05, sim.structures)) continue;
    scene3d.projectSimToScreen(p.prevX, p.prevY, 1.05, _ptA);
    scene3d.projectSimToScreen(p.x, p.y, 1.05, _ptB);
    if (!_ptA.visible && !_ptB.visible) continue;

    const sc = Math.max(0.35, Math.min(2.4, _ptB.scale));
    ctx.save();
    if (p.isCannonball) {
      ctx.strokeStyle = 'rgba(255, 190, 95, 0.6)';
      ctx.lineWidth = 4 * sc;
      ctx.beginPath();
      ctx.moveTo(_ptA.sx, _ptA.sy);
      ctx.lineTo(_ptB.sx, _ptB.sy);
      ctx.stroke();

      ctx.fillStyle = '#242528';
      ctx.strokeStyle = '#585c64';
      ctx.lineWidth = 1.2 * sc;
      ctx.beginPath();
      ctx.arc(_ptB.sx, _ptB.sy, 4.5 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 240, 185, 0.8)';
      ctx.lineWidth = 1.8 * sc;
      ctx.beginPath();
      ctx.moveTo(_ptA.sx, _ptA.sy);
      ctx.lineTo(_ptB.sx, _ptB.sy);
      ctx.stroke();

      ctx.fillStyle = '#fff3cf';
      ctx.beginPath();
      ctx.arc(_ptB.sx, _ptB.sy, 1.9 * sc, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 2D smoke, muzzle flashes, sparks, shockwaves projected at 3D emitter positions
  drawProjectedParticles(ctx, pool, scene3d, sim);

  // Weather precipitation, fog wisps, lightning flash & vignette
  drawWeatherScreenOverlay(ctx, width, height, sim, pool);

  // Hover placement preview projected onto 3D ground
  if (preview) {
    drawProjectedPlacementPreview(ctx, scene3d, preview);
  }
}
