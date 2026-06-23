// Tipos base de José en la Vida Adulta
// Simplicidad primero: sin enums, sin campos especulativos.

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
  crimeRisk: number;
  travelCostByTransport: Record<TransportType, number>;
  // posición en el tablero ASCII (col, fila) para render
  boardPos: { col: number; row: number };
}

export interface Job {
  id: string;
  title: string;
  locationId: string;
  hoursPerShift: number;
  baseWage: number;     // por turno trabajado, antes de wageMultiplier
  stressPerShift: number;
  experiencePerShift: number;
  minDependability: number;
}

export interface Business {
  id: string;
  type: 'comercio' | 'servicios' | 'manufactura' | 'gastronomia';
  locationId: string;
  capitalInvested: number;
  ticketPromedio: number;
  baseClientes: number;
  costosFijos: number;     // por quincena
}

export interface PatrimonyState {
  cashInBank: number;
  businesses: Business[];
  vehicles: { type: TransportType; value: number }[];
  // properties e investments quedan para más adelante
}

export interface PlayerStats {
  experience: number;
  dependability: number;
  leadership: number;
  health: number;
  stress: number;
  happiness: number;
  reputation: number;
  resilience: number; // oculto
  knowledge: number;
}

export interface PlayerState {
  id: string;
  name: string;
  colorIndex: number;       // 0..3 para colorear en pantalla
  timeLeft: number;
  liquidity: number;
  patrimony: PatrimonyState;
  housing: HousingType;
  transport: TransportType;
  currentLocation: string;
  job: Job | null;
  stats: PlayerStats;
}

export type GamePhase = 'planning' | 'events' | 'resolution' | 'gameover';

export interface GameState {
  turn: number;            // quincena
  phase: GamePhase;
  activePlayerIndex: number;
  players: PlayerState[];
  world: WorldState;
  log: string[];           // narrativa últimos eventos
  goals: GoalConfig;
}

export interface GoalConfig {
  patrimonio: number;
  bienestar: number;
  conocimientos: number;
  impacto: number;
}

// --- Event Bus ---

export type EffectTarget = 'time' | 'liquidity' | 'stats' | 'location' | 'transport';
export type EffectOperation = 'add' | 'multiply' | 'set';

export interface SystemEffect {
  target: EffectTarget;
  operation: EffectOperation;
  key?: string;
  value: number | string;
}

// --- Cosas Que Pasan ---

export type EventCondition =
  | { type: 'minTurn'; value: number }
  | { type: 'maxTurn'; value: number }
  | { type: 'housing'; value: HousingType }
  | { type: 'transport'; value: TransportType }
  | { type: 'statGt'; key: keyof PlayerStats; value: number }
  | { type: 'statLt'; key: keyof PlayerStats; value: number }
  | { type: 'hasJob'; value: boolean }
  | { type: 'liquidityLt'; value: number };

export interface EventWeight {
  when: EventCondition;
  multiplier: number;
}

export interface NarrativeTemplate {
  title: string;
  body: string;
  silverLiningText?: string;
}

export interface GameEvent {
  id: string;
  category: 'crimen' | 'familia' | 'salud' | 'trabajo' | 'oportunidad' | 'politico' | 'economia';
  isNegative: boolean;
  baseWeight: number;
  conditions: EventCondition[];
  weights: EventWeight[];
  effects: SystemEffect[];
  silverLining: SystemEffect[]; // obligatorio para negativos (validado en runtime)
  narrative: NarrativeTemplate;
  importance: 1 | 2 | 3;
}
