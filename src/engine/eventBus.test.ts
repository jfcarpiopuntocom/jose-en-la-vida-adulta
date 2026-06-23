import { createInitialState } from '../store/gameState';
import { applyEffect, applyEffects, eventBus } from './eventBus';
import { SystemEffect } from '../types';

describe('eventBus / applyEffect', () => {
  test('add sobre liquidity de un jugador', () => {
    const state = createInitialState(['jose']);
    const next = applyEffect(state, 'jose', { target: 'liquidity', operation: 'add', value: -400 });
    expect(next.players[0].liquidity).toBe(state.players[0].liquidity - 400);
    expect(state.players[0].liquidity).toBe(300); // inmutable
  });

  test('stats se clampean entre 0 y 100', () => {
    const state = createInitialState(['jose']);
    const next = applyEffect(state, 'jose', { target: 'stats', operation: 'add', key: 'stress', value: 1000 });
    expect(next.players[0].stats.stress).toBe(100);
  });

  test('applyEffects aplica una cadena en orden', () => {
    const state = createInitialState(['jose']);
    const effects: SystemEffect[] = [
      { target: 'liquidity', operation: 'add', value: -400 },
      { target: 'stats', operation: 'add', key: 'stress', value: 25 },
      { target: 'stats', operation: 'add', key: 'resilience', value: 10 },
    ];
    const next = applyEffects(state, 'jose', effects);
    expect(next.players[0].liquidity).toBe(-100);
    expect(next.players[0].stats.stress).toBe(45);
    expect(next.players[0].stats.resilience).toBe(10);
  });

  test('en partida multijugador, un efecto solo toca al jugador apuntado', () => {
    const state = createInitialState(['jose', 'maria', 'carlos', 'lucia']);
    const next = applyEffect(state, 'maria', { target: 'liquidity', operation: 'add', value: 500 });
    expect(next.players.find((p) => p.id === 'maria')!.liquidity).toBe(800);
    expect(next.players.find((p) => p.id === 'jose')!.liquidity).toBe(300);
    expect(next.players.find((p) => p.id === 'carlos')!.liquidity).toBe(300);
    expect(next.players.find((p) => p.id === 'lucia')!.liquidity).toBe(300);
  });

  test('createInitialState rechaza menos de 1 o más de 4 jugadores', () => {
    expect(() => createInitialState([])).toThrow();
    expect(() => createInitialState(['a', 'b', 'c', 'd', 'e'])).toThrow();
  });

  test('eventBus notifica a los suscriptores sin mutar estado', () => {
    const received: SystemEffect[] = [];
    const unsubscribe = eventBus.subscribe((effect) => received.push(effect));
    eventBus.emit({ target: 'liquidity', operation: 'add', value: 100 });
    expect(received).toHaveLength(1);
    unsubscribe();
    eventBus.emit({ target: 'liquidity', operation: 'add', value: 100 });
    expect(received).toHaveLength(1);
  });
});
