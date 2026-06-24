import { useState, useEffect, useRef } from 'react';
import { GameState, PlayerState, GameEvent, Goals } from './types';
import {
  newGame, actionsFor, metrics, rollEvent, applyEff, closeBusinessAndEmployees,
  hasWon, canRetire, makeHeir, cpuTurn, portfolioSlices, collectiblesValue,
  expensesPerTurn, passiveIncome, cuadrante, emergencyFundMonths,
  CUADRANTE_LABEL, CUADRANTE_ICON, TIER_GOALS,
  HOURS_PER_TURN, DEFAULT_GOALS, PLAYER_COLORS, careerTitle, generateBackstory,
} from './engine';
import { GameTier } from './types';
import { LOCATIONS, PATH_ORDER, locById, barrioById } from './data';
import { saveLocal, loadLocal, hasLocalSave, clearLocal, publishToNostr, publishStory } from './nostr';
import { jazz } from './music';

// Polyfill: structuredClone not available on Chrome < 98 / iOS < 15.4 (phones up to ~2021)
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

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
  // Jose has custom artwork; humans get placeholder smileys until assets land
  if (p.isAI && p.name.toLowerCase().startsWith('jos')) {
    return (
      <img src="/jose-en-la-vida-adulta/avatars/jose.png"
        width={size} height={size}
        alt={p.name}
        style={{
          borderRadius: '50%', objectFit: 'cover',
          border: '3px solid ' + col,
          boxShadow: '0 0 18px ' + col + '88, 0 4px 14px rgba(0,0,0,0.5)',
          background: '#f4e5c8',
        }} />
    );
  }
  // Smiley placeholder for human players — different color per slot
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
    function resize() { W = canvas!.width = innerWidth; H = canvas!.height = innerHeight; }
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
    addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
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
  const v = parseInt(localStorage.getItem(TIER_LOCK_KEY) || '1', 10);
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
          <div className="bstat"><span className="bstat-label">Barrio</span><span className="bstat-val">{player.birthBarrio.replace(/_/g, ' ')}</span></div>
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
  const [withJose, setWithJose] = useState(false);

  function start() {
    const tierGoals = TIER_GOALS[tier] as typeof TIER_GOALS[1];
    const human = { id: 'p0', name: 'Tú' };
    const players: { id: string; name: string; isAI?: boolean; aiStrategy?: 'empleado'|'empresa'; aiDifficulty?: 1|2|3 }[] = [human];
    for (let i = 1; i < n; i++) players.push({ id: 'p' + i, name: 'Jugador ' + (i + 1) });
    if (withJose) players.push({ id: 'jose', name: 'José', isAI: true, aiStrategy: 'empresa', aiDifficulty: 2 });
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
        <div className="setup-card">
          <div className="setup-title">JOSÉ EN LA VIDA ADULTA</div>
          <div className="setup-sub">simulador de vida adulta · Cuenca, Ecuador</div>

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

          {/* José CPU */}
          <label className="jose-toggle-label">
            <input type="checkbox" checked={withJose} onChange={e => setWithJose(e.target.checked)}
              style={{ marginRight: 8 }} />
            Jugar contra <b>José</b> (CPU)
          </label>

          <div style={{ display:'flex', gap:8, marginTop: 16 }}>
            <button className="primary" style={{ flex:1 }} onClick={start}>
              Empezar
            </button>
            <button style={{ flex:'0 0 auto', padding:'0 14px' }} onClick={() => {
              const { label: _l, desc: _d, cpuMult: _c, ...goals } = TIER_GOALS[1];
              onStart(newGame([{ id:'p0', name:'Jugador 1' }], goals, 1));
            }} title="Modo Rapido: 1 jugador, Principiante, sin configuracion">
              Rapido
            </button>
          </div>
          {hasLocalSave() && (
            <button style={{ width:'100%', marginTop: 8 }} onClick={() => { const g = loadLocal(); if (g) onStart(g); }}>
              Continuar partida guardada
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── SVG Time Ring ──
function TimeRing({ hours }: { hours: number }) {
  const pct = clamp(hours / HOURS_PER_TURN, 0, 1);
  const angle = pct * 360;
  const rad = (a: number) => (a - 90) * Math.PI / 180;
  const x2 = 18 + 14 * Math.cos(rad(angle));
  const y2 = 18 + 14 * Math.sin(rad(angle));
  const largeArc = angle > 180 ? 1 : 0;
  const arcPath = angle > 0
    ? 'M18 4 A14 14 0 ' + largeArc + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1)
    : '';
  const hoursLeft = Math.round(hours);
  const col = pct > 0.5 ? '#3A7850' : pct > 0.2 ? '#C8A040' : '#A0192C';
  return (
    <div className="clock-face">
      <svg viewBox="0 0 36 36" className="clock-svg">
        {/* Clock face background */}
        <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
        {/* Hour markers */}
        {[0,30,60,90,120,150,180,210,240,270,300,330].map(a => {
          const r1 = 14.5, r2 = 16;
          const ax = (a - 90) * Math.PI / 180;
          return <line key={a} x1={18+r1*Math.cos(ax)} y1={18+r1*Math.sin(ax)}
            x2={18+r2*Math.cos(ax)} y2={18+r2*Math.sin(ax)}
            stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"/>;
        })}
        {/* Time arc */}
        {angle > 0 && <path d={arcPath} fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>}
        {/* Center text */}
        <text x="18" y="17" textAnchor="middle" fontSize="8" fontWeight="800"
          fill={col} style={{ fontFamily: 'Nunito, sans-serif' }}>{hoursLeft}</text>
        <text x="18" y="22.5" textAnchor="middle" fontSize="3.5"
          fill="rgba(255,255,255,0.5)" style={{ fontFamily: 'Nunito, sans-serif' }}>horas</text>
      </svg>
    </div>
  );
}

// ── Stats Panel (right side overlay) ──
function StatsPanel({
  game, onEnd, onLegacy
}: { game: GameState; onEnd: () => void; onLegacy: () => void }) {
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
    { key:'emergencia', label:'Emergencia',  color:'var(--gold)',   val: emMonths,             goal: game.goals.emergencyMonths },
    { key:'pasivo',     label:'Pasivo', color:'var(--orange)', val: piPct,                goal: 100 },
  ];
  // Win progress: average of all 6 bars capped at 100%
  const winPct = Math.round(indBars.reduce((s, b) => s + Math.min(100, (b.val / b.goal) * 100), 0) / indBars.length);
  return (
    <div id="stats-panel">
      <div className="turn-banner">
        <Portrait p={p} size={72} />
        <div className="turn-banner-text">
          <div className="turn-of">Turno de</div>
          <div className="turn-name" style={{ color: col, WebkitTextFillColor: col }}>{p.name}</div>
        </div>
      </div>
      <div className="player-block">
        <div className="player-name" style={{ color: col, WebkitTextFillColor: col, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
          {p.name}
        </div>
        <div className="player-loc">{loc.icon} {loc.name}</div>
        <div className="econ-line">
          {game.world.economy === 'good'
            ? <span className="econ-good">● buen año</span>
            : <span className="econ-bad">● mal año</span>}
        </div>
      </div>
      <div className="stat-divider" />
      <div className="resources">
        <div className="resource"><span className="res-icon">💰</span><span className="res-val">${p.liquidity}</span></div>
        {(() => { const nw = p.liquidity + p.bank + p.businesses.reduce((s,b)=>s+b.capital,0) + collectiblesValue(p); return <div className="resource net-worth-row"><span className="res-icon" style={{color:"#28ECAA",WebkitTextFillColor:"#28ECAA"}}>NW</span><span className="res-val" style={{color:"#28ECAA",WebkitTextFillColor:"#28ECAA",fontWeight:700}}>${nw}</span></div>; })()}
        <div className="resource"><span className="res-icon">🏦</span><span className="res-val">${p.bank}</span></div>
        <div className="resource"><span className="res-icon">🎓</span><span className="res-val">{p.education.completed.length} titulos</span></div>
        {p.job && <div className="resource"><span className="res-icon">W</span><span className="res-val" style={{fontSize:"0.78rem"}}>{p.job.title}</span></div>}
        {p.education.enrolledId && <div className="resource"><span className="res-icon">E</span><span className="res-val" style={{fontSize:"0.78rem"}}>Estudiando...</span></div>}
        <div className="resource"><span className="res-icon">Q</span><span className="res-val">Quincena {game.turn}</span></div>
      <div className="resource"><span className="res-icon" style={{color:"#E8A020",WebkitTextFillColor:"#E8A020"}}>T</span><span className="res-val" style={{fontSize:"0.75rem",color:"#E8A020",WebkitTextFillColor:"#E8A020"}}>{TIER_GOALS[game.gameTier ?? 1].label}</span></div>
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
          const display = b.key === 'emergencia'
            ? b.val.toFixed(1) + 'm'
            : b.key === 'pasivo'
            ? Math.round(b.val) + '%'
            : Math.round(b.val) + '/' + b.goal;
          return (
            <div key={b.key} className="ind-row-mini">
              <span className="ind-lbl-mini">{b.label}</span>
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
      <details className="metas-detail">
        <summary className="metas-summary">Ver metas de victoria</summary>
        <div className="metas-list">
          {indBars.map(b => {
            const pct = Math.min(100, (b.val / b.goal) * 100);
            const done = pct >= 100;
            return (
              <div key={b.key} className={"meta-row" + (done ? " meta-done" : "")}>
                <span style={{ color: b.color, WebkitTextFillColor: b.color }}>{b.label}</span>
                <span>{b.key === "emergencia" ? b.val.toFixed(1) + "m / " + b.goal + "m" : b.key === "pasivo" ? Math.round(b.val) + "% / 100%" : Math.round(b.val) + " / " + b.goal}</span>
                {done && <span className="meta-check">✓</span>}
              </div>
            );
          })}
        </div>
      </details>
      <button className="btn-end" onClick={onEnd}>
        Terminar quincena ▶
      </button>
    </div>
  );
}

// ── Actions Bar (bottom overlay) ──
function ActionsBar({ game, onAction }: { game: GameState; onAction: (i: number) => void }) {
  const p = game.players[game.activePlayerIndex];
  const loc = locById(p.currentLocation);
  const acts = actionsFor(p, game.world);
  const [savedAt] = useState('');
  return (
    <div id="actions-bar">
      <div className="actions-label">Acciones en {loc.icon} {loc.name}</div>
      {acts.length === 0
        ? <div className="actions-empty">Sin acciones aquí — muévete o termina tu quincena.</div>
        : (
          <div className="actions-row">
            {acts.map((a, i) => (
              <button key={a.id} className="action-card"
                style={{ '--ac': 'var(--'+ACT_COLORS[i%ACT_COLORS.length]+')' } as any}
                onClick={() => onAction(i)}>
                <span className="act-name"><span className="act-icon">{actionIcon(a.id)}</span>{a.label}</span>
                <span className="act-desc">{a.desc}</span>
              </button>
            ))}
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
              <span className="ind-label">Emergencia</span>
              <div className="ind-bar"><div className="ind-fill" style={{ width: emPct+'%', '--bc': 'var(--gold)' } as any} /></div>
              <span className="ind-val">{emMonths.toFixed(1)}m/{game.goals.emergencyMonths}{emMonths >= game.goals.emergencyMonths ? <span className="check-icon"> ✓</span> : ''}</span>
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
      <p className="about-welcome">Bienvenido a <b>José En La Vida Adulta</b> — el juego de la vida adulta, ambientado en Cuenca, Ecuador.</p>

      <p>Cada quincena tienes 112 horas. Decides dónde invertirlas: trabajo, familia, educación, negocios, descanso. No hay camino correcto. Hay decisiones.</p>

      <div className="about-section">
        <div className="about-section-title">El recurso más escaso</div>
        <p>No es el dinero. No es el talento. Es el tiempo. Todo cuesta horas. Todo compite por las mismas 112 horas de tu quincena.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Dos rutas, un mismo respeto</div>
        <p>Empleado o empresario. Ninguna ruta es superior. El empleado comprometido sostiene la empresa; el empresario crea el espacio donde otros pueden crecer. Ambos se necesitan.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">De negocio a empresa</div>
        <p>Un negocio que depende del fundador para cada decisión no es una empresa, es un autoempleo de alta complejidad. El salto ocurre cuando existen procedimientos documentados. Sin eso, la dependencia es total y nada escala.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Portafolio Permanente</div>
        <p>Inspirado en Harry Browne: diversificar en activos que preservan valor. Cuadros, vinos, joyería, tarjetas de béisbol, bitcoin. La riqueza no es una cifra, es una estructura.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Los 4 arquetipos de ingreso</div>
        <p><b>👔 Asalariado</b> — intercambia tiempo por sueldo. Estabilidad real, no debilidad.<br />
        <b>🛠️ Profesión Liberal</b> — cobra por conocimiento o servicio. Autonomía con límite de horas.<br />
        <b>🏭 Empresario</b> — posee un sistema que opera sin su presencia constante. Escala con empleados y procedimientos.<br />
        <b>📈 Inversionista</b> — el capital genera más que los gastos básicos. El tiempo se libera.</p>
        <p style={{marginTop:6}}>El objetivo no es saltar de cuadrante a cuadrante: es construir bien en el tuyo y diversificar cuando tenga sentido.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Para ganar</div>
        <p>Bienestar + conocimientos + impacto comunitario + fondo de emergencia de 6 meses + al menos 35% de tus gastos cubiertos por flujo pasivo. Todo a la vez. El camino es tuyo.</p>
      </div>

      <div className="about-section">
        <div className="about-section-title">Legado</div>
        <p>Puedes pasar el testigo a un heredero. Lo que construiste — reputación, capital, principios — viaja con él. El linaje es el horizonte largo del juego.</p>
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
  // actions available AT this location (simulate)
  const mockP = { ...p, currentLocation: locId };
  const acts = actionsFor(mockP as typeof p, game.world);

  return (
    <div className="node-inspect">
      <button className="insp-close-btn" onClick={onClose}>✕</button>
      <div className="insp-title">{loc.icon} {loc.name}</div>
      {acts.length > 0 && (
        <div className="insp-actions">
          {acts.slice(0,3).map((a, i) => (
            <button key={a.id} className="insp-action" onClick={() => { if (isHere) onAction(i); else { onMove(); } }}>
              <span className="act-name">{a.label}</span>
              <span className="act-desc">{a.desc}</span>
            </button>
          ))}
        </div>
      )}
      <button className="insp-move" disabled={isHere || !canMove} onClick={onMove}>
        {isHere ? 'Estás aquí' : canMove ? `Ir aquí · ${cost}h` : `Sin tiempo suficiente (${cost}h)`}
      </button>
    </div>
  );
}

// ── Board ──
function Board({ game, onInspect, inspecting }: {
  game: GameState;
  onInspect: (id: string | null) => void;
  inspecting: string | null;
}) {
  const active = game.players[game.activePlayerIndex];
  const locs = LOCATIONS;

  // 13 locations around a rectangle: top 4, right 3, bottom 3, left 3
  const top    = locs.slice(0, 4);
  const right  = locs.slice(4, 7);
  const bottom = [...locs.slice(7, 10)].reverse();
  const left   = [...locs.slice(10, 13)].reverse();

  function Tile({ loc }: { loc: typeof LOCATIONS[0] }) {
    const here = loc.id === active.currentLocation;
    const cost = loc.tc[active.transport];
    const reachable = !here && active.timeLeft >= cost;
    const sel = inspecting === loc.id;
    const pawns = game.players.filter(p => p.currentLocation === loc.id);

    return (
      <div
        className={'tile' + (here ? ' tile-here' : '') + (reachable ? ' tile-reach' : '') + (sel ? ' tile-sel' : '')}
        onClick={() => onInspect(inspecting === loc.id ? null : loc.id)}
      >
        <div className="tile-icon">{loc.icon}</div>
        <div className="tile-label">{loc.name.split('(')[0].trim()}</div>
        {pawns.length > 0 && (
          <div className="tile-pawns">
            {pawns.map(p => <PawnAvatar key={p.id} p={p} size={18} glow={p.id === active.id} />)}
          </div>
        )}
        {here && <div className="tile-you">AQUI</div>}
        {!here && reachable && <div className="tile-cost">{cost}h</div>}
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
          <div className="bc-city">CUENCA</div>
          <div className="bc-turn">Quincena {game.turn}</div>
          <div className="bc-log">
            {game.log.slice(-5).map((l, i) => (
              <div key={i} className={'bc-line bc-' + l.kind}>{l.text}</div>
            ))}
          </div>
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
function TopBar({ openPanel, setOpenPanel, turn, economy }: {
  openPanel: PanelId;
  setOpenPanel: (p: PanelId) => void;
  turn: number;
  economy: string;
}) {
  const [musicOn, setMusicOn] = useState(false);
  function toggle(id: PanelId) { setOpenPanel(openPanel === id ? null : id); }
  function toggleMusic() {
    jazz.toggle();
    setMusicOn(!jazz.muted);
  }
  return (
    <div id="top-bar">
      <span className="game-name">JOSÉ EN LA VIDA ADULTA</span>
      <span className="bar-motto">el juego de la vida · Cuenca, Ecuador</span>
      <span className={"econ-pill " + (economy === "good" ? "econ-good" : "econ-bad")}>{economy === "good" ? "Buen año" : "Mal año"}</span>
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
        {p.collectibles.length > 0 && (
          <span className="pm-row"><span>🎨 Coleccionables</span><b>${portfolio.collectibles}</b></span>
        )}
        {p.collectibles.map((c, i) => (
          <span key={i} className="pm-col">{COL_ICONS[c.kind]} {c.name} · ${c.value} {c.value > c.boughtFor ? '▲' : '▼'}</span>
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
  function dismiss() { localStorage.setItem(ONBOARD_KEY, '1'); onClose(); }
  const goals = [
    { icon: '🚌', place: 'Terminal (bolsa de empleo)', action: 'Busca tu primer empleo', why: 'Sin trabajo, no hay sueldo. Es tu primera parada.' },
    { icon: '🏦', place: 'Banco (ahorrar · invertir)', action: 'Deposita $100 en el banco', why: 'El fondo de emergencia es una de las 6 metas de victoria.' },
    { icon: '🏠', place: 'Tu Casa (hogar)', action: 'Descansa cuando el estrés suba', why: 'Si el estrés llega a 100, pierdes rendimiento en todo.' },
  ];
  return (
    <div className="modal-bg">
      <div className="modal onboard-modal">
        <div className="onboard-title">Bienvenido a la vida adulta</div>
        <div className="onboard-sub">Tienes 112 horas esta quincena. Aquí hay 3 cosas para hacer ahora:</div>
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
        <div style={{ margin:'10px 0 6px', fontSize:'0.82rem', fontWeight:700, color:'#CCCCCC', WebkitTextFillColor:'#CCCCCC' }}>
          Cuatro rutas al exito:
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
          {[
            { label:'Asalariado', desc:'Empleo + carrera', col:'#28ECAA' },
            { label:'Independiente', desc:'Profesion liberal', col:'#E8A020' },
            { label:'Empresario', desc:'Negocio propio', col:'#fb7185' },
            { label:'Inversionista', desc:'Ingresos pasivos', col:'#c084fc' },
          ].map(r => (
            <div key={r.label} style={{ padding:'6px 8px', borderRadius:6, border:'1px solid ' + r.col + '66', background: r.col + '18' }}>
              <div style={{ fontSize:'0.78rem', fontWeight:700, color:r.col, WebkitTextFillColor:r.col }}>{r.label}</div>
              <div style={{ fontSize:'0.72rem', color:'#CCCCCC', WebkitTextFillColor:'#CCCCCC' }}>{r.desc}</div>
            </div>
          ))}
        </div>
        <div className="onboard-win">Para ganar: bienestar · conocimientos · impacto · legado · fondo 6 meses · 35% ingreso pasivo. Todo a la vez.</div>
        <button className="primary" style={{ width: '100%', marginTop: 16 }} onClick={dismiss}>
          Entendido — empezar
        </button>
      </div>
    </div>
  );
}

// ── Log Bar — live feed junto al board, siempre visible ──
function LogBar({ game }: { game: GameState }) {
  const last = [...game.log].slice(-5).reverse();
  if (last.length === 0) return null;
  return (
    <div id="log-bar">
      {last.map((l, i) => (
        <span key={i} className={'lb-entry lb-' + l.kind}>
          <span className="lb-q">Q{l.turn}</span>{l.text}
        </span>
      ))}
    </div>
  );
}

// ── Event Modal ──
function EventModal({ pend, onNext }: { pend: Pending; onNext: () => void }) {
  const { p, ev, silvered } = pend;
  const col = PLAYER_COLORS[p.colorIndex];
  return (
    <div className="modal-bg">
      <div className="modal">
        <div className="ev-tag">¿Qué pasó en mi fin de semana?</div>
        <h3>
          <span style={{ color: ev.neg ? 'var(--rose)' : 'var(--green)', WebkitTextFillColor: ev.neg ? 'var(--rose)' : 'var(--green)' }}>
            {ev.neg ? '✗' : '✦'}
          </span>{' '}
          <span style={{ color: col, WebkitTextFillColor: col }}>{p.name}</span> — {ev.title}
        </h3>
        <div className="body">{ev.body}</div>
        {silvered && ev.sl && <div className="silver">↪ {ev.sl}</div>}
        <button className="primary" onClick={onNext}>Continuar</button>
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
    localStorage.setItem(TIER_LOCK_KEY, String(nextTier));
  }
  const unlockedNew = nextTier > prevMax;
  const [realName, setRealName] = useState('');
  const [saved, setSaved] = useState(false);
  const hist = game.log.filter(l => l.importance >= 2).slice(-10);

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
          <div className="victory-title" style={{ color: col, WebkitTextFillColor: col }}>
            {winner.name} — quincena {game.turn}
          </div>
          <p className="victory-sub">Bienestar, carrera, patrimonio y legado — todo a la vez. Eso es una vida construida.</p>
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
            <div className="vstat"><span className="vstat-label">Titulos</span><span className="vstat-val">{winner.education.completed.length}</span></div>
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
  const [cpuThinking, setCpuThinking] = useState(false);
  const [showOnboard, setShowOnboard] = useState(() =>
    localStorage.getItem(ONBOARD_KEY) !== '1'
  );

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

  // ── Auto-run CPU turns — MUST be before early returns (Rules of Hooks) ──
  useEffect(() => {
    if (phase !== 'play' || !game || cpuThinking || queue.length > 0) return;
    const p = game.players[game.activePlayerIndex];
    if (!p?.isAI) return;
    setCpuThinking(true);
    const snap = game;
    const delay = 900 + Math.random() * 700;
    const timer = setTimeout(() => {
      const g: GameState = deepClone(snap);
      const ai = g.players[g.activePlayerIndex];
      const logs = cpuTurn(ai, g.world, ai.aiStrategy!, ai.aiDifficulty!);
      logs.forEach(text => g.log.push({ turn: g.turn, text, kind: 'plain', importance: 1 }));
      setCpuThinking(false);
      endPlayerTurn(g);
    }, delay);
    return () => { clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.activePlayerIndex, game?.turn, phase, queue.length]);

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
    if (result) setFlash(result);
    setInspecting(null);
  }

  function moveTo(locId: string) {
    if (locId === active.currentLocation) return;
    const cost = locById(locId).tc[active.transport];
    if (active.timeLeft < cost) { setFlash('No te alcanza el tiempo para moverte.'); return; }
    mutate(g => {
      const p = g.players[g.activePlayerIndex];
      p.timeLeft -= cost; p.currentLocation = locId;
    });
    setInspecting(null);
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
      const ev = rollEvent(p, g.turn);
      if (ev) {
        applyEff(p, ev.eff);
        let silvered = false;
        if (ev.neg && ev.silver.length) { applyEff(p, ev.silver); silvered = true; }
        if (ev.firesJob) p.job = null;
        if (ev.setEcon) { g.world.economy = ev.setEcon; g.world.wageMult = ev.setEcon==='good'?1:0.8; g.world.salesMult = ev.setEcon==='good'?1:0.8; }
        g.log.push({ turn: g.turn, text: `${p.name}: ${ev.title}`, kind: ev.neg?'neg':'pos', importance: ev.imp });
        pend.push({ p, ev, silvered });
      }
    }
    for (const p of g.players) {
      const logs = closeBusinessAndEmployees(p);
      logs.forEach(t => g.log.push({ turn: g.turn, text: `${p.name}: ${t}`, kind: 'neg', importance: 1 }));
    }
    if (Math.random() < 0.08) {
      const ne = g.world.economy === 'good' ? 'bad' : 'good';
      g.world.economy = ne; g.world.wageMult = ne==='good'?1:0.8; g.world.salesMult = ne==='good'?1:0.8;
      g.log.push({ turn: g.turn, text: `La economía cambió a ${ne==='good'?'buen año':'mal año'}`, kind: ne==='good'?'pos':'neg', importance: 2 });
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
    const winner = g.players.find(p => hasWon(p, g.goals));
    if (winner) { g.over = true; g.winnerId = winner.id; commit(g, true); setPhase('victory'); return; }
    // Apply passive income + deduct living expenses at end of turn
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
    }
    // Flash turn summary
    const firstP = g.players[0];
    const piSum = Math.round(passiveIncome(firstP));
    const expSum = expensesPerTurn(firstP);
    const net = piSum - expSum;
    setFlash(`Quincena ${g.turn} cerrada. Gastos: -$${expSum}${piSum > 0 ? ` · Pasivos: +$${piSum}` : ''} · Balance: ${net >= 0 ? '+' : ''}$${net}`);
    g.turn++; g.activePlayerIndex = 0;
    for (const p of g.players) p.timeLeft = HOURS_PER_TURN;
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
      <TopBar openPanel={openPanel} setOpenPanel={id => { setOpenPanel(id); setInspecting(null); }} turn={game.turn} economy={game.world.economy} />
      <div className="game-layout">
        <div className="game-main">
          <div className="board-section">
            <Board game={game}
              onInspect={id => { setInspecting(id); setOpenPanel(null); }}
              inspecting={inspecting}
            />
          </div>
          <div className="time-section">
            <TimeRing hours={game.activePlayerIndex >= 0 ? game.players[game.activePlayerIndex].timeLeft : HOURS_PER_TURN} />
          </div>
          <ActionsBar game={game} onAction={doAction} />
        </div>
        <StatsPanel game={game} onEnd={endPlayerTurn} onLegacy={retire} />
      </div>
      <LogBar game={game} />
      {inspecting && (
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
        <EventModal pend={queue[qi]} onNext={advanceQueue} />
      )}
      {flash && (
        <div className="modal-bg">
          <div className="modal">
            <div className="body">{flash}</div>
            <button className="primary" onClick={() => setFlash(null)}>Ok</button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
