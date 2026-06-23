import * as readline from 'readline';
import { GameState } from '../types';
import { createInitialState, NewGameOptions } from '../store/gameState';
import { renderFullScreen } from './render';
import { actionsForLocation } from './actions';
import { locations, getLocation } from '../data/locations';
import { rollCosasQuePasan } from '../engine/cosasQuePasanEngine';
import { endTurn, spendTime } from '../engine/timeEngine';
import { applyEffects } from '../engine/eventBus';
import { c, paint, clearScreen, playerColor } from './colors';
import { snapshot } from '../engine/metrics';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, (a) => res(a.trim())));

export async function runGame(): Promise<void> {
  clearScreen();
  console.log(paint(c.gold + c.bold, '\n  JOSÉ EN LA VIDA ADULTA  ') + paint(c.dim, ' v0.88'));
  console.log(paint(c.dim, '  un simulador de Cuenca, Ecuador\n'));
  console.log(paint(c.white, '  "No importa cuántas veces cambie el camino. Lo importante es seguir avanzando."\n'));

  const nRaw = await ask(paint(c.brightWhite, '  ¿Cuántos jugadores? (1-4): '));
  const n = Math.max(1, Math.min(4, parseInt(nRaw) || 1));
  const playerOpts: NewGameOptions = { players: [] };
  for (let i = 0; i < n; i++) {
    const def = i === 0 ? 'José' : `Jugador${i + 1}`;
    const name =
      (await ask(paint(c.brightWhite, `  Nombre del jugador ${i + 1} [${def}]: `))) || def;
    playerOpts.players.push({ id: `p${i}`, name });
  }

  let state = createInitialState(playerOpts);
  // Economía con 50/50 al inicio
  if (Math.random() < 0.5) {
    state = { ...state, world: { ...state.world, economy: 'bad', wageMultiplier: 0.8, salesMultiplier: 0.8 } };
  }

  while (state.phase !== 'gameover') {
    state = await playTurn(state);
    if (checkWin(state)) {
      printVictory(state);
      break;
    }
  }
  rl.close();
}

async function playTurn(state: GameState): Promise<GameState> {
  // Cada jugador agota su tiempo (o pasa) antes de avanzar al evento
  for (let pi = 0; pi < state.players.length; pi++) {
    state = { ...state, activePlayerIndex: pi };
    while (state.players[pi].timeLeft > 0) {
      process.stdout.write(renderFullScreen(state));
      const player = state.players[pi];

      console.log(paint(c.gold + c.bold, `\n  Turno de ${player.name}  `) +
        paint(c.dim, `(${player.timeLeft}h restantes en la quincena)`));
      console.log(paint(c.dim, '  ─────────────────────────────────────────'));

      const choice = await mainMenu();
      if (choice === 'm') {
        state = await doMove(state, pi);
      } else if (choice === 'a') {
        state = await doAction(state, pi);
      } else if (choice === 'p') {
        // Pasar a evento (terminar mi tiempo)
        state = {
          ...state,
          players: state.players.map((p, i) => (i === pi ? { ...p, timeLeft: 0 } : p)),
        };
      } else if (choice === 'd') {
        await showDetail(state, pi);
      } else if (choice === 'q') {
        console.log(paint(c.gold, '\n  Hasta luego. Tu historia continúa fuera del juego.\n'));
        return { ...state, phase: 'gameover' };
      }
    }
  }

  // Fase de eventos: un evento por jugador (puede ser null)
  for (let pi = 0; pi < state.players.length; pi++) {
    const result = rollCosasQuePasan(state, state.players[pi].id);
    state = result.state;
    if (result.fired) {
      const logLine = `[Q${state.turn}] ${state.players[pi].name}: ${result.fired.event.narrative.title}`;
      state = { ...state, log: [...state.log, logLine] };
      await announceEvent(state, pi, result.fired);
    }
  }

  // Cobro de costos fijos de negocios
  state = applyBusinessCosts(state);

  // Cambio económico aleatorio (raro)
  if (Math.random() < 0.08) {
    const newEcon = state.world.economy === 'good' ? 'bad' : 'good';
    state = {
      ...state,
      world: {
        ...state.world,
        economy: newEcon,
        wageMultiplier: newEcon === 'good' ? 1.0 : 0.8,
        salesMultiplier: newEcon === 'good' ? 1.0 : 0.8,
        priceMultiplier: newEcon === 'good' ? 1.0 : 0.85,
      },
      log: [
        ...state.log,
        paint(c.orange, `[Q${state.turn}] La economía cambió a ${newEcon === 'good' ? 'buen año' : 'mal año'}`),
      ],
    };
  }

  // Avanza quincena
  state = endTurn(state);
  return state;
}

async function mainMenu(): Promise<string> {
  console.log(
    paint(c.brightWhite, '  [m]') + paint(c.white, ' moverse  ') +
    paint(c.brightWhite, '[a]') + paint(c.white, ' acción local  ') +
    paint(c.brightWhite, '[d]') + paint(c.white, ' detalle  ') +
    paint(c.brightWhite, '[p]') + paint(c.white, ' pasar al evento  ') +
    paint(c.brightWhite, '[q]') + paint(c.white, ' salir')
  );
  const r = (await ask(paint(c.gold, '  > '))).toLowerCase();
  return r || 'a';
}

async function doMove(state: GameState, pi: number): Promise<GameState> {
  const player = state.players[pi];
  console.log(paint(c.brightWhite, '\n  Locaciones:'));
  locations.forEach((loc, i) => {
    const cost = loc.travelCostByTransport[player.transport];
    const here = loc.id === player.currentLocation;
    const tag = here ? paint(c.dim, ' (aquí)') : paint(c.gold, ` (${cost}h)`);
    console.log(`    ${paint(c.brightWhite, String(i + 1))}. ${paint(c.brightWhite, loc.name)}${tag}`);
  });
  const r = await ask(paint(c.gold, '  destino > '));
  const idx = parseInt(r) - 1;
  if (isNaN(idx) || idx < 0 || idx >= locations.length) return state;
  const dest = locations[idx];
  if (dest.id === player.currentLocation) return state;
  const cost = dest.travelCostByTransport[player.transport];
  if (player.timeLeft < cost) {
    console.log(paint(c.red, '  No te alcanza el tiempo para moverte.'));
    await ask(paint(c.dim, '  enter para continuar...'));
    return state;
  }
  const moved = spendTime(player, cost);
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === pi ? { ...moved, currentLocation: dest.id } : p
    ),
  };
}

async function doAction(state: GameState, pi: number): Promise<GameState> {
  const player = state.players[pi];
  const acts = actionsForLocation(state, player);
  if (acts.length === 0) {
    console.log(paint(c.dim, `\n  No hay acciones disponibles en ${getLocation(player.currentLocation).name}.`));
    await ask(paint(c.dim, '  enter para continuar...'));
    return state;
  }
  console.log(paint(c.brightWhite, `\n  Acciones en ${getLocation(player.currentLocation).name}:`));
  acts.forEach((a, i) => {
    console.log(
      `    ${paint(c.brightWhite, String(i + 1))}. ${paint(c.brightWhite, a.label)} ` +
      paint(c.dim, `(${a.hours}h) — ${a.description}`)
    );
  });
  const r = await ask(paint(c.gold, '  acción > '));
  const idx = parseInt(r) - 1;
  if (isNaN(idx) || idx < 0 || idx >= acts.length) return state;
  const { state: next, log } = acts[idx].perform(state, player.id);
  console.log('\n  ' + paint(c.green, '✔ ') + paint(c.white, log));
  await ask(paint(c.dim, '\n  enter para continuar...'));
  return { ...next, log: [...next.log, log] };
}

async function showDetail(state: GameState, pi: number): Promise<void> {
  const p = state.players[pi];
  const s = p.stats;
  const m = snapshot(p);
  console.log('\n' + paint(c.gold + c.bold, `  Detalle de ${p.name}`));
  console.log(paint(c.dim,   '  ─────────────────────────────────────────'));
  console.log(`    Vivienda:       ${paint(c.brightWhite, p.housing)}`);
  console.log(`    Transporte:     ${paint(c.brightWhite, p.transport)}`);
  console.log(`    Empleo:         ${paint(c.brightWhite, p.job?.title ?? 'sin empleo')}`);
  console.log(`    Negocios:       ${paint(c.brightWhite, String(p.patrimony.businesses.length))}`);
  console.log(`    Banco:          ${paint(c.gold, '$' + p.patrimony.cashInBank)}`);
  console.log('');
  console.log(`    Salud:          ${paint(c.green, String(s.health))}/100`);
  console.log(`    Estrés:         ${paint(c.red, String(s.stress))}/100`);
  console.log(`    Felicidad:      ${paint(c.green, String(s.happiness))}/100`);
  console.log(`    Reputación:     ${paint(c.magenta, String(s.reputation))}/100`);
  console.log(`    Experiencia:    ${paint(c.pink, String(s.experience))}`);
  console.log(`    Confiabilidad:  ${paint(c.brightWhite, String(s.dependability))}/100`);
  console.log(`    Liderazgo:      ${paint(c.brightWhite, String(s.leadership))}/100`);
  console.log(`    Conocimiento:   ${paint(c.pink, String(s.knowledge))}`);
  console.log('');
  console.log(paint(c.gold + c.bold, '    Metas:'));
  console.log(`      Patrimonio:    ${paint(c.gold, String(m.patrimonio))} / ${state.goals.patrimonio}`);
  console.log(`      Bienestar:     ${paint(c.green, String(m.bienestar))} / ${state.goals.bienestar}`);
  console.log(`      Conocimientos: ${paint(c.pink, String(m.conocimientos))} / ${state.goals.conocimientos}`);
  console.log(`      Impacto:       ${paint(c.magenta, String(m.impacto))} / ${state.goals.impacto}`);
  await ask(paint(c.dim, '\n  enter para continuar...'));
}

async function announceEvent(state: GameState, pi: number, fired: { event: any; appliedSilverLining: boolean }): Promise<void> {
  const p = state.players[pi];
  const col = playerColor(p.colorIndex);
  const e = fired.event;
  const tag = e.isNegative ? paint(c.red, '✗ ') : paint(c.green, '✦ ');
  console.log('\n' + tag + paint(col + 'bold', p.name) + paint(c.dim, ' — ') + paint(c.brightWhite, e.narrative.title));
  console.log('    ' + paint(c.white, e.narrative.body));
  if (fired.appliedSilverLining && e.narrative.silverLiningText) {
    console.log('    ' + paint(c.gold, '↪ ' + e.narrative.silverLiningText));
  }
  await ask(paint(c.dim, '\n  enter para continuar...'));
}

function applyBusinessCosts(state: GameState): GameState {
  // Pagar costos fijos de cada negocio al cerrar quincena
  let next = state;
  for (const p of state.players) {
    for (const b of p.patrimony.businesses) {
      next = applyEffects(next, p.id, [
        { target: 'liquidity', operation: 'add', value: -b.costosFijos },
      ]);
    }
  }
  return next;
}

function checkWin(state: GameState): boolean {
  for (const p of state.players) {
    const m = snapshot(p);
    if (
      m.patrimonio >= state.goals.patrimonio &&
      m.bienestar >= state.goals.bienestar &&
      m.conocimientos >= state.goals.conocimientos &&
      m.impacto >= state.goals.impacto
    ) {
      return true;
    }
  }
  return false;
}

function printVictory(state: GameState): void {
  console.log('\n' + paint(c.gold + c.bold, '═══════════════════════════════════════════════════'));
  console.log(paint(c.gold + c.bold, '   VICTORIA'));
  console.log(paint(c.gold + c.bold, '═══════════════════════════════════════════════════\n'));
  for (const p of state.players) {
    const m = snapshot(p);
    const won =
      m.patrimonio >= state.goals.patrimonio &&
      m.bienestar >= state.goals.bienestar &&
      m.conocimientos >= state.goals.conocimientos &&
      m.impacto >= state.goals.impacto;
    if (won) {
      console.log(
        paint(playerColor(p.colorIndex) + c.bold, `  ${p.name} `) +
        paint(c.white, `alcanzó sus metas en la quincena ${state.turn}.`)
      );
    }
  }
  console.log('\n' + paint(c.white, '  Eventos importantes de tu historia:'));
  state.log.slice(-10).forEach((l) => console.log(paint(c.dim, '    · ') + paint(c.white, l)));
  console.log('');
}
