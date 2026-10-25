export type SoundName =
  | 'shoot'
  | 'hit'
  | 'explosion'
  | 'dash'
  | 'hurt'
  | 'death'
  | 'pickup'
  | 'rule'
  | 'spawn'
  | 'victory'
  | 'defeat';

const MUTE_KEY = 'rule-thief-m0-muted';

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientStarted = false;
  private unlocked = false;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  get contextState(): string {
    return this.ctx?.state ?? 'none';
  }

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctx = window.AudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.unlocked = true;
    this.startAmbient();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, this.ctx.currentTime, 0.03);
    }
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // private mode / storage disabled
    }
    return this.muted;
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  async resume(): Promise<void> {
    if (this.ctx && this.unlocked && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || !this.unlocked || this.muted) return;
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? 0;
    const gate =
      name === 'hit' ? 45 : name === 'shoot' ? 55 : name === 'explosion' ? 80 :
      name === 'hurt' ? 180 : name === 'death' ? 80 : 0;
    if (gate && now - last < gate) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'shoot':
        this.tone(690, 360, 0.075, 0.09, 'triangle');
        this.noise(0.035, 0.035, 1800, 'highpass');
        break;
      case 'hit':
        this.tone(170, 70, 0.08, 0.07, 'square');
        this.noise(0.045, 0.06, 1100, 'lowpass');
        break;
      case 'explosion':
        this.noise(0.32, 0.24, 900, 'lowpass');
        this.tone(92, 38, 0.3, 0.17, 'sine');
        break;
      case 'dash':
        this.noise(0.18, 0.13, 1300, 'bandpass');
        this.tone(260, 780, 0.14, 0.04, 'sine');
        break;
      case 'hurt':
        this.tone(150, 52, 0.24, 0.18, 'sawtooth');
        this.noise(0.12, 0.12, 700, 'lowpass');
        break;
      case 'death':
        this.tone(260, 55, 0.45, 0.1, 'triangle');
        this.noise(0.18, 0.07, 900, 'lowpass');
        break;
      case 'pickup':
        this.tone(880, 880, 0.09, 0.09, 'triangle');
        this.tone(1320, 1320, 0.1, 0.07, 'triangle', 0.07);
        break;
      case 'rule':
        this.tone(523, 523, 0.14, 0.1, 'triangle');
        this.tone(659, 659, 0.14, 0.09, 'triangle', 0.1);
        this.tone(880, 880, 0.28, 0.08, 'triangle', 0.2);
        this.noise(0.28, 0.03, 3200, 'highpass', 0.12);
        break;
      case 'spawn':
        this.tone(190, 85, 0.2, 0.045, 'sine');
        break;
      case 'victory':
        this.tone(523, 523, 0.2, 0.1, 'triangle');
        this.tone(659, 659, 0.2, 0.1, 'triangle', 0.13);
        this.tone(784, 784, 0.24, 0.09, 'triangle', 0.26);
        this.tone(1047, 1047, 0.45, 0.08, 'triangle', 0.4);
        break;
      case 'defeat':
        this.tone(220, 220, 0.24, 0.1, 'sawtooth');
        this.tone(174, 174, 0.28, 0.08, 'sawtooth', 0.18);
        this.tone(130, 130, 0.5, 0.07, 'sawtooth', 0.38);
        break;
    }
  }

  private tone(
    startFreq: number,
    endFreq: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    delay = 0
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, startFreq), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(
    duration: number,
    volume: number,
    frequency: number,
    filterType: BiquadFilterType,
    delay = 0
  ): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, t);
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const length = Math.floor(this.ctx.sampleRate * 1.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private startAmbient(): void {
    if (!this.ctx || !this.master || this.ambientStarted) return;
    this.ambientStarted = true;

    const ambient = this.ctx.createGain();
    ambient.gain.value = 0.032;
    ambient.connect(this.master);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.7;
    filter.connect(ambient);

    const oscillators = [55, 82.5, 110].map((frequency, index) => {
      const osc = this.ctx!.createOscillator();
      osc.type = index === 2 ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      osc.detune.value = index === 1 ? 7 : index === 2 ? -5 : 0;
      const gain = this.ctx!.createGain();
      gain.gain.value = index === 2 ? 0.08 : 0.2;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      return osc;
    });

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // keep references alive for the lifetime of the page
    void oscillators;
  }
}

export const audio = new GameAudio();
