import { GameState, PlayerState, SystemEffect } from '../types';

// Aplica un efecto al jugador identificado por playerId.
// Función pura: retorna un nuevo GameState, nunca muta el original.
export function applyEffect(state: GameState, playerId: string, effect: SystemEffect): GameState {
  const players = state.players.map((p) =>
    p.id === playerId ? applyEffectToPlayer(p, effect) : p
  );
  return { ...state, players };
}

export function applyEffects(state: GameState, playerId: string, effects: SystemEffect[]): GameState {
  return effects.reduce((s, effect) => applyEffect(s, playerId, effect), state);
}

function applyEffectToPlayer(player: PlayerState, effect: SystemEffect): PlayerState {
  switch (effect.target) {
    case 'liquidity':
      return { ...player, liquidity: applyNumeric(player.liquidity, effect) };
    case 'time':
      return { ...player, timeLeft: Math.max(0, applyNumeric(player.timeLeft, effect)) };
    case 'location':
      return { ...player, currentLocation: effect.value as string };
    case 'transport':
      return { ...player, transport: effect.value as PlayerState['transport'] };
    case 'stats': {
      const key = effect.key as keyof PlayerState['stats'];
      const current = player.stats[key];
      // experience y knowledge sin tope; otros se clamean
      const unbounded = key === 'experience' || key === 'knowledge';
      const raw = applyNumeric(current, effect);
      const updated = unbounded ? Math.max(0, raw) : clamp(raw, 0, 100);
      return { ...player, stats: { ...player.stats, [key]: updated } };
    }
    default:
      return player;
  }
}

function applyNumeric(current: number, effect: SystemEffect): number {
  const value = effect.value as number;
  if (effect.operation === 'add') return current + value;
  if (effect.operation === 'multiply') return current * value;
  return value; // 'set'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// --- Pub/sub simple para notificar a la UI u otros sistemas (no aplica efectos) ---

type Listener = (effect: SystemEffect) => void;

class EventBus {
  private listeners: Listener[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(effect: SystemEffect): void {
    this.listeners.forEach((l) => l(effect));
  }
}

export const eventBus = new EventBus();
