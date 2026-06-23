import { GameState, PlayerState } from '../types';
import { locations, getLocation } from '../data/locations';
import { snapshot } from '../engine/metrics';
import { c, paint, bar, ratioColor, playerColor, clearScreen } from './colors';

const BOARD_WIDTH = 68;
const BOARD_HEIGHT = 18;

// Tablero ASCII de Cuenca con los 6 nodos posicionados según boardPos.
// Marca al jugador activo con un símbolo destacado.
export function renderBoard(state: GameState): string {
  const grid: string[][] = [];
  for (let r = 0; r < BOARD_HEIGHT; r++) {
    grid.push(Array(BOARD_WIDTH).fill(' '));
  }

  // Marco
  for (let x = 0; x < BOARD_WIDTH; x++) {
    grid[0][x] = '─';
    grid[BOARD_HEIGHT - 1][x] = '─';
  }
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    grid[y][0] = '│';
    grid[y][BOARD_WIDTH - 1] = '│';
  }
  grid[0][0] = '╭';
  grid[0][BOARD_WIDTH - 1] = '╮';
  grid[BOARD_HEIGHT - 1][0] = '╰';
  grid[BOARD_HEIGHT - 1][BOARD_WIDTH - 1] = '╯';

  // Conexiones (líneas simples entre nodos)
  drawLine(grid, 12, 3, 30, 6);   // Universitaria → Centro
  drawLine(grid, 50, 3, 30, 6);   // Financiera → Centro
  drawLine(grid, 30, 6, 12, 10);  // Centro → Feria
  drawLine(grid, 30, 6, 50, 10);  // Centro → Residencial
  drawLine(grid, 30, 6, 30, 14);  // Centro → Industrial
  drawLine(grid, 12, 10, 30, 14); // Feria → Industrial
  drawLine(grid, 50, 10, 30, 14); // Residencial → Industrial

  // Nodos de locación: cuadrito con código
  const codes: Record<string, string> = {
    centro_historico: 'CEN',
    feria_libre: 'FER',
    zona_universitaria: 'UNI',
    barrio_residencial: 'RES',
    zona_industrial: 'IND',
    zona_financiera: 'FIN',
  };
  for (const loc of locations) {
    const { col, row } = loc.boardPos;
    const code = codes[loc.id];
    placeText(grid, col - 2, row, `[${code}]`);
  }

  // Marcadores de jugadores: símbolo a la derecha del nodo
  const playersPerLoc: Record<string, PlayerState[]> = {};
  for (const p of state.players) {
    (playersPerLoc[p.currentLocation] ||= []).push(p);
  }
  for (const [locId, ps] of Object.entries(playersPerLoc)) {
    const loc = getLocation(locId);
    let xOffset = 4;
    for (const p of ps) {
      const marker = p.id === state.players[state.activePlayerIndex].id ? '★' : '●';
      placeText(grid, loc.boardPos.col + xOffset, loc.boardPos.row, marker);
      xOffset += 2;
    }
  }

  // Render coloreado
  let out = '';
  for (let r = 0; r < BOARD_HEIGHT; r++) {
    let row = '';
    let i = 0;
    while (i < BOARD_WIDTH) {
      const ch = grid[r][i];
      // Coloreado contextual mínimo: marcos en dim, nodos en blanco brillante
      if ('─│╭╮╰╯·'.includes(ch)) {
        row += paint(c.dim, ch);
      } else if ('★●'.includes(ch)) {
        // Determinar de quién es el marcador buscando jugador en esa locación
        const player = findPlayerAtGridPos(state, r, i);
        const col = player ? playerColor(player.colorIndex) : c.white;
        row += paint(col + c.bold, ch);
      } else if (ch === '[' || ch === ']') {
        row += paint(c.gold, ch);
      } else if (ch !== ' ' && /[A-Z]/.test(ch)) {
        row += paint(c.brightWhite, ch);
      } else {
        row += ch;
      }
      i++;
    }
    out += row + '\n';
  }

  // Título encima del tablero
  const titleLine =
    paint(c.gold + c.bold, '  CUENCA  ') + paint(c.dim, ' · tablero de la quincena');
  return titleLine + '\n' + out;
}

function findPlayerAtGridPos(state: GameState, row: number, col: number): PlayerState | null {
  for (const loc of locations) {
    if (loc.boardPos.row !== row) continue;
    const startX = loc.boardPos.col + 4;
    if (col >= startX && col < startX + 8) {
      const offset = Math.floor((col - startX) / 2);
      const here = state.players.filter((p) => p.currentLocation === loc.id);
      if (here[offset]) return here[offset];
    }
  }
  return null;
}

function drawLine(grid: string[][], x1: number, y1: number, x2: number, y2: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let s = 1; s < steps; s++) {
    const x = Math.round(x1 + (dx * s) / steps);
    const y = Math.round(y1 + (dy * s) / steps);
    if (grid[y] && grid[y][x] === ' ') grid[y][x] = '·';
  }
}

function placeText(grid: string[][], col: number, row: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    if (grid[row] && col + i < BOARD_WIDTH - 1 && col + i > 0) {
      grid[row][col + i] = text[i];
    }
  }
}

// HUD por jugador
export function renderHUD(state: GameState, player: PlayerState, goals = state.goals): string {
  const m = snapshot(player);
  const col = playerColor(player.colorIndex);
  const isActive = state.players[state.activePlayerIndex].id === player.id;
  const tag = isActive ? paint(col + c.bold, '▶ ') : '  ';
  const name = paint(col + c.bold, player.name.padEnd(8));
  const turnLine = paint(c.dim, `Q${state.turn}`);

  const econ =
    state.world.economy === 'good'
      ? paint(c.green, '● buen año')
      : paint(c.red, '● mal año');

  const time = `${paint(c.brightWhite, player.timeLeft.toFixed(0).padStart(3))}${paint(c.dim, '/112h')}`;
  const liq = paint(c.gold + c.bold, `$${player.liquidity}`);

  const m1 = metricLine('Patrim.', m.patrimonio, goals.patrimonio, c.gold);
  const m2 = metricLine('Bienest.', m.bienestar, goals.bienestar, c.green);
  const m3 = metricLine('Conoc.', m.conocimientos, goals.conocimientos, c.pink);
  const m4 = metricLine('Impacto', m.impacto, goals.impacto, c.magenta);

  const loc = getLocation(player.currentLocation);
  const job = player.job ? paint(c.white, player.job.title) : paint(c.dim, 'sin empleo');

  return [
    `${tag}${name} ${turnLine}  ${econ}  ${paint(c.dim, 'en')} ${paint(c.brightWhite, loc.name)}  ${paint(c.dim, '·')} ${job}`,
    `   tiempo: ${time}   liquidez: ${liq}`,
    `   ${m1}`,
    `   ${m2}`,
    `   ${m3}`,
    `   ${m4}`,
  ].join('\n');
}

function metricLine(label: string, value: number, goal: number, color: string): string {
  const ratio = Math.min(1, value / goal);
  const filled = Math.round(ratio * 18);
  const empty = 18 - filled;
  const reached = value >= goal ? paint(c.green + c.bold, ' ✓') : '';
  return (
    paint(c.brightWhite, label.padEnd(9)) +
    paint(color, '█'.repeat(filled)) +
    paint(c.dim, '░'.repeat(empty)) +
    ' ' +
    paint(c.brightWhite, String(Math.round(value)).padStart(5)) +
    paint(c.dim, ' / ') +
    paint(c.dim, String(goal)) +
    reached
  );
}

export function renderLog(state: GameState, max = 5): string {
  if (state.log.length === 0) return '';
  const recent = state.log.slice(-max);
  const lines = recent.map((l) => '  ' + l);
  return paint(c.dim, '─── eventos recientes ──────────────────────') + '\n' + lines.join('\n');
}

export function renderFullScreen(state: GameState): string {
  clearScreen();
  let out = '\n';
  out += renderBoard(state) + '\n';
  for (const p of state.players) {
    out += renderHUD(state, p) + '\n';
  }
  if (state.log.length > 0) out += renderLog(state) + '\n';
  return out;
}
