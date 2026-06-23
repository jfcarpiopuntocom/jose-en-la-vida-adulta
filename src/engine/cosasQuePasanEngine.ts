import { GameState, GameEvent, EventCondition, PlayerState } from '../types';
import { events as allEvents } from '../data/events';
import { applyEffects } from './eventBus';

// Validación estructural: ningún evento negativo puede existir sin silverLining.
allEvents.forEach((e) => {
  if (e.isNegative && (!e.silverLining || e.silverLining.length === 0)) {
    throw new Error(`Evento negativo sin silverLining: ${e.id}`);
  }
});

function evalCondition(cond: EventCondition, player: PlayerState, turn: number): boolean {
  switch (cond.type) {
    case 'minTurn':
      return turn >= cond.value;
    case 'maxTurn':
      return turn <= cond.value;
    case 'housing':
      return player.housing === cond.value;
    case 'transport':
      return player.transport === cond.value;
    case 'statGt':
      return player.stats[cond.key] > cond.value;
    case 'statLt':
      return player.stats[cond.key] < cond.value;
    case 'hasJob':
      return (player.job !== null) === cond.value;
    case 'liquidityLt':
      return player.liquidity < cond.value;
  }
}

function computeWeight(event: GameEvent, player: PlayerState, turn: number): number {
  let w = event.baseWeight;
  for (const wm of event.weights) {
    if (evalCondition(wm.when, player, turn)) w *= wm.multiplier;
  }
  return w;
}

export interface FiredEvent {
  event: GameEvent;
  appliedSilverLining: boolean;
}

// Tira un evento para el jugador. Puede no haber evento si nada califica.
// Magnitudes pequeñas + 1 evento/turno => el azar sazona, no decide.
export function rollCosasQuePasan(
  state: GameState,
  playerId: string,
  rng: () => number = Math.random
): { state: GameState; fired: FiredEvent | null } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { state, fired: null };

  const candidates = allEvents.filter((e) =>
    e.conditions.every((c) => evalCondition(c, player, state.turn))
  );
  if (candidates.length === 0) return { state, fired: null };

  const weights = candidates.map((e) => computeWeight(e, player, state.turn));
  const total = weights.reduce((s, w) => s + w, 0);

  // 25% de probabilidad de que NO pase nada este turno (helm al jugador).
  // El otro 75%, sale un evento ponderado.
  const NO_EVENT_PROB = 0.25;
  if (rng() < NO_EVENT_PROB) return { state, fired: null };

  let r = rng() * total;
  let picked = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      picked = candidates[i];
      break;
    }
  }

  let nextState = applyEffects(state, playerId, picked.effects);
  let appliedSilver = false;
  if (picked.isNegative && picked.silverLining.length > 0) {
    nextState = applyEffects(nextState, playerId, picked.silverLining);
    appliedSilver = true;
  }
  return { state: nextState, fired: { event: picked, appliedSilverLining: appliedSilver } };
}
