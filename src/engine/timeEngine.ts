import { GameState, PlayerState, TransportType, Location } from '../types';

export const HOURS_PER_TURN = 112;

export function canAffordTime(player: PlayerState, hours: number): boolean {
  return player.timeLeft >= hours;
}

export function spendTime(player: PlayerState, hours: number): PlayerState {
  return { ...player, timeLeft: Math.max(0, player.timeLeft - hours) };
}

export function getMoveCost(
  destination: Location,
  transport: TransportType
): number {
  return destination.travelCostByTransport[transport];
}

// Avanza a la siguiente quincena: resetea timeLeft, incrementa turn, vuelve a 'planning'.
export function endTurn(state: GameState): GameState {
  const players = state.players.map((p) => ({ ...p, timeLeft: HOURS_PER_TURN }));
  return { ...state, turn: state.turn + 1, phase: 'planning', players };
}
