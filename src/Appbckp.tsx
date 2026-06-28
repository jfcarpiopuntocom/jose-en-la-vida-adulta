import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { GameState, PlayerState, GameEvent, Goals } from './types';
import {
  newGame, actionsFor, metrics, rollEvent, applyEff, closeBusinessAndEmployees,
  hasWon, canRetire, makeHeir, cpuTurn, portfolioSlices, collectiblesValue,
  patrimonio, expensesPerTurn, passiveIncome, cuadrante, emergencyFundMonths,
  CUADRANTE_LABEL, CUADRANTE_ICON, TIER_GOALS,
  HOURS_PER_TURN, DEFAULT_GOALS, PLAYER_COLORS, careerTitle, generateBackstory,
  joseQuip, COLLECTIBLE_LORE, cpuTurnSteps,
} from './engine';
import { GameTier } from './types';
import { LOCATIONS, PATH_ORDER, locById, barrioById } from './data';
import { saveLocal, loadLocal, hasLocalSave, clearLocal, publishToNostr, publishStory } from './nostr';
import { cityMusic } from './citymusic';

// Polyfill: structuredClone not available on Chrome < 98 / iOS < 15.4 (phones up to ~2021)
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// Safe localStorage — iOS Safari Private Mode throws SecurityError on every access.
// These wrappers make all reads/writes a no-op instead of crashing the app.
function lsGet(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop in Private Mode */ }
}

// Redondear horas a 1 decimal máximo, sin basura flotante como 41.59999999994
function fh(n: number): number { return Math.round(n * 10) / 10; }

// ── Narración estilo Knizia ──
// La cifra cruda existe (segundo nivel, expandible), pero la primera línea es una frase humana.
const TRANSPORT_NAME: Record<string, string> = {
  walk: 'a pie', bus: 'el bus', taxi: 'el taxi',
  bicycle: 'la bici', motorcycle: 'la moto', car: 'el carro',
};
function narrateClose(p: PlayerState, turn: number): string {
  const pi = Math.round(passiveIncome(p));
  const exp = expensesPerTurn(p);
  const net = pi - exp;
  const lines: string[] = [];
  lines.push(`Quincena ${turn} cerrada.`);
  if (net > 30)        lines.push(`Cerraste con $${net} más en el bolsillo.`);
  else if (net > 0)    lines.push(`Quedaste con $${net} de saldo a favor.`);
  else if (net === 0)  lines.push(`Cerraste en cero, sin sobresaltos.`);
  else if (net > -50)  lines.push(`Quedaste $${-net} corto: ajusta esta vez.`);
  else                 lines.push(`Mal mes: $${-net} en rojo. Toca priorizar.`);
  const saved = p.savedHoursThisTurn ?? 0;
  if (saved >= 3 && p.transport !== 'walk') {
    lines.push(`${TRANSPORT_NAME[p.transport]} te ahorró ${saved}h esta quincena.`);
  }
  if (p.rentals && p.rentals.length > 0 && pi >= exp) {
    lines.push(`Tus arriendos van pagando solos.`);
  }
  return lines.join(' ');
}

// Frases para "Cómo me va" (Knizia: el mismo dato dicho como vida, no como spreadsheet)
function narrateLife(p: PlayerState, goals: Goals): string[] {
  const m = metrics(p);
  const em = emergencyFundMonths(p);
  const piPct = Math.min(100, (passiveIncome(p) / Math.max(expensesPerTurn(p), 1)) * 100);
  const out: string[] = [];
  if (em >= goals.emergencyMonths) out.push(`Tienes colchón para ${em.toFixed(1)} meses: duermes tranquilo.`);
  else if (em >= 1)                 out.push(`Tu colchón aguanta ${em.toFixed(1)} meses; te falta para dormir tranquilo del todo.`);
  else                              out.push(`Vives al día: si algo se cae, no hay red.`);
  if (piPct >= 100)                 out.push(`Tu dinero ya trabaja por ti — eres inversionista de verdad.`);
  else if (piPct >= 35)             out.push(`Tu flujo pasivo cubre ${Math.round(piPct)}% de los gastos: vas armando libertad.`);
  else if (piPct > 0)               out.push(`Algo de pasivo entra (${Math.round(piPct)}% de los gastos): es el inicio.`);
  else                              out.push(`Todavía cambias todas tus horas por sueldo.`);
  if (m.bienestar >= goals.bienestar) out.push(`Te sientes bien, en cuerpo y ánimo.`);
  else if (p.stats.health < 40)       out.push(`La salud te está cobrando; cuídate antes de seguir.`);
  else if (p.stats.stress > 65)       out.push(`El estrés te está apretando; necesitas un respiro.`);
  if (p.impact.comunitario >= goals.comunitario) out.push(`Tu comunidad recuerda tu nombre — vas dejando huella.`);
  else if (p.impact.comunitario >= 10)            out.push(`Empiezas a aportar a la comunidad; el legado se cultiva.`);
  if (m.conocimientos >= goals.conocimientos)     out.push(`Tu conocimiento te abre puertas que ni ves.`);
  return out.slice(0, 4);
}

// Heurística sencilla para que la IA evalúe el "valor" de una opción en eventos bifurcados
function scoreEff(eff: any[]): number {
  let s = 0;
  for (const e of eff) {
    if (e[0] === 'liq' || e[0] === 'bank') s += Number(e[1]) || 0;
    else if (e[0] === 'time') s += (Number(e[1]) || 0) * 5; // cada hora vale ~$5 de jornal
    else if (e[0] === 'stat') {
      const k = e[1]; const v = Number(e[2]) || 0;
      if (k === 'stress') s -= v * 4;
      else s += v * 3;
    }
    else if (e[0] === 'impact') s += (Number(e[2]) || 0) * 4;
  }
  return s;
}

// Progreso hacia la vida plena: promedio de las 6 áreas, tope 100% (igual que el dashboard)
function winProgress(p: PlayerState, goals: Goals): number {
  const m = metrics(p);
  const em = emergencyFundMonths(p);
  const piPct = Math.min(100, (passiveIncome(p) / Math.max(expensesPerTurn(p), 1)) * 100);
  const bars: [number, number][] = [
    [m.bienestar, goals.bienestar],
    [m.conocimientos, goals.conocimientos],
    [m.impacto, goals.impacto],
    [p.impact.comunitario, goals.comunitario],
    [em, goals.emergencyMonths],
    [piPct, 100],
  ];
  return Math.round(bars.reduce((s, [v, gl]) => s + Math.min(100, (v / gl) * 100), 0) / bars.length);
}

// #6 Quip contextual: José mira el área más descuidada del jugador y la nombra sin sermonear
function joseAdvice(human: PlayerState, goals: Goals): string {
  const m = metrics(human);
  const em = emergencyFundMonths(human);
  const piPct = Math.min(100, (passiveIncome(human) / Math.max(expensesPerTurn(human), 1)) * 100);
  const areas: { pct: number; tip: string }[] = [
    { pct: (m.bienestar / goals.bienestar) * 100,       tip: '¿cuándo fue la última vez que descansaste sin culpa? El cuerpo también cobra.' },
    { pct: (m.conocimientos / goals.conocimientos) * 100, tip: 'lo que aprendes hoy te abre puertas que ni ves todavía. ¿Un curso?' },
    { pct: (m.impacto / goals.impacto) * 100,           tip: 'nadie llega lejos solo. ¿A quién no has cuidado últimamente?' },
    { pct: (human.impact.comunitario / goals.comunitario) * 100, tip: 'lo que das a tu comunidad es lo único que de verdad queda. Piénsalo.' },
    { pct: (em / goals.emergencyMonths) * 100,          tip: 'un colchón para emergencias es dormir tranquilo. ¿Ya empezaste el tuyo?' },
    { pct: piPct,                                        tip: 'que el dinero trabaje por ti, no al revés. ¿Dónde está tu primer ingreso pasivo?' },
  ];
  const weak = areas.reduce((a, b) => (b.pct < a.pct ? b : a));
  return weak.tip;
}

const PAWN_ICONS = ['🧑‍💼', '👩‍🔧', '🧑‍🎨', '👨‍🌾']; // fallback
function PawnAvatar({ p, size = 22, glow = false }: { p: PlayerState; size?: number; glow?: boolean }) {
  const col = PLAYER_COLORS[p.colorIndex];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{
      filter: glow ? 'drop-shadow(0 0 4px ' + col + ')' : 'none',
    }}>
      {/* Meeple shape — CC BY 3.0 game-icons.net/delapouite */}
      <path d="M12 2C10.34 2 9 3.34 9 5s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm-7 18 2.5-7H5l3-5h1.5L8 13h2V8h4v5h2l-1.5-5H16l3 5h-2.5L19 20H5z"
        fill={col} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5"/>
    </svg>
  );
}

// ── Portrait: large face for active turn ──
function Portrait({ p, size = 72 }: { p: PlayerState; size?: number }) {
  const col = PLAYER_COLORS[p.colorIndex];
  const [imgFailed, setImgFailed] = useState(false);
  const isJose = p.isAI && p.name.toLowerCase().startsWith('jos');
  // José tiene su retrato; los 4 jugadores usan player1..4.png (fallback a smiley si aún no están)
  const slot = (p.avatar ?? p.colorIndex) + 1;
  const src = isJose
    ? '/jose-en-la-vida-adulta/avatars/jose.png'
    : '/jose-en-la-vida-adulta/avatars/player' + slot + '.png';
  if (!imgFailed) {
    return (
      <img src={src}
        width={size} height={size}
        alt={p.name}
        onError={() => setImgFailed(true)}
        style={{
          borderRadius: '50%', objectFit: 'cover',
          border: '3px solid ' + col,
          boxShadow: '0 0 18px ' + col + '88, 0 4px 14px rgba(0,0,0,0.5)',
          background: '#f4e5c8',
        }} />
    );
  }
  // Smiley placeholder para jugadores humanos — distinto color por slot
  const smileyColors = ['#F4D03F', '#F5B041', '#EC7063', '#AF7AC5'];
  const bg = smileyColors[p.colorIndex % 4];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{
      borderRadius: '50%', border: '3px solid ' + col,
      boxShadow: '0 0 18px ' + col + '88, 0 4px 14px rgba(0,0,0,0.5)',
    }}>
      {/* Sun-yellow face */}
      <circle cx="50" cy="50" r="48" fill={bg} />
      {/* Eyes */}
      <circle cx="35" cy="42" r="5" fill="#2c1810" />
      <circle cx="65" cy="42" r="5" fill="#2c1810" />
      {/* Eye highlights */}
      <circle cx="36.5" cy="40.5" r="1.6" fill="#fff" />
      <circle cx="66.5" cy="40.5" r="1.6" fill="#fff" />
      {/* Happy smile */}
      <path d="M 30 60 Q 50 78 70 60" stroke="#2c1810" strokeWidth="4"
        fill="none" strokeLinecap="round" />
      {/* Rosy cheeks */}
      <circle cx="25" cy="58" r="5" fill="#ff8a8a" opacity="0.55" />
      <circle cx="75" cy="58" r="5" fill="#ff8a8a" opacity="0.55" />
    </svg>
  );
}

// Zone → node color type
const ZONE_T: Record<string, string> = {
  hogar:'home', universitaria:'edu', financiera:'finance',
  transporte:'transit', industrial:'indust', salud:'health',
  centro:'hist', rio:'river', politico:'gov', deporte:'sport',
};
function nodeType(zone: string, id: string): string {
  if (id === 'feria_libre') return 'market';
  if (id === 'mall_rio') return 'shop';
  if (id === 'parque_calderon') return 'nature';
  return ZONE_T[zone] || 'home';
}

// Action card accent colors cycle
const ACT_COLORS = ['emerald','sky','amber','violet','rose','lime'];
const ACTION_ICONS: Record<string, string> = {
  rest:'Z', sleep:'Z', social:'C', family:'H', family_ally:'H',
  enroll_:'E', study:'E', lecture:'E',
  work:'W', overtime:'W', parttime:'W',
  save100:'$', save500:'$', invest_bolsa:'S', fondo_500:'F', fondo_2000:'F',
  startbiz:'N', runbiz:'N', hirebiz:'N', expandbiz:'N',
  startmanufactura:'M', runmanufactura:'M',
  empleo_:'J', cambio_empleo:'J',
  consulta:'R', recuperar:'R', fisio:'R',
  entrenar:'T', partido_inf:'T',
  parque_descanso:'P', parque_foto:'P', parque_familia:'P',
  naturaleza:'🌿', voluntariado:'🤝', scouts:'⚜️',
  club_leones:'🦁', kiwanis:'🧒', rotario_operacion:'⚕️',
  proyecto_com:'G', tramite:'G', donacion:'G',
  meditacion:'M', rio_contemp:'M',
  comprar_obra:'A', presentar:'A', escuchar_musica:'A',
  mall_colect:'S', mall_browse:'S',
  terminal_empleo:'J', bolsa_empleo:'J',
};
function actionIcon(id: string): string {
  const exact = ACTION_ICONS[id];
  if (exact) return exact;
  for (const [k, v] of Object.entries(ACTION_ICONS)) {
    if (id.startsWith(k)) return v;
  }
  return '·';
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type Phase = 'setup' | 'play' | 'victory';
type PanelId = 'about' | null;

interface Pending { p: PlayerState; ev: GameEvent; silvered: boolean }

// ── Particle canvas effect ──
function useParticles(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = canvas.width, H = canvas.height, raf = 0;
    const C = [[200,160,64],[30,90,153],[160,25,44],[196,88,40],[240,232,214],[32,128,144],[107,78,154]];
    const P: {x:number;y:number;vx:number;vy:number;s:number;r:number;g:number;b:number;life:number;ml:number}[] = [];
    const N = 45;
    // visualViewport gives the correct dimensions on iOS Safari when the
    // address bar animates in/out. Falls back to window for older browsers.
    const vvp = (window as any).visualViewport as VisualViewport | undefined;
    function resize() {
      W = canvas!.width  = vvp ? Math.round(vvp.width)  : innerWidth;
      H = canvas!.height = vvp ? Math.round(vvp.height) : innerHeight;
    }
    const resizeTarget: EventTarget = vvp ?? window;
    function spawn(rAge: boolean) {
      const c = C[(Math.random() * C.length) | 0];
      const ml = 300 + Math.random() * 400;
      return { x: Math.random() * W, y: rAge ? Math.random() * H : H + 10,
        vx: (Math.random() - 0.5) * 0.2, vy: -(0.1 + Math.random() * 0.28),
        s: 0.8 + Math.random() * 2, r: c[0], g: c[1], b: c[2], life: rAge ? Math.random() * ml : ml, ml };
    }
    resize();
    for (let i = 0; i < N; i++) P.push(spawn(true));
    function loop() {
      ctx!.clearRect(0, 0, W, H);
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; p.x += p.vx; p.y += p.vy; p.life--;
        const t = p.life / p.ml;
        const a = (t > .8 ? (1-t)*5 : t < .2 ? t*5 : 1) * 0.35;
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.s, 0, 6.283);
        ctx!.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`; ctx!.fill();
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.s * 3.5, 0, 6.283);
        ctx!.fillStyle = `rgba(${p.r},${p.g},${p.b},${a * .15})`; ctx!.fill();
        if (p.life <= 0 || p.y < -20) P[i] = spawn(false);
      }
      raf = requestAnimationFrame(loop);
    }
    loop();
    resizeTarget.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); resizeTarget.removeEventListener('resize', resize); };
  }, []);
}

// ── Atmosphere background ──
function AtmosphereBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useParticles(canvasRef);
  return (
    <>
      <div id="atmosphere" />
      <canvas id="particles" ref={canvasRef} />
      <div id="vignette" />
    </>
  );
}

// ── Rotating overlay for portrait mobile ──
function RotateOverlay() {
  return (
    <div className="rotate-overlay">
      <div className="rotate-icon">⤵️📱⤴️</div>
      <div>Gira tu teléfono — este tablero se juega en horizontal</div>
    </div>
  );
}

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Fácil', 2: 'Normal', 3: 'Difícil' };

// Nombre de lugar contextual: Feria Libre solo dice "tu negocio" si el jugador ya tiene uno.
function locName(loc: typeof LOCATIONS[0], p: PlayerState): string {
  if (loc.id === 'feria_libre') {
    return p.businesses.length > 0 ? 'Feria Libre (tu negocio)' : 'Feria Libre (mercado)';
  }
  return loc.name;
}

// Resumen narrado situacional para el header (80-100 chars): cómo le va al jugador, vivo.
function narrateHeadline(p: PlayerState, game: GameState): string {
  const dif = DIFFICULTY_LABEL[(p as any).aiDifficulty ?? game.gameTier ?? 1] ?? 'Normal';
  const m = metrics(p);
  const g = game.goals;
  const pi = passiveIncome(p), exp = expensesPerTurn(p);
  const areas: { r: number; name: string }[] = [
    { r: m.bienestar / g.bienestar, name: 'su bienestar' },
    { r: m.conocimientos / g.conocimientos, name: 'sus conocimientos' },
    { r: m.impacto / g.impacto, name: 'su impacto' },
    { r: p.impact.comunitario / g.comunitario, name: 'su legado en la comunidad' },
    { r: emergencyFundMonths(p) / g.emergencyMonths, name: 'su fondo de emergencia' },
    { r: Math.min(1, pi / Math.max(exp, 1)), name: 'sus ingresos pasivos' },
  ];
  const win = areas.reduce((s, a) => s + Math.min(1, a.r), 0) / areas.length;
  const weak = areas.slice().sort((a, b) => a.r - b.r)[0].name;
  let phase: string;
  if (game.turn <= 2) phase = `apenas empieza a hacerse una vida y aún le falta reforzar ${weak}`;
  else if (win < 0.25) phase = `busca estabilizarse sin descuidar ${weak}`;
  else if (win < 0.5) phase = `va construyendo bases sólidas, pero aún le falta ${weak}`;
  else if (win < 0.75) phase = `avanza firme hacia una vida plena, atento a ${weak}`;
  else if (win < 1) phase = `está a un suspiro de lograrlo todo, solo le falta ${weak}`;
  else phase = `ya construyó la vida plena que tanto buscaba`;
  return `Nivel ${dif} · ${p.name} ${phase}`;
}
const DIFFICULTY_DESC: Record<number, string> = {
  1: 'José comete errores — bueno para aprender el juego',
  2: 'José juega con criterio — una competencia real',
  3: 'José optimiza cada hora — sin contemplaciones',
};

// ── Avatar helper (DiceBear — MIT license, free commercial use) ──
const DICEBEAR_STYLES = ['adventurer', 'personas', 'micah', 'lorelei'];
function avatarUrl(seed: string, idx: number): string {
  const style = DICEBEAR_STYLES[idx % DICEBEAR_STYLES.length];
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
}

const TIER_LOCK_KEY = 'jelva_max_tier';
function getMaxTier(): GameTier {
  const v = parseInt(lsGet(TIER_LOCK_KEY, '1'), 10);
  return (Math.min(4, Math.max(1, v)) as GameTier);
}

// ── Setup screen ──
// ── Backstory Modal ──
function BackstoryModal({ player, onClose }: { player: PlayerState; onClose: () => void }) {
  const story = generateBackstory(player);
  const col = PLAYER_COLORS[player.colorIndex];
  return (
    <div className="backstory-overlay" onClick={onClose}>
      <div className="backstory-card" onClick={e => e.stopPropagation()}>
        <div className="backstory-avatar">
          <Portrait p={player} size={96} />
        </div>
        <div className="backstory-title" style={{ color: col, WebkitTextFillColor: col }}>
          Tu historia
        </div>
        <p className="backstory-text">{story}</p>
        <div className="backstory-stats">
          <div className="bstat"><span className="bstat-label">Dinero inicial</span><span className="bstat-val">${player.liquidity}</span></div>
          <div className="bstat"><span className="bstat-label">Barrio</span><span className="bstat-val">{barrioById(player.birthBarrio).name}</span></div>
          <div className="bstat"><span className="bstat-label">Familia</span><span className="bstat-val">{player.family.length} personas</span></div>
        </div>
        <button className="primary" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
          Empezar a jugar
        </button>
      </div>
    </div>
  );
}

function Setup({ onStart }: { onStart: (g: GameState) => void }) {
  const maxTier = getMaxTier();
  const [tier, setTier] = useState<GameTier>(maxTier);
  const [n, setN] = useState(1);
  const [withJose, setWithJose] = useState(true);
  const [joseLine] = useState(joseQuip());
  const [avatar, setAvatar] = useState(0);

  function start() {
    const tierGoals = TIER_GOALS[tier] as typeof TIER_GOALS[1];
    const human = { id: 'p0', name: 'Tú', avatar };
    const players: { id: string; name: string; isAI?: boolean; aiStrategy?: 'empleado'|'empresa'; aiDifficulty?: 1|2|3 }[] = [human];
    for (let i = 1; i < n; i++) players.push({ id: 'p' + i, name: 'Jugador ' + (i + 1) });
    const joseDiff = (tier <= 1 ? 1 : tier === 2 ? 2 : 3) as 1|2|3; // José da ejemplo ajustado al nivel
    if (withJose) players.push({ id: 'jose', name: 'José', isAI: true, aiStrategy: 'empresa', aiDifficulty: joseDiff });
    const { label: _l, desc: _d, cpuMult: _c, ...goals } = tierGoals;
    onStart(newGame(players, goals, tier));
  }

  const tierOrder: GameTier[] = [1, 2, 3, 4];
  const tierIcons = ['◆', '◆◆', '◆◆◆', '◆◆◆◆'];
  const tierColors = ['#3A7850', '#C8A040', '#A0192C', '#6B4E9A'];

  return (
    <>
      <AtmosphereBg />
      <div id="map-world" />
      <div className="setup-screen">
        <div className="setup-card setup-card-wide">
          <div className="setup-title">JOSÉ EN LA VIDA ADULTA</div>
          <div className="setup-sub">el juego de la vida plena · Cuenca, Ecuador</div>

          <div className="setup-grid">
          <div className="setup-col">
          {/* José: el héroe-sherpa, primera decisión */}
          <div className="jose-hero">
            <img className="jose-hero-img" src="/jose-en-la-vida-adulta/avatars/jose.png" alt="José" />
            <div className="jose-hero-body">
              <div className="jose-hero-name">José va contigo</div>
              <div className="jose-hero-quip">“{joseLine}”</div>
              <label className="jose-hero-toggle">
                <input type="checkbox" checked={!withJose} onChange={e => setWithJose(!e.target.checked)} />
                Jugar sin José <span className="jose-hero-warn">(no recomendado)</span>
              </label>
            </div>
          </div>

          {/* Selector de avatar */}
          <div className="setup-label">Elige tu personaje</div>
          <div className="avatar-pick">
            {[0,1,2,3].map(i => (
              <button key={i} type="button"
                className={'avatar-opt' + (avatar === i ? ' avatar-sel' : '')}
                onClick={() => setAvatar(i)}>
                <img src={'/jose-en-la-vida-adulta/avatars/player' + (i+1) + '.png'} alt={'Personaje ' + (i+1)} />
              </button>
            ))}
          </div>
          </div>{/* /setup-col izquierda */}

          <div className="setup-col">
          {/* Tier selector */}
          <div className="setup-label">Nivel de dificultad</div>
          <div className="tier-grid">
            {tierOrder.map((t, i) => {
              const tm = TIER_GOALS[t];
              const locked = t > maxTier;
              const active = tier === t;
              return (
                <button
                  key={t}
                  className={'tier-btn' + (active ? ' tier-active' : '') + (locked ? ' tier-locked' : '')}
                  style={{ '--tc': tierColors[i] } as any}
                  onClick={() => !locked && setTier(t)}
                  disabled={locked}
                >
                  <span className="tier-icon">{tierIcons[i]}</span>
                  <span className="tier-name">{tm.label}</span>
                  {locked
                    ? <span className="tier-lock">Gana {TIER_GOALS[t-1]?.label} para desbloquear</span>
                    : <span className="tier-desc">{tm.desc.split('.')[0]}</span>}
                </button>
              );
            })}
          </div>

          {/* Jugadores */}
          <div className="setup-label" style={{ marginTop: 16 }}>¿Cuántos jugadores?</div>
          <div className="setup-row" style={{ marginBottom: 14 }}>
            {[1,2,3,4].map(i => (
              <button key={i} className={n===i?'setup-sel':'setup-opt'} onClick={() => setN(i)}>{i}</button>
            ))}
          </div>

          <div style={{ display:'flex', gap:8, marginTop: 16 }}>
            <button className="primary" style={{ flex:1 }} onClick={start}>
              Empezar
            </button>
            <button style={{ flex:'0 0 auto', padding:'0 14px' }} onClick={() => {
              const { label: _l, desc: _d, cpuMult: _c, ...goals } = TIER_GOALS[1];
              onStart(newGame([{ id:'p0', name:'Jugador 1' }, { id:'jose', name:'José', isAI:true, aiStrategy:'empresa', aiDifficulty:1 }], goals, 1));
            }} title="Modo Rapido: 1 jugador + José, Principiante, sin configuracion">
              Rapido
            </button>
          </div>
          {hasLocalSave() && (
            <button style={{ width:'100%', marginTop: 8 }} onClick={() => { const g = loadLocal(); if (g) onStart(g); }}>
              Continuar partida guardada
            </button>
          )}
          </div>{/* /setup-col derecha */}
          </div>{/* /setup-grid */}
        </div>
      </div>
    </>
  );
}

// ── SVG Clock with hands — shows days remaining ──
function TimeRing({ hours, compact = false }: { hours: number; compact?: boolean }) {
  const pct = clamp(hours / HOURS_PER_TURN, 0, 1);
  const days = fh(hours / 8); // 8h útiles por día
  const urgent = pct <= 0.35;
  const handCol = urgent ? '#E0303A' : '#F5C24A';
  const numCol = urgent ? '#E0303A' : '#E8A020';
  // Manecilla de hora: gira según % de tiempo restante (360° = quincena completa)
  const hourAngle = pct * 360;
  // Manecilla de minuto: gira 6× más rápido (efecto visual)
  const minAngle = (pct * 360 * 6) % 360;
  const hRad = (hourAngle - 90) * Math.PI / 180;
  const mRad = (minAngle - 90) * Math.PI / 180;
  const cx = 50, cy = 50;
  return (
    <div className={'clock-face' + (urgent ? ' clock-urgent' : '') + (compact ? ' clock-sm' : '')}>
      <svg viewBox="0 0 100 100" className="clock-svg">
        {/* Caja del reloj */}
        <circle cx={cx} cy={cy} r="46" fill="#1A1408" stroke="#5A4218" strokeWidth="3"/>
        <circle cx={cx} cy={cy} r="43" fill="none" stroke="#3A2A14" strokeWidth="1.5"/>
        {/* 12 marcas horarias */}
        {Array.from({length:12},(_,i) => {
          const a = (i * 30 - 90) * Math.PI / 180;
          const major = i % 3 === 0;
          const r1 = major ? 35 : 37, r2 = 41;
          return <line key={i}
            x1={cx+r1*Math.cos(a)} y1={cy+r1*Math.sin(a)}
            x2={cx+r2*Math.cos(a)} y2={cy+r2*Math.sin(a)}
            stroke={major ? '#C8A040' : '#5A4218'} strokeWidth={major ? 2.5 : 1.2}
            strokeLinecap="round"/>;
        })}
        {/* Manecilla de hora (corta, gruesa) */}
        <line x1={cx} y1={cy} x2={cx+22*Math.cos(hRad)} y2={cy+22*Math.sin(hRad)}
          stroke={handCol} strokeWidth="3.5" strokeLinecap="round"/>
        {/* Manecilla de minuto (larga, delgada) */}
        <line x1={cx} y1={cy} x2={cx+32*Math.cos(mRad)} y2={cy+32*Math.sin(mRad)}
          stroke={handCol} strokeWidth="2" strokeLinecap="round"/>
        {/* Centro */}
        <circle cx={cx} cy={cy} r="3" fill={handCol}/>
        <circle cx={cx} cy={cy} r="1.5" fill="#1A1408"/>
      </svg>
      <div className="clock-days">
        <span className="clock-num" style={{color:numCol,WebkitTextFillColor:numCol}}>{days}</span>
        <span className="clock-unit">DÍAS</span>
      </div>
    </div>
  );
}

// ── Stats Panel (right side overlay) ──
function StatsPanel({
  game, onEnd, onLegacy, onShowProgress
}: { game: GameState; onEnd: () => void; onLegacy: () => void; onShowProgress: () => void }) {
  const p = game.players[game.activePlayerIndex];
  const m = metrics(p);
  const col = PLAYER_COLORS[p.colorIndex];
  const loc = locById(p.currentLocation);
  const cq = cuadrante(p);
  const pi = passiveIncome(p);
  const exp = expensesPerTurn(p);
  const emMonths = emergencyFundMonths(p);
  const piPct = Math.min(100, (pi / Math.max(exp, 1)) * 100);
  const indBars = [
    { key:'bienestar',  label:'Bienestar',   color:'var(--green)',  val: m.bienestar,          goal: game.goals.bienestar },
    { key:'conoc',      label:'Conocimiento',  color:'var(--violet)', val: m.conocimientos,      goal: game.goals.conocimientos },
    { key:'impacto',    label:'Impacto',    color:'var(--pink)',   val: m.impacto,            goal: game.goals.impacto },
    { key:'legado',     label:'Legado',    color:'var(--teal)',   val: p.impact.comunitario, goal: game.goals.comunitario },
    { key:'emergencia', label:'Fondo de Emergencia', color:'var(--gold)', val: emMonths, goal: game.goals.emergencyMonths },
    { key:'pasivo',     label:'Ingresos Pasivos', color:'var(--orange)', val: piPct,                goal: 100 },
  ];
  // Win progress: average of all 6 bars capped at 100%
  const winPct = Math.round(indBars.reduce((s, b) => s + Math.min(100, (b.val / b.goal) * 100), 0) / indBars.length);
  return (
    <div id="stats-panel">
      <button className="turn-banner turn-banner-btn" onClick={onShowProgress} title="Ver cómo me va">
        <Portrait p={p} size={62} />
        <div className="turn-banner-right">
          <div className="turn-banner-text">Tu Turno</div>
          {((p.streak ?? 0) >= 2 || p.weeklyFocus) && (
            <div className="banner-strip">
              {(p.streak ?? 0) >= 2 && <span className="strip-streak">🔥{p.streak}</span>}
              {(p.streak ?? 0) >= 2 && p.weeklyFocus && <span className="strip-sep">·</span>}
              {p.weeklyFocus && <span className="strip-focus">🎯 {p.weeklyFocus}</span>}
            </div>
          )}
          <div className="turn-banner-hint">toca para ver cómo te va ▾</div>
        </div>
      </button>
      <div className="player-block">
        <div className="player-name" style={{ color: col, WebkitTextFillColor: col, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
          {p.name}
        </div>
        <div className="player-loc">{loc.icon} {locName(loc, p)}</div>
        <div className="econ-line">
          {game.world.economy === 'good'
            ? <span className="econ-good">● buen año económico del país</span>
            : <span className="econ-bad">● mal año económico del país</span>}
        </div>
      </div>
      <div className="stat-divider" />
      <div className="resources">
        <div className="resource"><span className="res-icon">💰</span><span className="res-val">${p.liquidity}</span></div>
        <div className="resource"><span className="res-icon">🏦</span><span className="res-val">${p.bank}</span></div>
        {(() => { const nw = patrimonio(p); return <div className="resource net-worth-row"><span className="res-val" style={{color:"#28ECAA",WebkitTextFillColor:"#28ECAA",fontWeight:700,fontSize:"0.82rem"}}>Neto: ${nw}</span></div>; })()}
        <div className="res-compact">
          <span>🎓 {p.education.completed.length}</span>
          <span>Q{game.turn}</span>
          {p.job && <span title={p.job.title}>💼</span>}
          {p.education.enrolledId && <span>📖</span>}
        </div>
      </div>
      <div className="win-pct-bar">
        <div className="win-pct-fill" style={{ width: winPct + '%' }} />
        <span className="win-pct-label">{winPct}% hacia la victoria</span>
      </div>
      <div className="stat-divider" />
      <div className="ind-inline">
        <div className="cuadrante-chip sml" data-cq={cq}>{CUADRANTE_ICON[cq]} {CUADRANTE_LABEL[cq]}</div>
        {indBars.map(b => {
          const pct = Math.min(100, (b.val / b.goal) * 100);
          const almost = pct >= 90 && pct < 100; // #2 ¡casi!
          const display = b.key === 'emergencia'
            ? b.val.toFixed(1) + 'm'
            : b.key === 'pasivo'
            ? Math.round(b.val) + '%'
            : Math.round(b.val) + '/' + b.goal;
          return (
            <div key={b.key} className={'ind-row-mini' + (almost ? ' ind-almost' : '')}>
              <span className="ind-lbl-mini">{b.label}{almost && <span className="ind-almost-tag">¡casi!</span>}</span>
              <div className="ind-bar-mini"><div className="ind-fill" style={{ width: pct+'%', '--bc': b.color } as any} /></div>
              <span className="ind-val-mini">{display}{pct >= 100 ? ' ✓' : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="stat-divider" />
      {canRetire(p, game.turn) && (
        <button className="btn-legacy" onClick={onLegacy}>Pasar el legado ✦</button>
      )}
      {p.stats.health < 20 && (
        <div className="stress-warning" style={{ borderColor:'rgba(232,160,32,0.4)', background:'rgba(232,160,32,0.15)', color:'#E8A020', WebkitTextFillColor:'#E8A020' }}>
          Salud critica ({p.stats.health}%) — no puedes trabajar. Ve a la Clinica.
        </div>
      )}
      {p.stats.stress >= 80 && (
        <div className="stress-warning">
          Estres critico ({p.stats.stress}%) — salario reducido. Descansa ya.
        </div>
      )}
    </div>
  );
}

// ── Actions Bar (bottom overlay) ──
function ActionsBar({ game, onAction }: { game: GameState; onAction: (i: number) => void }) {
  const p = game.players[game.activePlayerIndex];
  const loc = locById(p.currentLocation);
  const acts = actionsFor(p, game.world);
  // #11 Urgencia visual: cuando quedan pocas horas, las acciones se resaltan
  const urgent = p.timeLeft > 0 && p.timeLeft < 20;
  return (
    <div id="actions-bar" className={urgent ? 'actions-urgent' : ''}>
      <div className="actions-label">
        Acciones en {loc.icon} {loc.name}
        {urgent && <span className="actions-urgent-tag">⏳ últimas {Math.round(p.timeLeft)}h — aprovéchalas</span>}
      </div>
      {acts.length === 0
        ? <div className="actions-empty">Muévete o termina la quincena.</div>
        : (
          <div className="actions-row">
            {acts.map((a, i) => {
              return (
                <button key={a.id} className="action-chip"
                  style={{ '--ac': 'var(--'+ACT_COLORS[i%ACT_COLORS.length]+')' } as any}
                  onClick={() => onAction(i)}
                  title={a.desc}>
                  <span className="chip-icon">{actionIcon(a.id)}</span>
                  <span className="chip-label">{a.label}</span>
                  <span className="chip-cost">{fh(a.hours)}h</span>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ── Lid Panel ──
function LidPanel({ id, title, onClose, children }: {
  id: string; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="lid-panel" id={'panel-'+id}>
      <div className="lid-header">
        <h2>{title}</h2>
        <button className="lid-close" onClick={onClose}>✕</button>
      </div>
      <div className="lid-body">{children}</div>
    </div>
  );
}

// ── Indicators Panel Content ──
function IndicatorsContent({ game }: { game: GameState }) {
  const lifeBars = [
    { key:'bienestar',     label:'Bienestar',     color:'var(--green)',  goal: game.goals.bienestar },
    { key:'conocimientos', label:'Conocimientos', color:'var(--violet)', goal: game.goals.conocimientos },
    { key:'impacto',       label:'Impacto',       color:'var(--pink)',   goal: game.goals.impacto },
  ] as const;
  return (
    <div>
      {game.players.map(p => {
        const m = metrics(p);
        const col = PLAYER_COLORS[p.colorIndex];
        const isActive = p.id === game.players[game.activePlayerIndex].id;
        const cq = cuadrante(p);
        const pi = passiveIncome(p);
        const exp = expensesPerTurn(p);
        const emMonths = emergencyFundMonths(p);
        const emPct = Math.min(100, (emMonths / game.goals.emergencyMonths) * 100);
        const piPct = Math.min(100, (pi / Math.max(exp, 1)) * 100);
        const comPct = Math.min(100, (p.impact.comunitario / game.goals.comunitario) * 100);
        const piGoalPct = 35; // necesitas 35% de gastos cubiertos por flujo pasivo para ganar
        return (
          <div key={p.id} className="ind-section">
            <div className="ind-pname" style={{ color: col, WebkitTextFillColor: col }}>
              {p.isAI ? '🤖 ' : isActive ? '▶ ' : ''}{p.name}
              {p.isAI && <span className="ai-tag"> ({p.aiStrategy}·{['','F','N','D'][p.aiDifficulty??2]})</span>}
            </div>

            {/* Arquetipo actual */}
            <div className="cuadrante-chip" data-cq={cq}>
              {CUADRANTE_ICON[cq]} {CUADRANTE_LABEL[cq]}
              <span className="cq-pi">{pi > 0 ? ` · $${pi}/q pasivo` : ' · sin flujo pasivo'}</span>
            </div>

            {/* Barras de vida */}
            {lifeBars.map(b => {
              const val = m[b.key as keyof typeof m] as number;
              const pct = Math.min(100, (val / b.goal) * 100);
              return (
                <div key={b.key} className="ind-row">
                  <span className="ind-label">{b.label}</span>
                  <div className="ind-bar"><div className="ind-fill" style={{ width: pct+'%', '--bc': b.color } as any} /></div>
                  <span className="ind-val">{Math.round(val)}/{b.goal}{val >= b.goal ? <span className="check-icon"> ✓</span> : ''}</span>
                </div>
              );
            })}

            {/* Legado comunitario */}
            <div className="ind-row">
              <span className="ind-label">Legado</span>
              <div className="ind-bar"><div className="ind-fill" style={{ width: comPct+'%', '--bc': 'var(--teal)' } as any} /></div>
              <span className="ind-val">{p.impact.comunitario}/{game.goals.comunitario}{p.impact.comunitario >= game.goals.comunitario ? <span className="check-icon"> ✓</span> : ''}</span>
            </div>

            {/* Fondo de emergencia (6 meses de gastos) */}
            <div className="ind-row">
              <span className="ind-label">Fondo Emergencia</span>
              <div className="ind-bar"><div className="ind-fill" style={{ width: emPct+'%', '--bc': 'var(--gold)' } as any} /></div>
              <span className="ind-val">{fh(emMonths)}m/{game.goals.emergencyMonths}{emMonths >= game.goals.emergencyMonths ? <span className="check-icon"> ✓</span> : ''}</span>
            </div>

            {/* Flujo pasivo: meta = 35% de gastos cubiertos */}
            <div className="ind-row">
              <span className="ind-label">Flujo pasivo</span>
              <div className="ind-bar"><div className="ind-fill" style={{ width: Math.min(100,piPct)+'%', '--bc': 'var(--orange)' } as any} /></div>
              <span className="ind-val">{Math.round(piPct)}%{piPct >= piGoalPct ? <span className="check-icon"> ✓</span> : ''}</span>
            </div>

            {/* Coleccionables si los hay */}
            {p.collectibles.length > 0 && (
              <div className="portfolio-breakdown">
                {p.collectibles.map((c, i) => (
                  <span key={i} className="pb-item">
                    {COL_ICONS[c.kind]} ${c.value}{c.value > c.boughtFor ? '▲' : c.value < c.boughtFor ? '▼' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Historia Panel Content ──
function HistoriaContent({ game }: { game: GameState }) {
  return (
    <div>
      {[...game.log].slice(-20).reverse().map((l, i) => (
        <div key={i} className={'hist-entry ' + (l.kind==='pos'?'hist-pos':l.kind==='neg'?'hist-neg':'')}>
          <span className="hist-q">Q{l.turn}</span>{l.text}
        </div>
      ))}
    </div>
  );
}

// ── About Panel Content ──
function AboutContent() {
  return (
    <div className="about-box-inner">
      <p className="about-welcome"><b>José En La Vida Adulta</b> — el juego de la vida plena, ambientado en Cuenca, Ecuador.</p>

      <div className="about-section">
        <div className="about-section-title">El tablero</div>
        <p>15 stops forman un anillo alrededor de Cuenca: la Universidad, el Banco, la Terminal, la Feria Libre, el Rio Tomebamba y más. Te mueves de un stop al siguiente. Cada movimiento cuesta horas, y las horas no regresan.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Las quincenas</div>
        <p>Cada turno es una quincena: <b>112 horas</b>. Trabajas, estudias, descansas, inviertes. Al cerrar la quincena cobras (o pierdes), tu negocio opera solo, y el banco te abona intereses. Después viene el fin de semana.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Los fines de semana y el azar</div>
        <p>Al cerrar cada quincena, cae un evento de fin de semana. Puede ser bueno, malo, o depende de ti. El azar existe — como en la vida. Pero el azar solo decide dentro del margen que tú le dejas: a más salud, menos riesgo; a más reputación, más puertas. La preparación reduce la lotería.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Decisiones, no dados</div>
        <p>En algunos eventos el juego te pregunta. Prestar plata al primo. Aceptar el encargo de un cliente. No hay respuesta correcta: hay consecuencias. Piénsalo dos segundos y elige.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">El transporte importa</div>
        <p>A pie cuesta horas. El bus menos. Un carro te libera el tiempo para hacer más cosas por quincena. El transporte que eliges cambia cuánto puedes hacer, y eso cambia todo.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">El dinero no es la meta</div>
        <p>La victoria requiere seis cosas a la vez: bienestar físico y mental, conocimientos, impacto, legado comunitario, un fondo de emergencia de 6 meses, y al menos 35% de tus gastos cubiertos por ingresos que no dependen de tu presencia. Todo a la vez. No hay atajo.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Legado</div>
        <p>Cuando terminas tu vida de juego, puedes pasar el testigo a un heredero. Lo que construiste viaja con él: capital, reputación, principios. El linaje es el horizonte largo.</p>
      </div>

      <div className="about-tribute">
        Tributo libre a <i>Jones in the Fast Lane</i> (Sierra On-Line, 1990).
      </div>
    </div>
  );
}

// ── Node Inspect Tooltip ──
function NodeInspect({ locId, game, onMove, onAction, onClose }: {
  locId: string; game: GameState;
  onMove: () => void; onAction: (i: number) => void; onClose: () => void;
}) {
  const p = game.players[game.activePlayerIndex];
  const loc = locById(locId);
  const cost = loc.tc[p.transport];
  const isHere = locId === p.currentLocation;
  const canMove = !isHere && p.timeLeft >= cost;

  return (
    <div className="node-inspect">
      <button className="insp-close-btn" onClick={onClose}>✕</button>
      <div className="insp-title">{loc.icon} {locName(loc, p)}</div>
      <button className="insp-move" disabled={isHere || !canMove} onClick={onMove}>
        {isHere ? 'Estás aquí' : canMove ? `Ir · ${fh(cost)}h` : `Necesitas ${fh(cost)}h`}
      </button>
    </div>
  );
}

// ── Pawn Overlay: avatares flotando encima de los casilleros, animados con CSS ──
// position:fixed para evitar clipping de cualquier overflow en el árbol del DOM.
// getBoundingClientRect() da coordenadas de viewport → left/top directos.
function PawnOverlay({ game }: { game: GameState }) {
  const active = game.players[game.activePlayerIndex];
  const locKey = game.players.map(p => p.currentLocation).join(',');
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  // vpKey increments whenever iOS Safari's visualViewport resizes (address bar
  // show/hide), forcing a re-run of getBoundingClientRect() so pawns stay aligned.
  const [vpKey, setVpKey] = useState(0);

  useEffect(() => {
    const vvp = (window as any).visualViewport as VisualViewport | undefined;
    if (!vvp) return;
    const onVpChange = () => setVpKey(k => k + 1);
    vvp.addEventListener('resize', onVpChange);
    vvp.addEventListener('scroll', onVpChange);
    return () => {
      vvp.removeEventListener('resize', onVpChange);
      vvp.removeEventListener('scroll', onVpChange);
    };
  }, []);

  useLayoutEffect(() => {
    const center = document.querySelector<HTMLElement>('.board-center');
    if (!center) return;
    const cr = center.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const cy = cr.top + cr.height / 2;

    const next: Record<string, { x: number; y: number }> = {};
    for (const p of game.players) {
      const tile = document.querySelector<HTMLElement>(`[data-loc="${p.currentLocation}"]`);
      if (tile) {
        const r = tile.getBoundingClientRect();
        const tx = r.left + r.width / 2;
        const ty = r.top + r.height / 2;
        const dx = cx - tx, dy = cy - ty;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        next[p.id] = {
          x: tx + (dx / dist) * 22 + r.width * 0.16,
          y: ty + (dy / dist) * 18 - r.height * 0.14,
        };
      }
    }
    setPos(next);
  }, [locKey, vpKey]);

  const count = game.players.length;
  return (
    <div className="pawn-overlay">
      {game.players.map((p, i) => {
        const pp = pos[p.id];
        if (!pp) return null;
        const offset = (i - (count - 1) / 2) * 26;
        return (
          <div key={p.id} className="pawn-float" style={{
            left: pp.x + offset,
            top: pp.y,
            zIndex: p.id === active.id ? 22 : 20,
            filter: p.id === active.id
              ? `drop-shadow(0 0 12px ${PLAYER_COLORS[p.colorIndex]})`
              : `drop-shadow(0 2px 4px rgba(0,0,0,0.6))`,
          }}>
            <Portrait p={p} size={44} />
          </div>
        );
      })}
    </div>
  );
}

// SVG icons para tiles (reemplazan emojis)
const TILE_SVG: Record<string, string> = {
  '🏠': 'M12 3L2 12h3v8h5v-6h4v6h5v-8h3L12 3z',                    // casa
  '🎓': 'M12 3L1 9l11 6 9-5v7h2V9L12 3zM5 13.2v4L12 21l7-3.8v-4L12 17l-7-3.8z', // gorro
  '🏦': 'M2 20h20v2H2v-2zm1-2h2v-6H3v6zm4 0h2v-6H7v6zm4 0h2v-6h-2v6zm4 0h2v-6h-2v6zm4 0h2v-6h-2v6zM2 10l10-7 10 7H2z', // banco
  '🚌': 'M4 16V6c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v10l-1 2H5l-1-2zM7 14a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2zM6 6h12v4H6V6zm0 14h3v2H6v-2zm9 0h3v2h-3v-2z', // bus
  '🏭': 'M22 22H2V10l6-4v4l6-4v4l6-4v12zM6 18h3v-3H6v3zm5 0h3v-3h-3v3zm5 0h3v-3h-3v3z', // fabrica
  '🏥': 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 8h-3v3h-2v-3H8v-2h3V6h2v3h3v2z', // hospital
  '🛒': 'M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 14.8l.1-.2L8.1 13h7.5c.7 0 1.4-.4 1.7-1l3.9-7-1.7-1-3.9 7H8.5L4.3 2H1v2h2l3.6 7.6L5.2 14c-.1.3-.2.6-.2 1 0 1.1.9 2 2 2h12v-2H7.4c-.1 0-.2-.1-.2-.2z', // carrito
  '⛪': 'M12 2L8 7v2H4v12h16V9h-4V7l-4-5zM12 18c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3zm0-8a1 1 0 110-2 1 1 0 010 2z', // iglesia
  '🌳': 'M12 2C8 2 5 5 5 8.5c0 2 1 3.8 2.5 5L12 22l4.5-8.5C18 12.3 19 10.5 19 8.5 19 5 16 2 12 2z', // arbol
  '🌉': 'M2 18h20v2H2v-2zM4 14c0-3 2.7-5 5-5s5 2 5 5H4zm6-7V4h4v3h-4zm5 7c0-3 2.7-5 5-5v5h-5z', // puente
  '🏛️': 'M2 20h20v2H2v-2zm2-2V10h2v8H4zm5 0V10h2v8H9zm5 0V10h2v8h-2zm5 0V10h2v8h-2zM1 8l11-6 11 6H1z', // municipio
  '🛍️': 'M18 6h-2c0-2.2-1.8-4-4-4S8 3.8 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2z', // shopping
  '⚽': 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm1-13.5l3 2.2-1.2 3.7H9.2L8 8.7l3-2.2h2z', // estadio
};

function TileIcon({ icon }: { icon: string }) {
  const path = TILE_SVG[icon];
  if (!path) return <span className="tile-art-emoji">{icon}</span>;
  return (
    <svg viewBox="0 0 24 24" className="tile-svg-icon" fill="currentColor">
      <path d={path} />
    </svg>
  );
}

// ── Clerks: NPCs que atienden cada ubicación ──
interface Clerk {
  name: string;
  role: string;
  gridRow: number; // 0=top row, 1=bottom row in grid-old.png
  gridCol: number; // 0-3 left to right
  quips: string[]; // frases al interactuar
}

const CLERKS: Record<string, Clerk> = {
  casa:               { name: 'Don Pancho', role: 'Casero', gridRow: 0, gridCol: 0,
    quips: ['Uy, ya era hora de que llegues.', 'La casa no se limpia sola, mijo.', 'Otra vez sin llaves, carajo.'] },
  zona_universitaria: { name: 'Doña Marthita', role: 'Secretaria Académica', gridRow: 0, gridCol: 1,
    quips: ['A ver, esa matrícula no se paga sola.', 'Rápido que cierro a las 4.', 'El título no sale del aire, joven.'] },
  zona_financiera:    { name: 'Don Patricio', role: 'Gerente de Ventanilla', gridRow: 0, gridCol: 2,
    quips: ['Buenos días, ¿depósito o retiro?', 'El dólar sube, el dólar baja, aquí seguimos.', 'Firme aquí, aquí y aquí.'] },
  terminal:           { name: 'Doña Carmita', role: 'Coordinadora de Empleo', gridRow: 0, gridCol: 3,
    quips: ['Hay chamba, pero madrugue.', 'No me vengan con excusas.', '¿Experiencia? ¿Qué experiencia?'] },
  zona_industrial:    { name: 'Doña Lupita', role: 'Jefa de Planta', gridRow: 1, gridCol: 0,
    quips: ['Cuidado con la maquinaria.', 'Aquí se trabaja duro, no se pasea.', 'Producción es producción, no hay vacaciones.'] },
  hospital:           { name: 'Don Memo', role: 'Administrador', gridRow: 1, gridCol: 1,
    quips: ['Espere su turno, por favor.', 'El seguro cubre, el seguro no cubre...', 'Salud no tiene precio, pero sí tiene costo.'] },
  feria_libre:        { name: 'Don Wilmer', role: 'Administrador del Mercado', gridRow: 1, gridCol: 2,
    quips: ['¡Lleve, lleve, caserito!', 'Hoy está barato todo.', 'La yapa va por cuenta de la casa.'] },
  centro_historico:   { name: 'Doña Rosita', role: 'Curadora Municipal', gridRow: 1, gridCol: 3,
    quips: ['El centro es patrimonio, no parqueadero.', 'Aquí se respira historia.', 'Las leyes son las leyes, joven.'] },
  parque_calderon:    { name: 'Don Pancho', role: 'Guardia del Parque', gridRow: 0, gridCol: 0,
    quips: ['Siéntese un rato, descanse.', 'No pise el césped, carajo.', 'Las palomas también tienen derechos.'] },
  rio_tomebamba:      { name: 'Doña Marthita', role: 'Guía del Río', gridRow: 0, gridCol: 1,
    quips: ['El río lleva historias, no solo agua.', 'Meditar aquí es gratis, al menos.', 'Cuidado con el barranco.'] },
  municipio:          { name: 'Don Patricio', role: 'Funcionario Público', gridRow: 0, gridCol: 2,
    quips: ['¿Trámite? Saque turno.', 'Vuelva mañana con copia notarizada.', 'El sistema está caído, intente más tarde.'] },
  mall_rio:           { name: 'Doña Carmita', role: 'Gerente de Piso', gridRow: 0, gridCol: 3,
    quips: ['Bienvenido al Mall del Río.', 'Hay descuentos en el tercer piso.', '¿Va a comprar o solo a pasear?'] },
  estadio:            { name: 'Don Memo', role: 'Entrenador', gridRow: 1, gridCol: 1,
    quips: ['¡Dale duro, campeón!', 'El Deportivo necesita gente como vos.', 'Sudar es el precio del éxito.'] },
  parque_paraiso:     { name: 'Doña Lupita', role: 'Cuidadora del Parque', gridRow: 1, gridCol: 0,
    quips: ['El Paraíso es para todos.', 'No deje basura, pues.', 'La naturaleza sana todo.'] },
  u_cuenca:           { name: 'Doña Rosita', role: 'Decana', gridRow: 1, gridCol: 3,
    quips: ['La Universidad de Cuenca no es cualquier cosa.', 'Aquí se forjan profesionales.', 'Estudie, que para vago no le va a alcanzar.'] },
};

function clerkQuip(locId: string): string {
  const c = CLERKS[locId];
  if (!c) return '';
  return c.quips[Math.floor(Math.random() * c.quips.length)];
}

function ClerkPortrait({ locId, size = 56 }: { locId: string; size?: number }) {
  const c = CLERKS[locId];
  if (!c) return null;
  // Sprite sheet 4 cols x 2 filas. Posición correcta en %: col/(cols-1)*100.
  const cols = 4, rows = 2;
  const posX = (c.gridCol / (cols - 1)) * 100;
  const posY = (c.gridRow / (rows - 1)) * 100;
  return (
    <div className="clerk-portrait" style={{ width: size, height: size }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
        backgroundImage: 'url(/jose-en-la-vida-adulta/clerks/grid-old.png)',
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat: 'no-repeat',
      }} />
    </div>
  );
}

// Gradiente por zona — color de tablero sin fotos externas
const ZONE_GRAD: Record<string, string> = {
  hogar:        'linear-gradient(135deg,#7c3a1a,#4a2010)',
  universitaria:'linear-gradient(135deg,#1a3a6a,#0f2244)',
  financiera:   'linear-gradient(135deg,#6a4f00,#3a2c00)',
  transporte:   'linear-gradient(135deg,#1e3a4a,#0e1e28)',
  industrial:   'linear-gradient(135deg,#2e2e2e,#141414)',
  salud:        'linear-gradient(135deg,#6a1a22,#3a0c12)',
  comercial:    'linear-gradient(135deg,#1a5a2a,#0c3016)',
  centro:       'linear-gradient(135deg,#4a2a6a,#26143a)',
  rio:          'linear-gradient(135deg,#0e4a5a,#062832)',
  politico:     'linear-gradient(135deg,#1a2a5a,#0a1430)',
  deporte:      'linear-gradient(135deg,#1a4a1a,#0a2a0a)',
};

// ── Board ──
function Board({ game, onInspect, inspecting, onAction, fading, onReopen, onClose }: {
  game: GameState;
  onInspect: (id: string | null) => void;
  inspecting: string | null;
  onAction: (i: number) => void;
  fading: boolean;
  onReopen: () => void;
  onClose: () => void;
}) {
  const active = game.players[game.activePlayerIndex];
  const locs = LOCATIONS;

  const showingClerk = inspecting === active.currentLocation;
  const clerkActs = showingClerk ? actionsFor(active, game.world) : [];
  const [clerkMsg, setClerkMsg] = useState('');
  useEffect(() => {
    if (showingClerk) setClerkMsg(clerkQuip(active.currentLocation));
  }, [showingClerk, active.currentLocation]);

  // 15 stops around a rectangle ring: top 4, right 4, bottom 4, left 3 (clockwise loop)
  const top    = locs.slice(0, 4);
  const right  = locs.slice(4, 8);
  const bottom = [...locs.slice(8, 12)].reverse();
  const left   = [...locs.slice(12, 15)].reverse();

  function Tile({ loc }: { loc: typeof LOCATIONS[0] }) {
    const here = loc.id === active.currentLocation;
    const cost = loc.tc[active.transport];
    const reachable = !here && active.timeLeft >= cost;
    const sel = inspecting === loc.id;
    const showActions = here && sel;
    const acts = showActions ? actionsFor(active, game.world) : [];

    return (
      <div
        data-loc={loc.id}
        className={'tile' + (here ? ' tile-here' : '') + (reachable ? ' tile-reach' : '') + (sel ? ' tile-sel' : '')}
        onClick={() => {
          if (here) { sel ? onClose() : onReopen(); }
          else onInspect(inspecting === loc.id ? null : loc.id);
        }}
        onMouseEnter={here ? onReopen : undefined}
      >
        <div className="tile-art" style={{ background: ZONE_GRAD[loc.zone] ?? 'rgba(255,255,255,0.06)' }}>
          <TileIcon icon={loc.icon} />
        </div>
        <div className="tile-label">{loc.name.split('(')[0].trim()}</div>
        {here && !sel && <div className="tile-you">● AQUÍ</div>}
        {!here && reachable && <div className="tile-cost">{fh(cost)}h</div>}
      </div>
    );
  }

  return (
    <div className="board">
      <div className="board-edge board-top">
        {top.map(l => <Tile key={l.id} loc={l} />)}
      </div>
      <div className="board-body">
        <div className="board-edge board-left">
          {left.map(l => <Tile key={l.id} loc={l} />)}
        </div>
        <div className="board-center">
          <div className="bc-head">
            <div className="bc-turn">Quincena {game.turn}</div>
            <TimeRing hours={active.timeLeft} compact />
          </div>
          {showingClerk ? (
            <div className={'clerk-panel' + (fading ? ' clerk-fading' : '')}
              onClick={e => e.stopPropagation()}
              onMouseEnter={onReopen}>
              <div className="clerk-header">
                <ClerkPortrait locId={active.currentLocation} size={44} />
                <div className="clerk-info">
                  <div className="clerk-name">{CLERKS[active.currentLocation]?.name}</div>
                  <div className="clerk-role">{CLERKS[active.currentLocation]?.role}</div>
                </div>
              </div>
              <div className="clerk-quip">{clerkMsg}</div>
              <div className="clerk-actions">
                {clerkActs.map((a, i) => (
                  <button key={a.id} className="tile-act-chip" onClick={() => onAction(i)}>
                    <span className="tac-name">{a.label}</span>
                    <span className="tac-desc">{a.desc}</span>
                    <span className="tac-cost">{fh(a.hours)}h</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bc-city">CUENCA</div>
          )}
        </div>
        <div className="board-edge board-right">
          {right.map(l => <Tile key={l.id} loc={l} />)}
        </div>
      </div>
      <div className="board-edge board-bottom">
        {bottom.map(l => <Tile key={l.id} loc={l} />)}
      </div>
    </div>
  );
}


// ── Top bar HUD ──
function TopBar({ openPanel, setOpenPanel, game, player }: {
  openPanel: PanelId;
  setOpenPanel: (p: PanelId) => void;
  game: GameState;
  player: PlayerState;
}) {
  const [musicOn, setMusicOn] = useState(cityMusic.wanted);
  function toggle(id: PanelId) { setOpenPanel(openPanel === id ? null : id); }
  function toggleMusic() {
    cityMusic.toggle();
    setMusicOn(cityMusic.wanted);
  }
  const headline = narrateHeadline(player, game);
  return (
    <div id="top-bar">
      <span className="game-name">JOSÉ EN LA VIDA ADULTA</span>
      <span className="topbar-headline">{headline}</span>
      <div className="bar-right">
        <button className={'hud-btn music-btn'+(musicOn?' on':'')}
          onClick={toggleMusic} title={musicOn ? 'Silenciar' : 'Jazz de ciudad'}>
          {musicOn ? '🎷' : '🔇'}
        </button>
        <button className={'about-btn-hud'+(openPanel==='about'?' on':'')}
          onClick={() => toggle('about')} title="¿Qué es este juego?">?</button>
      </div>
    </div>
  );
}

const COL_ICONS: Record<string, string> = { cuadro:'🖼️', vino:'🍷', joyeria:'💎', tarjeta:'⚾', bitcoin:'₿' };

// ── PlayerCard for zoom modal ──
function PlayerCardZoom({ p, game }: { p: PlayerState; game: GameState }) {
  const m = metrics(p);
  const col = PLAYER_COLORS[p.colorIndex];
  const loc = locById(p.currentLocation);
  const portfolio = portfolioSlices(p);
  const bars = [
    { key:'bienestar',      label:'Bienestar',     color:'var(--green)',  goal: game.goals.bienestar },
    { key:'conocimientos',  label:'Conocimientos', color:'var(--violet)', goal: game.goals.conocimientos },
    { key:'impacto',        label:'Impacto',       color:'var(--pink)',   goal: game.goals.impacto },
  ] as const;
  return (
    <div className="pcard-zoom">
      <div className="pcard-name" style={{ color: col, WebkitTextFillColor: col }}>
        {PAWN_ICONS[p.colorIndex]} {p.name}{p.generation > 1 ? ` (gen.${p.generation})` : ''}
      </div>
      <div className="pcard-meta">
        nació en {barrioById(p.birthBarrio).name} · ahora en {loc.icon} {loc.name}<br />
        {p.job ? p.job.title : 'sin empleo'} · <b>{careerTitle(p.careerLevel)}</b><br />
        <span className="money-val">${p.liquidity}</span> efectivo · banco ${p.bank}<br />
        estudios: {p.education.completed.length ? p.education.completed.join(', ') : '—'}
        {p.education.enrolledId ? ` (cursando ${p.education.enrolledId})` : ''}
      </div>
      {p.family.length > 0 && (
        <div className="pcard-fam">
          <span className="fam-tag">Familia</span><br />
          {p.family.map((f, i) => (
            <span key={i}>
              <span style={{ color: col, WebkitTextFillColor: col }}>●</span>
              {' '}{f.rel} {f.name}<br />
            </span>
          ))}
        </div>
      )}
      {bars.map(b => {
        const val = m[b.key as keyof typeof m] as number;
        const pct = Math.min(100, (val / b.goal) * 100);
        return (
          <div key={b.key} className="metric">
            <div className="lab">
              <span>{b.label}</span>
              <span>{Math.round(val)}/{b.goal}{val >= b.goal ? ' ✓' : ''}</span>
            </div>
            <div className="barbg"><div className="barfill" style={{ width: pct+'%', background: b.color }} /></div>
          </div>
        );
      })}
      <div className="portfolio-mini">
        <span className="pm-label">Portafolio Permanente</span>
        <span className="pm-row"><span>💵 Efectivo</span><b>${portfolio.cash}</b></span>
        <span className="pm-row"><span>🏦 Banco</span><b>${portfolio.stable}</b></span>
        <span className="pm-row"><span>🏭 Negocio</span><b>${portfolio.growth}</b></span>
        <span className="pm-row"><span>🚗 Bienes</span><b>${portfolio.hard}</b></span>
        {portfolio.stocks > 0 && (
          <span className="pm-row"><span>📈 Acciones BVQ</span><b>${portfolio.stocks}{p.stocksCost ? ` (costo $${p.stocksCost})` : ''}</b></span>
        )}
        {portfolio.rentals > 0 && (
          <span className="pm-row"><span>🏘️ Arrendamientos</span><b>${portfolio.rentals}{portfolio.rentalDebt > 0 ? ` (deuda $${portfolio.rentalDebt})` : ''}</b></span>
        )}
        {p.rentals && p.rentals.map((r, i) => (
          <span key={i} className="pm-col">
            {r.kind === 'apto' ? '🏢' : '🏬'} {r.kind === 'apto' ? 'Depto' : 'Local'} en {r.note} · renta $${r.rent}/q
            <span className="pm-col-lore">{r.remaining > 0 ? `Préstamo: $${r.payment}/q por ${r.remaining}q. Renta neta $${r.rent - r.payment}/q.` : `Préstamo pagado. Renta plena $${r.rent}/q.`}</span>
          </span>
        ))}
        {p.collectibles.length > 0 && (
          <span className="pm-row"><span>🎨 Coleccionables</span><b>${portfolio.collectibles}</b></span>
        )}
        {p.collectibles.map((c, i) => (
          <span key={i} className="pm-col" title={COLLECTIBLE_LORE[c.kind]}>
            {COL_ICONS[c.kind]} {c.name} · ${c.value} {c.value > c.boughtFor ? '▲' : '▼'}
            <span className="pm-col-lore">{COLLECTIBLE_LORE[c.kind]}</span>
          </span>
        ))}
      </div>
      <div className="pcard-dims">
        impacto → prof {p.impact.profesional} · fam {p.impact.familiar} · com {p.impact.comunitario} · emp {p.impact.empresarial}
      </div>
    </div>
  );
}

// ── Onboarding modal — aparece solo en Q1, solo la primera vez ──
const ONBOARD_KEY = 'jelva_onboard_v1';
function OnboardModal({ onClose }: { onClose: () => void }) {
  function dismiss() { lsSet(ONBOARD_KEY, '1'); onClose(); }
  const goals = [
    { icon: '🚌', place: 'Terminal (bolsa de empleo)', action: 'Busca tu primer empleo', why: 'Sin trabajo, no hay sueldo. Es tu primera parada.' },
    { icon: '🏦', place: 'Banco (ahorrar · invertir)', action: 'Deposita $100 en el banco', why: 'El fondo de emergencia es una de las 6 metas de victoria.' },
    { icon: '🏠', place: 'Tu Casa (hogar)', action: 'Descansa cuando el estrés suba', why: 'Si el estrés llega a 100, pierdes rendimiento en todo.' },
  ];
  return (
    <div className="modal-bg">
      <div className="modal onboard-modal">
        <div className="onboard-jose">
          <img className="onboard-jose-img" src="/jose-en-la-vida-adulta/avatars/jose.png" alt="José" />
          <div>
            <div className="onboard-title">Tu primera quincena</div>
            <div className="onboard-sub">Soy José. Tienes <b>112 horas</b>: cada cosa cuesta tiempo y nada vuelve. Empieza por estas tres. No es la única ruta — es una buena.</div>
          </div>
        </div>
        <div className="onboard-goals">
          {goals.map((g, i) => (
            <div key={i} className="onboard-goal">
              <div className="og-num">{i + 1}</div>
              <div className="og-body">
                <div className="og-action">{g.action}</div>
                <div className="og-place">{g.icon} {g.place}</div>
                <div className="og-why">{g.why}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="onboard-win">Meta: bienestar · conocimientos · impacto · legado · fondo 6 meses · 35% ingreso pasivo. Todo a la vez. El camino lo decides tú.</div>
        <button className="primary" style={{ width: '100%', marginTop: 16 }} onClick={dismiss}>
          Entendido — empezar
        </button>
      </div>
    </div>
  );
}

// ── Event Modal ──
function EventModal({ pend, onChoose, onNext }: { pend: Pending; onChoose: (idx: number) => void; onNext: () => void }) {
  const { p, ev, silvered } = pend;
  const col = PLAYER_COLORS[p.colorIndex];
  const hasChoices = !!ev.choices && ev.choices.length > 0;
  return (
    <div className="modal-bg" onClick={!hasChoices ? onNext : undefined}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="ev-dice-row">
          <svg className="ev-dice" viewBox="0 0 36 36"><rect x="1" y="1" width="34" height="34" rx="7" fill="rgba(200,160,64,0.14)" stroke="rgba(200,160,64,0.6)" strokeWidth="1.5"/><circle cx="10" cy="10" r="3.2" fill="#C8A040"/><circle cx="18" cy="18" r="3.2" fill="#C8A040"/><circle cx="26" cy="26" r="3.2" fill="#C8A040"/></svg>
          <svg className="ev-dice ev-dice-2" viewBox="0 0 36 36"><rect x="1" y="1" width="34" height="34" rx="7" fill="rgba(200,160,64,0.10)" stroke="rgba(200,160,64,0.5)" strokeWidth="1.5"/><circle cx="10" cy="10" r="3.2" fill="#C8A040"/><circle cx="26" cy="10" r="3.2" fill="#C8A040"/><circle cx="18" cy="18" r="3.2" fill="#C8A040"/><circle cx="10" cy="26" r="3.2" fill="#C8A040"/><circle cx="26" cy="26" r="3.2" fill="#C8A040"/></svg>
        </div>
        <div className="ev-tag">¿Qué pasó en mi fin de semana?</div>
        <h3>
          <span style={{ color: ev.neg ? 'var(--rose)' : 'var(--green)', WebkitTextFillColor: ev.neg ? 'var(--rose)' : 'var(--green)' }}>
            {ev.neg ? '✗' : '✦'}
          </span>{' '}
          <span style={{ color: col, WebkitTextFillColor: col }}>{p.name}</span> — {ev.title}
        </h3>
        <div className="body">{ev.body}</div>
        {silvered && ev.sl && <div className="silver">↪ {ev.sl}</div>}
        {hasChoices ? (
          <div className="event-choices">
            {ev.choices!.map((c, i) => (
              <button key={i} className="event-choice" onClick={() => onChoose(i)}>
                <span className="event-choice-label">{c.label}</span>
                <span className="event-choice-desc">{c.desc}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="primary" onClick={onNext}>Continuar</button>
        )}
      </div>
    </div>
  );
}

// ── Victory screen ──
function Victory({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const winner = game.players.find(p => p.id === game.winnerId) || game.players[0];
  const col = PLAYER_COLORS[winner.colorIndex];
  const wonTier = game.gameTier ?? 1;
  const nextTier = Math.min(4, wonTier + 1) as GameTier;
  const prevMax = getMaxTier();
  // Unlock next tier
  if (wonTier >= prevMax && nextTier > prevMax) {
    lsSet(TIER_LOCK_KEY, String(nextTier));
  }
  const unlockedNew = nextTier > prevMax;
  const [realName, setRealName] = useState('');
  const [saved, setSaved] = useState(false);
  const hist = game.log.filter(l => l.importance >= 2).slice(-10);

  // #14 Final temático según el área donde más floreciste
  const vm = metrics(winner);
  const piRatio = passiveIncome(winner) / Math.max(expensesPerTurn(winner), 1);
  const themes: { key: string; score: number; title: string; epi: string }[] = [
    { key:'pasivo',  score: piRatio,                                         title:'Inversionista Pleno', epi:'Hiciste que el dinero trabajara por ti. La libertad fue tu cosecha.' },
    { key:'legado',  score: winner.impact.comunitario / game.goals.comunitario, title:'Pilar de la Comunidad', epi:'Tu nombre quedó en la gente que ayudaste. Ese legado no se gasta.' },
    { key:'conoc',   score: vm.conocimientos / game.goals.conocimientos,      title:'El Sabio', epi:'Cada lección te abrió una puerta. Llegaste lejos pensando lejos.' },
    { key:'impacto', score: vm.impacto / game.goals.impacto,                  title:'El Constructor', epi:'Tejiste una red que te sostuvo y sostuvo a otros.' },
    { key:'biene',   score: vm.bienestar / game.goals.bienestar,             title:'El Bien Vivido', epi:'Cuidaste cuerpo y alma. Viviste pleno, no solo ocupado.' },
  ];
  const theme = themes.reduce((a, b) => (b.score > a.score ? b : a));

  async function saveStory() {
    const summary = `${winner.name} alcanzó sus metas en la quincena ${game.turn}.\n` +
      hist.map(l => `Q${l.turn} · ${l.text}`).join('\n');
    await publishStory(realName || winner.name, summary);
    setSaved(true);
  }

  return (
    <>
      <AtmosphereBg />
      <div id="map-world" />
      <div className="setup-screen">
        <div className="victory-card">
          <div className="setup-title" style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
            <Portrait p={winner} size={56} /> Victoria
          </div>
          <div className="victory-epithet">{winner.name}, {theme.title}</div>
          <div className="victory-title" style={{ color: col, WebkitTextFillColor: col }}>
            quincena {game.turn}
          </div>
          <p className="victory-sub">{theme.epi} Bienestar, carrera, patrimonio y legado, todo a la vez: eso es una vida plena.</p>
          {unlockedNew && nextTier <= 4 && (
            <div className="tier-unlock-badge">
              Nivel desbloqueado: {TIER_GOALS[nextTier].label}
            </div>
          )}
          {wonTier === 4 && (
            <div className="tier-unlock-badge tier-legend">
              Leyenda completada. Has conquistado el juego.
            </div>
          )}
          {/* Victory stats summary */}
          <div className="victory-stats">
            <div className="vstat"><span className="vstat-label">Quincenas</span><span className="vstat-val">{game.turn}</span></div>
            <div className="vstat"><span className="vstat-label">Patrimonio neto</span><span className="vstat-val">${winner.liquidity + winner.bank + winner.businesses.reduce((s,b)=>s+b.capital,0)}</span></div>
            <div className="vstat"><span className="vstat-label">Nivel carrera</span><span className="vstat-val">{winner.careerLevel + 1}/9</span></div>
            <div className="vstat"><span className="vstat-label">Títulos académicos</span><span className="vstat-val">{winner.education.completed.length}</span></div>
            <div className="vstat"><span className="vstat-label">Vivienda</span><span className="vstat-val">{winner.housing === 'own_apartment' ? 'Propia' : winner.housing === 'rent_cheap' ? 'Alquiler' : 'Familiar'}</span></div>
            <div className="vstat"><span className="vstat-label">Negocios</span><span className="vstat-val">{winner.businesses.length}</span></div>
          </div>
          <div style={{ marginBottom: 16 }}>
            {hist.map((l, i) => <div key={i} className="log-entry">Q{l.turn} · {l.text}</div>)}
          </div>
          <input type="text" value={realName} onChange={e => setRealName(e.target.value)}
            placeholder="Tu nombre real (opcional)" style={{ marginBottom: 8 }} />
          <button onClick={saveStory} disabled={saved} style={{ width:'100%', marginBottom: 8 }}>
            {saved ? 'Historia guardada en Nostr ✓' : 'Guardar mi historia'}
          </button>
          <button className="primary" style={{ width:'100%' }} onClick={onRestart}>Jugar de nuevo</button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════
export // ── Turn-based contextual hints (visible Q1-Q3 only) ──
const TURN_HINTS: Record<number, { icon: string; text: string }> = {
  1: { icon: 'T', text: 'Q1: Ve a Terminal y busca empleo. Sin trabajo no hay progreso.' },
  2: { icon: 'B', text: 'Q2: Deposita algo en el Banco. El fondo de emergencia es clave para ganar.' },
  3: { icon: 'U', text: 'Q3: Visita la UDA y estudia. El conocimiento abre mejores empleos.' },
};
function TurnHint({ turn }: { turn: number }) {
  const hint = TURN_HINTS[turn];
  if (!hint) return null;
  return (
    <div className="turn-hint">
      <span className="turn-hint-icon">{hint.icon}</span>
      <span className="turn-hint-text">{hint.text}</span>
    </div>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [game, setGame] = useState<GameState | null>(null);
  const [showBackstory, setShowBackstory] = useState(false);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [qi, setQi] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [actionsFading, setActionsFading] = useState(false);
  const actionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cpuThinking, setCpuThinking] = useState(false);
  // Confirmación breezy de acción (no bloquea, no cierra el panel: puedes repetir con clicks)
  const [actionToast, setActionToast] = useState<string | null>(null);
  const actionToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reproducción visible del turno de José (pasos): como en Jones, lo observamos jugar
  const [josePlay, setJosePlay] = useState<{ steps: import('./engine').CpuStep[]; idx: number; name: string } | null>(null);
  const joseFinal = useRef<GameState | null>(null);
  // Velocidad del turno de José: lento (ves su jugada y aprendes) o rápido (saltas)
  const [slowJose, setSlowJose] = useState(true);
  const [showOnboard, setShowOnboard] = useState(() => lsGet(ONBOARD_KEY) !== '1');
  const [showProgress, setShowProgress] = useState(false);
  const [celebrate, setCelebrate] = useState(false); // #3 microcelebración juicy
  const [showFocusPick, setShowFocusPick] = useState(false); // #7 meta autoimpuesta

  // Tema oficial: suena siempre (arranca al primer gesto en iOS/mobile)
  useEffect(() => { cityMusic.arm(); }, []);

  // El anuncio sobre el tablero se desvanece solo en un tiempo prudencial
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => { setFlash(null); setCelebrate(false); }, 2800);
    return () => clearTimeout(t);
  }, [flash]);

  function commit(g: GameState, persist = false) {
    setGame({ ...g });
    if (persist) { saveLocal(g); setSavedAt(new Date().toLocaleTimeString()); publishToNostr(g); }
  }
  function mutate(fn: (g: GameState) => void, persist = false) {
    if (!game) return;
    const g: GameState = deepClone(game);
    fn(g);
    commit(g, persist);
  }

  // ── Turno de la IA: calcula los pasos y los REPRODUCE visiblemente (como en Jones) ──
  useEffect(() => {
    if (phase !== 'play' || !game || cpuThinking || queue.length > 0 || josePlay) return;
    const p = game.players[game.activePlayerIndex];
    if (!p?.isAI) return;
    setCpuThinking(true);
    const snap = game;
    const startDelay = slowJose ? 650 : 150;
    const timer = setTimeout(() => {
      const g: GameState = deepClone(snap);
      const ai = g.players[g.activePlayerIndex];
      const { steps, logs } = cpuTurnSteps(ai, g.world, ai.aiStrategy!, ai.aiDifficulty!);
      logs.forEach(text => g.log.push({ turn: g.turn, text, kind: 'plain', importance: 1 }));
      // José, sherpa del Viaje del Héroe: a veces deja un quip socrático (sin spoilear)
      if (ai.name.toLowerCase().startsWith('jos') && Math.random() < 0.4) {
        const human = g.players.find(p => !p.isAI);
        const line = human && Math.random() < 0.55 ? joseAdvice(human, g.goals) : joseQuip();
        g.log.push({ turn: g.turn, text: 'José: ' + line, kind: 'jose', importance: 2 });
      }
      setCpuThinking(false);
      joseFinal.current = g;
      if (steps.length === 0) { endPlayerTurn(g); return; }
      // Arranca la reproducción paso a paso (el estado final se aplica al terminar)
      setJosePlay({ steps, idx: 0, name: ai.name });
    }, startDelay);
    return () => { clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.activePlayerIndex, game?.turn, phase, queue.length, slowJose, josePlay]);

  // Avanza la reproducción del turno de José: 1 paso por intervalo (lento/rápido)
  useEffect(() => {
    if (!josePlay) return;
    const stepMs = slowJose ? 1500 : 300;
    const t = setTimeout(() => {
      if (josePlay.idx + 1 < josePlay.steps.length) {
        setJosePlay({ ...josePlay, idx: josePlay.idx + 1 });
      } else {
        const fin = joseFinal.current;
        joseFinal.current = null;
        setJosePlay(null);
        if (fin) endPlayerTurn(fin);
      }
    }, stepMs);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [josePlay, slowJose]);

  // Al llegar a un lugar (o iniciar turno) las acciones se despliegan solas ~20s, luego fade.
  useEffect(() => {
    if (phase !== 'play' || !game) return;
    const p = game.players[game.activePlayerIndex];
    if (!p || p.isAI || queue.length > 0) return;
    openActionsHere();
    return clearActionsTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.activePlayerIndex, game?.players[game?.activePlayerIndex ?? 0]?.currentLocation, phase, queue.length]);

  if (phase === 'setup') return <Setup onStart={g => { setGame(g); setShowBackstory(true); setPhase('play'); saveLocal(g); }} />;
  if (!game) return null;
  if (phase === 'victory') return <Victory game={game} onRestart={() => { clearLocal(); location.reload(); }} />;

  const active = game.players[game.activePlayerIndex];

  function doAction(idx: number) {
    let result = '';
    mutate(g => {
      const p = g.players[g.activePlayerIndex];
      const a = actionsFor(p, g.world)[idx];
      if (!a) return;
      const log = a.run();
      result = log;
      g.log.push({ turn: g.turn, text: log, kind: 'plain', importance: 1 });
    });
    if (result) {
      const big = /graduaste|ascendiste|Ascendiste|legado máximo|Compraste un apartamento/.test(result);
      if (big) {
        // Hito grande (ascenso, graduación): fanfarria, esa SÍ se celebra
        setFlash(result);
        setCelebrate(true);
      } else {
        // Acción normal: confirmación breezy que NO interrumpe ni cierra el panel
        setActionToast(result);
        if (actionToastTimer.current) clearTimeout(actionToastTimer.current);
        actionToastTimer.current = setTimeout(() => setActionToast(null), 1600);
      }
    }
    // Mantén el panel abierto para repetir acciones con clicks (como en Jones) y reinicia el fade
    openActionsHere();
  }

  // ── Acciones del lugar actual: se despliegan ~20s y luego hacen fade. Click/mouseover reabren. ──
  function clearActionsTimer() {
    if (actionsTimer.current) { clearTimeout(actionsTimer.current); actionsTimer.current = null; }
  }
  function openActionsHere() {
    if (!game) return;
    const loc = game.players[game.activePlayerIndex].currentLocation;
    setActionsFading(false);
    setInspecting(loc);
    clearActionsTimer();
    // 20s visibles (estándar de lectura), luego fade y se colapsa
    actionsTimer.current = setTimeout(() => {
      setActionsFading(true);
      actionsTimer.current = setTimeout(() => { setInspecting(null); setActionsFading(false); }, 700);
    }, 20000);
  }
  function closeActionsHere() {
    clearActionsTimer();
    setActionsFading(false);
    setInspecting(null);
  }

  function moveTo(locId: string) {
    if (locId === active.currentLocation) return;
    const cost = locById(locId).tc[active.transport];
    if (active.timeLeft < cost) { setFlash('No te alcanza el tiempo para moverte.'); return; }
    mutate(g => {
      const p = g.players[g.activePlayerIndex];
      // Tracking de tiempo ahorrado vs caminar (para narrar al cierre)
      if (p.transport !== 'walk') {
        const walkCost = locById(locId).tc['walk'];
        const saved = walkCost - cost;
        if (saved > 0) p.savedHoursThisTurn = (p.savedHoursThisTurn ?? 0) + saved;
      }
      p.timeLeft -= cost; p.currentLocation = locId;
    });
    // El effect de llegada despliega solo las acciones del nuevo lugar.
  }

  function endPlayerTurn(override?: GameState) {
    const g: GameState = deepClone(override || game!);
    g.players[g.activePlayerIndex].timeLeft = 0;
    if (g.activePlayerIndex < g.players.length - 1) {
      g.activePlayerIndex++; commit(g);
    } else { runEvents(g); }
    setInspecting(null);
  }

  function retire() {
    mutate(g => {
      const i = g.activePlayerIndex;
      const heir = makeHeir(g.players[i], i);
      g.players[i] = heir;
      g.log.push({ turn: g.turn, text: `${heir.name} hereda el legado (gen. ${heir.generation})`, kind: 'pos', importance: 3 });
    }, true);
  }

  function runEvents(g: GameState) {
    const pend: Pending[] = [];
    for (const p of g.players) {
      // El humano SIEMPRE ve su recap de fin de semana; la IA puede tener quincenas tranquilas.
      const ev = rollEvent(p, g.turn, p.isAI ? 1 : (g.world.luckMult ?? 1), !p.isAI);
      if (ev) {
        let silvered = false;
        const hasChoices = !!ev.choices && ev.choices.length > 0;
        // #5 Evento bifurcado: si hay opciones, el efecto se aplica al elegir.
        // La IA decide según dificultad: Fácil = al azar, Normal/Difícil = mejor valor neto.
        if (hasChoices) {
          if (p.isAI) {
            const diff = (p.aiDifficulty ?? 2) as 1|2|3;
            const idx = diff === 1
              ? Math.floor(Math.random() * ev.choices!.length)
              : ev.choices!.reduce((bestI, c, i, arr) => scoreEff(c.eff) > scoreEff(arr[bestI].eff) ? i : bestI, 0);
            applyEff(p, ev.choices![idx].eff);
          }
        } else {
          applyEff(p, ev.eff);
          if (ev.neg && ev.silver.length) { applyEff(p, ev.silver); silvered = true; }
        }
        if (ev.firesJob) p.job = null;
        if (ev.setEcon) { g.world.economy = ev.setEcon; g.world.wageMult = ev.setEcon==='good'?1:0.8; g.world.salesMult = ev.setEcon==='good'?1:0.8; }
        g.log.push({ turn: g.turn, text: `${p.name}: ${ev.title}`, kind: ev.neg?'neg':'pos', importance: ev.imp });
        // Solo mostrar modal a los humanos (la IA decide sola)
        if (!p.isAI) pend.push({ p, ev, silvered });
      }
    }
    for (const p of g.players) {
      const logs = closeBusinessAndEmployees(p);
      logs.forEach(t => g.log.push({ turn: g.turn, text: `${p.name}: ${t}`, kind: 'neg', importance: 1 }));
    }
    if (Math.random() < 0.08) {
      const ne = g.world.economy === 'good' ? 'bad' : 'good';
      g.world.economy = ne; g.world.wageMult = ne==='good'?1:0.8; g.world.salesMult = ne==='good'?1:0.8;
      g.log.push({ turn: g.turn, text: `La economía del país cambió a ${ne==='good'?'buen año económico':'mal año económico'}`, kind: ne==='good'?'pos':'neg', importance: 2 });
    }
    setGame({ ...g }); setQueue(pend); setQi(0);
    if (pend.length === 0) finishTurn(g);
  }

  function advanceQueue() {
    if (qi + 1 < queue.length) setQi(qi + 1);
    else { setQueue([]); finishTurn(game!); }
  }

  function finishTurn(g0: GameState) {
    const g: GameState = deepClone(g0);
    // Pasivos + gastos PRIMERO, para evaluar la victoria con el estado real de cierre
    for (const p of g.players) {
      const pi = passiveIncome(p);
      const exp = expensesPerTurn(p);
      if (pi > 0) {
        p.liquidity += pi;
        g.log.push({ turn: g.turn, text: `${p.name}: ingresos pasivos +$${pi}`, kind: 'pos', importance: 1 });
      }
      p.liquidity -= exp;
      g.log.push({ turn: g.turn, text: `${p.name}: gastos de vida -$${exp}`, kind: 'neg', importance: 1 });
      if (p.liquidity < 0) {
        // Borrow from bank if possible
        if (p.bank >= -p.liquidity) {
          p.bank += p.liquidity; p.liquidity = 0;
          g.log.push({ turn: g.turn, text: `${p.name}: retiró del banco para cubrir gastos`, kind: 'neg', importance: 2 });
        } else {
          p.bank = 0; p.stats.stress = Math.min(100, p.stats.stress + 15);
          g.log.push({ turn: g.turn, text: `${p.name}: sin fondos — estres +15`, kind: 'neg', importance: 3 });
        }
      }
      // #10 Volver a levantarse: caer marca, recuperarse da temple y José celebra
      const broke = p.liquidity <= 0 && p.bank <= 0;
      if (p.stats.health < 20 || broke) {
        p.fell = true;
      } else if (p.fell && p.stats.health >= 60) {
        p.fell = false;
        p.stats.resilience = Math.min(100, p.stats.resilience + 8);
        p.stats.happiness = Math.min(100, p.stats.happiness + 4);
        g.log.push({ turn: g.turn, text: `${p.name} se levantó después de una caída (+temple).`, kind: 'pos', importance: 3 });
        if (!p.isAI && g.players.some(x => x.isAI)) {
          g.log.push({ turn: g.turn, text: 'José: caer no te define; lo que haces después, sí.', kind: 'jose', importance: 2 });
        }
      }
    }
    // #8 Comparativa silenciosa con José: el sherpa va dos pasos adelante, sin juzgar
    const human = g.players.find(p => !p.isAI);
    const jose = g.players.find(p => p.isAI && p.name.toLowerCase().startsWith('jos'));
    if (human && jose) {
      const hp = winProgress(human, g.goals), jp = winProgress(jose, g.goals);
      const diff = hp - jp;
      const msg = Math.abs(diff) < 4
        ? `José: vamos parejos hacia la vida plena (tú ${hp}% · yo ${jp}%).`
        : diff > 0
        ? `José: me llevas la delantera (tú ${hp}% · yo ${jp}%). Sigue así.`
        : `José: voy un paso adelante (tú ${hp}% · yo ${jp}%). Tú marcas tu ritmo.`;
      g.log.push({ turn: g.turn, text: msg, kind: 'jose', importance: 2 });
    }
    // #1 Racha de quincenas equilibradas + #7 meta autoimpuesta
    for (const p of g.players) {
      const curWin = winProgress(p, g.goals);
      const prev = p.prevWin ?? curWin;
      if (curWin >= prev) p.streak = (p.streak ?? 0) + 1;
      else p.streak = 0;
      p.prevWin = curWin;
      if (!p.isAI && p.streak && p.streak > 0 && p.streak % 3 === 0) {
        g.log.push({ turn: g.turn, text: `Racha de ${p.streak} quincenas en avance constante (+temple).`, kind: 'pos', importance: 2 });
        p.stats.resilience = Math.min(100, p.stats.resilience + 3);
      }
      // #7 Evalúa la meta declarada
      if (!p.isAI && p.weeklyFocus && typeof p.weeklyFocusBase === 'number') {
        const m = metrics(p);
        const now = p.weeklyFocus === 'salud' ? m.bienestar
          : p.weeklyFocus === 'plata' ? (p.liquidity + p.bank)
          : p.weeklyFocus === 'familia' ? p.impact.familiar
          : m.conocimientos;
        const delta = now - p.weeklyFocusBase;
        const goalDelta = p.weeklyFocus === 'plata' ? 80 : 8;
        if (delta >= goalDelta) {
          g.log.push({ turn: g.turn, text: `Meta cumplida: te enfocaste en ${p.weeklyFocus} y se notó (+ánimo, +temple).`, kind: 'pos', importance: 2 });
          p.stats.happiness = Math.min(100, p.stats.happiness + 5);
          p.stats.resilience = Math.min(100, p.stats.resilience + 3);
        }
        p.weeklyFocus = null;
        p.weeklyFocusBase = undefined;
      }
    }
    // Tras cerrar la quincena, pregunta al humano por su próxima meta
    // (esperamos a que el toast del cierre termine para que no se monten en iOS)
    if (g.players.some(p => !p.isAI && !p.weeklyFocus)) setTimeout(() => { setFlash(null); setShowFocusPick(true); }, 3200);
    // Victoria (ya con pasivos aplicados)
    const winner = g.players.find(p => hasWon(p, g.goals));
    if (winner) { g.over = true; g.winnerId = winner.id; commit(g, true); setPhase('victory'); return; }
    // Cierre narrado (elegancia Knizia): el toast cuenta una historia, no recita KPI
    const humanForNarrative = g.players.find(p => !p.isAI) || g.players[0];
    setFlash(narrateClose(humanForNarrative, g.turn));
    g.turn++; g.activePlayerIndex = 0;
    for (const p of g.players) {
      p.timeLeft = HOURS_PER_TURN;
      p.savedHoursLast = p.savedHoursThisTurn ?? 0;
      p.savedHoursThisTurn = 0;
    }
    commit(g, true);
  }

  const zp = zoom ? game.players.find(p => p.id === zoom) : null;

  return (
    <>
      <RotateOverlay />
      <AtmosphereBg />
      {showBackstory && game && (
        <BackstoryModal player={game.players.find(p => !p.isAI) || game.players[0]} onClose={() => setShowBackstory(false)} />
      )}
      <TopBar openPanel={openPanel} setOpenPanel={id => { setOpenPanel(id); setInspecting(null); }} game={game} player={game.players[game.activePlayerIndex]} />
      <PawnOverlay game={game} />
      <div className="game-layout">
        <div className="game-main">
          <Board game={game}
            onInspect={id => { setInspecting(id); setOpenPanel(null); }}
            inspecting={inspecting}
            onAction={doAction}
            fading={actionsFading}
            onReopen={openActionsHere}
            onClose={closeActionsHere}
          />
          <div className="footer-bar">
            <div className="footer-loc">
              {(() => { const p = game.players[game.activePlayerIndex]; const loc = locById(p.currentLocation); return <>{loc.icon} {locName(loc, p)}</>; })()}
            </div>
            <button className="btn-jose-speed" onClick={() => setSlowJose(s => !s)}
              title={slowJose ? 'José juega lento: ves su jugada y aprendes' : 'José juega rápido: salta su turno'}>
              {slowJose ? '🐢 José lento' : '🐇 José rápido'}
            </button>
            <button className="btn-end-footer" onClick={() => endPlayerTurn()}>
              Siguiente quincena ▶
            </button>
          </div>
        </div>
        <StatsPanel game={game} onEnd={endPlayerTurn} onLegacy={retire} onShowProgress={() => setShowProgress(true)} />
      </div>
      {inspecting && inspecting !== game.players[game.activePlayerIndex].currentLocation && (
        <NodeInspect locId={inspecting} game={game}
          onMove={() => moveTo(inspecting)} onAction={doAction}
          onClose={() => setInspecting(null)} />
      )}
      {openPanel === 'about' && (
        <LidPanel id="about" title="¿Qué es este juego?" onClose={() => setOpenPanel(null)}>
          <AboutContent />
        </LidPanel>
      )}

      {/* Zoom modal */}
      {zp && (
        <div className="modal-bg" onClick={() => setZoom(null)}>
          <div className="modal modal-zoom" onClick={e => e.stopPropagation()}>
            <button className="zoom-close" onClick={() => setZoom(null)}>✕</button>
            <PlayerCardZoom p={zp} game={game} />
          </div>
        </div>
      )}

      {/* CPU thinking overlay */}
      {cpuThinking && (
        <div className="cpu-thinking">
          <span className="cpu-dot" />
          José está pensando
          {active.aiStrategy === 'empleado' ? ' (ruta 💼 Empleado)' : ' (ruta 🏭 Empresa)'}
          {active.aiDifficulty === 3 ? ' — Difícil' : active.aiDifficulty === 1 ? ' — Fácil' : ''}
        </div>
      )}

      {/* Onboarding — solo Q1, solo primera vez */}
      {showOnboard && game.turn === 1 && queue.length === 0 && (
        <OnboardModal onClose={() => setShowOnboard(false)} />
      )}

      {/* Event modals */}
      {queue.length > 0 && qi < queue.length && (
        <EventModal
          pend={queue[qi]}
          onChoose={(idx) => {
            // #5 aplica la elección al jugador y avanza
            mutate(g => {
              const pp = g.players.find(x => x.id === queue[qi].p.id);
              if (pp && queue[qi].ev.choices) applyEff(pp, queue[qi].ev.choices![idx].eff);
            });
            advanceQueue();
          }}
          onNext={advanceQueue}
        />
      )}
      {/* Anuncio transitorio sobre la mitad del tablero — se desvanece solo */}
      {flash && (
        <div className={'board-toast' + (celebrate ? ' board-toast-celebrate' : '')}
          onClick={() => { setFlash(null); setCelebrate(false); }}>
          {celebrate && <div className="toast-confetti">✦ ✶ ✦ ✶ ✦</div>}
          {flash}
        </div>
      )}

      {/* "Cómo me va": historial + recordatorio de metas, al tocar el personaje */}
      {showProgress && (
        <ProgressModal game={game} onClose={() => setShowProgress(false)} />
      )}

      {/* #7 Meta autoimpuesta de la quincena */}
      {showFocusPick && (
        <FocusPickModal
          onPick={(f) => {
            mutate(g => {
              const p = g.players.find(x => !x.isAI);
              if (!p) return;
              p.weeklyFocus = f;
              const m = metrics(p);
              p.weeklyFocusBase = f === 'salud' ? m.bienestar
                : f === 'plata' ? (p.liquidity + p.bank)
                : f === 'familia' ? p.impact.familiar
                : m.conocimientos;
            });
            setShowFocusPick(false);
          }}
          onSkip={() => setShowFocusPick(false)}
        />
      )}
    </>
  );
}

// ── #7 Meta autoimpuesta de la quincena ──
function FocusPickModal({ onPick, onSkip }: { onPick: (f: 'salud'|'plata'|'familia'|'aprender') => void; onSkip: () => void }) {
  const opts: { id: 'salud'|'plata'|'familia'|'aprender'; label: string; desc: string; emoji: string }[] = [
    { id:'salud',    emoji:'💪', label:'Cuidarme', desc:'Esta quincena pongo el bienestar primero.' },
    { id:'plata',    emoji:'💰', label:'Ganar terreno', desc:'Ahorrar, trabajar o invertir. Quiero ver el saldo subir.' },
    { id:'familia',  emoji:'🤝', label:'Estar con los míos', desc:'Más tiempo con la gente que importa.' },
    { id:'aprender', emoji:'📚', label:'Aprender algo', desc:'Estudiar, leer, un curso. Pico de conocimiento.' },
  ];
  return (
    <div className="modal-bg" onClick={onSkip}>
      <div className="modal focus-modal" onClick={e => e.stopPropagation()}>
        <div className="focus-title">¿En qué te enfocas esta quincena?</div>
        <div className="focus-sub">Una meta clara hace el doble. Si la cumples, tu temple y tu ánimo lo agradecen.</div>
        <div className="focus-opts">
          {opts.map(o => (
            <button key={o.id} className="focus-opt" onClick={() => onPick(o.id)}>
              <span className="focus-emoji">{o.emoji}</span>
              <span className="focus-opt-label">{o.label}</span>
              <span className="focus-opt-desc">{o.desc}</span>
            </button>
          ))}
        </div>
        <button className="focus-skip" onClick={onSkip}>Sin meta esta vez</button>
      </div>
    </div>
  );
}

// ── Progreso modal — historial del jugador + recordatorio de la vida plena ──
function ProgressModal({ game, onClose }: { game: GameState; onClose: () => void }) {
  const p = game.players[game.activePlayerIndex];
  const col = PLAYER_COLORS[p.colorIndex];
  const hist = [...game.log].reverse().slice(0, 16);
  const phrases = narrateLife(p, game.goals);
  const m = metrics(p);
  const em = emergencyFundMonths(p);
  const piPct = Math.min(100, (passiveIncome(p) / Math.max(expensesPerTurn(p), 1)) * 100);
  const rows: { label: string; val: string; pct: number }[] = [
    { label: 'Bienestar',         val: Math.round(m.bienestar) + ' / ' + game.goals.bienestar,         pct: (m.bienestar / game.goals.bienestar) * 100 },
    { label: 'Conocimiento',      val: Math.round(m.conocimientos) + ' / ' + game.goals.conocimientos, pct: (m.conocimientos / game.goals.conocimientos) * 100 },
    { label: 'Impacto',           val: Math.round(m.impacto) + ' / ' + game.goals.impacto,             pct: (m.impacto / game.goals.impacto) * 100 },
    { label: 'Legado',            val: p.impact.comunitario + ' / ' + game.goals.comunitario,          pct: (p.impact.comunitario / game.goals.comunitario) * 100 },
    { label: 'Colchón',           val: em.toFixed(1) + ' / ' + game.goals.emergencyMonths + ' meses',  pct: (em / game.goals.emergencyMonths) * 100 },
    { label: 'Flujo pasivo',      val: Math.round(piPct) + '% de los gastos',                          pct: piPct },
  ];
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal progress-modal" onClick={e => e.stopPropagation()}>
        <button className="zoom-close" onClick={onClose}>✕</button>
        <div className="progress-head">
          <Portrait p={p} size={56} />
          <div>
            <div className="progress-name" style={{ color: col, WebkitTextFillColor: col }}>Cómo me va</div>
            <div className="progress-sub">Quincena {game.turn}</div>
          </div>
        </div>
        {/* Frases primero (Knizia): tu vida contada, no tu spreadsheet */}
        <div className="progress-prose">
          {phrases.map((s, i) => <p key={i}>{s}</p>)}
          {(p.savedHoursLast ?? 0) >= 3 && p.transport !== 'walk' && (
            <p>La quincena pasada {TRANSPORT_NAME[p.transport]} te ahorró {p.savedHoursLast}h.</p>
          )}
        </div>
        <details className="progress-details">
          <summary>Ver los números</summary>
          <div className="progress-rows">
            {rows.map(r => {
              const done = r.pct >= 100;
              return (
                <div key={r.label} className={'progress-row' + (done ? ' progress-row-done' : '')}>
                  <span className="progress-row-lbl">{r.label}</span>
                  <span className="progress-row-val">{r.val}{done ? ' ✓' : ''}</span>
                </div>
              );
            })}
          </div>
        </details>
        <div className="progress-philo">
          Aquí no se gana solo con plata. Se gana viviendo <b>pleno</b>: la <b>eudaimonía</b> de Aristóteles — equilibrio entre bienestar, conocimiento, vínculos, comunidad, seguridad y libertad.
        </div>
        {/* #13 Hito de legado visible: crece con voluntariado y filantropía */}
        {(() => {
          const legPct = Math.min(100, (p.impact.comunitario / Math.max(game.goals.comunitario, 1)) * 100);
          return (
            <div className="progress-legacy">
              <div className="progress-legacy-top">
                <span>Tu legado</span>
                <span>{p.impact.comunitario}/{game.goals.comunitario}{legPct >= 100 ? ' ✓' : ''}</span>
              </div>
              <div className="progress-legacy-bar"><div className="progress-legacy-fill" style={{ width: legPct + '%' }} /></div>
              <div className="progress-legacy-cap">Voluntariado, Scouts y filantropía hacen crecer lo que dejas a tu comunidad.</div>
            </div>
          );
        })()}
        <div className="progress-hist-title">Tu historia reciente</div>
        <div className="progress-hist">
          {hist.length === 0
            ? <div className="progress-empty">Aún no hay nada que contar. Empieza a vivir.</div>
            : hist.map((l, i) => (
              <div key={i} className={'progress-line progress-' + l.kind}>
                <span className="progress-q">Q{l.turn}</span>{l.text}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default App;
