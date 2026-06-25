import {
  GameState, PlayerState, World, Goals, Effect, PlayerStats, GameEvent,
  FamilyMember, Personality, Business, Employee, GameAction, ImpactNet,
  Collectible, CollectibleKind,
} from './types';
import { CAREER_LADDER } from './types';
import {
  LOCATIONS, locById, BARRIOS, JOBS, jobsAt, EVENTS, DEGREES, degreeById,
  FNAMES_M, FNAMES_F, EMP_NAMES, RELATIONS, PERSONALITIES, PERS_WEALTH,
} from './data';

// Diseño de engagement (v0.90):
// - Recurso escaso = tiempo (Sid Meier: "una serie de decisiones interesantes").
// - Pérdida visible (Kahneman): costo de oportunidad en cada acción.
// - Maestría + autonomía + propósito (Self-Determination Theory): meta autoimpuesta + bifurcaciones.
// - Octalysis CD2 (Desarrollo) + CD7 (Variable): racha + varianza en negocio.
// - Sherpa (Joseph Campbell): José va dos pasos adelante, sin sermonear.
export const HOURS_PER_TURN = 112;

export interface TierMeta extends Goals {
  label: string;
  desc: string;
  cpuMult: number; // multiplicador de ingresos del CPU (handicap)
  luckMult: number; // fortuna de partida: familia, salud inicial, frecuencia de imprevistos
}

export const TIER_GOALS: Record<number, TierMeta> = {
  1: { label: 'Vida Afortunada', desc: 'Naciste con buena estrella: familia que apoya, salud firme y la suerte de tu lado.',
       bienestar:55, conocimientos:38, impacto:38, comunitario:10, emergencyMonths:3, passiveGoalPct:15, cpuMult:0.55, luckMult:1.30 },
  2: { label: 'Vida Pareja',    desc: 'Suerte normal. La familia ayuda a ratos y la vida trae sustos de vez en cuando.',
       bienestar:68, conocimientos:52, impacto:52, comunitario:18, emergencyMonths:6, passiveGoalPct:35, cpuMult:0.78, luckMult:1.00 },
  3: { label: 'Cuesta Arriba',  desc: 'Suerte esquiva, respaldo justo y los imprevistos no perdonan. Hay que tener temple.',
       bienestar:80, conocimientos:65, impacto:65, comunitario:28, emergencyMonths:9, passiveGoalPct:60, cpuMult:0.95, luckMult:0.78 },
  4: { label: 'A Pulso',        desc: 'Mala estrella, poca red de apoyo y la vida golpea duro. José juega sin ventaja.',
       bienestar:90, conocimientos:78, impacto:78, comunitario:40, emergencyMonths:12, passiveGoalPct:100, cpuMult:1.10, luckMult:0.60 },
};

export const DEFAULT_GOALS: Goals = TIER_GOALS[1] as Goals;

// ── Arquetipos de ingreso (concepto universal, no propiedad de nadie) ──
// Asalariado: intercambia tiempo por sueldo fijo
// Independiente/Profesión Liberal: cobra por servicio/conocimiento, sin sistema propio
// Empresario: posee un sistema que opera sin su presencia constante
// Inversionista: el capital genera ingresos, no el tiempo personal
export const CUADRANTE_LABEL: Record<string, string> = {
  asalariado:    'Asalariado',
  independiente: 'Profesión Liberal',
  empresario:    'Empresario',
  inversionista: 'Inversionista',
};
export const CUADRANTE_ICON: Record<string, string> = {
  asalariado:    '👔',
  independiente: '🛠️',
  empresario:    '🏭',
  inversionista: '📈',
};

// Gastos base por quincena según estilo de vida del jugador
export function expensesPerTurn(p: PlayerState): number {
  let e = 75; // alimentación, servicios mínimos
  if (p.housing === 'rent_cheap') e += 110;
  if (p.housing === 'own_apartment') e += 20;  // mantenimiento
  if (p.transport === 'car')   e += 30;
  if (p.transport === 'taxi')  e += 12;
  e += p.family.length * 10;
  return e;
}

// Ingreso pasivo por quincena (no requiere tiempo laboral)
export function passiveIncome(p: PlayerState): number {
  let pi = 0;
  // Interés bancario: ~5% anual = ~0.2% quincena
  pi += Math.round(p.bank * 0.002);
  // Fondo mutuo: 0.6% por turno
  pi += Math.round(((p as any).fondoMutuo || 0) * 0.006);
  // Negocio con empleados: el sistema genera sin el dueño presente
  for (const b of p.businesses) {
    if (b.employees.length > 0) {
      const boost = b.employees.reduce((s, e) => s + e.competence / 100, 0);
      const cl = Math.round(b.clientes * (1 + boost * 0.5));
      const wages = b.employees.reduce((s, e) => s + e.wage, 0);
      pi += Math.max(0, cl * b.ticket - b.costosFijos - wages);
    }
  }
  // Apreciación media de coleccionables
  pi += Math.round(p.collectibles.reduce((s, c) => s + c.value * 0.022, 0));
  return Math.max(0, pi);
}

// En qué arquetipo de ingreso está el jugador ahora mismo
export function cuadrante(p: PlayerState): string {
  const pi = passiveIncome(p);
  const exp = expensesPerTurn(p);
  if (pi >= exp)                                          return 'inversionista';
  if (p.businesses.some(b => b.employees.length > 0))   return 'empresario';
  if (p.businesses.length > 0)                           return 'independiente';
  return 'asalariado';
}

// Fondo de emergencia: meses de gastos cubiertos en banco
export function emergencyFundMonths(p: PlayerState): number {
  const exp = expensesPerTurn(p);
  return exp > 0 ? p.bank / exp : 0;
}
export const PLAYER_COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];

// ── José sherpa: Viaje del Héroe. Va dos pasos adelante, guía con preguntas
//    socráticas y quips, sin spoilear. Su hilo: caer y volver a levantarse. ──
export const JOSE_QUIPS: string[] = [
  '¿Qué harías distinto si supieras que una caída no es el final, sino el primer acto?',
  'Yo también quebré mi primer negocio. Aprendí más de esa caída que de tres aciertos.',
  '¿El tiempo te alcanza… o estás llenando las horas sin elegirlas?',
  'No busques el camino perfecto. Busca el siguiente paso honesto.',
  'Cuando caí, no me levantó la suerte. Me levantó una decisión pequeña, repetida.',
  '¿Qué área de tu vida lleva rato pidiendo atención y la sigues ignorando?',
  'La fortuna ayuda, sí. Pero la disciplina es la que se queda a desayunar.',
  '¿Esto te acerca al equilibrio, o solo abulta una sola columna?',
  'Perdí salud por ganar plata, y gasté la plata en recuperar la salud. No repitas mi vuelta larga.',
  'Un tropiezo cuenta una historia. Lo que importa es quién la narra después.',
  '¿Y si el legado no es lo que dejas al final, sino a quién ayudas en el camino?',
  'Voy dos pasos adelante, pero no para que me sigas: para mostrarte que se puede.',
];
export function joseQuip(): string { return JOSE_QUIPS[Math.floor(Math.random() * JOSE_QUIPS.length)]; }

// #9 Coleccionables con historia: micro-lore cuencano para que se sientan reales
export const COLLECTIBLE_LORE: Record<string, string> = {
  cuadro: 'Pintura de un taller del Centro Histórico — esos cuadros se cuelgan en sala y se cuentan a las visitas.',
  vino: 'Botella de guarda; en Cuenca pocas familias saben de cavas, así que el que tiene una, presume bien.',
  joyeria: 'Pieza de plata de Chordeleg; el oficio viene de generaciones y la pieza no se devalúa.',
  tarjeta: 'Tarjeta de béisbol — colección de nicho, valor que sube cuando el jugador entra al Salón de la Fama.',
  bitcoin: 'Fracción de Bitcoin; volátil, pero el que aguantó la curva nunca se arrepintió.',
};
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const UNBOUNDED = new Set<keyof PlayerStats>(['experience', 'knowledge']);

/* ---------- FAMILIA ---------- */
export function generateFamily(luckMult = 1): FamilyMember[] {
  // Más suerte = familia más grande y con mejor relación de partida
  const n = clamp(Math.round((2 + rnd(3)) * (0.7 + luckMult * 0.3)), 1, 5);
  const pool = RELATIONS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const fam: FamilyMember[] = [];
  for (let k = 0; k < n; k++) {
    const r = pool[k];
    fam.push({
      rel: r.rel,
      name: (r.sex === 'f' ? FNAMES_F : FNAMES_M)[rnd(10)],
      pers: pick(PERSONALITIES),
      score: clamp(Math.round((40 + rnd(51)) * (0.75 + luckMult * 0.25)), 15, 100),
    });
  }
  return fam;
}
function startingLiquidity(fam: FamilyMember[]): number {
  let liq = 200;
  for (const m of fam) liq += (PERS_WEALTH[m.pers] || 0);
  return Math.max(80, liq);
}

/* ---------- ESTADO INICIAL ---------- */
export function newPlayer(
  id: string, name: string, idx: number, generation = 1,
  aiOpts?: { isAI: boolean; aiStrategy: 'empleado'|'empresa'; aiDifficulty: 1|2|3 },
  luckMult = 1
): PlayerState {
  // La buena estrella inclina el barrio de origen hacia los más tranquilos
  const sorted = BARRIOS.slice().sort((a, b) => a.crimeRisk - b.crimeRisk);
  const span = sorted.length;
  const biasIdx = clamp(Math.floor(rnd(span) * (luckMult >= 1 ? 0.7 : 1.2)), 0, span - 1);
  const birth = luckMult >= 1 ? sorted[biasIdx] : sorted[span - 1 - biasIdx];
  const family = generateFamily(luckMult);
  // Salud y ánimo de partida escalan con la fortuna
  const health = clamp(Math.round(72 + 14 * luckMult), 55, 95);
  const happiness = clamp(Math.round(50 + 12 * luckMult), 40, 80);
  return {
    id, name, colorIndex: idx, generation,
    timeLeft: HOURS_PER_TURN, liquidity: Math.max(80, Math.round(startingLiquidity(family) * (0.8 + luckMult * 0.2))), bank: 0,
    businesses: [], vehicles: [],
    housing: 'family', transport: 'walk',
    birthBarrio: birth.id, birthCrime: birth.crimeRisk, currentLocation: 'casa',
    family, job: null, careerLevel: 0,
    education: { completed: [], enrolledId: null, hoursInvested: 0 },
    impact: { profesional: 5, familiar: 10, comunitario: 5, empresarial: 0 },
    stats: { experience: 0, dependability: 50, leadership: 0, health, stress: 20, happiness, reputation: 30, resilience: 0, knowledge: 5 },
    retired: false,
    collectibles: [],
    ...(aiOpts ?? {}),
  };
}

export function newGame(
  players: { id: string; name: string; isAI?: boolean; aiStrategy?: 'empleado'|'empresa'; aiDifficulty?: 1|2|3; avatar?: number }[],
  goals: Goals = DEFAULT_GOALS,
  tier: 1|2|3|4 = 1
): GameState {
  const bad = Math.random() < 0.5;
  const lm = TIER_GOALS[tier]?.luckMult ?? 1;
  return {
    turn: 1, activePlayerIndex: 0, gameTier: tier,
    players: players.map((p, i) => {
      const ps = newPlayer(p.id, p.name, i,1,
        p.isAI ? { isAI: true, aiStrategy: p.aiStrategy!, aiDifficulty: p.aiDifficulty! } : undefined,
        p.isAI ? 1 : lm // la suerte de la dificultad afecta al humano; el CPU corre parejo
      );
      if (p.avatar !== undefined) ps.avatar = p.avatar;
      return ps;
    }),
    world: { economy: bad ? 'bad' : 'good', wageMult: bad ? 0.8 : 1, salesMult: bad ? 0.8 : 1, cpuMult: (TIER_GOALS[tier]?.cpuMult ?? 0.78), luckMult: lm },
    goals: { ...goals }, log: [], over: false, winnerId: null,
  };
}

/* ---------- EFECTOS ---------- */
export function applyEff(p: PlayerState, eff: Effect[]): void {
  for (const e of eff) {
    if (e[0] === 'liq') p.liquidity += e[1];
    else if (e[0] === 'bank') p.bank += e[1];
    else if (e[0] === 'time') p.timeLeft = Math.max(0, p.timeLeft + e[1]);
    else if (e[0] === 'stat') {
      const k = e[1]; const raw = p.stats[k] + e[2];
      p.stats[k] = UNBOUNDED.has(k) ? Math.max(0, raw) : clamp(raw, 0, 100);
    } else if (e[0] === 'impact') {
      p.impact[e[1]] = Math.max(0, p.impact[e[1]] + e[2]);
    }
  }
}

/* ---------- MÉTRICAS ---------- */
export function collectiblesValue(p: PlayerState): number {
  return Math.round(p.collectibles.reduce((s, c) => s + c.value, 0));
}
export function portfolioSlices(p: PlayerState) {
  return {
    cash:        Math.round(p.liquidity),
    stable:      Math.round(p.bank),
    growth:      Math.round(p.businesses.reduce((s, b) => s + b.capital, 0)),
    hard:        Math.round(p.vehicles.reduce((s, v) => s + v.value, 0)),
    collectibles:collectiblesValue(p),
  };
}
export function patrimonio(p: PlayerState): number {
  const sl = portfolioSlices(p);
  return sl.cash + sl.stable + sl.growth + sl.hard + sl.collectibles;
}
export function totalAssets(p: PlayerState): number {
  return p.liquidity + p.bank + collectiblesValue(p) + p.businesses.reduce((s,b)=>s+b.capital,0);
}
export function bienestar(p: PlayerState): number {
  return Math.round((p.stats.health + p.stats.happiness + (100 - p.stats.stress)) / 3);
}
export function conocimientos(p: PlayerState): number {
  return Math.min(100, Math.round(p.stats.knowledge + p.stats.experience * 0.5));
}
// Impacto = promedio de las 4 dimensiones de la red
export function impacto(p: PlayerState): number {
  const i = p.impact;
  return Math.min(100, Math.round((i.profesional + i.familiar + i.comunitario + i.empresarial) / 4));
}
export function metrics(p: PlayerState) {
  return { patrimonio: patrimonio(p), bienestar: bienestar(p), conocimientos: conocimientos(p), impacto: impacto(p) };
}

/* ---------- CARRERA (escalera Aprendiz→Director) ---------- */
export const careerTitle = (lvl: number) => CAREER_LADDER[clamp(lvl, 0, CAREER_LADDER.length - 1)];
// experiencia necesaria para el siguiente peldaño
export function expForNextLevel(lvl: number): number { return 20 + lvl * 25; }
export function tryPromote(p: PlayerState): string | null {
  if (p.careerLevel >= CAREER_LADDER.length - 1) return null;
  const need = expForNextLevel(p.careerLevel);
  const eduBoost = p.education.completed.reduce((s, id) => s + degreeById(id).levelBoost, 0);
  // experiencia + educación habilitan; confiabilidad mínima sube con el nivel
  if (p.stats.experience >= need && p.stats.dependability >= 40 + p.careerLevel * 4) {
    p.careerLevel++;
    p.stats.experience -= need;
    applyEff(p, [['impact', 'profesional', 4], ['stat', 'leadership', 2]]);
    return `Ascendiste a ${careerTitle(p.careerLevel)}${eduBoost ? ' (tu educación ayudó)' : ''}`;
  }
  return null;
}

// ── Historia de origen procedural ──
export function generateBackstory(p: import('./types').PlayerState): string {
  const barrioEntry = BARRIOS.find(b => b.id === p.birthBarrio);
  const barrio = barrioEntry ? barrioEntry.name : p.birthBarrio;
  const crimeLevel = p.birthCrime;
  const famNames = p.family.map(f => f.name);
  const fam = famNames.length === 0 ? 'solo' :
    famNames.length === 1 ? famNames[0] :
    famNames.slice(0, -1).join(', ') + ' y ' + famNames[famNames.length - 1];

  const origin =
    crimeLevel >= 40
      ? 'Creciste en ' + barrio + ', uno de los barrios más bravos de Cuenca. No fue fácil, pero aprendiste a leer el ambiente antes que el mercado.'
      : crimeLevel >= 25
      ? 'Tu barrio, ' + barrio + ', era tranquilo pero no próspero. Los fines de semana olían a pan de casa y a deudas calladas.'
      : 'Creciste en ' + barrio + ', donde los domingos sonaban las campanas de la catedral y la mayoría de la gente pagaba sus cuentas a tiempo.';

  const famLine = fam === 'solo'
    ? 'No tienes familia cercana. Lo que logres, lo vas a construir desde cero.'
    : p.family.length >= 3
    ? 'En casa eran ' + p.family.length + ': ' + fam + '. Había cariño, pero el espacio y el dinero siempre anduvieron justos.'
    : 'Tu familia inmediata: ' + fam + '. No muy grande, con sus propios problemas, pero siempre presente.';

  const parts: string[] = [origin, famLine];
  const know = (p.stats as any).knowledge ?? 0;
  const dep = p.stats.dependability ?? 50;
  if (know >= 60) parts.push('Desde joven tuviste hambre de aprender. Los libros eran más baratos que las deudas.');
  else if (know <= 25) parts.push('No fuiste el mejor alumno. Lo tuyo no era el salón de clases, sino la calle y el ensayo.');
  if (dep >= 70) parts.push('Eres de los que llegan a tiempo y cumplen lo que prometen. Eso vale más de lo que crees en esta ciudad.');

  const liquidityLine = p.liquidity < 300
    ? 'Empiezas con $' + p.liquidity + ' en el bolsillo. Poco, pero es tuyo.'
    : p.liquidity < 700
    ? 'Tienes $' + p.liquidity + ' ahorrados. No es fortuna, pero es un punto de partida honesto.'
    : 'Guardaste $' + p.liquidity + '. Más que la mayoría cuando empieza. Úsalo bien.';

  parts.push(liquidityLine);
  parts.push('La vida adulta en Cuenca no espera. Cada quincena cuenta.');
  return parts.join(' ');
}
export function wageOf(p: PlayerState, job: import('./types').Job, world: World): number {
  const base = Math.round(job.wage * (1 + p.careerLevel * 0.22) * world.wageMult);
  const stressPenalty = p.stats.stress > 80 ? 1 - (p.stats.stress - 80) * 0.008 : 1; // up to 16% penalty at max stress
  const effective = Math.round(base * stressPenalty);
  return p.isAI ? Math.round(effective * world.cpuMult) : effective;
}

/* ---------- EDUCACIÓN ---------- */
export function availableDegrees(p: PlayerState) {
  return DEGREES.filter(d =>
    !p.education.completed.includes(d.id) &&
    p.education.enrolledId !== d.id &&
    (d.prereq === null || p.education.completed.includes(d.prereq))
  );
}

/* ---------- EMPLEADOS ---------- */
export function generateEmployee(): Employee {
  return {
    id: 'e' + Math.random().toString(36).slice(2, 7),
    name: pick(EMP_NAMES),
    honesty: 40 + rnd(61), initiative: 30 + rnd(71), loyalty: 40 + rnd(31),
    competence: 35 + rnd(66), turnsEmployed: 0, wage: 60 + rnd(41),
  };
}

/* ---------- EVENTOS (Cosas Que Pasan) ---------- */
function evalCond(c: any[], p: PlayerState, turn: number): boolean {
  switch (c[0]) {
    case 'minTurn': return turn >= c[1];
    case 'maxTurn': return turn <= c[1];
    case 'housing': return p.housing === c[1];
    case 'transport': return p.transport === c[1];
    case 'statGt': return (p.stats as any)[c[1]] > c[2];
    case 'statLt': return (p.stats as any)[c[1]] < c[2];
    case 'hasJob': return (p.job !== null) === c[1];
    case 'liquidityLt': return p.liquidity < c[1];
    case 'bornCrimeGt': return p.birthCrime > c[1];
    default: return true;
  }
}
function weightOf(ev: GameEvent, p: PlayerState, turn: number): number {
  let w = ev.w;
  for (const wm of ev.wt) {
    let cond: any[], mult: number;
    if (wm[0] === 'statGt' || wm[0] === 'statLt') { cond = [wm[0], wm[1], wm[2]]; mult = wm[3]; }
    else { cond = [wm[0], wm[1]]; mult = wm[2]; }
    if (evalCond(cond, p, turn)) w *= mult;
  }
  return w;
}
// 25% de las quincenas no pasa nada: el jugador es el timón.
export function rollEvent(p: PlayerState, turn: number, luckMult = 1): GameEvent | null {
  const cands = EVENTS.filter(e => e.cond.every((c: any[]) => evalCond(c, p, turn)));
  if (cands.length === 0) return null;
  // Más suerte = más quincenas tranquilas; cuesta arriba = los imprevistos no perdonan
  const skip = clamp(0.25 * luckMult, 0.12, 0.42);
  if (Math.random() < skip) return null;
  const ws = cands.map(e => weightOf(e, p, turn));
  const total = ws.reduce((s, w) => s + w, 0);
  let r = Math.random() * total, pickEv = cands[cands.length - 1];
  for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { pickEv = cands[i]; break; } }
  return pickEv;
}

/* ---------- ACCIONES POR LOCACIÓN ---------- */
export function familyVisitEffect(m: FamilyMember, pname: string): { eff: Effect[]; log: string } {
  const good = m.score >= 55;
  let E: Effect[] = [], msg = '';
  switch (m.pers) {
    case 'sabio': E = [['stat', 'knowledge', good ? 6 : 2], ['stat', 'happiness', 3], ['impact', 'familiar', 2]]; msg = good ? `tu ${m.rel} ${m.name} te dio una mentoría (+conocimiento)` : `tu ${m.rel} ${m.name} te contó sus historias`; break;
    case 'emprendedor': E = good ? [['stat', 'knowledge', 4], ['liq', 40]] : [['stat', 'knowledge', 2]]; msg = good ? `tu ${m.rel} ${m.name} te conectó un cliente (+$40)` : `tu ${m.rel} ${m.name} te aconsejó sobre negocios`; break;
    case 'generoso': E = [['liq', good ? 80 : 30], ['stat', 'happiness', 4]]; msg = `tu ${m.rel} ${m.name} te regaló $${good ? 80 : 30}`; break;
    case 'trabajador': E = [['stat', 'dependability', 3], ['liq', good ? 30 : 10]]; msg = `tu ${m.rel} ${m.name} te consiguió un trabajito (+$${good ? 30 : 10})`; break;
    case 'responsable': E = [['stat', 'dependability', 3], ['stat', 'stress', -4]]; msg = `tu ${m.rel} ${m.name} te ayudó a organizarte (-estrés)`; break;
    case 'ahorrador': E = [['stat', 'knowledge', 2], ['stat', 'stress', -2]]; msg = `tu ${m.rel} ${m.name} te enseñó a cuidar el bolsillo`; break;
    case 'protector': E = [['stat', 'health', 5], ['stat', 'stress', -6]]; msg = `tu ${m.rel} ${m.name} te cuidó y consintió (+salud)`; break;
    case 'fiestero': E = [['stat', 'happiness', 8], ['liq', -20], ['impact', 'comunitario', 1]]; msg = `tu ${m.rel} ${m.name} te llevó de fiesta (+ánimo, -$20)`; break;
    case 'oportunista': E = good ? [['liq', 40]] : [['liq', -30], ['stat', 'stress', 4]]; msg = good ? `tu ${m.rel} ${m.name} te metió en un buen negocito (+$40)` : `tu ${m.rel} ${m.name} te enredó en un lío (-$30)`; break;
    case 'irresponsable': E = [['liq', -40], ['stat', 'happiness', 3]]; msg = `tu ${m.rel} ${m.name} te pidió prestado $40 (pero te animó)`; break;
    case 'conflictivo': E = [['stat', 'stress', 8], ['stat', 'happiness', -5], ['stat', 'resilience', 3]]; msg = `discutiste con tu ${m.rel} ${m.name} (+temple, igual)`; break;
  }
  E.push(['impact', 'familiar', 1]);
  return { eff: E, log: `${pname} visitó a la familia: ${msg}` };
}

// Devuelve acciones disponibles. Cada run() muta p y devuelve log.
export function actionsFor(p: PlayerState, world: World): GameAction[] {
  const out: GameAction[] = [];
  const loc = p.currentLocation;

  if (loc === 'casa') {
    out.push({ id: 'rest', label: 'Descansar (8h)', hours: 8, desc: '+salud, -estrés', ok: p.timeLeft >= 8,
      run: () => { applyEff(p, [['time', -8], ['stat', 'health', 6], ['stat', 'stress', -10], ['stat', 'happiness', 3]]); return `Descansaste en casa`; } });
    out.push({ id: 'social', label: 'Socializar (4h)', hours: 4, desc: '+felicidad, +impacto comunitario, -$15', ok: p.timeLeft >= 4 && p.liquidity >= 15,
      run: () => { applyEff(p, [['time', -4], ['liq', -15], ['stat', 'happiness', 7], ['impact', 'comunitario', 3]]); return `Saliste con amigos`; } });
       out.push({ id: 'family', label: 'Visitar familia (3h)', hours: 3, desc: 'Fortalece lazos (+relacion, +felicidad)', ok: p.timeLeft >= 3 && p.family.length > 0,
      run: () => {
        const m = pick(p.family);
        m.score = Math.min(100, m.score + 8);
        const r = familyVisitEffect(m, p.name);
        applyEff(p, [['time', -3], ['stat', 'happiness', 5], ['impact', 'familiar', 2], ...r.eff]);
        return r.log + ` (relacion con ${m.name}: ${m.score})`;
      } });
    if (p.family.some(fm => fm.score >= 80)) {
      const ally = p.family.find(fm => fm.score >= 80)!;
      out.push({ id: 'family_ally', label: `Consejo de ${ally.name} (2h)`, hours: 2, desc: 'Relacion solida = +conocimiento real', ok: p.timeLeft >= 2,
        run: () => { applyEff(p, [['time', -2], ['stat', 'knowledge', 8], ['stat', 'happiness', 4]]); return `${ally.name} te dio un consejo clave (+8 conocimiento)`; } });
    }
  }

  // Housing progression: upgrading is a major life decision
  if (loc === 'casa') {
    if (p.housing === 'family') {
      out.push({ id: 'rent_apartment', label: 'Alquilar apartamento ($300 dep.)', hours: 4, desc: 'Independencia: +$110/quincena en gastos, +felicidad', ok: p.timeLeft >= 4 && p.liquidity >= 300,
        run: () => { p.housing = 'rent_cheap'; applyEff(p, [['time', -4], ['liq', -300], ['stat', 'happiness', 8], ['stat', 'stress', -5]]); return `Te independizaste: alquilaste un apartamento`; } });
    }
    if (p.housing === 'rent_cheap' && p.bank >= 5000) {
      out.push({ id: 'buy_apartment', label: 'Comprar apartamento (banco: -$5000)', hours: 4, desc: 'Patrimonio real. Gastos bajan a $20/quincena', ok: p.timeLeft >= 4 && p.bank >= 5000,
        run: () => { p.housing = 'own_apartment'; p.bank -= 5000; applyEff(p, [['time', -4], ['stat', 'happiness', 12], ['impact', 'profesional', 5]]); return `Compraste un apartamento (patrimonio: +5000)`; } });
    }
  }

  if (loc === 'zona_universitaria' || loc === 'u_cuenca') {
    // matricularse en un grado
    for (const d of availableDegrees(p)) {
      if (p.education.enrolledId) break; // un grado a la vez
      out.push({ id: 'enroll_' + d.id, label: 'Matricularse: ' + d.name, hours: 1, desc: `${d.hours}h totales · $${d.cost} · +${d.knowledge} conoc.`, ok: p.timeLeft >= 1 && p.liquidity >= d.cost,
        run: () => { applyEff(p, [['time', -1], ['liq', -d.cost]]); p.education.enrolledId = d.id; p.education.hoursInvested = 0; return `Te matriculaste en ${d.name}`; } });
    }
    // avanzar el grado en curso
    if (p.education.enrolledId) {
      const d = degreeById(p.education.enrolledId);
      const left = d.hours - p.education.hoursInvested;
      const block = Math.min(10, left);
      out.push({ id: 'study', label: `Estudiar ${d.name} (${block}h)`, hours: block, desc: `progreso ${p.education.hoursInvested}/${d.hours}h`, ok: p.timeLeft >= block,
        run: () => {
          applyEff(p, [['time', -block]]); p.education.hoursInvested += block;
          if (p.education.hoursInvested >= d.hours) {
            p.education.completed.push(d.id); p.education.enrolledId = null; p.education.hoursInvested = 0;
            applyEff(p, [['stat', 'knowledge', d.knowledge], ['stat', 'happiness', 5], ['impact', 'profesional', 2]]);
            return `Te graduaste: ${d.name} (+${d.knowledge} conocimiento)`;
          }
          return `Estudiaste ${block}h de ${d.name}`;
        } });
    }
  }

  if (loc === 'zona_financiera') {
    if (p.liquidity >= 100)
      out.push({ id: 'save100', label: 'Ahorrar $100 en banco (1h)', hours: 1, desc: 'mueve liquidez a patrimonio', ok: p.timeLeft >= 1 && p.liquidity >= 100,
        run: () => { applyEff(p, [['time', -1], ['liq', -100], ['bank', 100]]); return `Ahorraste $100 en el banco`; } });
    if (p.liquidity >= 500)
      out.push({ id: 'save500', label: 'Ahorrar $500 en banco (1h)', hours: 1, desc: 'depósito grande', ok: p.timeLeft >= 1 && p.liquidity >= 500,
        run: () => { applyEff(p, [['time', -1], ['liq', -500], ['bank', 500]]); return `Depositaste $500 en el banco`; } });
    if (p.liquidity >= 200)
      out.push({ id: 'invest_bolsa', label: 'Invertir en bolsa (2h · $200)', hours: 2, desc: 'especulativo: puede ganar o perder', ok: p.timeLeft >= 2 && p.liquidity >= 200,
        run: () => {
          const win = Math.random() > 0.45;
          const delta = win ? rnd(120) + 60 : -(rnd(80) + 30);
          applyEff(p, [['time', -2], ['liq', -200 + delta], ['stat', 'knowledge', 1]]);
          return win
            ? `${p.name} invirtió en bolsa y ganó $${delta}`
            : `${p.name} invirtió en bolsa y perdió $${-delta}`;
        } });
    // Fondo mutuo: aporte genera ingreso pasivo fijo (0.6%/turno sobre capital)
    const fondoMutuo = (p as any).fondoMutuo as number || 0;
    if (p.liquidity >= 500)
      out.push({ id: 'fondo_500', label: 'Fondo mutuo +$500 (1h)', hours: 1,
        desc: `Cada $500 = ~$3/turno pasivo. Fondo actual: $${fondoMutuo}`,
        ok: p.timeLeft >= 1 && p.liquidity >= 500,
        run: () => {
          (p as any).fondoMutuo = ((p as any).fondoMutuo || 0) + 500;
          applyEff(p, [['time', -1], ['liq', -500], ['stat', 'knowledge', 1]]);
          return `Aportaste $500 al fondo mutuo (total: $${(p as any).fondoMutuo})`;
        } });
    if (p.liquidity >= 2000)
      out.push({ id: 'fondo_2000', label: 'Fondo mutuo +$2000 (1h)', hours: 1,
        desc: `Aporte grande. Fondo actual: $${fondoMutuo}`,
        ok: p.timeLeft >= 1 && p.liquidity >= 2000,
        run: () => {
          (p as any).fondoMutuo = ((p as any).fondoMutuo || 0) + 2000;
          applyEff(p, [['time', -1], ['liq', -2000], ['stat', 'knowledge', 2]]);
          return `Aportaste $2000 al fondo mutuo (total: $${(p as any).fondoMutuo})`;
        } });
  }

  if (loc === 'feria_libre') {
    if (p.businesses.length === 0) {
      out.push({ id: 'startbiz', label: 'Abrir negocio ($500, 12h)', hours: 12, desc: 'comercio con ventas pasivas', ok: p.timeLeft >= 12 && p.liquidity >= 500,
        run: () => { applyEff(p, [['time', -12], ['liq', -500], ['stat', 'experience', 3], ['impact', 'empresarial', 4]]);
          p.businesses.push({ id: 'biz_' + p.id, type: 'comercio', capital: 500, ticket: 12, clientes: 8, costosFijos: 40, employees: [] });
          return `Abriste un negocio en la Feria Libre`; } });
    } else {
      const b = p.businesses[0];
      out.push({ id: 'operate', label: 'Operar negocio (8h)', hours: 8, desc: 'atender clientes · el día varía', ok: p.timeLeft >= 8,
        run: () => {
          const empBoost = b.employees.reduce((s, e) => s + e.competence / 100, 0);
          // #12 Recompensa variable: el comercio depende del flujo de gente y del clima de Cuenca
          const variance = 0.65 + Math.random() * 0.7; // 65%–135%
          const cl = Math.round(b.clientes * world.salesMult * (1 + empBoost * 0.5) * variance);
          const util = cl * b.ticket - b.costosFijos;
          applyEff(p, [['time', -8], ['liq', util], ['stat', 'stress', 5], ['stat', 'experience', 2], ['impact', 'empresarial', 2]]);
          const flavor = variance >= 1.15 ? '¡día buenazo!' : variance >= 0.95 ? 'día normal' : variance >= 0.8 ? 'día flojo' : 'día muy tranquilo';
          return `Operaste tu negocio (${flavor}): ${cl} clientes, utilidad $${util}`;
        } });
      out.push({ id: 'hire', label: 'Contratar empleado (2h)', hours: 2, desc: 'persistente: más producción, más costo y riesgo', ok: p.timeLeft >= 2 && b.employees.length < 3,
        run: () => { applyEff(p, [['time', -2]]); const e = generateEmployee(); b.employees.push(e);
          return `Contrataste a ${e.name} (competencia ${e.competence})`; } });
    }
  }

  // ── Portafolio Permanente — coleccionables deflacionarios ──
  // Inspirado en Harry Browne: diversificar en activos que preservan valor
  function buyCol(kind: CollectibleKind, name: string, cost: number, hours: number): GameAction {
    return {
      id: 'buy_' + kind,
      label: `Comprar ${name} (${hours}h · $${cost})`,
      hours, desc: 'activo deflacionario · se aprecia con el tiempo',
      ok: p.timeLeft >= hours && p.liquidity >= cost,
      run: () => {
        applyEff(p, [['time', -hours], ['liq', -cost], ['impact', 'comunitario', kind==='cuadro'?2:0]]);
        p.collectibles.push({ kind, name, value: cost, boughtFor: cost });
        return `Adquiriste: ${name} ($${cost})`;
      }
    };
  }

  if (loc === 'centro_historico') {
    if (p.collectibles.filter(c => c.kind === 'cuadro').length < 3)
      out.push(buyCol('cuadro', 'cuadro local', 180 + rnd(220), 2));
    if (p.collectibles.filter(c => c.kind === 'joyeria').length < 4)
      out.push(buyCol('joyeria', 'joyería artesanal', 120 + rnd(180), 1));
    out.push({ id: 'comunity_act', label: 'Actividad cultural (3h)', hours: 3, desc: '+legado comunitario, +felicidad, gratis', ok: p.timeLeft >= 3,
      run: () => { applyEff(p, [['time', -3], ['stat', 'happiness', 5], ['impact', 'comunitario', 4], ['impact', 'profesional', 1]]); return `Participaste en una actividad cultural en el Centro Histórico`; } });
  }

  if (loc === 'mall_rio') {
    if (p.collectibles.filter(c => c.kind === 'vino').length < 5)
      out.push(buyCol('vino', 'vino de guarda', 80 + rnd(100), 1));
    if (p.collectibles.filter(c => c.kind === 'tarjeta').length < 3)
      out.push(buyCol('tarjeta', 'tarjeta de béisbol', 60 + rnd(140), 1));
    if (p.collectibles.filter(c => c.kind === 'bitcoin').length < 2 && p.liquidity >= 100)
      out.push(buyCol('bitcoin', 'fracción BTC', 100, 1));
    // Transport upgrades
    if (p.transport === 'walk' || p.transport === 'bus') {
      out.push({ id: 'buy_bicycle', label: 'Comprar bicicleta ($150)', hours: 2, desc: 'Mas rapido que caminar, gratis a futuro', ok: p.timeLeft >= 2 && p.liquidity >= 150,
        run: () => { p.transport = 'bicycle'; applyEff(p, [['time', -2], ['liq', -150], ['stat', 'health', 3]]); return `Compraste una bicicleta`; } });
    }
    if (p.transport !== 'motorcycle' && p.transport !== 'car') {
      out.push({ id: 'buy_moto', label: 'Comprar moto ($800)', hours: 2, desc: 'Veloz y economica. Ahorra tiempo en viajes', ok: p.timeLeft >= 2 && p.liquidity >= 800,
        run: () => { p.transport = 'motorcycle'; applyEff(p, [['time', -2], ['liq', -800], ['stat', 'happiness', 5]]); return `Compraste una motocicleta`; } });
    }
    if (p.transport !== 'car' && p.bank >= 3000) {
      out.push({ id: 'buy_car', label: 'Comprar carro (banco: -$3000)', hours: 3, desc: 'El mas rapido. +$30/quincena en gastos', ok: p.timeLeft >= 3 && p.bank >= 3000,
        run: () => { p.transport = 'car'; p.bank -= 3000; applyEff(p, [['time', -3], ['stat', 'happiness', 8], ['impact', 'profesional', 3]]); return `Compraste un carro`; } });
    }
  }

  if (loc === 'rio_tomebamba') {
    out.push({ id: 'meditar', label: 'Meditar junto al río (2h)', hours: 2, desc: '+salud, -estrés, +legado comunitario', ok: p.timeLeft >= 2,
      run: () => { applyEff(p, [['time', -2], ['stat', 'health', 4], ['stat', 'stress', -8], ['stat', 'happiness', 4], ['impact', 'comunitario', 2]]); return `Meditaste junto al Tomebamba (+salud, -estrés)`; } });
    // Salir a la naturaleza: vuelves con otro tono y eso mejora los lazos en casa
    out.push({ id: 'naturaleza', label: 'Caminata por la naturaleza (4h)', hours: 4, desc: '+bienestar fuerte; vuelves de mejor ánimo y mejoran tus relaciones', ok: p.timeLeft >= 4,
      run: () => {
        applyEff(p, [['time', -4], ['stat', 'health', 8], ['stat', 'stress', -12], ['stat', 'happiness', 8]]);
        let extra = '';
        if (p.family.length > 0) {
          // El mejor ánimo se contagia: sube la relación con toda la familia
          for (const fm of p.family) fm.score = Math.min(100, fm.score + 4);
          applyEff(p, [['impact', 'familiar', 3]]);
          extra = ' Volviste con otro tono y en casa se notó (+relaciones)';
        }
        return `Caminaste por las orillas del Tomebamba (+bienestar).` + extra;
      } });
  }

  if (loc === 'terminal') {
    if (!p.job) {
      out.push({ id: 'buscar_empleo', label: 'Buscar empleo en agencia (2h)', hours: 2, desc: 'aplica a mejor vacante según tu nivel', ok: p.timeLeft >= 2,
        run: () => {
          const candidates = JOBS.filter(j => p.careerLevel >= j.minLevel && p.stats.dependability >= j.minDep);
          if (candidates.length === 0) { applyEff(p, [['time', -2]]); return `Buscaste empleo: aún no cumples los requisitos`; }
          const best = candidates.sort((a, b) => b.wage - a.wage)[0];
          p.job = best; applyEff(p, [['time', -2], ['stat', 'happiness', 3], ['impact', 'profesional', 2]]);
          return `Te contrataron como ${best.title} en ${locById(best.locationId).name.split('(')[0].trim()} (+$${best.wage}/turno)`;
        }
      });
    }
    if (p.job) {
      out.push({ id: 'cambiar_trabajo', label: 'Buscar trabajo mejor (2h)', hours: 2, desc: 'busca vacante de mayor salario', ok: p.timeLeft >= 2,
        run: () => {
          const better = JOBS.filter(j => j.wage > (p.job?.wage ?? 0) && p.careerLevel >= j.minLevel && p.stats.dependability >= j.minDep);
          if (better.length === 0) { applyEff(p, [['time', -2]]); return `Buscaste un trabajo mejor: ninguna oferta supera la actual`; }
          const best = better.sort((a, b) => b.wage - a.wage)[0];
          p.job = best; applyEff(p, [['time', -2], ['impact', 'profesional', 1]]);
          return `Cambiaste de trabajo: ahora eres ${best.title} (+$${best.wage}/turno)`;
        }
      });
    }
    out.push({ id: 'secap', label: 'Curso SECAP (4h · gratis)', hours: 4, desc: '+confiabilidad, +experiencia', ok: p.timeLeft >= 4,
      run: () => { applyEff(p, [['time', -4], ['stat', 'dependability', 5], ['stat', 'experience', 3], ['stat', 'knowledge', 2]]); return `Completaste un curso en el SECAP (+confiabilidad)`; }
    });
  }

  if (loc === 'zona_industrial') {
    if (p.businesses.length === 0) {
      out.push({ id: 'startmanufactura', label: 'Abrir manufactura ($800, 12h)', hours: 12, desc: 'negocio industrial · mejor margen que la Feria', ok: p.timeLeft >= 12 && p.liquidity >= 800,
        run: () => {
          applyEff(p, [['time', -12], ['liq', -800], ['stat', 'experience', 4], ['impact', 'empresarial', 5]]);
          p.businesses.push({ id: 'mfg_' + p.id, type: 'manufactura', capital: 800, ticket: 22, clientes: 7, costosFijos: 65, employees: [] });
          return `Abriste una manufactura en la Zona Industrial`;
        }
      });
    }
    if (!p.job)
      out.push({ id: 'jornadaextra', label: 'Jornada contratista (6h)', hours: 6, desc: '+$38 sin empleo formal', ok: p.timeLeft >= 6,
        run: () => { applyEff(p, [['time', -6], ['liq', 38], ['stat', 'experience', 3], ['stat', 'stress', 6]]); return `Hiciste una jornada de contratista en la Zona Industrial (+$38)`; }
      });
  }

  if (loc === 'hospital') {
    out.push({ id: 'consulta', label: 'Consulta médica (2h · $30)', hours: 2, desc: '+salud, -estrés', ok: p.timeLeft >= 2 && p.liquidity >= 30,
      run: () => { applyEff(p, [['time', -2], ['liq', -30], ['stat', 'health', 8], ['stat', 'stress', -6]]); return `Fuiste a consulta médica (+salud, -estrés)`; }
    });
    if (p.stats.health < 60)
      out.push({ id: 'recuperacion', label: 'Recuperación completa (8h · $80)', hours: 8, desc: 'solo cuando salud < 60: recuperación total', ok: p.timeLeft >= 8 && p.liquidity >= 80,
        run: () => { applyEff(p, [['time', -8], ['liq', -80], ['stat', 'health', 25], ['stat', 'stress', -15]]); return `Te recuperaste en la clínica Kennedy`; }
      });
    out.push({ id: 'check_prev', label: 'Chequeo preventivo (1h · $15)', hours: 1, desc: '+salud ligera, +conocimiento', ok: p.timeLeft >= 1 && p.liquidity >= 15,
      run: () => { applyEff(p, [['time', -1], ['liq', -15], ['stat', 'health', 3], ['stat', 'knowledge', 1]]); return `Te hiciste un chequeo preventivo en la clínica`; }
    });
  }

  if (loc === 'parque_calderon' || loc === 'parque_paraiso') {
    out.push({ id: 'parque_descanso', label: 'Descansar en el parque (3h)', hours: 3, desc: '+felicidad, -estrés, gratis', ok: p.timeLeft >= 3,
      run: () => { applyEff(p, [['time', -3], ['stat', 'happiness', 6], ['stat', 'stress', -7], ['stat', 'health', 2]]); return `Descansaste en el Parque Calderón`; }
    });
    if (p.family.length > 0)
      out.push({ id: 'picnic_fam', label: 'Picnic familiar (3h · $10)', hours: 3, desc: '+felicidad, +legado familiar, +salud', ok: p.timeLeft >= 3 && p.liquidity >= 10,
        run: () => { applyEff(p, [['time', -3], ['liq', -10], ['stat', 'happiness', 8], ['stat', 'health', 3], ['impact', 'familiar', 4], ['impact', 'comunitario', 1]]); return `Hiciste un picnic con la familia en el parque`; }
      });
    out.push({ id: 'networking_parque', label: 'Red de contactos (2h)', hours: 2, desc: '+confiabilidad, +impacto profesional', ok: p.timeLeft >= 2,
      run: () => { applyEff(p, [['time', -2], ['stat', 'dependability', 3], ['impact', 'profesional', 3], ['stat', 'happiness', 2]]); return `Expandiste tu red de contactos en el Parque Calderón`; }
    });
    // Voluntariado: buenas acciones para la comunidad
    out.push({ id: 'voluntariado', label: 'Voluntariado comunitario (4h)', hours: 4, desc: '+legado, +liderazgo, +felicidad. Buenas acciones que perduran', ok: p.timeLeft >= 4,
      run: () => { applyEff(p, [['time', -4], ['stat', 'leadership', 4], ['stat', 'happiness', 6], ['stat', 'reputation', 3], ['impact', 'comunitario', 6]]); return `Hiciste voluntariado por tu comunidad (+legado, +liderazgo)`; }
    });
    // Dirigente Scout: liderazgo formativo de alto impacto comunitario
    out.push({ id: 'scouts', label: 'Dirigente en Scouts del Ecuador (5h)', hours: 5, desc: 'Formar jóvenes: +liderazgo fuerte, +legado, +reputación', ok: p.timeLeft >= 5,
      run: () => { applyEff(p, [['time', -5], ['stat', 'leadership', 7], ['stat', 'knowledge', 2], ['stat', 'reputation', 5], ['stat', 'happiness', 5], ['impact', 'comunitario', 8], ['impact', 'profesional', 2]]); return `Serviste como dirigente en los Scouts del Ecuador (+liderazgo, +legado)`; }
    });
    // Salir a la naturaleza también disponible en los parques
    out.push({ id: 'naturaleza', label: 'Día en la naturaleza (4h)', hours: 4, desc: '+bienestar fuerte; vuelves de mejor ánimo y mejoran tus relaciones', ok: p.timeLeft >= 4,
      run: () => {
        applyEff(p, [['time', -4], ['stat', 'health', 8], ['stat', 'stress', -12], ['stat', 'happiness', 8]]);
        let extra = '';
        if (p.family.length > 0) {
          for (const fm of p.family) fm.score = Math.min(100, fm.score + 4);
          applyEff(p, [['impact', 'familiar', 3]]);
          extra = ' Volviste con otro tono y en casa se notó (+relaciones)';
        }
        return `Pasaste el día en la naturaleza (+bienestar).` + extra;
      } });
  }

  if (loc === 'municipio') {
    out.push({ id: 'proyecto_com', label: 'Proyecto comunitario (4h)', hours: 4, desc: '+legado comunitario, +conocimiento', ok: p.timeLeft >= 4,
      run: () => { applyEff(p, [['time', -4], ['stat', 'knowledge', 3], ['stat', 'happiness', 4], ['impact', 'comunitario', 6]]); return `Participaste en un proyecto comunitario en el Municipio`; }
    });
    if (p.businesses.length > 0)
      out.push({ id: 'licencia_neg', label: 'Licencia de negocio (3h · $40)', hours: 3, desc: '+confiabilidad, +impacto empresarial', ok: p.timeLeft >= 3 && p.liquidity >= 40,
        run: () => { applyEff(p, [['time', -3], ['liq', -40], ['stat', 'dependability', 4], ['impact', 'empresarial', 5]]); return `Tramitaste la licencia de tu negocio en el Municipio`; }
      });
    if (p.impact.comunitario >= 10)
      out.push({ id: 'cargo_publico', label: 'Cargo público voluntario (6h)', hours: 6, desc: 'legado alto: +reputación, +impacto', ok: p.timeLeft >= 6,
        run: () => { applyEff(p, [['time', -6], ['stat', 'dependability', 6], ['stat', 'knowledge', 2], ['impact', 'comunitario', 8], ['impact', 'profesional', 2]]); return `Asumiste un cargo público voluntario`; }
      });
    // ── Filantropía de legado: clubes de servicio (gana acceso con reputación comunitaria) ──
    if (p.impact.comunitario >= 20) {
      out.push({ id: 'club_leones', label: 'Club de Leones: jornada médica ($300, 4h)', hours: 4, desc: 'Apoya hospitales y familias necesitadas. +legado fuerte, +reputación', ok: p.timeLeft >= 4 && p.liquidity >= 300,
        run: () => { applyEff(p, [['time', -4], ['liq', -300], ['stat', 'reputation', 6], ['stat', 'happiness', 6], ['impact', 'comunitario', 12]]); return `Financiaste una jornada médica con el Club de Leones`; }
      });
      out.push({ id: 'kiwanis', label: 'Kiwanis: causa por la niñez ($250, 4h)', hours: 4, desc: 'Ayuda a hospitales infantiles. +legado, +reputación', ok: p.timeLeft >= 4 && p.liquidity >= 250,
        run: () => { applyEff(p, [['time', -4], ['liq', -250], ['stat', 'reputation', 5], ['stat', 'happiness', 6], ['impact', 'comunitario', 10]]); return `Apoyaste a la niñez con Kiwanis`; }
      });
      out.push({ id: 'rotario_operacion', label: 'Rotarios: donar una operación ($800, 5h)', hours: 5, desc: 'Como donante, pagas la cirugía de una familia necesitada. +legado máximo', ok: p.timeLeft >= 5 && p.liquidity >= 800,
        run: () => { applyEff(p, [['time', -5], ['liq', -800], ['stat', 'reputation', 9], ['stat', 'happiness', 10], ['impact', 'comunitario', 18], ['impact', 'profesional', 2]]); return `Donaste una operación a través del Club Rotario (+legado máximo)`; }
      });
    }
  }

  if (loc === 'estadio') {
    out.push({ id: 'entrenar', label: 'Entrenar físico (4h)', hours: 4, desc: '+salud grande, -estrés, gratis', ok: p.timeLeft >= 4,
      run: () => { applyEff(p, [['time', -4], ['stat', 'health', 10], ['stat', 'stress', -8], ['stat', 'happiness', 3]]); return `Entrenaste en el Estadio Alejandro (+salud)`; }
    });
    out.push({ id: 'partido_inf', label: 'Partido informal (3h · $5)', hours: 3, desc: '+salud, +felicidad, +legado comunitario', ok: p.timeLeft >= 3 && p.liquidity >= 5,
      run: () => { applyEff(p, [['time', -3], ['liq', -5], ['stat', 'health', 6], ['stat', 'happiness', 7], ['impact', 'comunitario', 3]]); return `Jugaste un partido informal en el Estadio`; }
    });
    if (p.businesses.length > 0)
      out.push({ id: 'red_palco', label: 'Red empresarial en palco (2h · $20)', hours: 2, desc: '+confiabilidad, +impacto empresarial', ok: p.timeLeft >= 2 && p.liquidity >= 20,
        run: () => { applyEff(p, [['time', -2], ['liq', -20], ['stat', 'dependability', 4], ['impact', 'empresarial', 4], ['impact', 'profesional', 2]]); return `Hiciste contactos empresariales en el palco del Estadio`; }
      });
  }

  // Empleos: trabajar / postular según escalera
  for (const j of jobsAt(loc)) {
    if (p.job && p.job.id === j.id) {
      out.push({ id: 'work_' + j.id, label: `Trabajar turno (${j.hours}h)`, hours: j.hours, desc: `+$${wageOf(p, j, world)} · ${careerTitle(p.careerLevel)}`, ok: p.timeLeft >= j.hours,
        run: () => { const wage = wageOf(p, j, world);
          applyEff(p, [['time', -j.hours], ['liq', wage], ['stat', 'stress', j.stress], ['stat', 'experience', j.exp], ['stat', 'dependability', 1], ['impact', 'profesional', 1]]);
          const promo = tryPromote(p);
          return `Trabajaste como ${j.title} en ${locById(j.locationId).name.split('(')[0].trim()} (+$${wage})` + (promo ? ' · ' + promo : ''); } });
    } else if (p.job === null) {
      const eligible = p.careerLevel >= j.minLevel;
      out.push({ id: 'apply_' + j.id, label: 'Postular: ' + j.title, hours: 2, desc: eligible ? `requiere confiab. ${j.minDep}` : `requiere nivel ${careerTitle(j.minLevel)}`, ok: p.timeLeft >= 2 && eligible,
        run: () => { applyEff(p, [['time', -2]]);
          if (p.stats.dependability >= j.minDep) { p.job = j; const loc = locById(j.locationId); return `Te contrataron como ${j.title} en ${loc.name.split('(')[0].trim()}`; }
          return `Postulaste a ${j.title}: no quedaste (sube tu confiabilidad)`; } });
    }
  }
  // Health crisis: if health < 20, mark all work-related actions as unavailable
  if (p.stats.health < 20) {
    out.forEach(a => {
      if (['work_', 'overtime', 'startbiz', 'runbiz', 'runmanufactura', 'empleo_'].some(k => a.id.startsWith(k))) {
        a.ok = false;
        a.desc = a.desc + ' — SALUD CRITICA, descansa primero';
      }
    });
  }
  return out.filter(a => a.ok);
}

/* ---------- APRECIACIÓN DE COLECCIONABLES (Portafolio Permanente) ---------- */
// Perfiles de volatilidad inspirados en Harry Browne: activos reales como cobertura
const COL_RATES: Record<string, () => number> = {
  cuadro:   () => 0.02 + Math.random() * 0.04,            // +2–6% estable
  vino:     () => 0.015 + Math.random() * 0.03,           // +1.5–4.5% muy estable
  joyeria:  () => 0.01 + Math.random() * 0.025,           // +1–3.5% reserva de valor
  tarjeta:  () => -0.08 + Math.random() * 0.30,           // -8% a +22% especulativo
  bitcoin:  () => -0.18 + Math.random() * 0.50,           // -18% a +32% volátil
};

function tickCollectibles(p: PlayerState): string[] {
  const logs: string[] = [];
  for (const c of p.collectibles) {
    const rate = (COL_RATES[c.kind] ?? (() => 0))();
    const delta = Math.round(c.value * rate);
    c.value = Math.max(1, c.value + delta);
    if (Math.abs(rate) > 0.12)
      logs.push(`${c.name}: ${rate >= 0 ? '+' : ''}${Math.round(rate*100)}% → $${c.value}`);
  }
  return logs;
}

/* ---------- CIERRE DE QUINCENA ---------- */
export function closeBusinessAndEmployees(p: PlayerState): string[] {
  const logs: string[] = [];
  logs.push(...tickCollectibles(p));
  for (const b of p.businesses) {
    p.liquidity -= b.costosFijos;
    for (const e of b.employees) {
      p.liquidity -= e.wage;
      e.turnsEmployed++;
      if (e.loyalty > 55 && Math.random() < 0.3) e.loyalty = Math.min(100, e.loyalty + 3);
      // eventos rudimentarios de empleado
      const r = Math.random();
      if (e.honesty < 45 && r < 0.10) { const robo = 30 + rnd(40); p.liquidity -= robo; logs.push(`${e.name} robó $${robo} del negocio`); }
      else if (e.initiative > 75 && r < 0.12) { applyEff(p, [['impact', 'empresarial', 2]]); logs.push(`${e.name} propuso una mejora (+impacto empresarial)`); }
      else if (e.loyalty < 45 && r < 0.10) { b.employees = b.employees.filter(x => x.id !== e.id); logs.push(`${e.name} renunció`); }
    }
  }
  return logs;
}

/* ---------- VICTORIA — vida plena, cuadrante libre ---------- */
export function hasWon(p: PlayerState, g: Goals): boolean {
  const m = metrics(p);
  const emMonths = emergencyFundMonths(p);
  const pi = passiveIncome(p);
  const exp = expensesPerTurn(p);
  // Victoria: vida equilibrada + fondo de 6 meses + al menos ingreso pasivo parcial
  // (el inversionista pleno gana más rápido; el asalariado puede llegar con paciencia)
  return m.bienestar >= g.bienestar
    && m.conocimientos >= g.conocimientos
    && m.impacto >= g.impacto
    && p.impact.comunitario >= g.comunitario
    && emMonths >= g.emergencyMonths
    && pi >= exp * (g.passiveGoalPct / 100);   // al menos 35% de gastos cubiertos por flujo pasivo
}

/* ---------- CPU OPPONENT — JOSÉ ---------- */
function cpuNextTarget(p: PlayerState, world: World, strategy: 'empleado'|'empresa'): { locId: string; actionId: string } | null {
  // Emergency: health crisis → rest at home
  if (p.stats.health < 35) return { locId: 'casa', actionId: 'rest' };

  if (strategy === 'empleado') {
    // Priority 1: study if enrolled
    if (p.education.enrolledId) return { locId: 'zona_universitaria', actionId: 'study' };
    // Priority 2: enroll if no degree and can afford
    if (p.education.completed.length === 0 && p.liquidity >= 80) return { locId: 'zona_universitaria', actionId: 'enroll' };
    // Priority 3: work if has job
    if (p.job) {
      const jobLoc = LOCATIONS.find(l => jobsAt(l.id).some(j => j.id === p.job!.id));
      if (jobLoc) return { locId: jobLoc.id, actionId: 'work_' + p.job.id };
    }
    // Priority 4: apply for a job
    if (!p.job) {
      for (const loc of LOCATIONS) {
        const jobs = jobsAt(loc.id).filter(j => p.careerLevel >= j.minLevel);
        if (jobs.length > 0) return { locId: loc.id, actionId: 'apply_' + jobs[0].id };
      }
    }
    // Priority 5: save when flush
    if (p.liquidity >= 200) return { locId: 'zona_financiera', actionId: 'save' };
    // Fallback: rest
    return { locId: 'casa', actionId: 'rest' };
  }

  // empresa strategy
  // Priority 1: open business when ready
  if (p.businesses.length === 0 && p.liquidity >= 500) return { locId: 'feria_libre', actionId: 'startbiz' };
  // Priority 2: operate existing business
  if (p.businesses.length > 0) {
    const biz = p.businesses[0];
    if (biz.employees.length < 2 && p.timeLeft > 10) return { locId: 'feria_libre', actionId: 'hire' };
    return { locId: 'feria_libre', actionId: 'operate' };
  }
  // Priority 3: save to reach $500 for business
  if (p.liquidity >= 150) return { locId: 'zona_financiera', actionId: 'save' };
  // Priority 4: get a job to earn capital
  if (p.job) {
    const jobLoc = LOCATIONS.find(l => jobsAt(l.id).some(j => j.id === p.job!.id));
    if (jobLoc) return { locId: jobLoc.id, actionId: 'work_' + p.job.id };
  }
  if (!p.job) {
    for (const loc of LOCATIONS) {
      const jobs = jobsAt(loc.id).filter(j => p.careerLevel >= j.minLevel);
      if (jobs.length > 0) return { locId: loc.id, actionId: 'apply_' + jobs[0].id };
    }
  }
  return { locId: 'casa', actionId: 'rest' };
}

export function cpuTurn(
  p: PlayerState, world: World,
  strategy: 'empleado'|'empresa', difficulty: 1|2|3
): string[] {
  const logs: string[] = [];
  const noiseRate = difficulty === 1 ? 0.50 : difficulty === 2 ? 0.20 : 0;
  let safety = 0;

  while (p.timeLeft >= 0.5 && safety++ < 40) {
    const target = cpuNextTarget(p, world, strategy);
    if (!target) break;

    // Move if needed
    if (target.locId !== p.currentLocation) {
      const loc = locById(target.locId);
      const cost = loc.tc[p.transport];
      if (p.timeLeft < cost) {
        // Try casa as fallback
        const casaCost = locById('casa').tc[p.transport];
        if (p.currentLocation !== 'casa' && p.timeLeft >= casaCost) {
          p.currentLocation = 'casa'; p.timeLeft -= casaCost;
        } else break;
      } else {
        p.currentLocation = target.locId;
        p.timeLeft -= cost;
      }
    }

    // Get available actions at current location
    const acts = actionsFor(p, world);
    if (acts.length === 0) break;

    // Noise: pick random action instead of best
    let act = acts.find(a => a.id === target.actionId || a.id.startsWith(target.actionId));
    if (!act || Math.random() < noiseRate) act = acts[Math.floor(Math.random() * acts.length)];
    if (!act) break;

    const log = act.run();
    // Las acciones se narran en 2da persona (tú); para la IA atribuimos con el nombre
    logs.push(`${p.name}: ${log}`);
  }

  p.timeLeft = 0;
  return logs;
}

/* ---------- MODO LEGADO ---------- */
export function canRetire(p: PlayerState, turn: number): boolean {
  return !p.retired && turn >= 24; // ~1 año de quincenas
}
// Crea heredero que hereda patrimonio (con costo), reputación y ~30% resiliencia
export function makeHeir(parent: PlayerState, idx: number): PlayerState {
  const heir = newPlayer(parent.id, parent.name + ' Jr.', idx, parent.generation + 1);
  // patrimonio ya incluye el banco; el heredero recibe la mitad del patrimonio total
  const inherited = Math.round(patrimonio(parent) * 0.5);
  heir.bank = inherited;
  heir.businesses = parent.businesses.map(b => ({ ...b, employees: [...b.employees] }));
  heir.stats.reputation = Math.round(parent.stats.reputation * 0.6);
  heir.stats.resilience = Math.round(parent.stats.resilience * 0.3);
  heir.impact.familiar = Math.round(parent.impact.familiar * 0.5);
  return heir;
}
