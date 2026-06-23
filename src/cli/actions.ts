// Acciones disponibles según la locación actual.
// Cada acción consume tiempo y produce efectos. Magnitudes calibradas:
// las decisiones del jugador pesan ~3-5x más que un evento típico.

import { GameState, PlayerState, SystemEffect } from '../types';
import { applyEffects } from '../engine/eventBus';
import { getJobsAt } from '../data/jobs';

export interface Action {
  id: string;
  label: string;
  hours: number;
  description: string;
  available: (p: PlayerState, state: GameState) => boolean;
  perform: (state: GameState, playerId: string) => { state: GameState; log: string };
}

function applyToPlayer(state: GameState, playerId: string, effects: SystemEffect[]): GameState {
  // Cobra tiempo y aplica efectos
  return applyEffects(state, playerId, effects);
}

function makeWorkAction(jobId: string): Action {
  return {
    id: `work_${jobId}`,
    label: 'Trabajar (turno)',
    hours: 8,
    description: 'Cumples tu turno. Cobras al final.',
    available: (p) => p.job?.id === jobId && p.timeLeft >= 8,
    perform: (state, playerId) => {
      const player = state.players.find((x) => x.id === playerId)!;
      const job = player.job!;
      const wage = Math.round(job.baseWage * state.world.wageMultiplier);
      const effects: SystemEffect[] = [
        { target: 'time', operation: 'add', value: -job.hoursPerShift },
        { target: 'liquidity', operation: 'add', value: wage },
        { target: 'stats', operation: 'add', key: 'stress', value: job.stressPerShift },
        { target: 'stats', operation: 'add', key: 'experience', value: job.experiencePerShift },
        { target: 'stats', operation: 'add', key: 'dependability', value: 1 },
      ];
      return {
        state: applyToPlayer(state, playerId, effects),
        log: `${player.name} trabajó ${job.hoursPerShift}h en ${job.title} (+$${wage})`,
      };
    },
  };
}

function applyForJobAction(jobId: string): Action {
  return {
    id: `apply_${jobId}`,
    label: `Postular: ${jobId}`,
    hours: 2,
    description: 'Llevas tu hoja de vida y te entrevistan.',
    available: (p) => p.job === null && p.timeLeft >= 2,
    perform: (state, playerId) => {
      const player = state.players.find((x) => x.id === playerId)!;
      const jobsHere = getJobsAt(player.currentLocation);
      const job = jobsHere.find((j) => j.id === jobId)!;
      const accepted = player.stats.dependability >= job.minDependability;
      const effects: SystemEffect[] = [{ target: 'time', operation: 'add', value: -2 }];
      const nextState = applyToPlayer(state, playerId, effects);
      if (accepted) {
        const players = nextState.players.map((p) => (p.id === playerId ? { ...p, job } : p));
        return {
          state: { ...nextState, players },
          log: `${player.name} fue contratado en ${job.title}`,
        };
      }
      return {
        state: nextState,
        log: `${player.name} postuló a ${job.title}: no quedaste (sube tu confiabilidad)`,
      };
    },
  };
}

const studyAction: Action = {
  id: 'study',
  label: 'Estudiar (10h)',
  hours: 10,
  description: '+ conocimientos, - liquidez.',
  available: (p) => p.timeLeft >= 10 && p.liquidity >= 20,
  perform: (state, playerId) => {
    const player = state.players.find((x) => x.id === playerId)!;
    const effects: SystemEffect[] = [
      { target: 'time', operation: 'add', value: -10 },
      { target: 'liquidity', operation: 'add', value: -20 },
      { target: 'stats', operation: 'add', key: 'knowledge', value: 8 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 1 },
    ];
    return {
      state: applyToPlayer(state, playerId, effects),
      log: `${player.name} estudió 10h en la universidad (+8 conocimientos)`,
    };
  },
};

const restAction: Action = {
  id: 'rest',
  label: 'Descansar (8h)',
  hours: 8,
  description: '+ salud, - estrés.',
  available: (p) => p.timeLeft >= 8,
  perform: (state, playerId) => {
    const player = state.players.find((x) => x.id === playerId)!;
    const effects: SystemEffect[] = [
      { target: 'time', operation: 'add', value: -8 },
      { target: 'stats', operation: 'add', key: 'health', value: 6 },
      { target: 'stats', operation: 'add', key: 'stress', value: -10 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 3 },
    ];
    return {
      state: applyToPlayer(state, playerId, effects),
      log: `${player.name} descansó en casa (+salud, -estrés)`,
    };
  },
};

const socializeAction: Action = {
  id: 'socialize',
  label: 'Socializar (4h)',
  hours: 4,
  description: '+ felicidad, + reputación, - $15.',
  available: (p) => p.timeLeft >= 4 && p.liquidity >= 15,
  perform: (state, playerId) => {
    const player = state.players.find((x) => x.id === playerId)!;
    const effects: SystemEffect[] = [
      { target: 'time', operation: 'add', value: -4 },
      { target: 'liquidity', operation: 'add', value: -15 },
      { target: 'stats', operation: 'add', key: 'happiness', value: 7 },
      { target: 'stats', operation: 'add', key: 'reputation', value: 3 },
    ];
    return {
      state: applyToPlayer(state, playerId, effects),
      log: `${player.name} salió con amigos (+felicidad, +reputación)`,
    };
  },
};

const bankSaveAction: Action = {
  id: 'bank_save',
  label: 'Ahorrar $100 en banco',
  hours: 1,
  description: 'Mueve $100 de liquidez a patrimonio bancario.',
  available: (p) => p.timeLeft >= 1 && p.liquidity >= 100,
  perform: (state, playerId) => {
    const player = state.players.find((x) => x.id === playerId)!;
    const next = applyToPlayer(state, playerId, [
      { target: 'time', operation: 'add', value: -1 },
      { target: 'liquidity', operation: 'add', value: -100 },
    ]);
    const players = next.players.map((p) =>
      p.id === playerId
        ? { ...p, patrimony: { ...p.patrimony, cashInBank: p.patrimony.cashInBank + 100 } }
        : p
    );
    return {
      state: { ...next, players },
      log: `${player.name} ahorró $100 en el banco`,
    };
  },
};

const startBusinessAction: Action = {
  id: 'start_business',
  label: 'Abrir negocio en Feria ($500)',
  hours: 12,
  description: 'Comercio pequeño. Genera ventas pasivas cada quincena.',
  available: (p) => p.timeLeft >= 12 && p.liquidity >= 500 && p.patrimony.businesses.length === 0,
  perform: (state, playerId) => {
    const player = state.players.find((x) => x.id === playerId)!;
    const next = applyToPlayer(state, playerId, [
      { target: 'time', operation: 'add', value: -12 },
      { target: 'liquidity', operation: 'add', value: -500 },
      { target: 'stats', operation: 'add', key: 'experience', value: 3 },
    ]);
    const players = next.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            patrimony: {
              ...p.patrimony,
              businesses: [
                ...p.patrimony.businesses,
                {
                  id: `biz_${playerId}_${state.turn}`,
                  type: 'comercio' as const,
                  locationId: 'feria_libre',
                  capitalInvested: 500,
                  ticketPromedio: 12,
                  baseClientes: 8,
                  costosFijos: 40,
                },
              ],
            },
          }
        : p
    );
    return {
      state: { ...next, players },
      log: `${player.name} abrió un negocio en la Feria Libre`,
    };
  },
};

const operateBusinessAction: Action = {
  id: 'operate_business',
  label: 'Operar negocio (8h)',
  hours: 8,
  description: 'Atender clientes en tu local. Ingresos por ventas.',
  available: (p) => p.timeLeft >= 8 && p.patrimony.businesses.length > 0,
  perform: (state, playerId) => {
    const player = state.players.find((x) => x.id === playerId)!;
    const biz = player.patrimony.businesses[0];
    const clientes = Math.round(biz.baseClientes * state.world.salesMultiplier);
    const ingreso = clientes * biz.ticketPromedio;
    const utilidad = ingreso - biz.costosFijos;
    const effects: SystemEffect[] = [
      { target: 'time', operation: 'add', value: -8 },
      { target: 'liquidity', operation: 'add', value: utilidad },
      { target: 'stats', operation: 'add', key: 'stress', value: 5 },
      { target: 'stats', operation: 'add', key: 'experience', value: 2 },
      { target: 'stats', operation: 'add', key: 'reputation', value: 1 },
    ];
    return {
      state: applyToPlayer(state, playerId, effects),
      log: `${player.name} operó negocio: ${clientes} clientes, utilidad $${utilidad}`,
    };
  },
};

// Mapa locación → acciones disponibles
export function actionsForLocation(state: GameState, player: PlayerState): Action[] {
  const out: Action[] = [];
  const loc = player.currentLocation;

  // Acción universal: descansar SOLO en residencial
  if (loc === 'barrio_residencial') {
    out.push(restAction, socializeAction);
  }

  if (loc === 'zona_universitaria') {
    out.push(studyAction);
  }

  if (loc === 'zona_financiera') {
    out.push(bankSaveAction);
  }

  if (loc === 'feria_libre') {
    if (player.patrimony.businesses.length === 0) out.push(startBusinessAction);
    if (player.patrimony.businesses.length > 0) out.push(operateBusinessAction);
  }

  // Trabajos disponibles en esta locación
  const jobsHere = getJobsAt(loc);
  for (const j of jobsHere) {
    if (player.job?.id === j.id) {
      out.push(makeWorkAction(j.id));
    } else if (player.job === null) {
      out.push(applyForJobAction(j.id));
    }
  }

  return out.filter((a) => a.available(player, state));
}
