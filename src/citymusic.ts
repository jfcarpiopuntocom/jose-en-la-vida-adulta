// ── Caminata por Cuenca — tema oficial del juego (jazz retro, WAV) ──
// Suena SIEMPRE por defecto. iOS/Safari bloquean autoplay sin gesto,
// así que armamos un listener de primer gesto que lo arranca. Se apaga/enciende
// con el ícono de saxofón.
const URL = '/jose-en-la-vida-adulta/audio/jazz-cuenca.wav';
let el: HTMLAudioElement | null = null;
let wanted = true;      // intención del usuario: música encendida por defecto
let armed = false;

function ensure(): HTMLAudioElement {
  if (!el) {
    el = new Audio(URL);
    el.loop = true;
    el.volume = 0.42;
    el.preload = 'auto';
  }
  return el;
}
function tryPlay() { if (wanted) ensure().play().catch(() => {}); }

export const cityMusic = {
  get wanted(): boolean { return wanted; },
  get playing(): boolean { return !!el && !el.paused; },
  // Arranca de inmediato (desktop) y al primer gesto (iOS/mobile)
  arm(): void {
    if (armed) return;
    armed = true;
    const evs = ['pointerdown', 'touchstart', 'keydown', 'click'];
    const handler = () => {
      tryPlay();
      if (cityMusic.playing) evs.forEach(e => window.removeEventListener(e, handler));
    };
    evs.forEach(e => window.addEventListener(e, handler, { passive: true }));
    tryPlay();
  },
  toggle(): void {
    const a = ensure();
    if (a.paused) { wanted = true; a.play().catch(() => {}); }
    else { wanted = false; a.pause(); }
  },
};
