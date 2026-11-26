import { Faction, SimSoundEvent, SoldierType, WeatherType } from './types';

const OFFICER_LINES = [
  'Present! Fire!',
  'Hold the line!',
  'Make ready! Fire!',
  'Forward, men!',
  'Stand fast!',
];

const CANNON_LINES = [
  'Fire the cannon!',
  'Battery, fire!',
  'Artillery, ready!',
];

const DEPLOY_LINES: Record<SoldierType, string[]> = {
  line: ['Company formed.', 'Ranks steady.', 'Bayonets ready.'],
  skirmisher: ['Skirmishers forward.', 'Taking cover.'],
  grenadier: ['Grenadiers advance.', 'Hold the flank.'],
  officer: ['Form on me.', 'Regiment, attention.', 'Follow the colors.'],
};

class BattlefieldAudio {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;

  private activeShots = 0;
  private lastShotTime = 0;
  private lastReloadTime = 0;

  private lastCommandVoiceTime = 0;
  private lastDeathVoiceTime = 0;
  private lastPainVoiceTime = 0;
  private lastSpokenTime = 0;

  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.buildNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private buildNoiseBuffer(ctx: AudioContext): void {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  unlock(): void {
    this.unlocked = true;
    this.ensureContext();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(
        mute ? 0 : 0.035,
        this.ctx.currentTime,
        0.08
      );
    }
    if (mute && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speechSynthesis cancel errors in restricted frames
      }
    }
  }

  setWeatherAmbience(weather: WeatherType, active: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;

    const shouldRain =
      active && !this.muted && (weather === 'rain' || weather === 'storm');
    const targetGain = weather === 'storm' ? 0.055 : 0.032;

    if (shouldRain) {
      if (!this.rainSource) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 0.6;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start();

        this.rainSource = src;
        this.rainGain = gain;
      }
      if (this.rainGain) {
        this.rainGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.25);
      }
    } else if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }
  }

  private triggerSnareHit(
    ctx: AudioContext,
    atTime: number,
    volume: number,
    tight = true
  ): void {
    if (!this.noiseBuffer) return;

    // Snare wire rattle
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = tight ? 1350 : 900;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, atTime);
    nGain.gain.linearRampToValueAtTime(volume, atTime + 0.005);
    nGain.gain.exponentialRampToValueAtTime(0.001, atTime + (tight ? 0.075 : 0.13));
    src.connect(hp);
    hp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(atTime);
    src.stop(atTime + 0.15);

    // Drum membrane tone
    const drum = ctx.createOscillator();
    drum.type = 'sine';
    drum.frequency.setValueAtTime(195, atTime);
    drum.frequency.exponentialRampToValueAtTime(108, atTime + 0.055);
    const dGain = ctx.createGain();
    dGain.gain.setValueAtTime(volume * 0.85, atTime);
    dGain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.065);
    drum.connect(dGain);
    dGain.connect(ctx.destination);
    drum.start(atTime);
    drum.stop(atTime + 0.07);
  }

  /**
   * Natural-cadence spoken military orders via browser SpeechSynthesis when OS voices are available.
   */
  private speakTacticalLine(lines: string[], pitch = 0.95, rate = 1.0): void {
    if (!this.unlocked || this.muted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (typeof SpeechSynthesisUtterance === 'undefined') return;

    const nowMs = performance.now();
    if (nowMs - this.lastSpokenTime < 3400) return;

    try {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) return;
      const voices = synth.getVoices();
      if (!voices || voices.length === 0) return;

      const preferred =
        voices.find(
          (v) =>
            /en[-_](GB|US)/i.test(v.lang) &&
            /(Daniel|Arthur|Ryan|George|Google UK English Male|Alex|Aaron)/i.test(
              v.name
            )
        ) ??
        voices.find((v) => /en[-_](GB|US)/i.test(v.lang) && !/novelty|whisper|trinoids/i.test(v.name)) ??
        voices.find((v) => v.lang.startsWith('en'));

      if (!preferred) return;

      this.lastSpokenTime = nowMs;
      const text = lines[Math.floor(Math.random() * lines.length)];
      const utt = new SpeechSynthesisUtterance(text);
      utt.voice = preferred;
      utt.pitch = Math.max(0.88, Math.min(1.04, pitch));
      utt.rate = Math.max(0.95, Math.min(1.06, rate));
      utt.volume = 0.42;
      synth.speak(utt);
    } catch {
      // Ignore unavailable browser speech engines cleanly
    }
  }

  playCommandOrder(
    role: 'officer' | 'cannon' | 'advance' | 'fire' | 'halt'
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const cooldown = role === 'officer' || role === 'advance' || role === 'halt' ? 1.8 : 2.6;
    if (now - this.lastCommandVoiceTime < cooldown) return;
    this.lastCommandVoiceTime = now;

    if (role === 'halt') {
      // Single muted field drum stop beat
      this.triggerSnareHit(ctx, now, 0.045, false);
      this.speakTacticalLine(['Hold fire!', 'Cease fire!'], 0.94, 0.98);
      return;
    }

    if (role === 'cannon') {
      // Artillery battery double snare flam
      this.triggerSnareHit(ctx, now, 0.055, true);
      this.triggerSnareHit(ctx, now + 0.085, 0.075, false);
      this.speakTacticalLine(CANNON_LINES, 0.92, 1.02);
      return;
    }

    if (role === 'advance') {
      // Crisp 3-beat Napoleonic march cadence on snare
      this.triggerSnareHit(ctx, now, 0.05, true);
      this.triggerSnareHit(ctx, now + 0.095, 0.048, true);
      this.triggerSnareHit(ctx, now + 0.19, 0.075, false);
      this.speakTacticalLine(['Advance! Engage the enemy!', 'Forward, men!'], 0.96, 1.0);
      return;
    }

    if (role === 'officer') {
      this.triggerSnareHit(ctx, now, 0.045, true);
      this.triggerSnareHit(ctx, now + 0.06, 0.06, true);
      this.speakTacticalLine(OFFICER_LINES, 0.95, 1.02);
      return;
    }

    // Squad fire order: subtle snare tap only (no vocal spam)
    this.triggerSnareHit(ctx, now, 0.032, true);
  }

  playDeployVoice(soldierType: SoldierType, _faction: Faction): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (now - this.lastCommandVoiceTime < 0.45) return;
    this.lastCommandVoiceTime = now;

    // Crisp regimental drum cadence on formation deploy
    this.triggerSnareHit(ctx, now, 0.045, true);
    this.triggerSnareHit(ctx, now + 0.09, 0.06, true);

    const pitch =
      soldierType === 'grenadier'
        ? 0.92
        : soldierType === 'skirmisher'
          ? 1.0
          : 0.96;
    this.speakTacticalLine(DEPLOY_LINES[soldierType], pitch, 1.0);
  }

  playPainGrunt(soldierType: SoldierType): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    if (now - this.lastPainVoiceTime < 0.35) return;
    this.lastPainVoiceTime = now;

    // Subtle breathy wind-knocked exhale + muffled chest thud (zero oscillator pitch glide)
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.65;
    lp.frequency.setValueAtTime(soldierType === 'grenadier' ? 280 : 340, now);
    lp.frequency.exponentialRampToValueAtTime(125, now + 0.11);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.065, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    src.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.13);
  }

  playDeathCry(soldierType: SoldierType): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    if (now - this.lastDeathVoiceTime < 0.38) return;
    this.lastDeathVoiceTime = now;

    // Heavy low-passed final exhale + soft ground collapse thud
    const dur = 0.19;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(soldierType === 'grenadier' ? 300 : 380, now);
    lp.frequency.exponentialRampToValueAtTime(105, now + dur);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(0.075, now + 0.02);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(lp);
    lp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);

    // Subtle body/gear fall thump slightly after hit
    const thumpAt = now + 0.09;
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(76, thumpAt);
    thump.frequency.exponentialRampToValueAtTime(34, thumpAt + 0.08);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.045, thumpAt);
    tGain.gain.exponentialRampToValueAtTime(0.001, thumpAt + 0.09);
    thump.connect(tGain);
    tGain.connect(ctx.destination);
    thump.start(thumpAt);
    thump.stop(thumpAt + 0.1);
  }

  playUiClick(pitch = 520): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.65, now + 0.05);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playDeploy(isStructure: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isStructure ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(isStructure ? 150 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(isStructure ? 70 : 105, now + 0.09);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playThunder(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + 1.8);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 2.05);
  }

  playMusket(soldierType: SoldierType): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    if (now - this.lastShotTime < 0.015 && this.activeShots >= 6) return;
    if (this.activeShots >= 10) return;

    this.lastShotTime = now;
    this.activeShots++;
    setTimeout(() => {
      this.activeShots = Math.max(0, this.activeShots - 1);
    }, 180);

    const pitchJitter = 0.9 + Math.random() * 0.2;
    const baseFreq =
      soldierType === 'skirmisher'
        ? 1650
        : soldierType === 'grenadier'
          ? 780
          : soldierType === 'officer'
            ? 1950
            : 1150;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * pitchJitter, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.16);
    filter.Q.value = 0.85;

    const noiseGain = ctx.createGain();
    const vol =
      soldierType === 'grenadier'
        ? 0.22
        : soldierType === 'officer'
          ? 0.13
          : 0.17;
    noiseGain.gain.setValueAtTime(vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.2);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const thumpFreq = soldierType === 'grenadier' ? 125 : 165;
    osc.frequency.setValueAtTime(thumpFreq * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.95, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playCannon(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.exponentialRampToValueAtTime(95, now + 0.65);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.75);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.38);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.38, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.44);
  }

  playExplosion(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(75, now + 0.95);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 1.05);
  }

  playReloadClink(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastReloadTime < 0.14) return;
    this.lastReloadTime = now;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1850 + Math.random() * 350, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.03);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playHit(fatal: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fatal ? 155 : 220, now);
    osc.frequency.exponentialRampToValueAtTime(fatal ? 55 : 95, now + 0.075);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(fatal ? 0.09 : 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  processEvents(events: SimSoundEvent[]): void {
    if (this.muted || events.length === 0) return;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.kind === 'musket') {
        this.playMusket(ev.soldierType);
      } else if (ev.kind === 'cannon') {
        this.playCannon();
      } else if (ev.kind === 'explosion') {
        this.playExplosion();
      } else if (ev.kind === 'reload') {
        this.playReloadClink();
      } else if (ev.kind === 'hit') {
        this.playHit(ev.fatal);
      } else if (ev.kind === 'voice_command') {
        this.playCommandOrder(ev.role);
      } else if (ev.kind === 'voice_death') {
        this.playDeathCry(ev.soldierType);
      } else if (ev.kind === 'voice_pain') {
        this.playPainGrunt(ev.soldierType);
      }
    }
  }
}

export const battlefieldAudio = new BattlefieldAudio();
