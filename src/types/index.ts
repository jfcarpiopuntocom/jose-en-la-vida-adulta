// Tipos base de José en la Vida Adulta — Semana 1
// Mantener simple: sin enums, sin campos especulativos. Se amplía cuando haga falta.

export type EconomyState = 'good' | 'bad';

export interface WorldState {
  economy: EconomyState;
  priceMultiplier: number;
  wageMultiplier: number;
  salesMultiplier: number;
}

export type HousingType = 'family' | 'rent_cheap' | 'own_apartment';
export type TransportType = 'walk' | 'bus' | 'taxi' | 'bicycle' | 'motorcycle' | 'car';

export type LocationZone =
  | 'centro'
  | 'comercial'
  | 'universitaria'
  | 'residencial'
  | 'industrial'
  | 'financiera';

export interface Location {
  id: string;
  name: string;
  zone: LocationZone;
  crimeRisk: number; // 0-100
  // costo en horas de llegar aquí desde cualquier punto, según transporte
  travelCostByTransport: Record<TransportType, number>;
}

export interface PatrimonyState {
  properties: unknown[];
  businesses: unknown[];
  vehicles: unknown[];
  investments: unknown[];
}

export interface PlayerStats {
  experience: number;
  dependability: number;
  leadership: number;
  health: number;
  stress: number;
  happiness: number;
  reputation: number;
  resilience: number; // oculto, nunca al HUD
}

export interface PlayerState {
  id: string;
  timeLeft: number; // horas restantes en la quincena (0-112)
  liquidity: number; // cash disponible
  patrimony: PatrimonyState;
  housing: HousingType;
  transport: TransportType;
  currentLocation: string;
  stats: PlayerStats;
}

export type GamePhase = 'planning' | 'events' | 'resolution';

export interface GameState {
  turn: number;
  phase: GamePhase;
  players: PlayerState[];
  world: WorldState;
}

// --- Event Bus ---

export type EffectTarget = 'time' | 'liquidity' | 'stats' | 'location';
export type EffectOperation = 'add' | 'multiply' | 'set';

export interface SystemEffect {
  target: EffectTarget;
  operation: EffectOperation;
  // para 'stats' indica qué stat tocar (ej. 'stress'); para 'location' el id destino
  key?: string;
  value: number | string;
}
