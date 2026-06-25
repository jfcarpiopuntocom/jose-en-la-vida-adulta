// Tipos centrales — José en la Vida Adulta v0.90 (React + TS)
// Espiral de complejidad: cada sistema arranca rudimentario y expandible.

export type EconomyState = 'good' | 'bad';
export type HousingType = 'family' | 'rent_cheap' | 'own_apartment';
export type TransportType = 'walk' | 'bus' | 'taxi' | 'bicycle' | 'motorcycle' | 'car';

export interface World {
  economy: EconomyState;
  wageMult: number;
  salesMult: number;
  cpuMult: number; // handicap: CPU earns this fraction of calculated wages (1.0 = fair, <1 = easier for human)
  luckMult: number; // fortuna de la partida: >1 = más suerte (mejor familia, menos accidentes), <1 = vida cuesta arriba
}

// stop funcional del TABLERO (donde el jugador se mueve y actúa) — NO es un barrio
export interface Location {
  id: string;
  code: string;
  name: string;
  zone: string;
  crimeRisk: number;
  x: number;
  y: number;
  icon: string;
  tc: Record<TransportType, number>;
}

// barrio real de Cuenca — SOLO origen/nacimiento, no tiene posición en el tablero
export interface Barrio {
  id: string;
  name: string;
  crimeRisk: number;
}

export interface Job {
  id: string;
  title: string;
  locationId: string;
  hours: number;
  wage: number;        // base por turno, antes de nivel de carrera y economía
  stress: number;
  exp: number;
  minDep: number;
  minLevel: number;    // nivel mínimo de la escalera para acceder
}

// Escalera de carrera (índice 0..8)
export const CAREER_LADDER = [
  'Aprendiz', 'Auxiliar', 'Asistente', 'Técnico', 'Supervisor',
  'Coordinador', 'Jefe', 'Gerente', 'Director',
] as const;

export interface Employee {
  id: string;
  name: string;
  honesty: number;     // 0-100
  initiative: number;
  loyalty: number;     // sube con turnsEmployed si la relación es buena
  competence: number;
  turnsEmployed: number;
  wage: number;        // costo por quincena
}

export interface Business {
  id: string;
  type: string;
  capital: number;
  ticket: number;
  clientes: number;
  costosFijos: number;
  employees: Employee[];
}

export type Personality =
  | 'trabajador' | 'responsable' | 'generoso' | 'ahorrador' | 'emprendedor'
  | 'irresponsable' | 'conflictivo' | 'oportunista' | 'fiestero' | 'sabio' | 'protector';

export interface FamilyMember {
  rel: string;
  name: string;
  pers: Personality;
  score: number;       // relationshipScore 0-100
}

// Educación: árbol formal + técnica + autodidacta (rudimentario)
export interface Degree {
  id: string;
  name: string;
  track: 'formal' | 'tecnica' | 'autodidacta';
  prereq: string | null;      // id de grado previo, o null
  hours: number;              // horas totales a invertir
  cost: number;               // costo total en $
  knowledge: number;          // conocimiento que otorga al completar
  levelBoost: number;         // cuántos peldaños de carrera habilita
}

export interface EducationState {
  completed: string[];        // ids de grados completados
  enrolledId: string | null;  // grado en curso
  hoursInvested: number;      // horas acumuladas en el grado en curso
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

// Impacto como red de 4 dimensiones independientes
export interface ImpactNet {
  profesional: number;
  familiar: number;
  comunitario: number;
  empresarial: number;
}

export interface PlayerState {
  id: string;
  name: string;
  realName?: string;   // nombre real para guardar la aventura (se pide al final)
  colorIndex: number;
  avatar?: number;     // retrato elegido por el jugador (0-3 = player1..4.png)
  fell?: boolean;      // cayó (salud crítica o quiebra); al recuperarse gana temple — narrativa de levantarse
  streak?: number;     // #1 racha de quincenas equilibradas (6 áreas todas en avance)
  weeklyFocus?: 'salud' | 'plata' | 'familia' | 'aprender' | null; // #7 meta autoimpuesta
  weeklyFocusBase?: number; // valor base del área para medir avance al cierre
  prevWin?: number;    // progreso hacia la victoria al cierre del turno anterior (para racha)
  generation: number;  // 1 = José, 2+ = herederos (Modo Legado)
  timeLeft: number;
  liquidity: number;
  bank: number;
  businesses: Business[];
  vehicles: { type: TransportType; value: number }[];
  housing: HousingType;
  transport: TransportType;
  birthBarrio: string;  // id de un Barrio (no de un stop del tablero)
  birthCrime: number;
  currentLocation: string;
  family: FamilyMember[];
  job: Job | null;
  careerLevel: number; // índice en CAREER_LADDER
  education: EducationState;
  impact: ImpactNet;
  stats: PlayerStats;
  retired: boolean;
  collectibles: Collectible[];
  stocksValue?: number; // valor actual de acciones BVQ/BVG en cartera
  stocksCost?: number;  // costo histórico (para mostrar P&L)
  rentals?: Rental[];   // bienes raíces que arriendas a inquilinos
  savedHoursThisTurn?: number; // horas que el transporte te ahorró vs caminar
  savedHoursLast?: number;     // último cierre, para narrar al jugador
  isAI?: boolean;
  aiStrategy?: 'empleado' | 'empresa';
  aiDifficulty?: 1 | 2 | 3;
}

export type RentalKind = 'apto' | 'local';
export interface Rental {
  kind: RentalKind;
  value: number;     // valor de mercado de la propiedad
  rent: number;      // renta cobrada por quincena
  payment: number;   // cuota del préstamo (cero cuando ya pagaste)
  remaining: number; // quincenas restantes del préstamo
  note: string;      // dónde está, para el lore
}

export type CollectibleKind = 'cuadro' | 'vino' | 'joyeria' | 'tarjeta' | 'bitcoin';
export interface Collectible {
  kind: CollectibleKind;
  name: string;
  value: number;      // current market value
  boughtFor: number;  // original cost (for display)
}

// Los 4 arquetipos de generación de ingreso — concepto universal de finanzas personales
// (empleado, profesión liberal, empresario, inversionista son categorías universales
// presentes en Adam Smith, Drucker, Buffett, etc.)
export type Cuadrante = 'asalariado' | 'independiente' | 'empresario' | 'inversionista';

export interface Goals {
  bienestar: number;
  conocimientos: number;
  impacto: number;
  comunitario: number;
  emergencyMonths: number;
  passiveGoalPct: number; // % de gastos mensuales cubiertos por ingreso pasivo para ganar
}

export type GameTier = 1 | 2 | 3 | 4;

export interface LogEntry {
  turn: number;
  text: string;
  kind: 'plain' | 'pos' | 'neg' | 'silver' | 'jose';
  importance: 1 | 2 | 3;
}

export interface GameState {
  turn: number;
  activePlayerIndex: number;
  players: PlayerState[];
  world: World;
  goals: Goals;
  gameTier: GameTier;
  log: LogEntry[];
  over: boolean;
  winnerId: string | null;
}

// Efectos: [target, ...args]
export type Effect =
  | ['liq', number]
  | ['bank', number]
  | ['time', number]
  | ['stat', keyof PlayerStats, number]
  | ['impact', keyof ImpactNet, number];

export interface GameEvent {
  id: string;
  cat: string;
  neg: boolean;
  w: number;
  imp: 1 | 2 | 3;
  cond: any[];
  wt: any[];
  eff: Effect[];
  silver: Effect[];
  title: string;
  body: string;
  sl: string;
  firesJob?: boolean;
  setEcon?: EconomyState;
  choices?: { label: string; desc: string; eff: Effect[] }[]; // #5 evento bifurcado
}

export interface GameAction {
  id: string;
  label: string;
  hours: number;
  desc: string;
  ok: boolean;
  run: () => string; // muta el jugador (vía draft) y devuelve línea de log
}
