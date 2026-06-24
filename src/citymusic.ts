// ── Caminata por Cuenca — jazz retro desde archivo WAV ──
// HTML5 Audio: arranca con gesto del usuario (compatible iOS/Safari/mobile).
const URL = '/jose-en-la-vida-adulta/audio/jazz-cuenca.wav';
let el: HTMLAudioElement | null = null;

function ensure(): HTMLAudioElement {
  if (!el) {
    el = new Audio(URL);
    el.loop = true;
    el.volume = 0.45;
    el.preload = 'auto';
  }
  return el;
}

export const cityMusic = {
  get playing(): boolean { return !!el && !el.paused; },
  toggle(): void {
    const a = ensure();
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  },
};
