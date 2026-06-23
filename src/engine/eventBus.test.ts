import { createInitialState } from '../store/gameState';
import { applyEffect, applyEffects, eventBus } from './eventBus';
import { SystemEffect } from '../types';

const newState = (ids: string[]) =>
  createInitialState({ players: ids.map((id) => ({ id, name: id })) });

describe('eventBus / applyEffect', () => {
  test('add sobre liquidity de un jugador', () => {
    const state = newState(['jose']);
    const next = applyEffect(state, 'jose', { target: 'liquidity', operation: 'add', value: -400 });
    expect(next.players[0].liquidity).toBe(-100);
    expect(state.players[0].liquidity).toBe(300);
  });

  test('stats con tope (health) se clampean entre 0 y 100', () => {
    const state = newState(['jose']);
    const next = applyEffect(state, 'jose', { target: 'stats', operation: 'add', key: 'stress', value: 1000 });
    expect(next.players[0].stats.stress).toBe(100);
  });

  test('experience y knowledge son sin tope', () => {
    const state = newState(['jose']);
    const next = applyEffect(state, 'jose', { target: 'stats', operation: 'add', key: 'experience', value: 250 });
    expect(next.players[0].stats.experience).toBe(250);
  });

  test('applyEffects aplica una cadena en orden', () => {
    const state = newState(['jose']);
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
    const state = newState(['jose', 'maria', 'carlos', 'lucia']);
    const next = applyEffect(state, 'maria', { target: 'liquidity', operation: 'add', value: 500 });
    expect(next.players.find((p) => p.id === 'maria')!.liquidity).toBe(800);
    expect(next.players.find((p) => p.id === 'jose')!.liquidity).toBe(300);
  });

  test('createInitialState rechaza fuera de rango 1-4', () => {
    expect(() => createInitialState({ players: [] })).toThrow();
    expect(() =>
      createInitialState({
        players: [
          { id: 'a', name: 'a' },
          { id: 'b', name: 'b' },
          { id: 'c', name: 'c' },
          { id: 'd', name: 'd' },
          { id: 'e', name: 'e' },
        ],
      })
    ).toThrow();
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
