import { GameState, PlayerState } from '../types';
import { HOURS_PER_TURN } from '../engine/timeEngine';

export function createInitialPlayer(id: string): PlayerState {
  return {
    id,
    timeLeft: HOURS_PER_TURN,
    liquidity: 300,
    patrimony: { properties: [], businesses: [], vehicles: [], investments: [] },
    housing: 'family',
    transport: 'walk',
    currentLocation: 'barrio_residencial',
    stats: {
      experience: 0,
      dependability: 50,
      leadership: 0,
      health: 80,
      stress: 20,
      happiness: 60,
      reputation: 30,
      resilience: 0,
    },
  };
}

// playerIds: lista de 1 a 4 ids. Si no se pasa nada, parte una partida solo con José.
export function createInitialState(playerIds: string[] = ['jose']): GameState {
  if (playerIds.length < 1 || playerIds.length > 4) {
    throw new Error(`Soporte 1-4 jugadores; recibí ${playerIds.length}`);
  }
  return {
    turn: 1,
    phase: 'planning',
    players: playerIds.map(createInitialPlayer),
    world: {
      economy: 'good',
      priceMultiplier: 1.0,
      wageMultiplier: 1.0,
      salesMultiplier: 1.0,
    },
  };
}
