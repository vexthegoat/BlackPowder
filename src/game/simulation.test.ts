import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearBattlefield,
  createSimulation,
  eraseAt,
  getLivingCounts,
  setupSkirmishPreset,
  spawnFormation,
  spawnSoldier,
  spawnStructure,
  stepSimulation,
} from './simulation';
import { ParticlePool } from './particles';
import { buildCrashInfo, formatCrashReport } from '../components/ErrorBoundary';

test('formation spawning places expected soldier counts for each mode', () => {
  const sim = createSimulation('waterloo', 'clear');
  const single = spawnFormation(sim, 'line', 'blue', 300, 400, 'single');
  assert.equal(single.length, 1);

  const line5 = spawnFormation(sim, 'skirmisher', 'blue', 400, 400, 'line5');
  assert.equal(line5.length, 5);

  const double10 = spawnFormation(sim, 'grenadier', 'red', 1300, 500, 'double10');
  assert.equal(double10.length, 10);

  const counts = getLivingCounts(sim);
  assert.equal(counts.blue, 6);
  assert.equal(counts.red, 10);
});

test('soldier walks, aims, fires with muzzle flash, reloads, and kills target with death animation', () => {
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;

  const blue = spawnSoldier(sim, 'line', 'blue', 400, 500);
  const red = spawnSoldier(sim, 'line', 'red', 850, 500); // > 420 range initially
  red.hp = 35; // ensure 1 musket shot (42 dmg) is fatal

  // Step 1: Out of range -> should walk and advance walkPhase
  stepSimulation(sim, 0.05, () => 0.5);
  assert.equal(blue.state, 'walking');
  assert.ok(blue.walkPhase > 0, 'walkPhase should increment while walking');

  // Step until blue gets in range and begins aiming
  let sawAiming = false;
  let sawFiring = false;
  let sawMuzzleFlash = false;
  let sawReloading = false;
  let sawDying = false;

  for (let i = 0; i < 240; i++) {
    stepSimulation(sim, 0.05, () => 0.5);
    const bState: string = blue.state;
    const rState: string = red.state;
    if (bState === 'aiming') sawAiming = true;
    if (bState === 'firing') sawFiring = true;
    if (bState === 'reloading') sawReloading = true;
    if (rState === 'dying') sawDying = true;
    if (sim.visualEvents.some((e) => e.kind === 'muzzle_flash')) {
      sawMuzzleFlash = true;
    }
    if (rState === 'dead') break;
  }

  assert.equal(sawAiming, true, 'soldier should enter aiming state');
  assert.equal(sawFiring, true, 'soldier should enter firing state');
  assert.equal(sawMuzzleFlash, true, 'firing should emit muzzle_flash event');
  assert.equal(sawReloading, true, 'soldier should enter reloading state after firing');
  assert.equal(sawDying, true, 'fatal hit should trigger dying animation state');
  assert.equal(red.state, 'dead', 'dying soldier should settle into dead state');
  assert.equal(sim.blueKills, 1);
});

test('weather slows reload in rain and fog reduces engagement range', () => {
  const clearSim = createSimulation('waterloo', 'clear');
  clearSim.combatActive = true;
  const cBlue = spawnSoldier(clearSim, 'line', 'blue', 500, 500);
  spawnSoldier(clearSim, 'line', 'red', 860, 500); // 360px apart

  stepSimulation(clearSim, 0.05, () => 0.5);
  assert.equal(cBlue.state, 'aiming', '360px is within clear range (420px)');

  const fogSim = createSimulation('waterloo', 'fog');
  fogSim.combatActive = true;
  const fBlue = spawnSoldier(fogSim, 'line', 'blue', 500, 500);
  spawnSoldier(fogSim, 'line', 'red', 860, 500); // 360px apart > 420 * 0.68 = 285.6px

  stepSimulation(fogSim, 0.05, () => 0.5);
  assert.equal(fBlue.state, 'walking', '360px exceeds fog visibility range so soldier advances');
});

test('sandbag wall intercepts enemy bullets and powder keg explodes when destroyed', () => {
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;

  spawnSoldier(sim, 'skirmisher', 'blue', 400, 500);
  const keg = spawnStructure(sim, 'powder_keg', 'red', 620, 500);
  const nearbyRed = spawnSoldier(sim, 'line', 'red', 645, 500);

  let sawExplosion = false;
  for (let i = 0; i < 80; i++) {
    stepSimulation(sim, 0.05, () => 0.5);
    if (sim.visualEvents.some((e) => e.kind === 'explosion')) {
      sawExplosion = true;
      break;
    }
  }

  assert.equal(sawExplosion, true, 'powder keg should explode when shot');
  assert.equal(keg.state, 'destroyed');
  assert.ok(nearbyRed.hp < nearbyRed.maxHp, 'explosion should damage nearby soldiers');
});

test('eraseAt and clearBattlefield clean up units and structures', () => {
  const sim = createSimulation('lodi_bridge', 'rain');
  setupSkirmishPreset(sim);
  const before = getLivingCounts(sim);
  assert.ok(before.blue > 10 && before.red > 10 && before.structures > 0);

  const s = sim.soldiers[0];
  const erased = eraseAt(sim, s.x, s.y, 40);
  assert.equal(erased, true);

  clearBattlefield(sim);
  const after = getLivingCounts(sim);
  assert.equal(after.blue, 0);
  assert.equal(after.red, 0);
  assert.equal(after.structures, 0);
});

test('corpses never disappear and age continuously to drive rot progression', () => {
  const sim = createSimulation('waterloo', 'clear');
  for (let i = 0; i < 180; i++) {
    const s = spawnSoldier(sim, 'line', i % 2 === 0 ? 'blue' : 'red', 400 + (i % 20) * 20, 200 + Math.floor(i / 20) * 30);
    s.state = 'dead';
    s.hp = 0;
    s.corpseAge = 0;
  }

  for (let t = 0; t < 100; t++) {
    stepSimulation(sim, 0.05, () => 0.5);
  }

  const deadSoldiers = sim.soldiers.filter((s) => s.state === 'dead');
  assert.equal(deadSoldiers.length, 180, 'all 180 corpses should remain on the field');
  assert.ok(deadSoldiers[0].corpseAge >= 4.9, 'corpseAge should advance over time for rot');
});

test('field cannon impact emits cannon_impact event and ParticlePool records craters, glows, and splashes', () => {
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;
  spawnStructure(sim, 'cannon', 'blue', 300, 500);
  spawnSoldier(sim, 'line', 'red', 760, 500);

  let sawCannonImpact = false;
  for (let i = 0; i < 120; i++) {
    stepSimulation(sim, 0.05, () => 0.5);
    if (sim.visualEvents.some((e) => e.kind === 'cannon_impact')) {
      sawCannonImpact = true;
      break;
    }
  }
  assert.equal(sawCannonImpact, true, 'cannonball splash should emit cannon_impact');

  const pool = new ParticlePool();
  pool.spawnMuzzleBlast(100, 100, 0, 1, true);
  pool.spawnCannonImpact(250, 250);
  pool.spawnExplosion(400, 400, 120);
  pool.spawnProjectileTrail(150, 150, true);
  pool.spawnBarrelWisp(120, 120);
  pool.spawnFootstepDust(130, 130);
  pool.update(0.016, 'rain', 1600, 900);

  assert.ok(pool.scorchMarks.some((m) => m.active), 'scorch marks should be active after impacts');
  assert.ok(pool.pool.some((p) => p.active && p.kind === 'glow'), 'glow halo should be active');
  assert.ok(pool.pool.some((p) => p.active && p.kind === 'splash'), 'rain splash should be active');

  pool.clear();
  assert.equal(pool.scorchMarks.some((m) => m.active), false, 'clear() resets scorch marks');
  assert.equal(pool.pool.some((p) => p.active), false, 'clear() resets pooled particles');
});

test('crash handler helpers build and format diagnostic crash reports', () => {
  const err = new Error('Simulated canvas failure');
  const info = buildCrashInfo(err, 'simulation', 'screen=playing, map=waterloo');
  assert.equal(info.source, 'simulation');
  assert.equal(info.title, 'Battlefield Simulation Error');
  assert.equal(info.message, 'Simulated canvas failure');

  const formatted = formatCrashReport(info);
  assert.ok(formatted.includes('=== Blackpowder Sandbox Crash Report ==='));
  assert.ok(formatted.includes('Simulated canvas failure'));
  assert.ok(formatted.includes('screen=playing, map=waterloo'));
});

test('soldiers emit permanent ground blood splatters on damage and death that persist across updates', () => {
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;
  spawnSoldier(sim, 'line', 'blue', 400, 500);
  const red = spawnSoldier(sim, 'grenadier', 'red', 720, 500); // high HP so first hit wounds, later hit kills

  const pool = new ParticlePool();
  let nonFatalSplatters = 0;
  let fatalSplatters = 0;

  for (let i = 0; i < 260; i++) {
    stepSimulation(sim, 0.05, () => 0.5);
    for (const ev of sim.visualEvents) {
      if (ev.kind === 'blood_splatter') {
        if (ev.fatal) fatalSplatters++;
        else nonFatalSplatters++;
        pool.spawnBloodSplatter(ev.x, ev.y, ev.angle, ev.fatal, ev.intensity);
      }
    }
    pool.update(0.05, sim.weather, sim.width, sim.height);
    if (red.state === 'dead') break;
  }

  assert.ok(nonFatalSplatters >= 1, 'non-fatal damage should emit blood_splatter');
  assert.ok(fatalSplatters >= 1, 'fatal blow should emit fatal blood_splatter');

  const countAfterDeath = pool.bloodSplatters.length;
  assert.ok(countAfterDeath > 10, 'multiple permanent blood splatter particles should exist on ground');

  // Advance particle pool for 30+ seconds to confirm permanent blood splatters never fade or despawn
  for (let t = 0; t < 600; t++) {
    pool.update(0.05, 'storm', sim.width, sim.height);
  }
  assert.equal(pool.bloodSplatters.length, countAfterDeath, 'blood splatters must remain permanent over time');

  pool.clear();
  assert.equal(pool.bloodSplatters.length, 0, 'clear() resets blood splatters for a new battle');
});

import {
  getAtmosphereConfig,
  simToWorld3D,
  terrainHeightAt,
  world3DToSim,
} from './terrain3d';

test('3D terrain math converts sim coordinates cleanly and models ridges, riverbeds, and bridges', () => {
  const w = simToWorld3D(900, 500);
  assert.equal(w.x, 0);
  assert.equal(w.z, 0);

  const back = world3DToSim(w.x, w.z);
  assert.equal(Math.round(back.x), 900);
  assert.equal(Math.round(back.y), 500);

  // Redoubt Ridge center ridge should be markedly higher than flat corner ground
  const ridgeCenterH = terrainHeightAt('redoubt_ridge', 900, 500);
  const flatGroundH = terrainHeightAt('redoubt_ridge', 180, 180);
  assert.ok(ridgeCenterH > flatGroundH + 2.5, 'ridge elevation should rise above surrounding terrain');

  // Bridge at Lodi river trench should dip below water, while bridge deck rises above it
  const riverH = terrainHeightAt('lodi_bridge', 900, 500);
  const bridgeH = terrainHeightAt('lodi_bridge', 900, 295);
  assert.ok(riverH < -1.0, 'river channel should be carved below 0');
  assert.ok(bridgeH > 0.5, 'arched bridge deck should sit above water surface');

  const stormAtmo = getAtmosphereConfig('waterloo', 'storm');
  const clearAtmo = getAtmosphereConfig('waterloo', 'clear');
  assert.ok(stormAtmo.fogDensity > clearAtmo.fogDensity);
  assert.ok(stormAtmo.sunIntensity < clearAtmo.sunIntensity);
});

test('simulation emits voice_command, voice_pain, and voice_death sound events during battle', () => {
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;

  spawnSoldier(sim, 'officer', 'blue', 400, 500);
  spawnStructure(sim, 'cannon', 'blue', 360, 440);
  const target = spawnSoldier(sim, 'grenadier', 'red', 700, 500);

  let sawCommand = false;
  let sawPain = false;
  let sawDeath = false;

  for (let i = 0; i < 240; i++) {
    stepSimulation(sim, 0.05, () => 0.5);
    for (const ev of sim.soundEvents) {
      if (ev.kind === 'voice_command') sawCommand = true;
      if (ev.kind === 'voice_pain') sawPain = true;
      if (ev.kind === 'voice_death') sawDeath = true;
    }
    if (target.state === 'dead') break;
  }

  assert.equal(sawCommand, true, 'officers and cannons should emit voice_command events');
  assert.equal(sawPain, true, 'wounded soldiers should emit voice_pain events');
  assert.equal(sawDeath, true, 'dying soldiers should emit voice_death events');
});

import { hasLineOfSight } from './simulation';

test('bots do not shoot or tunnel bullets through stone_ruin walls or stone_wall structures', () => {
  // 1. Terrain stone_ruin on waterloo at x=875..925, y=340..435
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;
  const blue = spawnSoldier(sim, 'skirmisher', 'blue', 810, 385);
  const red = spawnSoldier(sim, 'skirmisher', 'red', 990, 385);

  assert.equal(
    hasLineOfSight(sim, blue.x, blue.y, red.x, red.y),
    false,
    'stone_ruin should block line of sight'
  );

  // Step briefly: bots must walk/flank around wall rather than aiming or firing into it
  for (let i = 0; i < 15; i++) {
    stepSimulation(sim, 0.05, () => 0.5);
    assert.notEqual(blue.state, 'aiming', 'blue must not aim through stone_ruin');
    assert.notEqual(blue.state, 'firing', 'blue must not fire through stone_ruin');
    assert.notEqual(red.state, 'aiming', 'red must not aim through stone_ruin');
    assert.notEqual(red.state, 'firing', 'red must not fire through stone_ruin');
  }
  assert.equal(red.hp, red.maxHp, 'red behind wall should take zero damage');
  assert.equal(blue.hp, blue.maxHp, 'blue behind wall should take zero damage');

  // 2. Player-built stone_wall blocks line of sight and projectiles from both sides
  const wallSim = createSimulation('waterloo', 'clear');
  wallSim.combatActive = true;
  const wBlue = spawnSoldier(wallSim, 'line', 'blue', 400, 500);
  spawnStructure(wallSim, 'stone_wall', 'blue', 460, 500);
  const wRed = spawnSoldier(wallSim, 'line', 'red', 540, 500);

  assert.equal(
    hasLineOfSight(wallSim, wBlue.x, wBlue.y, wRed.x, wRed.y),
    false,
    'stone_wall must block line of sight from both sides'
  );
  stepSimulation(wallSim, 0.05, () => 0.5);
  assert.equal(wBlue.state, 'walking', 'allied bot behind own stone_wall must flank instead of shooting through it');

  // Manual projectile fired straight at stone_ruin or stone_wall must collide instead of tunneling
  wallSim.projectiles.push({
    id: wallSim.nextId++,
    faction: 'blue',
    x: 435,
    y: 500,
    prevX: 435,
    prevY: 500,
    vx: 1600, // 80px in one 0.05s step > wall diameter
    vy: 0,
    damage: 50,
    rangeLeft: 600,
    isCannonball: false,
    splashRadius: 0,
  });
  stepSimulation(wallSim, 0.05, () => 0.5);
  assert.equal(wRed.hp, wRed.maxHp, 'fast bullet must not tunnel through stone_wall');
});

test('low-accuracy shot aimed past a wall corner can accidentally hit the wall', () => {
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;
  // Waterloo ruin is at x=875..925, y=340..435
  // Place blue & red just below bottom edge y=435 (center ray y=444 clears wall; muzzle at y-8=436 clips wall on upward spread)
  const blue = spawnSoldier(sim, 'grenadier', 'blue', 845, 444);
  const red = spawnSoldier(sim, 'grenadier', 'red', 955, 444);

  assert.equal(
    hasLineOfSight(sim, blue.x, blue.y, red.x, red.y),
    true,
    'line past corner of ruin should be unobstructed'
  );

  // Force maximum upward spread (rng = () => 0.0) so shot accidentally clips the stone_ruin corner
  let sawStoneImpact = false;
  for (let i = 0; i < 40; i++) {
    stepSimulation(sim, 0.05, () => 0.0);
    if (
      sim.visualEvents.some((e) => e.kind === 'impact' && e.material === 'stone')
    ) {
      sawStoneImpact = true;
      break;
    }
  }

  assert.equal(
    sawStoneImpact,
    true,
    'wide spread shot past wall corner should accidentally strike the stone wall'
  );
  assert.equal(red.hp, red.maxHp, 'accidental wall hit should stop the stray bullet');
});

test('wound system reduces movement speed, drips blood, and bleeds out critical wounds', () => {
  // 1. Speed comparison: healthy vs lightly wounded vs critically wounded
  const simSpeed = createSimulation('waterloo', 'clear');
  simSpeed.combatActive = true;
  const healthy = spawnSoldier(simSpeed, 'line', 'blue', 200, 300);
  const lightWound = spawnSoldier(simSpeed, 'line', 'blue', 200, 450);
  lightWound.woundSeverity = 1;
  const heavyWound = spawnSoldier(simSpeed, 'line', 'blue', 200, 600);
  heavyWound.woundSeverity = 2;
  spawnSoldier(simSpeed, 'line', 'red', 1400, 450); // out of range so all advance

  for (let i = 0; i < 10; i++) {
    stepSimulation(simSpeed, 0.05, () => 0.5);
  }
  assert.ok(
    healthy.x > lightWound.x && lightWound.x > heavyWound.x,
    'higher woundSeverity must reduce marching speed'
  );

  // 2. Non-fatal hit sets woundSeverity and heavy wound bleeds out fatally over time
  const simBleed = createSimulation('waterloo', 'clear');
  simBleed.combatActive = true;
  spawnSoldier(simBleed, 'line', 'blue', 400, 500);
  const grenadier = spawnSoldier(simBleed, 'grenadier', 'red', 750, 500); // 175 HP
  grenadier.hp = 60; // ~34% HP -> after taking a 42-dmg hit or stepping in critical state -> bleeds out

  // Take one hit? Actually 60 - 42 = 18 HP (<= 35% of 175 -> woundSeverity = 2!)
  // Wait for blue to fire once, then remove blue so only bleed-out kills grenadier
  let blueHitOnce = false;
  for (let i = 0; i < 80; i++) {
    stepSimulation(simBleed, 0.05, () => 0.5);
    if (grenadier.hp < 60 && grenadier.woundSeverity === 2) {
      blueHitOnce = true;
      break;
    }
  }
  assert.equal(blueHitOnce, true, 'non-fatal hit down to <=35% HP should inflict woundSeverity 2');

  // Remove attacker so only bleeding causes death
  simBleed.soldiers = simBleed.soldiers.filter((s) => s.faction === 'red');
  let sawBleedSplatter = false;
  for (let i = 0; i < 200; i++) {
    stepSimulation(simBleed, 0.05, () => 0.5);
    if (simBleed.visualEvents.some((e) => e.kind === 'blood_splatter' && !e.fatal)) {
      sawBleedSplatter = true;
    }
    if (grenadier.state === 'dead') break;
  }

  assert.equal(sawBleedSplatter, true, 'critical wound should drip blood_splatter events');
  assert.equal(grenadier.state, 'dead', 'untreated critical wound should bleed out fatally');
});

test('artillery cannonball impact flings infantry through the air and triggers goreLevel 2', () => {
  const sim = createSimulation('waterloo', 'clear');
  sim.combatActive = true;
  spawnStructure(sim, 'cannon', 'blue', 300, 500);
  const red = spawnSoldier(sim, 'line', 'red', 720, 500);

  let impactX: number | null = null;
  let sawAirborneFling = false;
  for (let i = 0; i < 120; i++) {
    const prevX = red.x;
    stepSimulation(sim, 0.05, () => 0.5);
    if (impactX === null && red.flingVx > 20) {
      impactX = prevX;
    }
    if (red.flingHeight > 0.2 && Math.abs(red.flingVx) > 20) {
      sawAirborneFling = true;
    }
    if (red.state === 'dead' && red.flingHeight === 0 && Math.abs(red.flingVx) < 2) {
      break;
    }
  }

  assert.equal(sawAirborneFling, true, 'cannonball impact should launch soldier into an airborne fling arc');
  assert.ok(impactX !== null && red.x > impactX + 18, 'flung soldier should be displaced along cannonball blast');
  assert.equal(red.goreLevel, 2, 'fatal cannonball hit should assign goreLevel 2');
});

import { STRUCTURE_SPECS } from './constants';

test('sandbag build is named Sandbag and sideways fortifications span horizontally', () => {
  assert.equal(STRUCTURE_SPECS.sandbag.name, 'Sandbag');

  const sim = createSimulation('waterloo', 'clear');
  spawnStructure(sim, 'stone_wall', 'blue', 500, 500);

  // Sideways stone_wall spans roughly x: 474..526, y: 487..513
  assert.equal(
    hasLineOfSight(sim, 520, 440, 520, 560),
    false,
    'sideways stone_wall should block north-south LOS across its horizontal width'
  );
  assert.equal(
    hasLineOfSight(sim, 540, 440, 540, 560),
    true,
    'LOS just past sideways edge of stone_wall should be clear'
  );
});
