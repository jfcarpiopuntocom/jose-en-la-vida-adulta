// ── Caminata por Cuenca — jazz con batería procedural (Web Audio API) ──
// Carga el WAV via fetch → AudioBufferSourceNode para speed sin pitch-warp.
// Encima agrega kick + snare + hi-hat generados, 132 BPM, swing feel.
// iOS/Safari: AudioContext se crea en el primer gesto del usuario.

const WAV_URL = '/jose-en-la-vida-adulta/audio/jazz-cuenca.wav';
const BPM = 148;
const SPEED = 1.28;   // 28% más rápido — jazz de pasillo activo
const LOOKAHEAD = 0.35; // segundos de anticipación para el scheduler

let ctx: AudioContext | null = null;
let wasBuf: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let masterGain: GainNode | null = null;
let drumGain: GainNode | null = null;
let nextBarTime = 0;
let schedTimer: ReturnType<typeof setInterval> | null = null;
let wanted = true;
let armed = false;

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

async function fetchBuffer(): Promise<AudioBuffer> {
  if (wasBuf) return wasBuf;
  const ac = getCtx();
  const res = await fetch(WAV_URL);
  const arr = await res.arrayBuffer();
  wasBuf = await ac.decodeAudioData(arr);
  return wasBuf;
}

// ── Drum synthesis ──
function kick(ac: AudioContext, when: number, dg: GainNode) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.connect(env); env.connect(dg);
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(38, when + 0.09);
  env.gain.setValueAtTime(1.3, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.28);
  osc.start(when); osc.stop(when + 0.3);
}

function snare(ac: AudioContext, when: number, dg: GainNode) {
  const samples = Math.floor(ac.sampleRate * 0.18);
  const buf = ac.createBuffer(1, samples, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) d[i] = Math.random() * 2 - 1;
  const ns = ac.createBufferSource();
  ns.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.6;
  const env = ac.createGain();
  ns.connect(bp); bp.connect(env); env.connect(dg);
  env.gain.setValueAtTime(0.55, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
  ns.start(when); ns.stop(when + 0.18);
}

function hihat(ac: AudioContext, when: number, dg: GainNode, vol = 0.18) {
  const samples = Math.floor(ac.sampleRate * 0.055);
  const buf = ac.createBuffer(1, samples, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) d[i] = Math.random() * 2 - 1;
  const ns = ac.createBufferSource();
  ns.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 8000;
  const env = ac.createGain();
  ns.connect(hp); hp.connect(env); env.connect(dg);
  env.gain.setValueAtTime(vol, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.055);
  ns.start(when); ns.stop(when + 0.06);
}

// Jazz swing drum pattern — 2 bars of 4/4
function scheduleBar(ac: AudioContext, dg: GainNode, t: number) {
  const beat = 60 / BPM;
  const sw = beat * 0.07; // swing
  for (let b = 0; b < 8; b++) {
    const tb = t + b * beat;
    if (b === 0) kick(ac, tb, dg);               // kick downbeat
    if (b === 4) kick(ac, tb + sw * 0.4, dg);    // kick 3rd beat (light)
    if (b === 2 || b === 6) snare(ac, tb, dg);   // snare on 2 & 4
    hihat(ac, tb, dg, b % 2 === 0 ? 0.18 : 0.12);           // on beat
    hihat(ac, tb + beat * 0.5 + (b % 2 ? sw : -sw * 0.5), dg, 0.09); // off-beat swing
  }
}

function runScheduler() {
  if (!ctx || !drumGain || !wanted) return;
  const barDur = (60 / BPM) * 8;
  while (nextBarTime < ctx.currentTime + LOOKAHEAD) {
    scheduleBar(ctx, drumGain, nextBarTime);
    nextBarTime += barDur;
  }
}

async function startMusic() {
  if (!wanted) return;
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') await ac.resume();

    masterGain = ac.createGain();
    masterGain.gain.value = 0.38;
    masterGain.connect(ac.destination);

    drumGain = ac.createGain();
    drumGain.gain.value = 0.52;
    drumGain.connect(ac.destination);

    const buf = await fetchBuffer();
    if (!wanted) return; // user turned off while loading
    source = ac.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    source.playbackRate.value = SPEED;
    source.connect(masterGain);
    source.start();

    nextBarTime = ac.currentTime;
    runScheduler();
    schedTimer = setInterval(runScheduler, 180);
  } catch (_) { /* autoplay blocked on desktop without gesture — arm() handles it */ }
}

function stopMusic() {
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  if (source) { try { source.stop(); } catch (_) {} source = null; }
  if (masterGain) { masterGain.disconnect(); masterGain = null; }
  if (drumGain)   { drumGain.disconnect();   drumGain = null; }
}

export const cityMusic = {
  get wanted(): boolean { return wanted; },
  get playing(): boolean { return !!source; },

  arm(): void {
    if (armed) return;
    armed = true;
    // Precarga el buffer completo en background — no espera al primer gesto
    // AudioContext en estado 'suspended' sólo bloquea el output, no el decode
    try {
      const ac = getCtx();
      if (!wasBuf) {
        fetch(WAV_URL)
          .then(r => r.arrayBuffer())
          .then(arr => ac.decodeAudioData(arr))
          .then(buf => { wasBuf = buf; })
          .catch(() => {});
      }
    } catch (_) {}
    const evs: string[] = ['pointerdown', 'touchstart', 'keydown', 'click'];
    const handler = () => {
      startMusic();
      evs.forEach(e => window.removeEventListener(e, handler));
    };
    evs.forEach(e => window.addEventListener(e, handler, { passive: true }));
    startMusic(); // try immediately (desktop)
  },

  toggle(): void {
    if (source) { wanted = false; stopMusic(); }
    else { wanted = true; startMusic(); }
  },
};
