import { createInitialState } from '../store/gameState';
import { rollCosasQuePasan } from './cosasQuePasanEngine';
import { events } from '../data/events';

const newState = (turn = 5) => {
  const s = createInitialState({ players: [{ id: 'jose', name: 'José' }] });
  return { ...s, turn };
};

// RNG determinístico para tests
const rngSeq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('cosasQuePasanEngine', () => {
  test('hay 33 o más eventos disponibles', () => {
    expect(events.length).toBeGreaterThanOrEqual(33);
  });

  test('todos los eventos negativos tienen silverLining', () => {
    const negatives = events.filter((e) => e.isNegative);
    expect(negatives.length).toBeGreaterThan(0);
    negatives.forEach((e) => {
      expect(e.silverLining.length).toBeGreaterThan(0);
    });
  });

  test('25% de las veces no pasa nada (helm al jugador)', () => {
    const state = newState();
    const noEvent = rollCosasQuePasan(state, 'jose', rngSeq(0.1));
    expect(noEvent.fired).toBeNull();
  });

  test('cuando dispara, el silverLining se aplica si el evento es negativo', () => {
    const state = newState(20);
    // Forzar evento: rng[0]=0.9 (>0.25 sí dispara), rng[1]=0.0 toma el primero
    const result = rollCosasQuePasan(state, 'jose', rngSeq(0.9, 0.0));
    if (result.fired && result.fired.event.isNegative) {
      expect(result.fired.appliedSilverLining).toBe(true);
    }
  });

  test('rollCosasQuePasan devuelve estado inmutable distinto', () => {
    const state = newState();
    const result = rollCosasQuePasan(state, 'jose', rngSeq(0.9, 0.0));
    if (result.fired) {
      expect(result.state).not.toBe(state);
    }
  });

  test('en turno 1 con stats default, eventos con minTurn alto no califican', () => {
    const state = { ...newState(1) };
    // Eventos con minTurn > 1 no pueden salir. Hacer rolls múltiples y verificar.
    for (let i = 0; i < 50; i++) {
      const result = rollCosasQuePasan(state, 'jose', Math.random);
      if (result.fired) {
        const minTurnCond = result.fired.event.conditions.find((c) => c.type === 'minTurn');
        if (minTurnCond && minTurnCond.type === 'minTurn') {
          expect(minTurnCond.value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
