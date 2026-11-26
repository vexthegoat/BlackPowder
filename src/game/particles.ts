import { WEATHER_CONFIGS } from './constants';
import { WeatherType } from './types';

export type ParticleKind =
  | 'smoke'
  | 'flash'
  | 'spark'
  | 'debris'
  | 'shockwave'
  | 'dust'
  | 'glow'
  | 'splash';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  endSize: number;
  age: number;
  maxAge: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
  rotation: number;
  rotSpeed: number;
}

export interface ScorchMark {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  seed: number;
}

export interface BloodSplatter {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
}

export interface WeatherParticle {
  x: number;
  y: number;
  speed: number;
  length: number;
  size: number;
  alpha: number;
  swayOffset: number;
}

const MAX_PARTICLES = 2200;
const MAX_SCORCH_MARKS = 90;
const MAX_WEATHER_PARTICLES = 360;
const MAX_FOG_CLOUDS = 22;

export interface FogCloud {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  speed: number;
  alpha: number;
}

export class ParticlePool {
  readonly pool: Particle[];
  private cursor = 0;

  readonly scorchMarks: ScorchMark[];
  private scorchCursor = 0;

  bloodSplatters: BloodSplatter[] = [];
  bloodResetVersion = 0;

  readonly weatherParticles: WeatherParticle[];
  readonly fogClouds: FogCloud[];

  constructor() {
    this.pool = new Array<Particle>(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool[i] = {
        active: false,
        kind: 'smoke',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 4,
        endSize: 12,
        age: 0,
        maxAge: 1,
        alpha: 1,
        r: 220,
        g: 220,
        b: 220,
        rotation: 0,
        rotSpeed: 0,
      };
    }

    this.scorchMarks = new Array<ScorchMark>(MAX_SCORCH_MARKS);
    for (let i = 0; i < MAX_SCORCH_MARKS; i++) {
      this.scorchMarks[i] = {
        active: false,
        x: 0,
        y: 0,
        radius: 20,
        alpha: 0.5,
        seed: 0,
      };
    }

    this.weatherParticles = new Array<WeatherParticle>(MAX_WEATHER_PARTICLES);
    for (let i = 0; i < MAX_WEATHER_PARTICLES; i++) {
      this.weatherParticles[i] = {
        x: Math.random() * 1800,
        y: Math.random() * 1000,
        speed: 450 + Math.random() * 300,
        length: 14 + Math.random() * 16,
        size: 1.5 + Math.random() * 2.5,
        alpha: 0.25 + Math.random() * 0.45,
        swayOffset: Math.random() * Math.PI * 2,
      };
    }

    this.fogClouds = new Array<FogCloud>(MAX_FOG_CLOUDS);
    for (let i = 0; i < MAX_FOG_CLOUDS; i++) {
      this.fogClouds[i] = {
        x: Math.random() * 2000 - 100,
        y: Math.random() * 1000,
        radiusX: 160 + Math.random() * 220,
        radiusY: 70 + Math.random() * 90,
        speed: 14 + Math.random() * 22,
        alpha: 0.14 + Math.random() * 0.18,
      };
    }
  }

  clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool[i].active = false;
    }
    for (let i = 0; i < MAX_SCORCH_MARKS; i++) {
      this.scorchMarks[i].active = false;
    }
    this.bloodSplatters = [];
    this.bloodResetVersion++;
  }

  private alloc(): Particle {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return p;
  }

  private addScorchMark(x: number, y: number, radius: number, alpha: number): void {
    const sm = this.scorchMarks[this.scorchCursor];
    this.scorchCursor = (this.scorchCursor + 1) % MAX_SCORCH_MARKS;
    sm.active = true;
    sm.x = x;
    sm.y = y;
    sm.radius = radius;
    sm.alpha = alpha;
    sm.seed = Math.random() * Math.PI * 2;
  }

  spawnMuzzleBlast(
    x: number,
    y: number,
    angle: number,
    scale = 1,
    isCannon = false
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Warm muzzle light halo
    const glow = this.alloc();
    glow.active = true;
    glow.kind = 'glow';
    glow.x = x + cos * (isCannon ? 14 : 6);
    glow.y = y + sin * (isCannon ? 14 : 6);
    glow.vx = 0;
    glow.vy = 0;
    glow.size = (isCannon ? 56 : 26) * scale;
    glow.endSize = (isCannon ? 72 : 34) * scale;
    glow.age = 0;
    glow.maxAge = isCannon ? 0.18 : 0.11;
    glow.alpha = isCannon ? 0.55 : 0.36;
    glow.r = 255;
    glow.g = 192;
    glow.b = 95;
    glow.rotation = 0;
    glow.rotSpeed = 0;

    // Bright muzzle flash core + flame cone
    const flash = this.alloc();
    flash.active = true;
    flash.kind = 'flash';
    flash.x = x + cos * (isCannon ? 10 : 4);
    flash.y = y + sin * (isCannon ? 10 : 4);
    flash.vx = cos * 22;
    flash.vy = sin * 22;
    flash.size = (isCannon ? 28 : 13) * scale;
    flash.endSize = (isCannon ? 40 : 18) * scale;
    flash.age = 0;
    flash.maxAge = isCannon ? 0.14 : 0.085;
    flash.alpha = 1;
    flash.r = 255;
    flash.g = 225;
    flash.b = 130;
    flash.rotation = angle;
    flash.rotSpeed = 0;

    // Hot sparks shooting out
    const sparkCount = isCannon ? 18 : 7;
    for (let i = 0; i < sparkCount; i++) {
      const sp = this.alloc();
      const spread = (Math.random() - 0.5) * (isCannon ? 0.8 : 0.55);
      const spd = (isCannon ? 220 : 150) + Math.random() * (isCannon ? 220 : 140);
      sp.active = true;
      sp.kind = 'spark';
      sp.x = x;
      sp.y = y;
      sp.vx = Math.cos(angle + spread) * spd;
      sp.vy = Math.sin(angle + spread) * spd;
      sp.size = isCannon ? 3.2 : 2.1;
      sp.endSize = 0.4;
      sp.age = 0;
      sp.maxAge = 0.12 + Math.random() * 0.18;
      sp.alpha = 1;
      sp.r = 255;
      sp.g = 175 + Math.floor(Math.random() * 75);
      sp.b = 65;
      sp.rotation = 0;
      sp.rotSpeed = 0;
    }

    // Thick billowing blackpowder smoke puffs
    const smokeCount = isCannon ? 20 : 9;
    for (let i = 0; i < smokeCount; i++) {
      const sm = this.alloc();
      const spread = (Math.random() - 0.5) * (isCannon ? 0.95 : 0.72);
      const distSpd =
        (isCannon ? 75 : 42) + Math.random() * (isCannon ? 150 : 88);
      const shade = 205 + Math.floor(Math.random() * 40);
      sm.active = true;
      sm.kind = 'smoke';
      sm.x = x + cos * (2 + Math.random() * 6);
      sm.y = y + sin * (2 + Math.random() * 6);
      sm.vx = Math.cos(angle + spread) * distSpd * scale;
      sm.vy = Math.sin(angle + spread) * distSpd * scale - Math.random() * 14;
      sm.size = (isCannon ? 11 : 5.5) * scale * (0.8 + Math.random() * 0.5);
      sm.endSize = (isCannon ? 56 : 27) * scale * (0.85 + Math.random() * 0.6);
      sm.age = 0;
      sm.maxAge = (isCannon ? 3.8 : 2.3) + Math.random() * 1.4;
      sm.alpha = isCannon ? 0.68 : 0.54;
      sm.r = shade;
      sm.g = shade - 3;
      sm.b = shade - 10;
      sm.rotation = Math.random() * Math.PI * 2;
      sm.rotSpeed = (Math.random() - 0.5) * 0.8;
    }
  }

  spawnExplosion(x: number, y: number, radius: number): void {
    // Persistent crater scorch mark on the ground
    this.addScorchMark(x, y, Math.max(24, radius * 0.44), 0.68);

    // Warm blast illumination halo
    const glow = this.alloc();
    glow.active = true;
    glow.kind = 'glow';
    glow.x = x;
    glow.y = y;
    glow.vx = 0;
    glow.vy = 0;
    glow.size = radius * 0.65;
    glow.endSize = radius * 1.25;
    glow.age = 0;
    glow.maxAge = 0.28;
    glow.alpha = 0.72;
    glow.r = 255;
    glow.g = 175;
    glow.b = 70;
    glow.rotation = 0;
    glow.rotSpeed = 0;

    // Shockwave ring
    const ring = this.alloc();
    ring.active = true;
    ring.kind = 'shockwave';
    ring.x = x;
    ring.y = y;
    ring.vx = 0;
    ring.vy = 0;
    ring.size = 10;
    ring.endSize = radius * 1.2;
    ring.age = 0;
    ring.maxAge = 0.36;
    ring.alpha = 0.9;
    ring.r = 255;
    ring.g = 210;
    ring.b = 120;
    ring.rotation = 0;
    ring.rotSpeed = 0;

    // Central fire flash
    for (let i = 0; i < 6; i++) {
      const f = this.alloc();
      const a = Math.random() * Math.PI * 2;
      const spd = Math.random() * 45;
      f.active = true;
      f.kind = 'flash';
      f.x = x + Math.cos(a) * 8;
      f.y = y + Math.sin(a) * 8;
      f.vx = Math.cos(a) * spd;
      f.vy = Math.sin(a) * spd;
      f.size = 22 + Math.random() * 16;
      f.endSize = 46;
      f.age = 0;
      f.maxAge = 0.2 + Math.random() * 0.1;
      f.alpha = 0.95;
      f.r = 255;
      f.g = 165 + Math.floor(Math.random() * 65);
      f.b = 50;
      f.rotation = a;
      f.rotSpeed = 0;
    }

    // Sparks & splinters
    for (let i = 0; i < 26; i++) {
      const sp = this.alloc();
      const a = Math.random() * Math.PI * 2;
      const spd = 120 + Math.random() * 260;
      sp.active = true;
      sp.kind = i % 3 === 0 ? 'debris' : 'spark';
      sp.x = x;
      sp.y = y;
      sp.vx = Math.cos(a) * spd;
      sp.vy = Math.sin(a) * spd;
      sp.size = i % 3 === 0 ? 4.5 : 3;
      sp.endSize = i % 3 === 0 ? 3.5 : 0.5;
      sp.age = 0;
      sp.maxAge = 0.35 + Math.random() * 0.35;
      sp.alpha = 1;
      if (i % 3 === 0) {
        sp.r = 120;
        sp.g = 80;
        sp.b = 45;
      } else {
        sp.r = 255;
        sp.g = 150 + Math.floor(Math.random() * 90);
        sp.b = 45;
      }
      sp.rotation = Math.random() * Math.PI * 2;
      sp.rotSpeed = (Math.random() - 0.5) * 12;
    }

    // Heavy billowing smoke plume
    for (let i = 0; i < 28; i++) {
      const sm = this.alloc();
      const a = Math.random() * Math.PI * 2;
      const spd = 20 + Math.random() * 110;
      const dark = i < 10;
      const shade = dark ? 75 + Math.floor(Math.random() * 45) : 185 + Math.floor(Math.random() * 45);
      sm.active = true;
      sm.kind = 'smoke';
      sm.x = x + Math.cos(a) * 10;
      sm.y = y + Math.sin(a) * 10;
      sm.vx = Math.cos(a) * spd;
      sm.vy = Math.sin(a) * spd - 16;
      sm.size = 14 + Math.random() * 12;
      sm.endSize = 52 + Math.random() * 34;
      sm.age = 0;
      sm.maxAge = 3.0 + Math.random() * 1.8;
      sm.alpha = dark ? 0.72 : 0.56;
      sm.r = shade;
      sm.g = shade - (dark ? 8 : 4);
      sm.b = shade - (dark ? 15 : 8);
      sm.rotation = Math.random() * Math.PI * 2;
      sm.rotSpeed = (Math.random() - 0.5) * 0.9;
    }
  }

  spawnCannonImpact(x: number, y: number): void {
    this.addScorchMark(x, y, 16 + Math.random() * 6, 0.52);

    const ring = this.alloc();
    ring.active = true;
    ring.kind = 'shockwave';
    ring.x = x;
    ring.y = y;
    ring.vx = 0;
    ring.vy = 0;
    ring.size = 6;
    ring.endSize = 44;
    ring.age = 0;
    ring.maxAge = 0.24;
    ring.alpha = 0.6;
    ring.r = 215;
    ring.g = 190;
    ring.b = 145;
    ring.rotation = 0;
    ring.rotSpeed = 0;

    for (let i = 0; i < 10; i++) {
      const p = this.alloc();
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 110;
      p.active = true;
      p.kind = i % 2 === 0 ? 'dust' : 'debris';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * spd;
      p.vy = Math.sin(a) * spd - 18;
      p.size = i % 2 === 0 ? 7 : 3.5;
      p.endSize = i % 2 === 0 ? 20 : 1.5;
      p.age = 0;
      p.maxAge = 0.45 + Math.random() * 0.35;
      p.alpha = 0.65;
      p.r = 115;
      p.g = 96;
      p.b = 70;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 8;
    }
  }

  spawnImpact(
    x: number,
    y: number,
    angle: number,
    material: 'flesh' | 'wood' | 'stone' | 'sand' | 'ground'
  ): void {
    if (material === 'flesh') {
      // Blood mist puff
      const mist = this.alloc();
      mist.active = true;
      mist.kind = 'dust';
      mist.x = x;
      mist.y = y - 4;
      mist.vx = Math.cos(angle) * 28;
      mist.vy = Math.sin(angle) * 28 - 4;
      mist.size = 4.5;
      mist.endSize = 13;
      mist.age = 0;
      mist.maxAge = 0.32;
      mist.alpha = 0.55;
      mist.r = 155;
      mist.g = 24;
      mist.b = 24;
      mist.rotation = 0;
      mist.rotSpeed = 0;
    }

    const count = material === 'flesh' ? 7 : 6;
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      const backAngle =
        material === 'flesh'
          ? angle + (Math.random() - 0.5) * 1.1
          : angle + Math.PI + (Math.random() - 0.5) * 1.4;
      const spd = 45 + Math.random() * 95;
      p.active = true;
      p.kind = material === 'stone' ? 'spark' : 'debris';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(backAngle) * spd;
      p.vy = Math.sin(backAngle) * spd;
      p.size = material === 'flesh' ? 2.5 : 3.2;
      p.endSize = 0.8;
      p.age = 0;
      p.maxAge = 0.2 + Math.random() * 0.2;
      p.alpha = 0.95;

      if (material === 'flesh') {
        p.r = 175 + Math.floor(Math.random() * 35);
        p.g = 22;
        p.b = 22;
      } else if (material === 'wood') {
        p.r = 165;
        p.g = 115;
        p.b = 62;
      } else if (material === 'stone') {
        p.r = 255;
        p.g = 215;
        p.b = 140;
      } else if (material === 'sand') {
        p.r = 212;
        p.g = 190;
        p.b = 145;
      } else {
        p.r = 120;
        p.g = 104;
        p.b = 76;
      }
      p.rotation = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 10;
    }
  }

  spawnBloodSplatter(
    x: number,
    y: number,
    angle: number,
    fatal: boolean,
    intensity = 1
  ): void {
    const scale = Math.max(0.7, Math.min(2.2, intensity));

    if (fatal) {
      // Deep central arterial pool & coagulated gore blotches beneath fallen soldier
      const poolCount = scale >= 1.5 ? 4 : 2;
      for (let i = 0; i < poolCount; i++) {
        const ox = (Math.random() - 0.5) * (scale >= 1.5 ? 14 : 8);
        const oy = (Math.random() - 0.5) * (scale >= 1.5 ? 7 : 4);
        this.bloodSplatters.push({
          x: x + ox,
          y: y + oy,
          radiusX: (7.0 + Math.random() * 5.8) * Math.min(1.6, scale),
          radiusY: (3.6 + Math.random() * 2.8) * Math.min(1.6, scale),
          rotation: angle + (Math.random() - 0.5) * 0.8,
          alpha: 0.76 + Math.random() * 0.16,
          r: 76 + Math.floor(Math.random() * 26),
          g: 7 + Math.floor(Math.random() * 7),
          b: 9 + Math.floor(Math.random() * 7),
        });
      }
    }

    // Directional splatter droplets & arterial streaks sprayed onto the ground
    const dropCount = fatal
      ? Math.round(12 + scale * 5)
      : Math.round(5 + scale * 2);
    const maxReach = fatal ? 38 * scale : 22 * scale;
    const spreadArc = fatal ? 1.45 : 0.8;

    for (let i = 0; i < dropCount; i++) {
      const a = angle + (Math.random() - 0.5) * spreadArc;
      const dist = 3 + Math.pow(Math.random(), 0.7) * maxReach;
      const dx = Math.cos(a) * dist;
      const dy = Math.sin(a) * dist * 0.65;
      const baseR = fatal
        ? 1.5 + Math.random() * 3.4
        : 1.0 + Math.random() * 2.1;
      const stretch = 1.3 + Math.random() * 1.1;

      this.bloodSplatters.push({
        x: x + dx,
        y: y + dy,
        radiusX: baseR * stretch,
        radiusY: baseR * 0.66,
        rotation: a,
        alpha: 0.68 + Math.random() * 0.24,
        r: 96 + Math.floor(Math.random() * 48),
        g: 10 + Math.floor(Math.random() * 10),
        b: 12 + Math.floor(Math.random() * 10),
      });
    }

    // Airborne crimson arterial droplets & visceral chunks spraying outward
    const airCount = fatal ? (scale >= 1.5 ? 14 : 9) : 4;
    for (let i = 0; i < airCount; i++) {
      const p = this.alloc();
      const a = angle + (Math.random() - 0.5) * (scale >= 1.5 ? 1.8 : 1.15);
      const spd = (fatal ? 68 : 38) + Math.random() * (scale >= 1.5 ? 135 : 85);
      const isChunk = fatal && i % 3 === 0;
      p.active = true;
      p.kind = 'debris';
      p.x = x;
      p.y = y - 6;
      p.vx = Math.cos(a) * spd;
      p.vy = Math.sin(a) * spd - (isChunk ? 22 : 12);
      p.size = isChunk ? 3.8 : fatal ? 2.8 : 2.0;
      p.endSize = isChunk ? 2.6 : 0.7;
      p.age = 0;
      p.maxAge = isChunk ? 0.34 + Math.random() * 0.18 : 0.22 + Math.random() * 0.16;
      p.alpha = 0.95;
      p.r = isChunk ? 112 + Math.floor(Math.random() * 28) : 168 + Math.floor(Math.random() * 38);
      p.g = isChunk ? 14 : 18;
      p.b = isChunk ? 16 : 20;
      p.rotation = a;
      p.rotSpeed = (Math.random() - 0.5) * 14;
    }
  }

  spawnProjectileTrail(x: number, y: number, isCannonball: boolean): void {
    const p = this.alloc();
    p.active = true;
    p.kind = isCannonball ? 'smoke' : 'dust';
    p.x = x + (Math.random() - 0.5) * 2;
    p.y = y + (Math.random() - 0.5) * 2;
    p.vx = (Math.random() - 0.5) * 10;
    p.vy = -8 - Math.random() * 8;
    p.size = isCannonball ? 4.2 : 1.6;
    p.endSize = isCannonball ? 12 : 4.2;
    p.age = 0;
    p.maxAge = isCannonball ? 0.55 : 0.18;
    p.alpha = isCannonball ? 0.38 : 0.24;
    p.r = isCannonball ? 195 : 235;
    p.g = isCannonball ? 188 : 232;
    p.b = isCannonball ? 175 : 220;
    p.rotation = 0;
    p.rotSpeed = 0;
  }

  spawnBarrelWisp(x: number, y: number): void {
    const p = this.alloc();
    p.active = true;
    p.kind = 'smoke';
    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * 8;
    p.vy = -14 - Math.random() * 10;
    p.size = 2.4;
    p.endSize = 8.5;
    p.age = 0;
    p.maxAge = 0.85 + Math.random() * 0.45;
    p.alpha = 0.28;
    p.r = 215;
    p.g = 212;
    p.b = 205;
    p.rotation = 0;
    p.rotSpeed = 0;
  }

  spawnFootstepDust(x: number, y: number): void {
    const p = this.alloc();
    p.active = true;
    p.kind = 'dust';
    p.x = x + (Math.random() - 0.5) * 5;
    p.y = y + 8;
    p.vx = (Math.random() - 0.5) * 14;
    p.vy = -6 - Math.random() * 8;
    p.size = 2.5;
    p.endSize = 6.5;
    p.age = 0;
    p.maxAge = 0.35 + Math.random() * 0.18;
    p.alpha = 0.24;
    p.r = 152;
    p.g = 138;
    p.b = 112;
    p.rotation = 0;
    p.rotSpeed = 0;
  }

  spawnDeathDust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const p = this.alloc();
      const a = Math.random() * Math.PI * 2;
      p.active = true;
      p.kind = 'dust';
      p.x = x + Math.cos(a) * 6;
      p.y = y + Math.sin(a) * 4;
      p.vx = Math.cos(a) * (15 + Math.random() * 25);
      p.vy = Math.sin(a) * (10 + Math.random() * 15) - 6;
      p.size = 5;
      p.endSize = 14;
      p.age = 0;
      p.maxAge = 0.55 + Math.random() * 0.25;
      p.alpha = 0.35;
      p.r = 155;
      p.g = 142;
      p.b = 118;
      p.rotation = 0;
      p.rotSpeed = 0;
    }
  }

  update(dt: number, weather: WeatherType, worldWidth: number, worldHeight: number): void {
    const wCfg = WEATHER_CONFIGS[weather];

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }

      if (p.kind === 'smoke') {
        p.vx = p.vx * (1 - Math.min(1, dt * 2.4)) + wCfg.windX * dt * 1.45;
        p.vy = p.vy * (1 - Math.min(1, dt * 2.4)) + (wCfg.windY - 6) * dt * 1.2;
      } else if (p.kind === 'debris' || p.kind === 'spark') {
        p.vx *= 1 - Math.min(1, dt * 4.5);
        p.vy *= 1 - Math.min(1, dt * 4.5);
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotSpeed * dt;
    }

    // Rain splash ripples on ground during rain / storm
    if (weather === 'rain' || weather === 'storm') {
      const splashCount = weather === 'storm' ? 4 : 2;
      for (let i = 0; i < splashCount; i++) {
        const sp = this.alloc();
        sp.active = true;
        sp.kind = 'splash';
        sp.x = Math.random() * worldWidth;
        sp.y = Math.random() * worldHeight;
        sp.vx = 0;
        sp.vy = 0;
        sp.size = 1.5;
        sp.endSize = weather === 'storm' ? 9.5 : 7;
        sp.age = 0;
        sp.maxAge = 0.24;
        sp.alpha = 0.38;
        sp.r = 195;
        sp.g = 220;
        sp.b = 242;
        sp.rotation = 0;
        sp.rotSpeed = 0;
      }
    }

    // Update ambient weather particles
    if (weather === 'rain' || weather === 'storm') {
      const speedMul = weather === 'storm' ? 1.45 : 1.0;
      const windX = wCfg.windX * (weather === 'storm' ? 2.1 : 1.5);
      for (let i = 0; i < MAX_WEATHER_PARTICLES; i++) {
        const wp = this.weatherParticles[i];
        wp.x += windX * dt;
        wp.y += wp.speed * speedMul * dt;
        if (wp.y > worldHeight + 30) {
          wp.y = -20;
          wp.x = Math.random() * (worldWidth + 300) - 150;
        }
        if (wp.x > worldWidth + 150) {
          wp.x = -80;
        }
      }
    } else if (weather === 'snow') {
      for (let i = 0; i < MAX_WEATHER_PARTICLES; i++) {
        const wp = this.weatherParticles[i];
        wp.swayOffset += dt * 2.2;
        wp.x += (wCfg.windX + Math.sin(wp.swayOffset) * 28) * dt;
        wp.y += wp.speed * 0.14 * dt;
        if (wp.y > worldHeight + 20) {
          wp.y = -15;
          wp.x = Math.random() * (worldWidth + 200) - 100;
        }
        if (wp.x > worldWidth + 100) {
          wp.x = -50;
        }
      }
    }

    if (wCfg.fogDensity > 0) {
      for (let i = 0; i < MAX_FOG_CLOUDS; i++) {
        const fc = this.fogClouds[i];
        fc.x += (fc.speed + wCfg.windX * 0.35) * dt;
        if (fc.x - fc.radiusX > worldWidth + 120) {
          fc.x = -fc.radiusX - 80;
          fc.y = Math.random() * worldHeight;
        }
      }
    }
  }
}
