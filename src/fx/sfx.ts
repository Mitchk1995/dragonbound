/** Procedural sound effects with WebAudio — no audio files needed. */

type Wave = OscillatorType | 'noise';

interface Voice {
  wave: Wave;
  freq?: number;
  freqEnd?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number };
}

const PRESETS: Record<string, Voice[]> = {
  swing: [{ wave: 'noise', dur: 0.14, vol: 0.25, filter: { type: 'bandpass', freq: 2400, freqEnd: 600, q: 1.2 } }],
  hit: [
    { wave: 'noise', dur: 0.08, vol: 0.35, filter: { type: 'lowpass', freq: 2000, freqEnd: 400 } },
    { wave: 'sine', freq: 140, freqEnd: 60, dur: 0.12, vol: 0.5 },
  ],
  crit: [
    { wave: 'noise', dur: 0.1, vol: 0.45, filter: { type: 'lowpass', freq: 3500, freqEnd: 500 } },
    { wave: 'sine', freq: 180, freqEnd: 50, dur: 0.18, vol: 0.7 },
    { wave: 'square', freq: 1400, freqEnd: 900, dur: 0.08, vol: 0.12 },
  ],
  arrow: [{ wave: 'noise', dur: 0.12, vol: 0.2, filter: { type: 'highpass', freq: 3000, freqEnd: 1500 } }],
  bolt: [{ wave: 'sine', freq: 500, freqEnd: 1200, dur: 0.15, vol: 0.2 }, { wave: 'triangle', freq: 900, freqEnd: 1800, dur: 0.12, vol: 0.1 }],
  fireball: [{ wave: 'noise', dur: 0.35, vol: 0.35, filter: { type: 'lowpass', freq: 800, freqEnd: 2500 } }],
  explode: [
    { wave: 'noise', dur: 0.6, vol: 0.55, filter: { type: 'lowpass', freq: 1500, freqEnd: 150 } },
    { wave: 'sine', freq: 90, freqEnd: 30, dur: 0.5, vol: 0.7 },
  ],
  frost: [
    { wave: 'noise', dur: 0.4, vol: 0.3, filter: { type: 'highpass', freq: 4000, freqEnd: 1500 } },
    { wave: 'sine', freq: 1800, freqEnd: 2600, dur: 0.35, vol: 0.12 },
  ],
  lightning: [
    { wave: 'sawtooth', freq: 120, freqEnd: 60, dur: 0.25, vol: 0.2 },
    { wave: 'noise', dur: 0.3, vol: 0.35, filter: { type: 'bandpass', freq: 5000, freqEnd: 1000, q: 0.6 } },
  ],
  slam: [
    { wave: 'sine', freq: 110, freqEnd: 35, dur: 0.45, vol: 0.9 },
    { wave: 'noise', dur: 0.35, vol: 0.45, filter: { type: 'lowpass', freq: 900, freqEnd: 100 } },
  ],
  roll: [{ wave: 'noise', dur: 0.2, vol: 0.2, filter: { type: 'bandpass', freq: 800, freqEnd: 300 } }],
  warcry: [
    { wave: 'sawtooth', freq: 160, freqEnd: 220, dur: 0.5, vol: 0.22 },
    { wave: 'square', freq: 240, freqEnd: 330, dur: 0.5, vol: 0.1, delay: 0.05 },
  ],
  enemyDie: [
    { wave: 'square', freq: 400, freqEnd: 80, dur: 0.22, vol: 0.12 },
    { wave: 'noise', dur: 0.2, vol: 0.2, filter: { type: 'lowpass', freq: 1200, freqEnd: 200 } },
  ],
  playerHurt: [{ wave: 'sawtooth', freq: 220, freqEnd: 90, dur: 0.16, vol: 0.2 }],
  pickup: [
    { wave: 'sine', freq: 700, dur: 0.06, vol: 0.2 },
    { wave: 'sine', freq: 1050, dur: 0.08, vol: 0.2, delay: 0.05 },
  ],
  gold: [
    { wave: 'triangle', freq: 2200, dur: 0.05, vol: 0.15 },
    { wave: 'triangle', freq: 2900, dur: 0.08, vol: 0.12, delay: 0.04 },
  ],
  drop_normal: [{ wave: 'sine', freq: 200, freqEnd: 120, dur: 0.1, vol: 0.2 }],
  drop_magic: [{ wave: 'sine', freq: 880, dur: 0.25, vol: 0.18 }],
  drop_rare: [
    { wave: 'sine', freq: 880, dur: 0.3, vol: 0.2 },
    { wave: 'sine', freq: 1320, dur: 0.4, vol: 0.18, delay: 0.1 },
  ],
  drop_unique: [
    { wave: 'triangle', freq: 523, dur: 0.6, vol: 0.25 },
    { wave: 'triangle', freq: 659, dur: 0.6, vol: 0.22, delay: 0.1 },
    { wave: 'triangle', freq: 784, dur: 0.7, vol: 0.22, delay: 0.2 },
    { wave: 'triangle', freq: 1047, dur: 1.2, vol: 0.25, delay: 0.3 },
    { wave: 'noise', dur: 1.2, vol: 0.08, delay: 0.3, filter: { type: 'highpass', freq: 6000 } },
  ],
  levelup: [
    { wave: 'square', freq: 523, dur: 0.14, vol: 0.13 },
    { wave: 'square', freq: 659, dur: 0.14, vol: 0.13, delay: 0.12 },
    { wave: 'square', freq: 784, dur: 0.14, vol: 0.13, delay: 0.24 },
    { wave: 'triangle', freq: 1047, dur: 0.7, vol: 0.25, delay: 0.36 },
    { wave: 'triangle', freq: 784, dur: 0.7, vol: 0.15, delay: 0.36 },
  ],
  roar: [
    { wave: 'sawtooth', freq: 90, freqEnd: 55, dur: 1.3, vol: 0.35, attack: 0.15 },
    { wave: 'noise', dur: 1.3, vol: 0.35, attack: 0.1, filter: { type: 'lowpass', freq: 700, freqEnd: 250 } },
  ],
  breath: [{ wave: 'noise', dur: 1.6, vol: 0.4, attack: 0.1, filter: { type: 'lowpass', freq: 600, freqEnd: 1800 } }],
  potion: [
    { wave: 'sine', freq: 400, freqEnd: 800, dur: 0.18, vol: 0.2 },
    { wave: 'sine', freq: 600, freqEnd: 1100, dur: 0.18, vol: 0.15, delay: 0.12 },
  ],
  ui: [{ wave: 'sine', freq: 900, dur: 0.04, vol: 0.1 }],
  deny: [{ wave: 'square', freq: 180, dur: 0.12, vol: 0.12 }],
  telegraph: [{ wave: 'sine', freq: 300, freqEnd: 500, dur: 0.18, vol: 0.08 }],
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  volume = 0.6;

  /** Must be called from a user gesture before audio will play. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  play(name: string, vol = 1, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.03) return;
    this.last.set(name, now);
    const voices = PRESETS[name];
    if (!voices) return;
    for (const v of voices) this.voice(ctx, v, now + (v.delay ?? 0), vol, pitch);
  }

  private voice(ctx: AudioContext, v: Voice, t0: number, vol: number, pitch: number) {
    const gain = ctx.createGain();
    const peak = (v.vol ?? 0.3) * vol;
    const atk = v.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
    let src: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const b = ctx.createBufferSource();
      b.buffer = this.noiseBuf;
      b.playbackRate.value = pitch;
      src = b;
    } else {
      const o = ctx.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime((v.freq ?? 440) * pitch, t0);
      if (v.freqEnd) o.frequency.exponentialRampToValueAtTime(v.freqEnd * pitch, t0 + v.dur);
      src = o;
    }
    let node: AudioNode = src;
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.frequency.setValueAtTime(v.filter.freq, t0);
      if (v.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(v.filter.freqEnd, t0 + v.dur);
      f.Q.value = v.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(this.master!);
    src.start(t0);
    src.stop(t0 + v.dur + 0.05);
  }
}
