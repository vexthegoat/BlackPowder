import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getMapById, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import { ParticlePool } from './particles';
import {
  getAtmosphereConfig,
  SIM_TO_3D,
  simToWorld3D,
  terrainHeightAt,
  WORLD_3D_HEIGHT,
  WORLD_3D_WIDTH,
  world3DToSim,
} from './terrain3d';
import { MapConfig, Structure, StructureType, WeatherType } from './types';

export interface Camera3DRig {
  targetX: number; // simulation X center (0..1800)
  targetY: number; // simulation Y center (0..1000)
  azimuth: number; // radians around Y (0 = standard south-facing view)
  polar: number; // radians from vertical (0.32..1.15)
  distance: number; // 3D distance from target (38..195)
}

export type SoldierVisibility = 'full' | 'waist_up' | 'head_only' | 'hidden';

export interface ProjectedPoint {
  sx: number;
  sy: number;
  ndcZ: number;
  scale: number;
  visible: boolean;
}

const _projVec = new THREE.Vector3();
const _ndcVec = new THREE.Vector2();
const _hitPt = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _skyTargetColor = new THREE.Color();
const _fogTargetColor = new THREE.Color();
const _sunTargetColor = new THREE.Color();
const _hemiSkyColor = new THREE.Color();
const _hemiGroundColor = new THREE.Color();

function createProceduralTurfTexture(
  map: MapConfig,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 512, 512);

  let seed = 4242;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Subtle organic turf & soil mottling (multiplied by vertex colors)
  for (let i = 0; i < 650; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 4 + rand() * 18;
    const v = 195 + Math.floor(rand() * 48);
    ctx.fillStyle = `rgba(${v},${v},${v},0.22)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine grass / snow grain strokes
  ctx.strokeStyle = map.id === 'winter_crossroads' ? 'rgba(255,255,255,0.28)' : 'rgba(60,72,48,0.22)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 900; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 5);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 11);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createWaterRippleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#33627a';
  ctx.fillRect(0, 0, 256, 256);

  let seed = 9001;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 120; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.strokeStyle = `rgba(185, 228, 245, ${0.14 + rand() * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 10, y + 12, x + 2, y + 26);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) {
        mat[i].dispose();
      }
    } else if (mat) {
      mat.dispose();
    }
  });
}

function buildCompositeTree(isWinter: boolean, radiusScale: number): THREE.Group {
  const g = new THREE.Group();
  const s = radiusScale;

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x4d3622,
    roughness: 0.92,
    metalness: 0.02,
  });

  // 1. Flared root base
  const rootMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45 * s, 0.78 * s, 0.75 * s, 7),
    barkMat
  );
  rootMesh.position.y = 0.35 * s;
  rootMesh.castShadow = true;
  rootMesh.receiveShadow = true;
  g.add(rootMesh);

  // 2. Main trunk
  const trunkMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28 * s, 0.48 * s, 2.8 * s, 7),
    barkMat
  );
  trunkMesh.position.y = 1.7 * s;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  g.add(trunkMesh);

  if (isWinter) {
    // 3-6. Snow-dusted tiered pine cones
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0x294a3d,
      roughness: 0.86,
      metalness: 0.02,
    });
    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xe6eff5,
      roughness: 0.65,
      metalness: 0.02,
    });
    const tiers = [
      { y: 2.8, r: 2.2, h: 2.3 },
      { y: 4.1, r: 1.7, h: 2.0 },
      { y: 5.2, r: 1.15, h: 1.7 },
    ];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(t.r * s, t.h * s, 8),
        pineMat
      );
      cone.position.y = t.y * s;
      cone.castShadow = true;
      cone.receiveShadow = true;
      g.add(cone);

      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(t.r * 0.72 * s, t.h * 0.42 * s, 8),
        snowMat
      );
      cap.position.y = (t.y + t.h * 0.28) * s;
      g.add(cap);
    }
  } else {
    // 3-6. Organic clustered oak/elm canopy
    const leafDark = new THREE.MeshStandardMaterial({
      color: 0x2d4e28,
      roughness: 0.85,
      metalness: 0.02,
    });
    const leafBright = new THREE.MeshStandardMaterial({
      color: 0x3f6934,
      roughness: 0.82,
      metalness: 0.02,
    });

    const puffs = [
      { x: 0, y: 3.6, z: 0, r: 1.9, mat: leafDark },
      { x: -0.95, y: 3.1, z: 0.65, r: 1.35, mat: leafBright },
      { x: 0.9, y: 3.2, z: -0.55, r: 1.4, mat: leafDark },
      { x: 0.15, y: 4.4, z: 0.25, r: 1.25, mat: leafBright },
    ];
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      const canopy = new THREE.Mesh(
        new THREE.DodecahedronGeometry(p.r * s, 1),
        p.mat
      );
      canopy.position.set(p.x * s, p.y * s, p.z * s);
      canopy.scale.set(1.05, 0.86, 1.0);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      g.add(canopy);
    }
  }

  return g;
}

function buildCompositeStoneRuin(w3d: number, d3d: number): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7f796f,
    roughness: 0.88,
    metalness: 0.05,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x5c574f,
    roughness: 0.94,
    metalness: 0.04,
  });

  // 1. Stone foundation plinth
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w3d + 0.5, 0.6, d3d + 0.5),
    darkStoneMat
  );
  plinth.position.y = 0.25;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  g.add(plinth);

  // 2. Main ashlar wall block (taller than 2.4u standing infantry)
  const wallH = 3.4;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(w3d, wallH, d3d),
    stoneMat
  );
  wall.position.y = 0.5 + wallH * 0.5;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  // 3-5. Broken battlements / capstones along the ruin crest
  const segCount = Math.max(2, Math.round(Math.max(w3d, d3d) / 3.2));
  const alongZ = d3d >= w3d;
  for (let i = 0; i < segCount; i++) {
    if (i % 2 === 1 && segCount > 2) continue;
    const t = (i + 0.5) / segCount - 0.5;
    const blockW = alongZ ? w3d * 0.86 : (w3d / segCount) * 0.72;
    const blockD = alongZ ? (d3d / segCount) * 0.72 : d3d * 0.86;
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(blockW, 0.85, blockD),
      i === 0 ? darkStoneMat : stoneMat
    );
    cap.position.set(
      alongZ ? 0 : t * w3d * 0.85,
      0.5 + wallH + 0.35,
      alongZ ? t * d3d * 0.85 : 0
    );
    cap.castShadow = true;
    cap.receiveShadow = true;
    g.add(cap);
  }

  // 6. Rubble stone beside wall base
  const rubble = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.85, 0),
    darkStoneMat
  );
  rubble.position.set(w3d * 0.58, 0.35, d3d * 0.2);
  rubble.scale.set(1.2, 0.65, 1.0);
  rubble.castShadow = true;
  rubble.receiveShadow = true;
  g.add(rubble);

  return g;
}

function buildCompositeBridge(w3d: number, d3d: number): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x998e7c,
    roughness: 0.86,
    metalness: 0.04,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x6c6356,
    roughness: 0.92,
    metalness: 0.05,
  });

  // 1-2. Stone bridge piers anchored into riverbed
  for (const px of [-w3d * 0.28, w3d * 0.28]) {
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 4.2, d3d * 0.94),
      trimMat
    );
    pier.position.set(px, -1.35, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    g.add(pier);
  }

  // 3-7. Arched deck segments matching terrainHeightAt bridge profile
  const segs = 7;
  const segW = w3d / segs;
  for (let i = 0; i < segs; i++) {
    const u = (i + 0.5) / segs;
    const archY = 0.55 + Math.sin(u * Math.PI) * 0.95;
    const slopeAngle = Math.cos(u * Math.PI) * 0.14;

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(segW + 0.25, 0.65, d3d),
      stoneMat
    );
    deck.position.set((u - 0.5) * w3d, archY - 0.34, 0);
    deck.rotation.z = slopeAngle;
    deck.receiveShadow = true;
    deck.castShadow = true;
    g.add(deck);

    // Side parapet walls
    for (const side of [-1, 1]) {
      const parapet = new THREE.Mesh(
        new THREE.BoxGeometry(segW + 0.2, 0.95, 0.85),
        trimMat
      );
      parapet.position.set(
        (u - 0.5) * w3d,
        archY + 0.35,
        side * (d3d * 0.5 - 0.42)
      );
      parapet.rotation.z = slopeAngle;
      parapet.castShadow = true;
      parapet.receiveShadow = true;
      g.add(parapet);
    }
  }

  return g;
}

function buildStructureGroup(st: Structure): {
  group: THREE.Group;
  barrel?: THREE.Group;
  fuse?: THREE.Mesh;
  materialsToFlash: THREE.MeshStandardMaterial[];
} {
  const g = new THREE.Group();
  const materialsToFlash: THREE.MeshStandardMaterial[] = [];

  if (st.type === 'sandbag') {
    const bermMat = new THREE.MeshStandardMaterial({
      color: 0x5c4a32,
      roughness: 0.96,
      metalness: 0.02,
    });
    const bagMat = new THREE.MeshStandardMaterial({
      color: 0xb6996a,
      roughness: 0.94,
      metalness: 0.02,
    });
    const darkBagMat = new THREE.MeshStandardMaterial({
      color: 0x947950,
      roughness: 0.95,
      metalness: 0.02,
    });
    materialsToFlash.push(bermMat, bagMat, darkBagMat);

    // Low dug-in earth & trench lip along sideways X axis
    const berm = new THREE.Mesh(
      new THREE.BoxGeometry(4.35, 0.24, 1.85),
      bermMat
    );
    berm.position.set(0, 0.1, 0);
    berm.receiveShadow = true;
    g.add(berm);

    const offsets = [
      { x: -1.38, y: 0.44, z: -0.32, m: bagMat },
      { x: 0, y: 0.44, z: -0.36, m: darkBagMat },
      { x: 1.38, y: 0.44, z: -0.32, m: bagMat },
      { x: -0.72, y: 1.04, z: 0.05, m: darkBagMat },
      { x: 0.72, y: 1.04, z: 0.05, m: bagMat },
    ];
    for (let i = 0; i < offsets.length; i++) {
      const o = offsets[i];
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(1.42, 0.68, 1.02),
        o.m
      );
      bag.position.set(o.x, o.y, o.z);
      bag.castShadow = true;
      bag.receiveShadow = true;
      g.add(bag);
    }
    return { group: g, materialsToFlash };
  }

  if (st.type === 'barricade') {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x734d2a,
      roughness: 0.88,
      metalness: 0.05,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x895e36,
      roughness: 0.84,
      metalness: 0.05,
    });
    materialsToFlash.push(woodMat, railMat);

    for (const xPos of [-1.6, 0, 1.6]) {
      const stakeA = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 3.0, 6),
        woodMat
      );
      stakeA.position.set(xPos, 1.05, 0);
      stakeA.rotation.x = 0.62;
      stakeA.castShadow = true;
      g.add(stakeA);

      const stakeB = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 3.0, 6),
        woodMat
      );
      stakeB.position.set(xPos, 1.05, 0);
      stakeB.rotation.x = -0.62;
      stakeB.castShadow = true;
      g.add(stakeB);
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.55, 0.55),
      railMat
    );
    beam.position.set(0, 1.15, 0);
    beam.castShadow = true;
    beam.receiveShadow = true;
    g.add(beam);

    return { group: g, materialsToFlash };
  }

  if (st.type === 'stone_wall') {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x88837b,
      roughness: 0.9,
      metalness: 0.05,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x6b665e,
      roughness: 0.92,
      metalness: 0.05,
    });
    materialsToFlash.push(wallMat, capMat);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 2.7, 2.5),
      wallMat
    );
    base.position.y = 1.35;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    for (const mx of [-1.7, 0, 1.7]) {
      const merlon = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.8, 2.65),
        capMat
      );
      merlon.position.set(mx, 3.05, 0);
      merlon.castShadow = true;
      merlon.receiveShadow = true;
      g.add(merlon);
    }
    return { group: g, materialsToFlash };
  }

  if (st.type === 'powder_keg') {
    const staveMat = new THREE.MeshStandardMaterial({
      color: 0x7b4a28,
      roughness: 0.84,
      metalness: 0.05,
    });
    const hoopMat = new THREE.MeshStandardMaterial({
      color: 0x2d2f33,
      roughness: 0.42,
      metalness: 0.78,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xc22e28,
      roughness: 0.72,
      metalness: 0.05,
    });
    materialsToFlash.push(staveMat, hazardMat);

    // Lathe barrel silhouette
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 2.35, 12),
      staveMat
    );
    barrel.position.y = 1.18;
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    g.add(barrel);

    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(1.01, 1.01, 0.72, 12),
      hazardMat
    );
    stripe.position.y = 1.18;
    g.add(stripe);

    for (const hy of [0.45, 1.92]) {
      const hoop = new THREE.Mesh(
        new THREE.TorusGeometry(0.98, 0.08, 8, 16),
        hoopMat
      );
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = hy;
      g.add(hoop);
    }
    return { group: g, materialsToFlash };
  }

  // Field Cannon (composite 6-part brass & wood gun with dynamic recoil barrel)
  const carriageMat = new THREE.MeshStandardMaterial({
    color: 0x6b4525,
    roughness: 0.86,
    metalness: 0.05,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x26282c,
    roughness: 0.45,
    metalness: 0.75,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd9aa4c,
    roughness: 0.24,
    metalness: 0.86,
  });
  const factionMat = new THREE.MeshStandardMaterial({
    color: st.faction === 'blue' ? 0x2c5ba8 : 0xb83232,
    roughness: 0.65,
    metalness: 0.1,
  });
  materialsToFlash.push(carriageMat, brassMat);

  const turretPivot = new THREE.Group();

  // Trail & axle
  const trail = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.55, 0.95),
    carriageMat
  );
  trail.position.set(-0.9, 0.72, 0);
  trail.rotation.z = 0.16;
  trail.castShadow = true;
  turretPivot.add(trail);

  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 2.8, 8),
    ironMat
  );
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, 0.85, 0);
  turretPivot.add(axle);

  // Two spoked carriage wheels
  for (const wz of [-1.25, 1.25]) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.14, 8, 16),
      ironMat
    );
    rim.position.set(0, 0.88, wz);
    rim.castShadow = true;
    turretPivot.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.35, 10),
      carriageMat
    );
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 0.88, wz);
    turretPivot.add(hub);
  }

  // Faction emblem plate on carriage
  const emblem = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.35, 1.05),
    factionMat
  );
  emblem.position.set(-1.5, 0.72, 0);
  turretPivot.add(emblem);

  // Recoiling brass barrel sub-group
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0.2, 1.28, 0);

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.46, 3.6, 14),
    brassMat
  );
  tube.rotation.z = -Math.PI / 2;
  tube.position.x = 0.7;
  tube.castShadow = true;
  barrelGroup.add(tube);

  const breechKnob = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 10),
    brassMat
  );
  breechKnob.position.x = -1.25;
  barrelGroup.add(breechKnob);

  const fuseMat = new THREE.MeshBasicMaterial({ color: 0xffcc55 });
  const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), fuseMat);
  fuse.position.set(-0.95, 0.48, 0);
  fuse.visible = false;
  barrelGroup.add(fuse);

  turretPivot.add(barrelGroup);
  g.add(turretPivot);

  return { group: g, barrel: turretPivot, fuse, materialsToFlash };
}

export class BattlefieldScene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly isSoftwareGl: boolean;

  private readonly mountEl: HTMLElement;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;
  private readonly raycaster = new THREE.Raycaster();

  private mapGroup: THREE.Group | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private waterTexture: THREE.CanvasTexture | null = null;
  private currentMapId = '';

  // Persistent ground decals (blood splatters + scorch marks) baked into CanvasTexture draped over 3D terrain
  private decalCanvas: HTMLCanvasElement;
  private decalCtx: CanvasRenderingContext2D;
  private decalTexture: THREE.CanvasTexture;
  private lastBloodCount = -1;
  private lastBloodResetVersion = -1;
  private lastScorchSignature = '';

  // 3D structures keyed by sim structure id
  private readonly structuresGroup = new THREE.Group();
  private readonly structureEntries = new Map<
    number,
    {
      group: THREE.Group;
      type: StructureType;
      barrel?: THREE.Group;
      fuse?: THREE.Mesh;
      materialsToFlash: THREE.MeshStandardMaterial[];
    }
  >();

  // Smooth damped 3D camera rig
  readonly targetRig: Camera3DRig = {
    targetX: WORLD_WIDTH * 0.5,
    targetY: WORLD_HEIGHT * 0.5,
    azimuth: 0,
    polar: 0.74,
    distance: 118,
  };
  readonly currentRig: Camera3DRig = {
    targetX: WORLD_WIDTH * 0.5,
    targetY: WORLD_HEIGHT * 0.5,
    azimuth: 0,
    polar: 0.74,
    distance: 118,
  };

  private viewportW = 1440;
  private viewportH = 900;
  private disposed = false;

  constructor(mountEl: HTMLElement) {
    this.mountEl = mountEl;

    // Software WebGL probe per Three.js skill directive
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7b98b2);
    this.fog = new THREE.FogExp2(0x849aa8, 0.0019);
    this.scene.fog = this.fog;

    // Procedural Studio Environment Map
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // Camera
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 680);

    // 3-point warm/cool outdoor lighting rig (<= 1 shadow caster)
    this.hemiLight = new THREE.HemisphereLight(0xaad0f0, 0x3f4c2f, 0.78);
    this.hemiLight.position.set(0, 60, 0);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffe9c2, 2.1);
    this.keyLight.position.set(65, 95, 55);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 260;
    this.keyLight.shadow.camera.left = -105;
    this.keyLight.shadow.camera.right = 105;
    this.keyLight.shadow.camera.top = 75;
    this.keyLight.shadow.camera.bottom = -75;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x98b8dc, 0.45);
    this.rimLight.position.set(-70, 45, -60);
    this.scene.add(this.rimLight);

    // Ground decal canvas for blood splatters + scorch craters draped over 3D hills
    this.decalCanvas = document.createElement('canvas');
    this.decalCanvas.width = 1024;
    this.decalCanvas.height = 576;
    this.decalCtx = this.decalCanvas.getContext('2d')!;
    this.decalTexture = new THREE.CanvasTexture(this.decalCanvas);
    this.decalTexture.colorSpace = THREE.SRGBColorSpace;
    this.decalTexture.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();

    this.scene.add(this.structuresGroup);
    this.rebuildMap('waterloo');
    this.updateCamera(1, 0);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0 || this.disposed) return;
    this.viewportW = width;
    this.viewportH = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
  }

  resetView(immediate = false): void {
    this.targetRig.targetX = WORLD_WIDTH * 0.5;
    this.targetRig.targetY = WORLD_HEIGHT * 0.5;
    this.targetRig.azimuth = 0;
    this.targetRig.polar = 0.74;
    this.targetRig.distance = 118;
    if (immediate) {
      Object.assign(this.currentRig, this.targetRig);
    }
  }

  rebuildMap(mapId: string): void {
    if (this.currentMapId === mapId && this.mapGroup) return;
    this.currentMapId = mapId;
    const map = getMapById(mapId);

    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      disposeObjectTree(this.mapGroup);
      this.mapGroup = null;
      this.terrainMesh = null;
      this.waterTexture = null;
    }

    const group = new THREE.Group();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // 1. Displaced 3D Terrain Mesh (290x200 extended valley surrounding 180x100 playable zone)
    const extW = 290;
    const extH = 200;
    const segX = 145;
    const segZ = 100;
    const terrainGeo = new THREE.PlaneGeometry(extW, extH, segX, segZ);
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cBase = new THREE.Color(map.palette.groundBase);
    const cAccent = new THREE.Color(map.palette.groundAccent);
    const cRidge = new THREE.Color(map.palette.ridgeColor);
    const cRoad = new THREE.Color(map.palette.roadColor);
    const cMud = new THREE.Color('#5a4e3a');
    const cTmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i);
      const wz = pos.getZ(i);
      const sim = world3DToSim(wx, wz);
      const y = terrainHeightAt(mapId, sim.x, sim.y);
      pos.setY(i, y);

      // Compute vertex color from elevation & terrain features
      const hillBlend = Math.max(0, Math.min(1, y / 3.4));
      cTmp.copy(cBase).lerp(cAccent, (Math.sin(sim.x * 0.02) + 1) * 0.25);
      if (hillBlend > 0.15) {
        cTmp.lerp(cRidge, Math.min(1, hillBlend * 0.95));
      }

      // Roads & riverbanks
      for (let fIdx = 0; fIdx < map.features.length; fIdx++) {
        const f = map.features[fIdx];
        if (f.kind === 'road') {
          if (
            sim.x >= f.x - 6 &&
            sim.x <= f.x + f.width + 6 &&
            sim.y >= f.y &&
            sim.y <= f.y + f.height
          ) {
            cTmp.copy(cRoad);
          }
        } else if (f.kind === 'river') {
          if (sim.x >= f.x - 18 && sim.x <= f.x + f.width + 18) {
            cTmp.lerp(cMud, 0.85);
          }
        }
      }

      // Subtle darker valley border fade outside playable area
      const outX = Math.max(-sim.x, 0, sim.x - WORLD_WIDTH);
      const outY = Math.max(-sim.y, 0, sim.y - WORLD_HEIGHT);
      const outD = Math.hypot(outX, outY);
      if (outD > 10) {
        cTmp.lerp(cAccent, Math.min(0.65, outD / 350));
      }

      colors[i * 3] = cTmp.r;
      colors[i * 3 + 1] = cTmp.g;
      colors[i * 3 + 2] = cTmp.b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const turfTex = createProceduralTurfTexture(map, maxAniso);
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: turfTex,
      roughness: map.id === 'winter_crossroads' ? 0.78 : 0.92,
      metalness: 0.02,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);
    this.terrainMesh = terrainMesh;

    // Playable battlefield subtle brass/timber surveyor border stakes or outline
    const borderGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(WORLD_3D_WIDTH, 0.1, WORLD_3D_HEIGHT)
    );
    const borderMat = new THREE.LineBasicMaterial({
      color: 0xc8a45d,
      transparent: true,
      opacity: 0.22,
    });
    const borderLines = new THREE.LineSegments(borderGeo, borderMat);
    borderLines.position.y = 0.06;
    group.add(borderLines);

    // 2. Draped Decal Overlay Mesh (blood splatters + scorch craters)
    const decalGeo = new THREE.PlaneGeometry(
      WORLD_3D_WIDTH,
      WORLD_3D_HEIGHT,
      90,
      50
    );
    decalGeo.rotateX(-Math.PI / 2);
    const dPos = decalGeo.attributes.position;
    for (let i = 0; i < dPos.count; i++) {
      const wx = dPos.getX(i);
      const wz = dPos.getZ(i);
      const sim = world3DToSim(wx, wz);
      dPos.setY(i, terrainHeightAt(mapId, sim.x, sim.y) + 0.045);
    }
    decalGeo.computeVertexNormals();
    const decalMat = new THREE.MeshBasicMaterial({
      map: this.decalTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
    group.add(decalMesh);

    // 3. 3D Features: River Water, Bridges, Stone Ruins, Playable Trees
    const isWinter = map.id === 'winter_crossroads';
    for (let i = 0; i < map.features.length; i++) {
      const f = map.features[i];
      const cxSim = f.x + f.width * 0.5;
      const cySim = f.y + f.height * 0.5;
      const pos3d = simToWorld3D(cxSim, cySim);

      if (f.kind === 'river') {
        const w3d = f.width * SIM_TO_3D + 2.4;
        const h3d = 210;
        const waterTex = createWaterRippleTexture(maxAniso);
        this.waterTexture = waterTex;
        const waterMat = new THREE.MeshStandardMaterial({
          map: waterTex,
          color: new THREE.Color(map.palette.waterColor).multiplyScalar(1.2),
          roughness: 0.18,
          metalness: 0.15,
          transparent: true,
          opacity: 0.88,
        });
        const waterMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(w3d, h3d),
          waterMat
        );
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.set(pos3d.x, -0.78, 0);
        waterMesh.receiveShadow = true;
        group.add(waterMesh);
      } else if (f.kind === 'bridge') {
        const bridge = buildCompositeBridge(
          f.width * SIM_TO_3D,
          f.height * SIM_TO_3D
        );
        bridge.position.set(pos3d.x, 0, pos3d.z);
        group.add(bridge);
      } else if (f.kind === 'stone_ruin') {
        const ruin = buildCompositeStoneRuin(
          f.width * SIM_TO_3D,
          f.height * SIM_TO_3D
        );
        const gy = terrainHeightAt(mapId, cxSim, cySim);
        ruin.position.set(pos3d.x, gy - 0.15, pos3d.z);
        group.add(ruin);
      } else if (f.kind === 'tree') {
        const tree = buildCompositeTree(isWinter, (f.width / 56) * 1.12);
        const gy = terrainHeightAt(mapId, cxSim, cySim);
        tree.position.set(pos3d.x, gy - 0.1, pos3d.z);
        tree.rotation.y = ((f.x * 13 + f.y * 7) % 628) / 100;
        group.add(tree);
      }
    }

    // 4. Instanced Perimeter Forest Grove (frames the valley naturally without rectangular walls)
    const perimCount = 72;
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.56, 3.0, 6);
    trunkGeo.translate(0, 1.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4b3522,
      roughness: 0.92,
    });
    const crownGeo = isWinter
      ? new THREE.ConeGeometry(2.1, 4.6, 7)
      : new THREE.DodecahedronGeometry(2.1, 1);
    crownGeo.translate(0, isWinter ? 4.4 : 4.1, 0);
    const crownMat = new THREE.MeshStandardMaterial({
      color: isWinter ? 0x2c4b3e : 0x365c2e,
      roughness: 0.85,
    });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, perimCount);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, perimCount);
    trunks.castShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let pSeed = 777;
    const prand = () => {
      pSeed = (pSeed * 1664525 + 1013904223) >>> 0;
      return pSeed / 4294967296;
    };

    for (let i = 0; i < perimCount; i++) {
      // Place trees around the outer ring beyond playable bounds
      const angle = (i / perimCount) * Math.PI * 2 + prand() * 0.12;
      const rx = 98 + prand() * 34;
      const rz = 58 + prand() * 30;
      const wx = Math.cos(angle) * rx;
      const wz = Math.sin(angle) * rz;
      const sim = world3DToSim(wx, wz);
      const gy = terrainHeightAt(mapId, sim.x, sim.y);
      const scale = 0.88 + prand() * 0.42;

      dummy.position.set(wx, gy - 0.15, wz);
      dummy.rotation.set(0, prand() * Math.PI * 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();

      trunks.setMatrixAt(i, dummy.matrix);
      crowns.setMatrixAt(i, dummy.matrix);

      const shade = 0.85 + prand() * 0.3;
      tint
        .setHex(isWinter ? 0x2f5446 : 0x3a6432)
        .multiplyScalar(shade);
      crowns.setColorAt(i, tint);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    group.add(trunks);
    group.add(crowns);

    this.scene.add(group);
    this.mapGroup = group;

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  syncDecals(pool: ParticlePool): void {
    const activeScorches: string[] = [];
    for (let i = 0; i < pool.scorchMarks.length; i++) {
      const sm = pool.scorchMarks[i];
      if (sm.active) {
        activeScorches.push(`${sm.x.toFixed(1)},${sm.y.toFixed(1)}`);
      }
    }
    const scorchSig = activeScorches.join('|');

    const needsRedraw =
      this.lastBloodResetVersion !== pool.bloodResetVersion ||
      this.lastBloodCount > pool.bloodSplatters.length ||
      this.lastScorchSignature !== scorchSig;

    if (!needsRedraw && this.lastBloodCount === pool.bloodSplatters.length) {
      return;
    }

    const ctx = this.decalCtx;
    const cw = this.decalCanvas.width;
    const ch = this.decalCanvas.height;
    const sx = cw / WORLD_WIDTH;
    const sy = ch / WORLD_HEIGHT;

    if (needsRedraw) {
      ctx.clearRect(0, 0, cw, ch);

      // Draw scorch craters
      for (let i = 0; i < pool.scorchMarks.length; i++) {
        const sm = pool.scorchMarks[i];
        if (!sm.active) continue;
        ctx.save();
        ctx.translate(sm.x * sx, sm.y * sy);
        ctx.rotate(sm.seed);
        ctx.fillStyle = `rgba(20, 16, 12, ${sm.alpha * 0.45})`;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          sm.radius * 1.32 * sx,
          sm.radius * 0.96 * sy,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = `rgba(12, 9, 7, ${sm.alpha * 0.7})`;
        ctx.beginPath();
        ctx.ellipse(
          1,
          0.5,
          sm.radius * 0.68 * sx,
          sm.radius * 0.5 * sy,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }

      this.lastBloodCount = 0;
      this.lastBloodResetVersion = pool.bloodResetVersion;
      this.lastScorchSignature = scorchSig;
    }

    // Incrementally stamp new permanent blood splatters
    for (let i = this.lastBloodCount; i < pool.bloodSplatters.length; i++) {
      const b = pool.bloodSplatters[i];
      ctx.save();
      ctx.translate(b.x * sx, b.y * sy);
      ctx.rotate(b.rotation);
      ctx.fillStyle = `rgba(${b.r},${b.g},${b.b},${b.alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.radiusX * sx, b.radiusY * sy, 0, 0, Math.PI * 2);
      ctx.fill();
      if (b.radiusX > 5) {
        ctx.fillStyle = `rgba(48, 6, 8, ${b.alpha * 0.48})`;
        ctx.beginPath();
        ctx.ellipse(
          0.5,
          0.3,
          b.radiusX * 0.56 * sx,
          b.radiusY * 0.52 * sy,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();
    }

    this.lastBloodCount = pool.bloodSplatters.length;
    this.decalTexture.needsUpdate = true;
  }

  syncStructures(
    structures: Structure[],
    mapId: string,
    time: number
  ): void {
    const aliveIds = new Set<number>();

    for (let i = 0; i < structures.length; i++) {
      const st = structures[i];
      if (st.state === 'destroyed') continue;
      aliveIds.add(st.id);

      let entry = this.structureEntries.get(st.id);
      if (!entry || entry.type !== st.type) {
        if (entry) {
          this.structuresGroup.remove(entry.group);
          disposeObjectTree(entry.group);
        }
        const built = buildStructureGroup(st);
        entry = { ...built, type: st.type };
        this.structuresGroup.add(entry.group);
        this.structureEntries.set(st.id, entry);
      }

      const wPos = simToWorld3D(st.x, st.y);
      const gy = terrainHeightAt(mapId, st.x, st.y);
      entry.group.position.set(wPos.x, gy, wPos.z);

      if (st.type === 'sandbag' || st.type === 'barricade' || st.type === 'stone_wall') {
        // Sideways orientation: wide wall face runs horizontally (east-west along world X)
        entry.group.rotation.y = Math.abs(st.angle) > Math.PI * 0.5 ? Math.PI : 0;
      }

      if (st.type === 'cannon' && entry.barrel) {
        entry.barrel.rotation.y = -st.angle;
        const kick = st.recoil * 0.95;
        entry.barrel.position.set(
          -Math.cos(st.angle) * kick,
          0,
          -Math.sin(st.angle) * kick
        );
        if (entry.fuse) {
          entry.fuse.visible = st.state === 'aiming';
          const pulse = 0.8 + Math.sin(time * 28) * 0.35;
          entry.fuse.scale.setScalar(pulse);
        }
      }

      // Hit flash feedback on 3D structures
      const flashAmt = st.hitFlash > 0.05 ? st.hitFlash * 0.65 : 0;
      for (let m = 0; m < entry.materialsToFlash.length; m++) {
        entry.materialsToFlash[m].emissive.setRGB(flashAmt, flashAmt * 0.85, flashAmt * 0.65);
      }
    }

    for (const [id, entry] of this.structureEntries.entries()) {
      if (!aliveIds.has(id)) {
        this.structuresGroup.remove(entry.group);
        disposeObjectTree(entry.group);
        this.structureEntries.delete(id);
      }
    }
  }

  updateAtmosphere(
    mapId: string,
    weather: WeatherType,
    lightningFlash: number,
    dt: number
  ): void {
    const cfg = getAtmosphereConfig(mapId, weather);

    _skyTargetColor.setHex(cfg.skyHex);
    _fogTargetColor.setHex(cfg.fogHex);
    _sunTargetColor.setHex(cfg.sunHex);
    _hemiSkyColor.setHex(cfg.hemiSkyHex);
    _hemiGroundColor.setHex(cfg.hemiGroundHex);

    if (lightningFlash > 0.02) {
      const flashMix = Math.min(0.85, lightningFlash * 0.75);
      _skyTargetColor.lerp(new THREE.Color(0xdbe8ff), flashMix);
      _fogTargetColor.lerp(new THREE.Color(0xcce0ff), flashMix * 0.7);
    }

    const bg = this.scene.background as THREE.Color;
    bg.lerp(_skyTargetColor, Math.min(1, dt * 8 + 0.15));
    this.fog.color.lerp(_fogTargetColor, Math.min(1, dt * 8 + 0.15));
    this.fog.density = THREE.MathUtils.damp(
      this.fog.density,
      cfg.fogDensity,
      6,
      dt
    );

    this.keyLight.color.copy(_sunTargetColor);
    this.keyLight.intensity =
      cfg.sunIntensity + lightningFlash * 2.4;
    this.hemiLight.color.copy(_hemiSkyColor);
    this.hemiLight.groundColor.copy(_hemiGroundColor);
    this.hemiLight.intensity = cfg.hemiIntensity + lightningFlash * 0.7;

    if (this.waterTexture) {
      this.waterTexture.offset.y -= dt * 0.42;
    }
  }

  updateCamera(dt: number, cameraShake: number): void {
    const lambda = 12;
    this.currentRig.targetX = THREE.MathUtils.damp(
      this.currentRig.targetX,
      this.targetRig.targetX,
      lambda,
      dt
    );
    this.currentRig.targetY = THREE.MathUtils.damp(
      this.currentRig.targetY,
      this.targetRig.targetY,
      lambda,
      dt
    );
    this.currentRig.azimuth = THREE.MathUtils.damp(
      this.currentRig.azimuth,
      this.targetRig.azimuth,
      lambda,
      dt
    );
    this.currentRig.polar = THREE.MathUtils.damp(
      this.currentRig.polar,
      this.targetRig.polar,
      lambda,
      dt
    );
    this.currentRig.distance = THREE.MathUtils.damp(
      this.currentRig.distance,
      this.targetRig.distance,
      lambda,
      dt
    );

    const tgtWorld = simToWorld3D(
      this.currentRig.targetX,
      this.currentRig.targetY
    );
    const tgtY = terrainHeightAt(
      this.currentMapId,
      this.currentRig.targetX,
      this.currentRig.targetY
    ) * 0.35;

    const shakeMag = cameraShake * cameraShake * 1.4;
    const sx = shakeMag > 0.02 ? (Math.random() - 0.5) * shakeMag : 0;
    const sy = shakeMag > 0.02 ? (Math.random() - 0.5) * shakeMag : 0;

    const sinP = Math.sin(this.currentRig.polar);
    const cosP = Math.cos(this.currentRig.polar);
    const sinA = Math.sin(this.currentRig.azimuth);
    const cosA = Math.cos(this.currentRig.azimuth);

    const camX = tgtWorld.x + this.currentRig.distance * sinP * sinA + sx;
    const camY = tgtY + this.currentRig.distance * cosP + sy;
    const camZ = tgtWorld.z + this.currentRig.distance * sinP * cosA;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(tgtWorld.x + sx * 0.5, tgtY, tgtWorld.z + sy * 0.5);
    this.camera.updateMatrixWorld();
  }

  raycastGround(
    clientX: number,
    clientY: number,
    rect: DOMRect
  ): { x: number; y: number } {
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.5 };
    }
    _ndcVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndcVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_ndcVec, this.camera);
    if (this.terrainMesh) {
      const hits = this.raycaster.intersectObject(this.terrainMesh, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        return world3DToSim(pt.x, pt.z);
      }
    }

    if (this.raycaster.ray.intersectPlane(_groundPlane, _hitPt)) {
      return world3DToSim(_hitPt.x, _hitPt.z);
    }

    return { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.5 };
  }

  projectSimToScreen(
    simX: number,
    simY: number,
    height3D: number,
    out: ProjectedPoint
  ): void {
    const wPos = simToWorld3D(simX, simY);
    const gy = terrainHeightAt(this.currentMapId, simX, simY) + height3D;
    _projVec.set(wPos.x, gy, wPos.z);

    const camDist = _projVec.distanceTo(this.camera.position);
    _projVec.project(this.camera);

    out.sx = ((_projVec.x + 1) * 0.5) * this.viewportW;
    out.sy = ((-_projVec.y + 1) * 0.5) * this.viewportH;
    out.ndcZ = _projVec.z;

    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const worldUnitsPerPixel =
      (2 * tanHalfFov * Math.max(4, camDist)) / Math.max(1, this.viewportH);
    out.scale = SIM_TO_3D / Math.max(0.001, worldUnitsPerPixel);
    out.visible =
      _projVec.z >= -1 &&
      _projVec.z <= 1.02 &&
      out.sx >= -120 &&
      out.sx <= this.viewportW + 120 &&
      out.sy >= -120 &&
      out.sy <= this.viewportH + 120;
  }

  private rayHitsBox3D(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number
  ): boolean {
    let tmin = 0.005;
    let tmax = 0.985;

    const axes: Array<[number, number, number, number]> = [
      [ox, dx, minX, maxX],
      [oy, dy, minY, maxY],
      [oz, dz, minZ, maxZ],
    ];

    for (let i = 0; i < 3; i++) {
      const [o, d, bMin, bMax] = axes[i];
      if (Math.abs(d) < 1e-7) {
        if (o < bMin || o > bMax) return false;
      } else {
        const inv = 1 / d;
        let t1 = (bMin - o) * inv;
        let t2 = (bMax - o) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return false;
      }
    }
    return tmax >= tmin;
  }

  isPointOccluded3D(
    simX: number,
    simY: number,
    height3D: number,
    structures: Structure[]
  ): boolean {
    const wPos = simToWorld3D(simX, simY);
    const ty = terrainHeightAt(this.currentMapId, simX, simY) + height3D;
    const ox = this.camera.position.x;
    const oy = this.camera.position.y;
    const oz = this.camera.position.z;
    const dx = wPos.x - ox;
    const dy = ty - oy;
    const dz = wPos.z - oz;

    // 1. Check 3D terrain ridge/hill occlusion along camera ray
    const steps = 14;
    for (let s = 2; s < steps; s++) {
      const t = s / steps;
      const sx3d = ox + dx * t;
      const sy3d = oy + dy * t;
      const sz3d = oz + dz * t;
      const simPt = world3DToSim(sx3d, sz3d);
      const groundY = terrainHeightAt(this.currentMapId, simPt.x, simPt.y);
      if (sy3d < groundY - 0.16) {
        return true;
      }
    }

    // 2. Check map stone_ruin walls (plinth + full ashlar height)
    const map = getMapById(this.currentMapId);
    for (let i = 0; i < map.features.length; i++) {
      const f = map.features[i];
      if (!f.blocksBullets) continue;
      const minPos = simToWorld3D(f.x, f.y);
      const maxX = minPos.x + f.width * SIM_TO_3D;
      const maxZ = minPos.z + f.height * SIM_TO_3D;
      const cxSim = f.x + f.width * 0.5;
      const cySim = f.y + f.height * 0.5;
      const gy = terrainHeightAt(this.currentMapId, cxSim, cySim) - 0.15;
      if (
        this.rayHitsBox3D(
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
          minPos.x - 0.25,
          gy - 0.65,
          minPos.z - 0.25,
          maxX + 0.25,
          gy + 4.1,
          maxZ + 0.25
        )
      ) {
        return true;
      }
    }

    // 3. Check player-built 3D cover structures (stone_wall, barricade, sandbag)
    for (let i = 0; i < structures.length; i++) {
      const st = structures[i];
      if (st.state === 'destroyed') continue;
      if (st.type !== 'stone_wall' && st.type !== 'barricade' && st.type !== 'sandbag') {
        continue;
      }
      const stPos = simToWorld3D(st.x, st.y);
      const gy = terrainHeightAt(this.currentMapId, st.x, st.y);
      const halfX = st.type === 'stone_wall' ? 2.65 : st.type === 'barricade' ? 2.45 : 2.15;
      const halfZ = st.type === 'stone_wall' ? 1.3 : st.type === 'barricade' ? 0.95 : 1.05;
      const wallTop = st.type === 'stone_wall' ? 3.35 : st.type === 'barricade' ? 1.65 : 1.42;
      if (
        this.rayHitsBox3D(
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
          stPos.x - halfX,
          gy - 0.5,
          stPos.z - halfZ,
          stPos.x + halfX,
          gy + wallTop,
          stPos.z + halfZ
        )
      ) {
        return true;
      }
    }

    return false;
  }

  getSoldierVisibility3D(
    simX: number,
    simY: number,
    isCorpse: boolean,
    structures: Structure[],
    extraHeight3D = 0
  ): SoldierVisibility {
    if (isCorpse && extraHeight3D <= 0.05) {
      return this.isPointOccluded3D(simX, simY, 0.3, structures)
        ? 'hidden'
        : 'full';
    }
    const torsoOcc = this.isPointOccluded3D(
      simX,
      simY,
      1.55 + extraHeight3D,
      structures
    );
    const headOcc = this.isPointOccluded3D(
      simX,
      simY,
      2.75 + extraHeight3D,
      structures
    );
    if (torsoOcc && headOcc) return 'hidden';
    if (torsoOcc) return 'head_only';
    const feetOcc = this.isPointOccluded3D(
      simX,
      simY,
      0.32 + extraHeight3D,
      structures
    );
    if (feetOcc) return 'waist_up';
    return 'full';
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Software WebGL frame pacing: wait for GL commands to finish, then pause briefly
   * so headless Chromium / CPU-rendered contexts never starve the UI thread.
   */
  afterDraw(cb: () => void): number {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          window.setTimeout(() => {
            if (!this.disposed) cb();
          }, 45);
        }
      };
      return window.setTimeout(poll, 5);
    }
    return window.setTimeout(() => {
      if (!this.disposed) cb();
    }, 45);
  }

  dispose(): void {
    this.disposed = true;
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      disposeObjectTree(this.mapGroup);
      this.mapGroup = null;
    }
    for (const entry of this.structureEntries.values()) {
      this.structuresGroup.remove(entry.group);
      disposeObjectTree(entry.group);
    }
    this.structureEntries.clear();
    this.decalTexture.dispose();
    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
