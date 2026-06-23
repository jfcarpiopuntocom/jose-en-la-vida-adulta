import { PlayerState } from '../types';

// Las cuatro métricas visibles, derivadas del estado interno.
// Patrimonio crece sin tope; las otras tres se reportan en 0-100 (con techo blando para mostrar).

export function patrimonio(p: PlayerState): number {
  const businessValue = p.patrimony.businesses.reduce((s, b) => s + b.capitalInvested, 0);
  const vehicleValue = p.patrimony.vehicles.reduce((s, v) => s + v.value, 0);
  return p.liquidity + p.patrimony.cashInBank + businessValue + vehicleValue;
}

export function bienestar(p: PlayerState): number {
  return Math.round((p.stats.health + p.stats.happiness + (100 - p.stats.stress)) / 3);
}

export function conocimientos(p: PlayerState): number {
  // experience cuenta menos que knowledge formal
  return Math.min(100, Math.round(p.stats.knowledge + p.stats.experience * 0.5));
}

export function impacto(p: PlayerState): number {
  return Math.min(100, Math.round(p.stats.reputation + p.stats.leadership * 0.5));
}

export interface MetricsSnapshot {
  patrimonio: number;
  bienestar: number;
  conocimientos: number;
  impacto: number;
}

export function snapshot(p: PlayerState): MetricsSnapshot {
  return {
    patrimonio: patrimonio(p),
    bienestar: bienestar(p),
    conocimientos: conocimientos(p),
    impacto: impacto(p),
  };
}
