// soundscape.ts — JFC 2026-06-28
// Capa de audio secundaria: SFX de transporte, drones de zona y confirmaciones de acción.
// Todo procedural (Web Audio API). Sin archivos externos. Complementa a cityMusic.ts.
// Principio Jones in the Fast Lane: la música dice dónde estás antes de que lo leas.

type TransportKey = 'walk' | 'bus' | 'taxi' | 'bicycle' | 'motorcycle' | 'car';

// ── Frecuencia base por zona (nota de bajo, sirve de "firma sonora") ──────────
// Cada zona = una nota de la escala. Con suficiente tiempo, el jugador aprende
// a reconocer la zona por el drone ANTES de leer el nombre. Es puro Jones.
const ZONE_FREQ: Record<string, number> = {
  hogar:         130.81,  // Do2  — cálido, íntimo, doméstico
  universitaria: 164.81,  // Mi2  — reflexivo, esperanzador
  financiera:    146.83,  // Re2  — tenso, profesional, bajo-oscuro
  transporte:    196.00,  // Sol2 — abierto, movimiento, neutro
  industrial:    185.00,  // Fa#2 — oscuro, mecánico
  salud:         220.00,  // La2  — limpio, algo clínico
  comercial:     233.08,  // Si♭2 — alegre, mercado vivo
  centro:        207.65,  // La♭2 — colonial, solemne, histórico
  rio:           196.00,  // Sol2 — fluido, natural, expansivo
  politico:      246.94,  // Si2  — burocrático, opresivo
  deporte:       261.63,  // Do3  — enérgico
};

// ── Motor ────────────────────────────────────────────────────────────────────
function createSoundscape() {
  let ctx: AudioContext | null = null;
  let enabled = true;
  let armed   = false;

  // Drone de zona
  let zoneOsc:     OscillatorNode | null = null;
  let zoneGain:    GainNode       | null = null;
  let currentZone: string         | null = null;

  // ── Utilidades internas ──────────────────────────────────────────────────

  function getCtx(): AudioContext | null {
    if (!enabled || !armed) return null;
    if (!ctx) {
      try { ctx = new AudioContext(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function mk<T extends AudioNode>(ac: AudioContext, node: T): T {
    return node;
  }

  function gain(ac: AudioContext, val: number): GainNode {
    const g = ac.createGain();
    // JFC: setValueAtTime antes de cualquier ramp (quirk WebKit/iOS Safari)
    g.gain.setValueAtTime(val, ac.currentTime);
    return g;
  }

  // Buffer de ruido blanco mono
  function whiteBuf(ac: AudioContext, sec: number): AudioBufferSourceNode {
    const n   = Math.ceil(ac.sampleRate * sec);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    return src;
  }

  // ── SFX de transporte ────────────────────────────────────────────────────
  // Cada sonido es corto (<250 ms), diegético y reconocible.

  // A pie: dos clics secos de adoquín (izquierda · derecha)
  function sfxWalk(ac: AudioContext) {
    [0, 0.18].forEach(delay => {
      const noise  = whiteBuf(ac, 0.07);
      const filter = ac.createBiquadFilter();
      filter.type  = 'highpass';
      filter.frequency.setValueAtTime(1700, ac.currentTime);
      const g = gain(ac, 0);
      const t = ac.currentTime + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.26, t + 0.005);
      g.gain.linearRampToValueAtTime(0,    t + 0.055);
      noise.connect(filter); filter.connect(g); g.connect(ac.destination);
      noise.start(t); noise.stop(t + 0.08);
    });
  }

  // Bus: chícharo de puerta de bus urbano (bandpass, ramp up-down)
  function sfxBus(ac: AudioContext) {
    const noise  = whiteBuf(ac, 0.22);
    const filter = ac.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.setValueAtTime(580, ac.currentTime);
    filter.Q.setValueAtTime(2.2, ac.currentTime);
    const g = gain(ac, 0);
    const t = ac.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.04);
    g.gain.setValueAtTime(0.22, t + 0.12);
    g.gain.linearRampToValueAtTime(0,    t + 0.20);
    noise.connect(filter); filter.connect(g); g.connect(ac.destination);
    noise.start(t); noise.stop(t + 0.24);
  }

  // Taxi: bocinazo breve (sine sweep descendente)
  function sfxTaxi(ac: AudioContext) {
    const osc = ac.createOscillator();
    osc.type  = 'sine';
    osc.frequency.setValueAtTime(430, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(395, ac.currentTime + 0.13);
    const g = gain(ac, 0);
    const t = ac.currentTime;
    g.gain.setValueAtTime(0,    t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.012);
    g.gain.setValueAtTime(0.18, t + 0.10);
    g.gain.linearRampToValueAtTime(0,    t + 0.15);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.17);
  }

  // Bicicleta: click metálico agudo (cadena — triangle corto)
  function sfxBicycle(ac: AudioContext) {
    const osc = ac.createOscillator();
    osc.type  = 'triangle';
    osc.frequency.setValueAtTime(2300, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(1800, ac.currentTime + 0.05);
    const g = gain(ac, 0);
    const t = ac.currentTime;
    g.gain.setValueAtTime(0,    t);
    g.gain.linearRampToValueAtTime(0.20, t + 0.003);
    g.gain.linearRampToValueAtTime(0,    t + 0.048);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.06);
  }

  // Moto: growl corto de motor (sawtooth + lowpass)
  function sfxMotorcycle(ac: AudioContext) {
    const osc    = ac.createOscillator();
    osc.type     = 'sawtooth';
    osc.frequency.setValueAtTime(80,  ac.currentTime);
    osc.frequency.linearRampToValueAtTime(165, ac.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(100, ac.currentTime + 0.20);
    const filter = ac.createBiquadFilter();
    filter.type  = 'lowpass';
    filter.frequency.setValueAtTime(420, ac.currentTime);
    const g = gain(ac, 0);
    const t = ac.currentTime;
    g.gain.setValueAtTime(0,    t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.03);
    g.gain.setValueAtTime(0.22, t + 0.12);
    g.gain.linearRampToValueAtTime(0,    t + 0.22);
    osc.connect(filter); filter.connect(g); g.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.24);
  }

  // Carro: seguro de puerta (impulso seco, bandpass)
  function sfxCar(ac: AudioContext) {
    const noise  = whiteBuf(ac, 0.10);
    const filter = ac.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.setValueAtTime(290, ac.currentTime);
    filter.Q.setValueAtTime(0.75, ac.currentTime);
    const g = gain(ac, 0);
    const t = ac.currentTime;
    g.gain.setValueAtTime(0,    t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.004);
    g.gain.linearRampToValueAtTime(0,    t + 0.09);
    noise.connect(filter); filter.connect(g); g.connect(ac.destination);
    noise.start(t); noise.stop(t + 0.11);
  }

  const TRANSPORT_SFX: Record<TransportKey, (ac: AudioContext) => void> = {
    walk:       sfxWalk,
    bus:        sfxBus,
    taxi:       sfxTaxi,
    bicycle:    sfxBicycle,
    motorcycle: sfxMotorcycle,
    car:        sfxCar,
  };

  // ── Drone de zona ─────────────────────────────────────────────────────────
  // Sine de baja ganancia (0.055) — casi inaudible en solitario, pero crea
  // calor y "lugar" cuando se superpone con el jazz de ciudad.
  // Fade in lento (2 s) para no interrumpir.

  function applyZone(zone: string) {
    const ac = getCtx();
    if (!ac) return;
    const freq = ZONE_FREQ[zone] ?? 130.81;

    // Fade out del drone anterior si existe
    if (zoneGain && zoneOsc) {
      const prev = zoneOsc;
      const prevG = zoneGain;
      const t = ac.currentTime;
      prevG.gain.setValueAtTime(prevG.gain.value, t);
      prevG.gain.linearRampToValueAtTime(0, t + 1.0);
      setTimeout(() => { try { prev.stop(); } catch {} }, 1200);
      zoneOsc  = null;
      zoneGain = null;
    }

    // Nuevo drone
    const osc = ac.createOscillator();
    osc.type  = 'sine';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    const g = ac.createGain();
    // JFC: anchor antes del ramp (iOS Safari)
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.055, ac.currentTime + 2.0);
    osc.connect(g); g.connect(ac.destination);
    osc.start();
    zoneOsc  = osc;
    zoneGain = g;
  }

  function stopCurrentZone() {
    if (!ctx || !zoneGain || !zoneOsc) return;
    const t = ctx.currentTime;
    zoneGain.gain.setValueAtTime(zoneGain.gain.value, t);
    zoneGain.gain.linearRampToValueAtTime(0, t + 0.8);
    const dead = zoneOsc;
    setTimeout(() => { try { dead.stop(); } catch {} }, 1000);
    zoneOsc  = null;
    zoneGain = null;
    currentZone = null;
  }

  // ── SFX de acción ─────────────────────────────────────────────────────────

  // Confirmación breezy: dos notas (Do5 + Sol5), muy suave
  function _confirm(ac: AudioContext) {
    [523.25, 783.99].forEach((freq, i) => {  // C5, G5
      const osc = ac.createOscillator();
      osc.type  = 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      const g = gain(ac, 0);
      const t = ac.currentTime + i * 0.07;
      g.gain.setValueAtTime(0,    t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.010);
      g.gain.setValueAtTime(0.09, t + 0.07);
      g.gain.linearRampToValueAtTime(0,    t + 0.30);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + 0.34);
    });
  }

  // Hito grande: triada de Do mayor ascendente (C5 → E5 → G5)
  function _milestone(ac: AudioContext) {
    [523.25, 659.25, 783.99].forEach((freq, i) => {  // C5, E5, G5
      const osc = ac.createOscillator();
      osc.type  = 'triangle';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      const g = gain(ac, 0);
      const t = ac.currentTime + i * 0.13;
      g.gain.setValueAtTime(0,    t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.015);
      g.gain.setValueAtTime(0.22, t + 0.11);
      g.gain.linearRampToValueAtTime(0,    t + 0.55);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + 0.60);
    });
  }

  // Cierre de quincena: resolución G4 → E4 → C4 (cadencia perfecta)
  function _endTurn(ac: AudioContext) {
    [392.00, 329.63, 261.63].forEach((freq, i) => {  // G4, E4, C4
      const osc = ac.createOscillator();
      osc.type  = 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      const g = gain(ac, 0);
      const t = ac.currentTime + i * 0.16;
      g.gain.setValueAtTime(0,    t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.018);
      g.gain.setValueAtTime(0.11, t + 0.13);
      g.gain.linearRampToValueAtTime(0,    t + 0.55);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + 0.60);
    });
  }

  // ── API pública ────────────────────────────────────────────────────────────
  return {
    /**
     * Llamar en el primer gesto de usuario — idéntico al cityMusic.arm().
     * Desbloquea AudioContext en iOS/Android (política autoplay).
     */
    arm() {
      armed = true;
      if (!ctx) {
        try { ctx = new AudioContext(); } catch { return; }
      }
      ctx.resume().catch(() => {});
    },

    /** Activar/desactivar sin perder el estado de armed */
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) stopCurrentZone();
    },

    /** Sonido de movimiento. Llamar justo ANTES de commitear la nueva ubicación. */
    playMove(transport: string) {
      const ac = getCtx();
      if (!ac) return;
      (TRANSPORT_SFX[transport as TransportKey] ?? sfxWalk)(ac);
    },

    /**
     * Cambiar drone de zona. Llamar cuando el jugador llega a una nueva ubicación.
     * Hace crossfade suave (1 s) entre la zona anterior y la nueva.
     */
    setZone(zone: string) {
      if (zone === currentZone) return;
      currentZone = zone;
      applyZone(zone);
    },

    /** Parar el drone activo (por ejemplo, al cerrar el juego o silenciar todo). */
    stopZone: stopCurrentZone,

    /** Chime discreto al completar una acción normal (do + sol, muy suave). */
    playActionConfirm() {
      const ac = getCtx();
      if (ac) _confirm(ac);
    },

    /** Fanfarra de ascenso/graduación (triada mayor ascendente). */
    playMilestone() {
      const ac = getCtx();
      if (ac) _milestone(ac);
    },

    /**
     * Cadencia de cierre de quincena (G→E→C).
     * Llamar cuando finishTurn() setea el flash de narrateClose.
     */
    playEndTurn() {
      const ac = getCtx();
      if (ac) _endTurn(ac);
    },
  };
}

export const soundscape = createSoundscape();
