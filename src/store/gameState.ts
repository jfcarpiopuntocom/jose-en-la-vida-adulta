import { GameState, PlayerState, GoalConfig } from '../types';
import { HOURS_PER_TURN } from '../engine/timeEngine';

export function createInitialPlayer(id: string, name: string, colorIndex: number): PlayerState {
  return {
    id,
    name,
    colorIndex,
    timeLeft: HOURS_PER_TURN,
    liquidity: 300,
    patrimony: { cashInBank: 0, businesses: [], vehicles: [] },
    housing: 'family',
    transport: 'walk',
    currentLocation: 'barrio_residencial',
    job: null,
    stats: {
      experience: 0,
      dependability: 50,
      leadership: 0,
      health: 80,
      stress: 20,
      happiness: 60,
      reputation: 30,
      resilience: 0,
      knowledge: 5,
    },
  };
}

export const DEFAULT_GOALS: GoalConfig = {
  patrimonio: 8000,
  bienestar: 75,
  conocimientos: 60,
  impacto: 60,
};

export interface NewGameOptions {
  players: { id: string; name: string }[]; // 1-4
  goals?: GoalConfig;
}

export function createInitialState(opts: NewGameOptions = { players: [{ id: 'jose', name: 'José' }] }): GameState {
  const ps = opts.players;
  if (ps.length < 1 || ps.length > 4) {
    throw new Error(`Soporte 1-4 jugadores; recibí ${ps.length}`);
  }
  return {
    turn: 1,
    phase: 'planning',
    activePlayerIndex: 0,
    players: ps.map((p, i) => createInitialPlayer(p.id, p.name, i)),
    world: {
      economy: 'good',
      priceMultiplier: 1.0,
      wageMultiplier: 1.0,
      salesMultiplier: 1.0,
    },
    log: [],
    goals: opts.goals ?? DEFAULT_GOALS,
  };
}
