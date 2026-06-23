import {
  GameState, PlayerState, World, Goals, Effect, PlayerStats, GameEvent,
  FamilyMember, Personality, Business, Employee, GameAction, ImpactNet,
} from './types';
import { CAREER_LADDER } from './types';
import {
  LOCATIONS, locById, JOBS, jobsAt, EVENTS, DEGREES, degreeById,
  FNAMES_M, FNAMES_F, EMP_NAMES, RELATIONS, PERSONALITIES, PERS_WEALTH,
} from './data';

export const HOURS_PER_TURN = 112;
export const DEFAULT_GOALS: Goals = { patrimonio: 8000, bienestar: 75, conocimientos: 60, impacto: 60 };
export const PLAYER_COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const UNBOUNDED = new Set<keyof PlayerStats>(['experience', 'knowledge']);

/* ---------- FAMILIA ---------- */
export function generateFamily(): FamilyMember[] {
  const n = 2 + rnd(3);
  const pool = RELATIONS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const fam: FamilyMember[] = [];
  for (let k = 0; k < n; k++) {
    const r = pool[k];
    fam.push({
      rel: r.rel,
      name: (r.sex === 'f' ? FNAMES_F : FNAMES_M)[rnd(10)],
      pers: pick(PERSONALITIES),
      score: 40 + rnd(51),
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
export function newPlayer(id: string, name: string, idx: number, generation = 1): PlayerState {
  const birth = pick(LOCATIONS);
  const family = generateFamily();
  return {
    id, name, colorIndex: idx, generation,
    timeLeft: HOURS_PER_TURN, liquidity: startingLiquidity(family), bank: 0,
    businesses: [], vehicles: [],
    housing: 'family', transport: 'walk',
    birthBarrio: birth.id, birthCrime: birth.crimeRisk, currentLocation: birth.id,
    family, job: null, careerLevel: 0,
    education: { completed: [], enrolledId: null, hoursInvested: 0 },
    impact: { profesional: 5, familiar: 10, comunitario: 5, empresarial: 0 },
    stats: { experience: 0, dependability: 50, leadership: 0, health: 80, stress: 20, happiness: 60, reputation: 30, resilience: 0, knowledge: 5 },
    retired: false,
  };
}

export function newGame(players: { id: string; name: string }[], goals: Goals = DEFAULT_GOALS): GameState {
  const bad = Math.random() < 0.5;
  return {
    turn: 1, activePlayerIndex: 0,
    players: players.map((p, i) => newPlayer(p.id, p.name, i)),
    world: { economy: bad ? 'bad' : 'good', wageMult: bad ? 0.8 : 1, salesMult: bad ? 0.8 : 1 },
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
export function patrimonio(p: PlayerState): number {
  const biz = p.businesses.reduce((s, b) => s + b.capital, 0);
  const veh = p.vehicles.reduce((s, v) => s + v.value, 0);
  return Math.round(p.liquidity + p.bank + biz + veh);
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
    return `${p.name} ascendió a ${careerTitle(p.careerLevel)}${eduBoost ? ' (su educación ayudó)' : ''}`;
  }
  return null;
}
export function wageOf(p: PlayerState, job: import('./types').Job, world: World): number {
  return Math.round(job.wage * (1 + p.careerLevel * 0.22) * world.wageMult);
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
export function rollEvent(p: PlayerState, turn: number): GameEvent | null {
  const cands = EVENTS.filter(e => e.cond.every((c: any[]) => evalCond(c, p, turn)));
  if (cands.length === 0) return null;
  if (Math.random() < 0.25) return null;
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

  if (loc === p.birthBarrio) {
    out.push({ id: 'rest', label: 'Descansar (8h)', hours: 8, desc: '+salud, -estrés', ok: p.timeLeft >= 8,
      run: () => { applyEff(p, [['time', -8], ['stat', 'health', 6], ['stat', 'stress', -10], ['stat', 'happiness', 3]]); return `${p.name} descansó en casa`; } });
    out.push({ id: 'social', label: 'Socializar (4h)', hours: 4, desc: '+felicidad, +impacto comunitario, -$15', ok: p.timeLeft >= 4 && p.liquidity >= 15,
      run: () => { applyEff(p, [['time', -4], ['liq', -15], ['stat', 'happiness', 7], ['impact', 'comunitario', 3]]); return `${p.name} salió con amigos`; } });
    out.push({ id: 'family', label: 'Visitar a la familia (3h)', hours: 3, desc: 'azar: apoyo, consejo, regalo o lío', ok: p.timeLeft >= 3 && p.family.length > 0,
      run: () => { const m = pick(p.family); const r = familyVisitEffect(m, p.name); applyEff(p, [['time', -3], ...r.eff]); return r.log; } });
  }

  if (loc === 'zona_universitaria') {
    // matricularse en un grado
    for (const d of availableDegrees(p)) {
      if (p.education.enrolledId) break; // un grado a la vez
      out.push({ id: 'enroll_' + d.id, label: 'Matricularse: ' + d.name, hours: 1, desc: `${d.hours}h totales · $${d.cost} · +${d.knowledge} conoc.`, ok: p.timeLeft >= 1 && p.liquidity >= d.cost,
        run: () => { applyEff(p, [['time', -1], ['liq', -d.cost]]); p.education.enrolledId = d.id; p.education.hoursInvested = 0; return `${p.name} se matriculó en ${d.name}`; } });
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
            return `${p.name} se graduó: ${d.name} (+${d.knowledge} conocimiento)`;
          }
          return `${p.name} estudió ${block}h de ${d.name}`;
        } });
    }
  }

  if (loc === 'zona_financiera') {
    out.push({ id: 'save', label: 'Ahorrar $100 en banco', hours: 1, desc: 'mueve liquidez a patrimonio', ok: p.timeLeft >= 1 && p.liquidity >= 100,
      run: () => { applyEff(p, [['time', -1], ['liq', -100], ['bank', 100]]); return `${p.name} ahorró $100 en el banco`; } });
  }

  if (loc === 'feria_libre') {
    if (p.businesses.length === 0) {
      out.push({ id: 'startbiz', label: 'Abrir negocio ($500, 12h)', hours: 12, desc: 'comercio con ventas pasivas', ok: p.timeLeft >= 12 && p.liquidity >= 500,
        run: () => { applyEff(p, [['time', -12], ['liq', -500], ['stat', 'experience', 3], ['impact', 'empresarial', 4]]);
          p.businesses.push({ id: 'biz_' + p.id, type: 'comercio', capital: 500, ticket: 12, clientes: 8, costosFijos: 40, employees: [] });
          return `${p.name} abrió un negocio en la Feria Libre`; } });
    } else {
      const b = p.businesses[0];
      out.push({ id: 'operate', label: 'Operar negocio (8h)', hours: 8, desc: 'atender clientes', ok: p.timeLeft >= 8,
        run: () => {
          const empBoost = b.employees.reduce((s, e) => s + e.competence / 100, 0);
          const cl = Math.round(b.clientes * world.salesMult * (1 + empBoost * 0.5));
          const util = cl * b.ticket - b.costosFijos;
          applyEff(p, [['time', -8], ['liq', util], ['stat', 'stress', 5], ['stat', 'experience', 2], ['impact', 'empresarial', 2]]);
          return `${p.name} operó: ${cl} clientes, utilidad $${util}`;
        } });
      out.push({ id: 'hire', label: 'Contratar empleado (2h)', hours: 2, desc: 'persistente: más producción, más costo y riesgo', ok: p.timeLeft >= 2 && b.employees.length < 3,
        run: () => { applyEff(p, [['time', -2]]); const e = generateEmployee(); b.employees.push(e);
          return `${p.name} contrató a ${e.name} (competencia ${e.competence})`; } });
    }
  }

  // Empleos: trabajar / postular según escalera
  for (const j of jobsAt(loc)) {
    if (p.job && p.job.id === j.id) {
      out.push({ id: 'work_' + j.id, label: `Trabajar turno (${j.hours}h)`, hours: j.hours, desc: `+$${wageOf(p, j, world)} · ${careerTitle(p.careerLevel)}`, ok: p.timeLeft >= j.hours,
        run: () => { const wage = wageOf(p, j, world);
          applyEff(p, [['time', -j.hours], ['liq', wage], ['stat', 'stress', j.stress], ['stat', 'experience', j.exp], ['stat', 'dependability', 1], ['impact', 'profesional', 1]]);
          const promo = tryPromote(p);
          return `${p.name} trabajó ${j.hours}h en ${j.title} (+$${wage})` + (promo ? ' · ' + promo : ''); } });
    } else if (p.job === null) {
      const eligible = p.careerLevel >= j.minLevel;
      out.push({ id: 'apply_' + j.id, label: 'Postular: ' + j.title, hours: 2, desc: eligible ? `requiere confiab. ${j.minDep}` : `requiere nivel ${careerTitle(j.minLevel)}`, ok: p.timeLeft >= 2 && eligible,
        run: () => { applyEff(p, [['time', -2]]);
          if (p.stats.dependability >= j.minDep) { p.job = j; return `${p.name} fue contratado en ${j.title}`; }
          return `${p.name} postuló a ${j.title}: no quedaste (sube confiabilidad)`; } });
    }
  }
  return out.filter(a => a.ok);
}

/* ---------- CIERRE DE QUINCENA ---------- */
export function closeBusinessAndEmployees(p: PlayerState): string[] {
  const logs: string[] = [];
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

/* ---------- VICTORIA ---------- */
export function hasWon(p: PlayerState, g: Goals): boolean {
  const m = metrics(p);
  return m.patrimonio >= g.patrimonio && m.bienestar >= g.bienestar && m.conocimientos >= g.conocimientos && m.impacto >= g.impacto;
}

/* ---------- MODO LEGADO ---------- */
export function canRetire(p: PlayerState, turn: number): boolean {
  return !p.retired && turn >= 24; // ~1 año de quincenas
}
// Crea heredero que hereda patrimonio (con costo), reputación y ~30% resiliencia
export function makeHeir(parent: PlayerState, idx: number): PlayerState {
  const heir = newPlayer(parent.id, parent.name + ' Jr.', idx, parent.generation + 1);
  const inherited = Math.round((parent.bank + patrimonio(parent) * 0.5));
  heir.bank = inherited;
  heir.businesses = parent.businesses.map(b => ({ ...b, employees: [...b.employees] }));
  heir.stats.reputation = Math.round(parent.stats.reputation * 0.6);
  heir.stats.resilience = Math.round(parent.stats.resilience * 0.3);
  heir.impact.familiar = Math.round(parent.impact.familiar * 0.5);
  return heir;
}
