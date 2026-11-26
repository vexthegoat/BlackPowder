import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CrashInfo,
  CrashReportScreen,
  buildCrashInfo,
} from './components/ErrorBoundary';
import { FieldManualModal } from './components/FieldManualModal';
import { GameHud } from './components/GameHud';
import { MainMenu } from './components/MainMenu';
import { MapSelectModal } from './components/MapSelectModal';
import { PauseModal } from './components/PauseModal';
import { battlefieldAudio } from './game/audio';
import { WORLD_HEIGHT, WORLD_WIDTH } from './game/constants';
import { BattlefieldScene3D } from './game/map3d';
import { ParticlePool } from './game/particles';
import { HoverPreview, renderInfantryOverlay } from './game/renderer';
import {
  clearBattlefield,
  createSimulation,
  eraseAt,
  getLivingCounts,
  setupSkirmishPreset,
  spawnFormation,
  spawnStructure,
  stepSimulation,
} from './game/simulation';
import {
  Faction,
  FormationMode,
  GameScreen,
  PlacementCategory,
  SimulationState,
  SoldierType,
  StructureType,
  WeatherType,
} from './game/types';

function isAutostartEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

export default function App() {
  const autostart = isAutostartEnabled();
  const [screen, setScreen] = useState<GameScreen>(autostart ? 'playing' : 'title');
  const [mapReturnScreen, setMapReturnScreen] = useState<GameScreen>('title');
  const [showManual, setShowManual] = useState(false);
  const [crash, setCrash] = useState<CrashInfo | null>(null);

  const [mapId, setMapId] = useState<string>('waterloo');
  const [weather, setWeather] = useState<WeatherType>('clear');
  const [combatActive, setCombatActive] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<1 | 2>(1);
  const [muted, setMuted] = useState<boolean>(false);

  const [faction, setFaction] = useState<Faction>('blue');
  const [category, setCategory] = useState<PlacementCategory>('infantry');
  const [soldierType, setSoldierType] = useState<SoldierType>('line');
  const [structureType, setStructureType] = useState<StructureType>('sandbag');
  const [formation, setFormation] = useState<FormationMode>('line5');

  const [counts, setCounts] = useState({
    blue: 0,
    red: 0,
    blueKills: 0,
    redKills: 0,
  });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const threeMountRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scene3dRef = useRef<BattlefieldScene3D | null>(null);

  const simRef = useRef<SimulationState>(createSimulation('waterloo', 'clear'));
  const poolRef = useRef<ParticlePool>(new ParticlePool());
  const hoverRef = useRef<HoverPreview>({
    active: false,
    worldX: 0,
    worldY: 0,
    category: 'infantry',
    soldierType: 'line',
    structureType: 'sandbag',
    faction: 'blue',
    formation: 'line5',
  });

  const screenRef = useRef<GameScreen>(screen);
  screenRef.current = screen;

  const crashRef = useRef<CrashInfo | null>(crash);
  crashRef.current = crash;

  const simSpeedRef = useRef<1 | 2>(simSpeed);
  simSpeedRef.current = simSpeed;

  const toolRef = useRef({
    faction,
    category,
    soldierType,
    structureType,
    formation,
  });
  toolRef.current = {
    faction,
    category,
    soldierType,
    structureType,
    formation,
  };

  const keysPressedRef = useRef<Set<string>>(new Set());
  const dragPanRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
  }>({ active: false, lastX: 0, lastY: 0 });
  const orbitDragRef = useRef<{
    active: boolean;
    button: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  }>({
    active: false,
    button: 2,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
  });
  const erasingDragRef = useRef<boolean>(false);

  const reset3DCamera = useCallback((immediate = false) => {
    scene3dRef.current?.resetView(immediate);
  }, []);

  const syncBodyState = useCallback(
    (nextScreen: GameScreen, hasCrash: boolean) => {
      document.body.dataset.state = hasCrash ? 'error' : nextScreen;
    },
    []
  );

  useEffect(() => {
    syncBodyState(screen, crash !== null);
  }, [screen, crash, syncBodyState]);

  // Global uncaught runtime & promise rejection crash handler
  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const err = event.error ?? new Error(event.message || 'Uncaught runtime error');
      setCrash(
        buildCrashInfo(
          err,
          'runtime',
          `screen=${screenRef.current}, map=${simRef.current.mapId}, weather=${simRef.current.weather}`
        )
      );
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      setCrash(
        buildCrashInfo(
          event.reason,
          'promise',
          `screen=${screenRef.current}, map=${simRef.current.mapId}, weather=${simRef.current.weather}`
        )
      );
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  // Initialize starting diorama or autostart battle once
  useEffect(() => {
    const sim = simRef.current;
    setupSkirmishPreset(sim);
    sim.combatActive = true;
    const initialCounts = getLivingCounts(sim);
    setCounts({
      blue: initialCounts.blue,
      red: initialCounts.red,
      blueKills: 0,
      redKills: 0,
    });
  }, []);

  // Keep weather ambience synced
  useEffect(() => {
    simRef.current.weather = weather;
    battlefieldAudio.setWeatherAmbience(
      weather,
      screen === 'playing' || screen === 'title'
    );
  }, [weather, screen]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    const scene3d = scene3dRef.current;
    if (!viewport || !scene3d) return { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.5 };
    const rect = viewport.getBoundingClientRect();
    return scene3d.raycastGround(clientX, clientY, rect);
  }, []);

  const refreshCountsNow = useCallback(() => {
    const sim = simRef.current;
    const c = getLivingCounts(sim);
    setCounts({
      blue: c.blue,
      red: c.red,
      blueKills: sim.blueKills,
      redKills: sim.redKills,
    });
  }, []);

  const handleDeployToBattlefield = useCallback(() => {
    battlefieldAudio.unlock();
    battlefieldAudio.playUiClick(580);

    const sim = simRef.current;
    sim.mapId = mapId;
    sim.weather = weather;
    sim.combatActive = true;
    poolRef.current.clear();
    setupSkirmishPreset(sim);
    scene3dRef.current?.rebuildMap(mapId);
    scene3dRef.current?.resetView(true);
    setCombatActive(true);
    setScreen('playing');
    refreshCountsNow();
    (document.activeElement as HTMLElement | null)?.blur();
  }, [mapId, weather, refreshCountsNow]);

  const handleToggleCombat = useCallback(() => {
    battlefieldAudio.unlock();
    battlefieldAudio.playUiClick(480);
    setCombatActive((prev) => {
      const next = !prev;
      simRef.current.combatActive = next;
      battlefieldAudio.playCommandOrder(next ? 'advance' : 'halt');
      return next;
    });
  }, []);

  const handleLoadPreset = useCallback(() => {
    battlefieldAudio.unlock();
    battlefieldAudio.playUiClick(540);
    const sim = simRef.current;
    poolRef.current.clear();
    setupSkirmishPreset(sim);
    battlefieldAudio.playCommandOrder('advance');
    refreshCountsNow();
  }, [refreshCountsNow]);

  const handleClearField = useCallback(() => {
    battlefieldAudio.unlock();
    battlefieldAudio.playUiClick(360);
    clearBattlefield(simRef.current);
    poolRef.current.clear();
    refreshCountsNow();
  }, [refreshCountsNow]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      battlefieldAudio.setMuted(next);
      if (!next) {
        battlefieldAudio.unlock();
        battlefieldAudio.playUiClick(520);
        battlefieldAudio.setWeatherAmbience(simRef.current.weather, true);
      }
      return next;
    });
  }, []);

  const handleChangeWeather = useCallback((w: WeatherType) => {
    battlefieldAudio.unlock();
    battlefieldAudio.playUiClick(500);
    setWeather(w);
    simRef.current.weather = w;
  }, []);

  const handleRecoverFromCrash = useCallback(() => {
    const sim = simRef.current;
    clearBattlefield(sim);
    poolRef.current.clear();
    setupSkirmishPreset(sim);
    sim.combatActive = true;
    setCombatActive(true);
    setCrash(null);
    setScreen('playing');
    reset3DCamera(true);
    refreshCountsNow();
  }, [reset3DCamera, refreshCountsNow]);

  // Initialize Three.js 3D map + 2D infantry overlay loop & ResizeObserver
  useEffect(() => {
    const viewport = viewportRef.current;
    const threeMount = threeMountRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!viewport || !threeMount || !overlayCanvas) return;

    const overlayCtx = overlayCanvas.getContext('2d');
    if (!overlayCtx) return;

    let scene3d: BattlefieldScene3D;
    try {
      scene3d = new BattlefieldScene3D(threeMount);
      scene3dRef.current = scene3d;
    } catch (err) {
      setCrash(
        buildCrashInfo(
          err,
          'simulation',
          `WebGL 3D map initialization failed (map=${simRef.current.mapId})`
        )
      );
      return;
    }

    let cssW = 1440;
    let cssH = 900;
    let lastDrawnStaticScreen: GameScreen | null = null;

    const resize = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      cssW = rect.width;
      cssH = rect.height;
      scene3d.resize(cssW, cssH);

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      overlayCanvas.width = Math.round(cssW * dpr);
      overlayCanvas.height = Math.round(cssH * dpr);
      overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastDrawnStaticScreen = null;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(viewport);

    let rafId = 0;
    let timerId: number | null = null;
    let lastTime = performance.now();
    let hudSyncAccum = 0;
    let lastCounts = { blue: -1, red: -1, blueKills: -1, redKills: -1 };
    let disposed = false;

    const renderBothLayers = (
      dt: number,
      showPreview: HoverPreview | null,
      timeSec: number
    ) => {
      const sim = simRef.current;
      const pool = poolRef.current;

      scene3d.rebuildMap(sim.mapId);
      scene3d.syncDecals(pool);
      scene3d.syncStructures(sim.structures, sim.mapId, timeSec);
      scene3d.updateAtmosphere(sim.mapId, sim.weather, sim.lightningFlash, dt);
      scene3d.updateCamera(dt, sim.cameraShake);
      scene3d.render();

      renderInfantryOverlay(
        overlayCtx,
        cssW,
        cssH,
        sim,
        pool,
        scene3d,
        showPreview,
        timeSec
      );
    };

    const renderSingleStaticFrame = () => {
      try {
        renderBothLayers(0, null, performance.now() / 1000);
      } catch (err) {
        rafId = 0;
        setCrash(
          buildCrashInfo(
            err,
            'simulation',
            `static render map=${simRef.current.mapId}, weather=${simRef.current.weather}`
          )
        );
      }
    };

    const scheduleNext = () => {
      if (disposed || crashRef.current) return;
      if (scene3d.isSoftwareGl) {
        timerId = scene3d.afterDraw(() => {
          if (!disposed && !crashRef.current) {
            frame(performance.now());
          }
        });
      } else {
        rafId = requestAnimationFrame(frame);
      }
    };

    const frame = (now: number) => {
      if (disposed || crashRef.current) {
        rafId = 0;
        return;
      }

      try {
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        const dt = Math.min(Math.max(rawDt, 0), 0.05);

        const currentScreen = screenRef.current;
        const sim = simRef.current;
        const pool = poolRef.current;

        if (currentScreen === 'map_select' || currentScreen === 'paused') {
          if (lastDrawnStaticScreen !== currentScreen) {
            lastDrawnStaticScreen = currentScreen;
            renderSingleStaticFrame();
          }
          rafId = 0;
          return;
        }
        lastDrawnStaticScreen = null;

        // Camera navigation in 3D space
        if (currentScreen === 'playing') {
          const keys = keysPressedRef.current;
          const zoomFactor = scene3d.targetRig.distance / 110;
          const panSpeed = 620 * zoomFactor;
          let inputForward = 0;
          let inputRight = 0;
          if (keys.has('KeyA') || keys.has('ArrowLeft')) inputRight -= 1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) inputRight += 1;
          if (keys.has('KeyW') || keys.has('ArrowUp')) inputForward += 1;
          if (keys.has('KeyS') || keys.has('ArrowDown')) inputForward -= 1;

          if (inputForward !== 0 || inputRight !== 0) {
            const az = scene3d.currentRig.azimuth;
            const sinA = Math.sin(az);
            const cosA = Math.cos(az);
            const dSimX = inputRight * cosA - inputForward * sinA;
            const dSimY = -inputRight * sinA - inputForward * cosA;
            scene3d.targetRig.targetX = Math.max(
              0,
              Math.min(WORLD_WIDTH, scene3d.targetRig.targetX + dSimX * panSpeed * dt)
            );
            scene3d.targetRig.targetY = Math.max(
              0,
              Math.min(WORLD_HEIGHT, scene3d.targetRig.targetY + dSimY * panSpeed * dt)
            );
          }
        } else if (currentScreen === 'title') {
          // Gentle live 3D battlefield panorama behind main menu
          scene3d.targetRig.targetX = WORLD_WIDTH * 0.5;
          scene3d.targetRig.targetY = WORLD_HEIGHT * 0.5;
          scene3d.targetRig.azimuth = Math.sin(now * 0.00016) * 0.42;
          scene3d.targetRig.polar = 0.72 + Math.cos(now * 0.00021) * 0.07;
          scene3d.targetRig.distance = 112;
        }

        // Advance simulation on 'title' (ambient skirmish) and 'playing'
        if (currentScreen === 'playing' || currentScreen === 'title') {
          const steps = currentScreen === 'playing' ? simSpeedRef.current : 1;
          for (let s = 0; s < steps; s++) {
            const { thunderTriggered } = stepSimulation(sim, dt);
            if (thunderTriggered && currentScreen === 'playing') {
              battlefieldAudio.playThunder();
            }
            if (currentScreen === 'playing') {
              battlefieldAudio.processEvents(sim.soundEvents);
            }

            // Translate visual events into zero-GC pooled particles
            for (let v = 0; v < sim.visualEvents.length; v++) {
              const ev = sim.visualEvents[v];
              if (ev.kind === 'muzzle_flash') {
                pool.spawnMuzzleBlast(ev.x, ev.y, ev.angle, ev.scale, ev.isCannon);
              } else if (ev.kind === 'explosion') {
                pool.spawnExplosion(ev.x, ev.y, ev.radius);
              } else if (ev.kind === 'cannon_impact') {
                pool.spawnCannonImpact(ev.x, ev.y);
              } else if (ev.kind === 'impact') {
                pool.spawnImpact(ev.x, ev.y, ev.angle, ev.material);
              } else if (ev.kind === 'blood_splatter') {
                pool.spawnBloodSplatter(ev.x, ev.y, ev.angle, ev.fatal, ev.intensity);
              } else if (ev.kind === 'death_dust') {
                pool.spawnDeathDust(ev.x, ev.y);
              }
            }

            // Continuous battlefield micro-effects
            for (let pIdx = 0; pIdx < sim.projectiles.length; pIdx++) {
              const pr = sim.projectiles[pIdx];
              if (pr.isCannonball || Math.random() < 0.35) {
                pool.spawnProjectileTrail(pr.x, pr.y, pr.isCannonball);
              }
            }

            const dryGround = sim.weather !== 'rain' && sim.weather !== 'storm';
            for (let uIdx = 0; uIdx < sim.soldiers.length; uIdx++) {
              const unit = sim.soldiers[uIdx];
              if (
                unit.state === 'reloading' &&
                unit.reloadProgress < 0.35 &&
                Math.random() < 0.12
              ) {
                pool.spawnBarrelWisp(
                  unit.x + Math.cos(unit.facing) * 6,
                  unit.y - 12
                );
              } else if (
                dryGround &&
                unit.state === 'walking' &&
                Math.random() < 0.08
              ) {
                pool.spawnFootstepDust(unit.x, unit.y);
              }
            }

            for (let stIdx = 0; stIdx < sim.structures.length; stIdx++) {
              const st = sim.structures[stIdx];
              if (
                st.type === 'cannon' &&
                st.state === 'reloading' &&
                st.reloadTimer > 3.0 &&
                Math.random() < 0.25
              ) {
                pool.spawnBarrelWisp(
                  st.x + Math.cos(st.angle) * 26,
                  st.y + Math.sin(st.angle) * 26
                );
              }
            }

            pool.update(dt, sim.weather, sim.width, sim.height);
          }

          // Loop ambient skirmish on title screen if one side wipes out
          if (currentScreen === 'title') {
            const c = getLivingCounts(sim);
            if (c.blue === 0 || c.red === 0) {
              setupSkirmishPreset(sim);
              sim.combatActive = true;
            }
          }
        }

        // Update hover preview tool snapshot
        const tool = toolRef.current;
        hoverRef.current.category = tool.category;
        hoverRef.current.soldierType = tool.soldierType;
        hoverRef.current.structureType = tool.structureType;
        hoverRef.current.faction = tool.faction;
        hoverRef.current.formation = tool.formation;

        const showPreview = currentScreen === 'playing' ? hoverRef.current : null;
        renderBothLayers(dt, showPreview, now / 1000);

        // Throttled HUD count sync
        hudSyncAccum += dt;
        if (hudSyncAccum >= 0.16) {
          hudSyncAccum = 0;
          const c = getLivingCounts(sim);
          if (
            c.blue !== lastCounts.blue ||
            c.red !== lastCounts.red ||
            sim.blueKills !== lastCounts.blueKills ||
            sim.redKills !== lastCounts.redKills
          ) {
            lastCounts = {
              blue: c.blue,
              red: c.red,
              blueKills: sim.blueKills,
              redKills: sim.redKills,
            };
            setCounts(lastCounts);
          }
        }

        scheduleNext();
      } catch (err) {
        rafId = 0;
        setCrash(
          buildCrashInfo(
            err,
            'simulation',
            `screen=${screenRef.current}, map=${simRef.current.mapId}, weather=${simRef.current.weather}, soldiers=${simRef.current.soldiers.length}`
          )
        );
      }
    };

    const resumeLoop = () => {
      if (disposed || rafId !== 0 || crashRef.current) return;
      lastTime = performance.now();
      if (scene3d.isSoftwareGl) {
        frame(performance.now());
      } else {
        rafId = requestAnimationFrame(frame);
      }
    };

    (viewport as HTMLDivElement & { __resumeLoop?: () => void }).__resumeLoop =
      resumeLoop;

    if (scene3d.isSoftwareGl) {
      renderBothLayers(0, null, performance.now() / 1000);
      scheduleNext();
    } else {
      rafId = requestAnimationFrame(frame);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
      ro.disconnect();
      scene3d.dispose();
      scene3dRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!crash && (screen === 'title' || screen === 'playing')) {
      const vp = viewportRef.current as
        | (HTMLDivElement & { __resumeLoop?: () => void })
        | null;
      vp?.__resumeLoop?.();
    }
  }, [screen, crash]);

  // Keyboard shortcuts & focus-loss release
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressedRef.current.add(e.code);

      if (screenRef.current === 'title') {
        if ((e.code === 'Enter' || e.code === 'Space') && !showManual) {
          e.preventDefault();
          battlefieldAudio.unlock();
          battlefieldAudio.playUiClick(560);
          setScreen('map_select');
        } else if (e.code === 'Escape' && showManual) {
          setShowManual(false);
        }
        return;
      }

      if (screenRef.current === 'map_select') {
        if (e.code === 'Escape') {
          e.preventDefault();
          setScreen(mapReturnScreen);
        }
        return;
      }

      if (screenRef.current === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setScreen('playing');
        }
        return;
      }

      if (screenRef.current === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setScreen('paused');
        } else if (e.code === 'Space') {
          e.preventDefault();
          handleToggleCombat();
        } else if (e.code === 'KeyM') {
          e.preventDefault();
          handleToggleMute();
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          battlefieldAudio.playUiClick(520);
          reset3DCamera();
        } else if (e.code === 'KeyQ') {
          setFaction('blue');
        } else if (e.code === 'KeyE') {
          setFaction('red');
        } else if (e.code === 'KeyX') {
          setCategory('erase');
        } else if (e.code === 'Digit1') {
          setCategory('infantry');
          setSoldierType('line');
        } else if (e.code === 'Digit2') {
          setCategory('infantry');
          setSoldierType('skirmisher');
        } else if (e.code === 'Digit3') {
          setCategory('infantry');
          setSoldierType('grenadier');
        } else if (e.code === 'Digit4') {
          setCategory('infantry');
          setSoldierType('officer');
        } else if (e.code === 'Digit5') {
          setCategory('build');
          setStructureType('sandbag');
        } else if (e.code === 'Digit6') {
          setCategory('build');
          setStructureType('barricade');
        } else if (e.code === 'Digit7') {
          setCategory('build');
          setStructureType('stone_wall');
        } else if (e.code === 'Digit8') {
          setCategory('build');
          setStructureType('powder_keg');
        } else if (e.code === 'Digit9') {
          setCategory('build');
          setStructureType('cannon');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.code);
    };

    const clearHeld = () => {
      keysPressedRef.current.clear();
      dragPanRef.current.active = false;
      orbitDragRef.current.active = false;
      erasingDragRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', clearHeld);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', clearHeld);
    };
  }, [showManual, mapReturnScreen, handleToggleCombat, handleToggleMute, reset3DCamera]);

  // 3D Viewport pointer handlers
  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (screen !== 'playing') return;
    battlefieldAudio.unlock();

    // Middle click or Alt+Left click starts horizontal 3D camera pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      dragPanRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      return;
    }

    // Shift + Left click starts 3D orbit/tilt
    if (e.button === 0 && e.shiftKey) {
      e.preventDefault();
      orbitDragRef.current = {
        active: true,
        button: 0,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: true,
      };
      return;
    }

    // Right mouse button: drag > 5px orbits 3D camera; short click erases
    if (e.button === 2) {
      e.preventDefault();
      orbitDragRef.current = {
        active: true,
        button: 2,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      };
      return;
    }

    const pt = screenToWorld(e.clientX, e.clientY);

    if (e.button === 0) {
      if (category === 'erase') {
        erasingDragRef.current = true;
        if (eraseAt(simRef.current, pt.x, pt.y, 34)) {
          battlefieldAudio.playUiClick(320);
          refreshCountsNow();
        }
      } else if (category === 'infantry') {
        const spawned = spawnFormation(
          simRef.current,
          soldierType,
          faction,
          pt.x,
          pt.y,
          formation
        );
        if (spawned.length > 0) {
          battlefieldAudio.playDeploy(false);
          battlefieldAudio.playDeployVoice(soldierType, faction);
          refreshCountsNow();
        }
      } else if (category === 'build') {
        spawnStructure(simRef.current, structureType, faction, pt.x, pt.y);
        battlefieldAudio.playDeploy(true);
        refreshCountsNow();
      }
    }
  };

  const handleViewportMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const scene3d = scene3dRef.current;

    if (orbitDragRef.current.active && scene3d) {
      const dx = e.clientX - orbitDragRef.current.lastX;
      const dy = e.clientY - orbitDragRef.current.lastY;
      orbitDragRef.current.lastX = e.clientX;
      orbitDragRef.current.lastY = e.clientY;
      if (
        !orbitDragRef.current.moved &&
        Math.hypot(
          e.clientX - orbitDragRef.current.startX,
          e.clientY - orbitDragRef.current.startY
        ) > 5
      ) {
        orbitDragRef.current.moved = true;
      }
      if (orbitDragRef.current.moved) {
        scene3d.targetRig.azimuth -= dx * 0.0065;
        scene3d.targetRig.polar = Math.max(
          0.32,
          Math.min(1.15, scene3d.targetRig.polar - dy * 0.0055)
        );
        return;
      }
    }

    if (dragPanRef.current.active && scene3d) {
      const dx = e.clientX - dragPanRef.current.lastX;
      const dy = e.clientY - dragPanRef.current.lastY;
      dragPanRef.current.lastX = e.clientX;
      dragPanRef.current.lastY = e.clientY;

      const az = scene3d.currentRig.azimuth;
      const sinA = Math.sin(az);
      const cosA = Math.cos(az);
      const panScale = (scene3d.targetRig.distance / 110) * 1.15;
      const dSimX = (-dx * cosA + dy * sinA) * panScale;
      const dSimY = (dx * sinA - dy * cosA) * panScale;

      scene3d.targetRig.targetX = Math.max(
        0,
        Math.min(WORLD_WIDTH, scene3d.targetRig.targetX + dSimX)
      );
      scene3d.targetRig.targetY = Math.max(
        0,
        Math.min(WORLD_HEIGHT, scene3d.targetRig.targetY + dSimY)
      );
      return;
    }

    const pt = screenToWorld(e.clientX, e.clientY);
    hoverRef.current.active = screen === 'playing';
    hoverRef.current.worldX = pt.x;
    hoverRef.current.worldY = pt.y;

    if (erasingDragRef.current && screen === 'playing') {
      if (eraseAt(simRef.current, pt.x, pt.y, 34)) {
        refreshCountsNow();
      }
    }
  };

  const handleViewportMouseUp = (e?: React.MouseEvent<HTMLDivElement>) => {
    if (
      orbitDragRef.current.active &&
      orbitDragRef.current.button === 2 &&
      !orbitDragRef.current.moved &&
      e &&
      screen === 'playing'
    ) {
      const pt = screenToWorld(e.clientX, e.clientY);
      if (eraseAt(simRef.current, pt.x, pt.y, 34)) {
        battlefieldAudio.playUiClick(320);
        refreshCountsNow();
      }
    }
    dragPanRef.current.active = false;
    orbitDragRef.current.active = false;
    erasingDragRef.current = false;
  };

  const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (screen !== 'playing' || !scene3dRef.current) return;
    const factor = e.deltaY > 0 ? 1.1 : 0.91;
    scene3dRef.current.targetRig.distance = Math.max(
      38,
      Math.min(185, scene3dRef.current.targetRig.distance * factor)
    );
  };

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#141712]">
      <div
        ref={viewportRef}
        data-testid="battlefield-canvas"
        onMouseDown={handleViewportMouseDown}
        onMouseMove={handleViewportMouseMove}
        onMouseUp={handleViewportMouseUp}
        onMouseLeave={() => {
          hoverRef.current.active = false;
          handleViewportMouseUp();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleViewportWheel}
        className={`relative w-full h-full ${
          screen === 'playing'
            ? category === 'erase'
              ? 'cursor-not-allowed'
              : 'cursor-crosshair'
            : 'cursor-default'
        }`}
      >
        {/* 3D Terrain, Rivers, Bridges, Ruins, Trees & 3D Structures */}
        <div ref={threeMountRef} className="absolute inset-0" />

        {/* 2D Infantry Regiments, Corpses, Projectiles, Particles & Weather */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 pointer-events-none block w-full h-full"
        />
      </div>

      {screen === 'title' && (
        <MainMenu
          muted={muted}
          onPlay={() => {
            battlefieldAudio.unlock();
            battlefieldAudio.playUiClick(560);
            setMapReturnScreen('title');
            setScreen('map_select');
          }}
          onOpenManual={() => {
            battlefieldAudio.unlock();
            battlefieldAudio.playUiClick(500);
            setShowManual(true);
          }}
          onToggleMute={handleToggleMute}
        />
      )}

      {screen === 'map_select' && (
        <MapSelectModal
          selectedMapId={mapId}
          selectedWeather={weather}
          onSelectMap={(id) => {
            battlefieldAudio.playUiClick(520);
            setMapId(id);
          }}
          onSelectWeather={(w) => {
            battlefieldAudio.playUiClick(500);
            setWeather(w);
          }}
          onDeploy={handleDeployToBattlefield}
          onClose={() => {
            battlefieldAudio.playUiClick(420);
            setScreen(mapReturnScreen);
          }}
        />
      )}

      {screen === 'playing' && (
        <GameHud
          mapId={mapId}
          weather={weather}
          combatActive={combatActive}
          simSpeed={simSpeed}
          muted={muted}
          blueCount={counts.blue}
          redCount={counts.red}
          faction={faction}
          category={category}
          soldierType={soldierType}
          structureType={structureType}
          formation={formation}
          onToggleCombat={handleToggleCombat}
          onToggleSpeed={() => {
            battlefieldAudio.playUiClick(540);
            setSimSpeed((s) => (s === 1 ? 2 : 1));
          }}
          onChangeWeather={handleChangeWeather}
          onLoadPreset={handleLoadPreset}
          onClearField={handleClearField}
          onOpenMaps={() => {
            battlefieldAudio.playUiClick(500);
            setMapReturnScreen('playing');
            setScreen('map_select');
          }}
          onResetCamera={() => {
            battlefieldAudio.playUiClick(520);
            reset3DCamera();
          }}
          onToggleMute={handleToggleMute}
          onOpenPause={() => {
            battlefieldAudio.playUiClick(440);
            setScreen('paused');
          }}
          onChangeFaction={(f) => {
            battlefieldAudio.playUiClick(520);
            setFaction(f);
          }}
          onChangeCategory={(c) => {
            battlefieldAudio.playUiClick(510);
            setCategory(c);
          }}
          onSelectSoldier={(t) => {
            battlefieldAudio.playUiClick(530);
            setCategory('infantry');
            setSoldierType(t);
          }}
          onSelectStructure={(t) => {
            battlefieldAudio.playUiClick(530);
            setCategory('build');
            setStructureType(t);
          }}
          onChangeFormation={(m) => {
            battlefieldAudio.playUiClick(500);
            setFormation(m);
          }}
        />
      )}

      {screen === 'paused' && (
        <PauseModal
          blueCount={counts.blue}
          redCount={counts.red}
          blueKills={counts.blueKills}
          redKills={counts.redKills}
          onResume={() => {
            battlefieldAudio.playUiClick(540);
            setScreen('playing');
          }}
          onRestartPreset={() => {
            handleLoadPreset();
            setScreen('playing');
          }}
          onChangeMap={() => {
            battlefieldAudio.playUiClick(500);
            setMapReturnScreen('paused');
            setScreen('map_select');
          }}
          onMainMenu={() => {
            battlefieldAudio.playUiClick(420);
            setupSkirmishPreset(simRef.current);
            simRef.current.combatActive = true;
            setScreen('title');
          }}
        />
      )}

      {showManual && (
        <FieldManualModal
          onClose={() => {
            battlefieldAudio.playUiClick(440);
            setShowManual(false);
          }}
        />
      )}

      {crash && (
        <CrashReportScreen
          crash={crash}
          onRecover={handleRecoverFromCrash}
          onReload={() => window.location.reload()}
        />
      )}
    </main>
  );
}
