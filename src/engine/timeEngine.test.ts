import { createInitialState } from '../store/gameState';
import { canAffordTime, spendTime, getMoveCost, endTurn, HOURS_PER_TURN } from './timeEngine';
import { getLocation } from '../data/locations';

const newState = () => createInitialState({ players: [{ id: 'jose', name: 'José' }] });

describe('timeEngine', () => {
  test('canAffordTime respeta el tiempo restante', () => {
    const state = newState();
    expect(canAffordTime(state.players[0], 50)).toBe(true);
    expect(canAffordTime(state.players[0], HOURS_PER_TURN + 1)).toBe(false);
  });

  test('spendTime resta horas sin bajar de cero', () => {
    const state = newState();
    const after = spendTime(state.players[0], 200);
    expect(after.timeLeft).toBe(0);
    expect(state.players[0].timeLeft).toBe(HOURS_PER_TURN);
  });

  test('getMoveCost devuelve el costo según transporte', () => {
    const destino = getLocation('centro_historico');
    expect(getMoveCost(destino, 'walk')).toBe(3);
    expect(getMoveCost(destino, 'car')).toBe(0.5);
  });

  test('endTurn avanza el turno y resetea el tiempo', () => {
    const state = newState();
    const spent = { ...state, players: [spendTime(state.players[0], 50)] };
    const next = endTurn(spent);
    expect(next.turn).toBe(2);
    expect(next.phase).toBe('planning');
    expect(next.players[0].timeLeft).toBe(HOURS_PER_TURN);
  });
});
