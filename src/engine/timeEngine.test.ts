import { createInitialState } from '../store/gameState';
import { canAffordTime, spendTime, getMoveCost, endTurn, HOURS_PER_TURN } from './timeEngine';
import { getLocation } from '../data/locations';

describe('timeEngine', () => {
  test('canAffordTime respeta el tiempo restante', () => {
    const state = createInitialState();
    const player = state.players[0];
    expect(canAffordTime(player, 50)).toBe(true);
    expect(canAffordTime(player, HOURS_PER_TURN + 1)).toBe(false);
  });

  test('spendTime resta horas sin bajar de cero', () => {
    const state = createInitialState();
    const player = state.players[0];
    const after = spendTime(player, 200);
    expect(after.timeLeft).toBe(0);
    expect(player.timeLeft).toBe(HOURS_PER_TURN); // inmutable: el original no cambia
  });

  test('getMoveCost devuelve el costo según transporte', () => {
    const destino = getLocation('centro_historico');
    expect(getMoveCost(destino, 'walk')).toBe(3);
    expect(getMoveCost(destino, 'car')).toBe(0.5);
  });

  test('endTurn avanza el turno y resetea el tiempo', () => {
    const state = createInitialState();
    const spent = { ...state, players: [spendTime(state.players[0], 50)] };
    const next = endTurn(spent);
    expect(next.turn).toBe(2);
    expect(next.phase).toBe('planning');
    expect(next.players[0].timeLeft).toBe(HOURS_PER_TURN);
  });
});
