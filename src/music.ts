// ── Jazz City player — José En La Vida Adulta ──
// Web Audio API, zero dependencies, works on mobile
// Genre: jazz-detective-urbano, feel: merodeando por Cuenca a las 10pm
// Progression: Dm7 → G7 → Cmaj7 → A7 (ii-V-I-VI), 104 BPM

const BPM = 104;
const BEAT = 60 / BPM;     // ~0.577 s
const LOOK = 0.14;          // lookahead: 140 ms ahead
const SCHED_MS = 35;        // scheduler fires every 35 ms

// Frequency table (Hz)
const G2=98,A2=110,Bb2=116.54,B2=123.47;
const C3=130.81,D3=146.83,Eb3=155.56,E3=164.81,F3=174.61,Gb3=185,G3=196,Ab3=207.65,A3=220,Bb3=233.08,B3=246.94;
const C4=261.63,D4=293.66,Eb4=311.13,E4=329.63,F4=349.23,G4=392,A4=440;

// Walking bass lines — 4 beats per chord
const BASS = [
  [D3, E3, F3, G3],       // Dm7: walk up
  [G2, A2, B2, C3],       // G7:  walk up
  [C3, B2, Bb2, A2],      // Cmaj7: walk down (chromatic)
  [A2, C3, E3, Gb3],      // A7:  walk up (chromatic passing)
];

// Chord voicings (upper structure, 3 notes — sparse jazz feel)
const CHORDS = [
  [A3, C4, F4],            // Dm7: 5th, 7th, 3rd (upper)
  [B3, D4, F4],            // G7:  3rd, 5th, 7th
  [E3, G3, B3],            // Cmaj7: 3rd, 5th, 7th
  [E3, A3, C4],            // A7:  5th, root (8va), 3rd
];

// Melody motifs (beat-offset, freq, duration-in-beats)
// Sparse: only plays ~60% of bars, gives breathing room
const MEL: [number, number, number][][] = [
  [[0.5, A4, 0.4], [2, F4, 0.3], [3.2, G4, 0.35]],   // Dm7
  [[1, G4, 0.4],   [2.5, Eb4, 0.25], [3.5, C4, 0.3]], // G7 b9 tension
  [[0, E4, 0.5],   [1.5, G4, 0.3],  [3, B3, 0.4]],    // Cmaj7 resolved
  [[0.5, A3, 0.3], [2, E4, 0.4],    [3.5, D4, 0.35]], // A7
];

// ── Swing helper: 2nd eighth of a beat is pushed slightly late ──
const sw = (beat: number, eighth: 0|1) => beat * BEAT + (eighth === 0 ? 0 : BEAT * 0.6);

export class JazzCity {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hatBuf: AudioBuffer | null = null;
  private _muted = true;
  private nextBeat = 0;
  private beatIdx = 0;
  private timerId = 0;
  private playMel = false;  // re-randomize each bar

  get muted() { return this._muted; }

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    // Pre-generate white noise buffer for hi-hat (reused every hit)
    const sr = this.ctx.sampleRate;
    this.hatBuf = this.ctx.createBuffer(1, Math.ceil(sr * 0.09), sr);
    const d = this.hatBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start() {
    this.init();
    if (!this.ctx || !this.master) return;
    this._muted = false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.5);
    if (this.timerId) return;
    this.nextBeat = this.ctx.currentTime + 0.12;
    this.beatIdx = 0;
    this.timerId = window.setInterval(() => this.tick(), SCHED_MS);
  }

  mute() {
    this._muted = true;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    window.clearInterval(this.timerId);
    this.timerId = 0;
  }

  toggle() {
    if (this._muted || !this.timerId) this.start();
    else this.mute();
  }

  private tick() {
    if (!this.ctx) return;
    while (this.nextBeat < this.ctx.currentTime + LOOK) {
      const b = this.beatIdx % 16;
      const bar = b >> 2;   // 0-3
      const beat = b & 3;   // 0-3
      if (beat === 0) this.playMel = Math.random() < 0.58;
      this.playBeat(this.nextBeat, bar, beat);
      this.beatIdx++;
      this.nextBeat += BEAT;
    }
  }

  private playBeat(t: number, bar: number, beat: number) {
    this.bass(t, BASS[bar][beat]);
    // Hi-hat: every beat, brush accent on 2 + 4 (jazz backbeat)
    this.hat(t, beat === 1 || beat === 3);
    // Light "ghost" hat on the 8th note offbeat (swing feel)
    if (Math.random() < 0.45) this.hat(t + sw(0, 1), false);
    // Chord stab on beats 2 and 4 only
    if (beat === 1 || beat === 3) this.chord(t, CHORDS[bar]);
    // Melody — first beat of bar, if this bar gets a melody
    if (beat === 0 && this.playMel) {
      for (const [bo, freq, dur] of MEL[bar]) {
        this.melNote(t + bo * BEAT, freq, dur * BEAT);
      }
    }
  }

  // ── Instrument voices ──

  private bass(t: number, freq: number) {
    const { ctx, master } = this; if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(0.7, t + 0.012);
    env.gain.setTargetAtTime(0.28, t + 0.04, 0.06);
    env.gain.setTargetAtTime(0.001, t + 0.46, 0.045);
    osc.connect(env); env.connect(master);
    osc.start(t); osc.stop(t + 0.56);
  }

  private hat(t: number, accent: boolean) {
    const { ctx, master, hatBuf } = this; if (!ctx || !master || !hatBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = hatBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 8500;
    const env = ctx.createGain();
    const vol = accent ? 0.22 : 0.09;
    const dec = accent ? 0.075 : 0.038;
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dec);
    src.connect(hpf); hpf.connect(env); env.connect(master);
    src.start(t); src.stop(t + 0.09);
  }

  private chord(t: number, freqs: number[]) {
    const { ctx, master } = this; if (!ctx || !master) return;
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const lpf = ctx.createBiquadFilter();
      const env = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      lpf.type = 'lowpass'; lpf.frequency.value = 850; lpf.Q.value = 0.6;
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.06, t + 0.018);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      osc.connect(lpf); lpf.connect(env); env.connect(master);
      osc.start(t); osc.stop(t + 0.38);
    }
  }

  private melNote(t: number, freq: number, dur: number) {
    const { ctx, master } = this; if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(0.13, t + 0.018);
    env.gain.setTargetAtTime(0.09, t + 0.04, 0.09);
    env.gain.setTargetAtTime(0.001, t + dur * 0.75, 0.028);
    osc.connect(env); env.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
}

export const jazz = new JazzCity();
