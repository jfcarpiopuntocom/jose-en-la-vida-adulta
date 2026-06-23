// ANSI colors — paleta intensa, sin grises ni azules apagados.
// Honra el principio de JFC: vibrante, sólido, legible.

const ESC = '\x1b[';

export const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,           // sólo para bordes decorativos, nunca para texto importante
  white: `${ESC}97m`,
  yellow: `${ESC}93m`,        // oro / dinero
  gold: `${ESC}38;5;220m`,    // oro premium
  green: `${ESC}92m`,         // bienestar / positivo
  red: `${ESC}91m`,           // peligro / Don Choro
  orange: `${ESC}38;5;208m`,  // acento
  pink: `${ESC}38;5;213m`,    // conocimiento (no usar cyan)
  magenta: `${ESC}95m`,       // impacto
  brightWhite: `${ESC}97m${ESC}1m`,
  // fondos
  bgBlack: `${ESC}40m`,
  bgDark: `${ESC}48;5;234m`,
};

export function paint(color: string, text: string): string {
  return `${color}${text}${c.reset}`;
}

// 4 colores distintos para 4 jugadores
const playerPalette = [c.gold, c.green, c.pink, c.orange];
export function playerColor(idx: number): string {
  return playerPalette[idx % playerPalette.length];
}

// Barra de progreso ASCII coloreada.
// value 0..max, ancho en chars.
export function bar(value: number, max: number, width: number, color: string): string {
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return paint(color, '█'.repeat(filled)) + paint(c.dim, '░'.repeat(empty));
}

// Color según ratio: rojo si <30%, amarillo si <60%, verde si >=60%.
export function ratioColor(value: number, max: number): string {
  const r = value / max;
  if (r < 0.3) return c.red;
  if (r < 0.6) return c.orange;
  return c.green;
}

export function clearScreen(): void {
  // Limpia pantalla y posiciona cursor arriba
  process.stdout.write('\x1b[2J\x1b[H');
}
