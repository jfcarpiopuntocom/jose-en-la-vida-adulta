import { useState, useEffect, useRef } from 'react';
import { GameState, PlayerState, GameEvent, Goals } from './types';
import {
  newGame, actionsFor, metrics, rollEvent, applyEff, closeBusinessAndEmployees,
  hasWon, canRetire, makeHeir, cpuTurn, portfolioSlices, collectiblesValue,
  expensesPerTurn, passiveIncome, cuadrante, emergencyFundMonths,
  CUADRANTE_LABEL, CUADRANTE_ICON,
  HOURS_PER_TURN, DEFAULT_GOALS, PLAYER_COLORS, careerTitle,
} from './engine';
import { LOCATIONS, PATH_ORDER, locById, barrioById } from './data';
import { saveLocal, loadLocal, hasLocalSave, clearLocal, publishToNostr, publishStory } from './nostr';
import { jazz } from './music';

// Polyfill: structuredClone not available on Chrome < 98 / iOS < 15.4 (phones up to ~2021)
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const PAWN_ICONS = ['🧑‍💼', '👩‍🔧', '🧑‍🎨', '👨‍🌾'];

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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type Phase = 'setup' | 'play' | 'victory';
type PanelId = 'indicators' | 'historia' | 'about' | null;

interface Pending { p: PlayerState; ev: GameEvent; silvered: boolean }

// ── Particle canvas effect ──
function useParticles(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = canvas.width, H = canvas.height, raf = 0;
    const C = [[255,195,55],[94,234,212],[167,139,250],[251,113,133],[255,255,240],[56,189,248],[251,146,60]];
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

// ── Setup screen ──
function Setup({ onStart }: { onStart: (g: GameState) => void }) {
  const [n, setN] = useState(1);
  const [withJose, setWithJose] = useState(false);
  const [joseSide, setJoseSide] = useState<'empleado'|'empresa'>('empresa');
  const [joseDiff, setJoseDiff] = useState<1|2|3>(2);

  function start() {
    const players: { id: string; name: string; isAI?: boolean; aiStrategy?: 'empleado'|'empresa'; aiDifficulty?: 1|2|3 }[] =
      Array.from({ length: n }, (_, i) => ({ id: 'p'+i, name: 'Jugador '+(i+1) }));
    if (withJose) players.push({
      id: 'jose', name: 'José',
      isAI: true, aiStrategy: joseSide, aiDifficulty: joseDiff,
    });
    onStart(newGame(players, DEFAULT_GOALS));
  }

  return (
    <>
      <AtmosphereBg />
      <div id="map-world" />
      <div className="setup-screen">
        <div className="setup-card">
          <div className="setup-title">JOSÉ EN LA VIDA ADULTA</div>
          <div className="setup-sub">el juego de la vida · ambientado en Cuenca, Ecuador</div>
          <p className="setup-p">
            Gestiona tu tiempo, tu familia, tu carrera y tu negocio.
            Empiezas como "Jugador 1" — tu nombre real se pide solo al ganar.
          </p>

          <div className="setup-label">¿Cuántos jugadores humanos? (1–4)</div>
          <div className="setup-row" style={{ marginBottom: 18 }}>
            {[1,2,3,4].map(i => (
              <button key={i} className={n===i?'setup-sel':'setup-opt'} onClick={() => setN(i)}>{i}</button>
            ))}
          </div>

          {/* José (CPU) section */}
          <div className="jose-section">
            <label className="jose-toggle-label">
              <input type="checkbox" checked={withJose} onChange={e => setWithJose(e.target.checked)}
                style={{ marginRight: 8 }} />
              Jugar contra <b>José</b> (CPU)
            </label>
            {withJose && (
              <div className="jose-config">
                <div className="setup-label" style={{ marginTop: 12 }}>Ruta de José:</div>
                <div className="setup-row">
                  <button className={joseSide==='empleado'?'setup-sel':'setup-opt'} onClick={() => setJoseSide('empleado')}>
                    💼 Empleado
                  </button>
                  <button className={joseSide==='empresa'?'setup-sel':'setup-opt'} onClick={() => setJoseSide('empresa')}>
                    🏭 Empresa
                  </button>
                </div>
                <div className="side-desc">
                  {joseSide === 'empleado'
                    ? 'José buscará empleo, subirá la escalera y priorizará educación y estabilidad.'
                    : 'José ahorrará, abrirá un negocio, contratará y escalará a empresa.'}
                </div>
                <div className="setup-label" style={{ marginTop: 12 }}>Dificultad:</div>
                <div className="setup-row">
                  {([1,2,3] as const).map(d => (
                    <button key={d} className={joseDiff===d?'setup-sel':'setup-opt'} onClick={() => setJoseDiff(d)}>
                      {DIFFICULTY_LABEL[d]}
                    </button>
                  ))}
                </div>
                <div className="side-desc">{DIFFICULTY_DESC[joseDiff]}</div>
              </div>
            )}
          </div>

          <button className="primary" style={{ width:'100%', marginTop: 18 }} onClick={start}>
            {withJose ? `Jugar contra José (${DIFFICULTY_LABEL[joseDiff]} · ${joseSide === 'empleado' ? '💼 Empleado' : '🏭 Empresa'})` : 'Empezar a jugar'}
          </button>
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
  const circumference = 220;
  const offset = circumference - pct * circumference;
  return (
    <div className="time-block">
      <svg className="time-ring" viewBox="0 0 36 36">
        <defs>
          <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={pct > 0.5 ? '#2DD4BF' : pct > 0.2 ? '#E8A020' : '#E11D48'} />
            <stop offset="100%" stopColor={pct > 0.5 ? '#34D399' : pct > 0.2 ? '#FCD34D' : '#FB7185'} />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx="18" cy="18" r="16" />
        <circle className="ring-fill" cx="18" cy="18" r="16"
          strokeDasharray={`${pct * circumference} ${circumference}`}
          strokeDashoffset="0" />
      </svg>
      <div className="time-display">
        <span className="time-num">{Math.round(hours)}</span>
        <span className="time-label">horas</span>
      </div>
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
  return (
    <div id="stats-panel">
      <TimeRing hours={p.timeLeft} />
      <div className="player-block">
        <div className="player-name" style={{ color: col, WebkitTextFillColor: col }}>
          {PAWN_ICONS[p.colorIndex]} {p.name}
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
        <div className="resource"><span className="res-icon">🏦</span><span className="res-val">${p.bank}</span></div>
        <div className="resource"><span className="res-icon">🎓</span><span className="res-val">{p.education.completed.length} títulos</span></div>
        <div className="resource"><span className="res-icon">Q</span><span className="res-val">Quincena {game.turn}</span></div>
      </div>
      <div className="stat-divider" />
      {canRetire(p, game.turn) && (
        <button className="btn-legacy" onClick={onLegacy}>Pasar el legado ✦</button>
      )}
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
                <span className="act-name">{a.label}</span>
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
function Board({ game, onMove, onInspect, inspecting }: {
  game: GameState;
  onMove: (id: string) => void;
  onInspect: (id: string | null) => void;
  inspecting: string | null;
}) {
  const active = game.players[game.activePlayerIndex];
  const pts = PATH_ORDER.map(id => locById(id));

  // We use percentage-based positioning in the container
  // SVG viewBox is 760×480; node coords are in that space
  const VW = 760, VH = 480;

  function handleNodeClick(locId: string) {
    if (inspecting === locId) {
      onInspect(null);
    } else {
      onInspect(locId);
    }
  }

  const polyPoints = pts.map(l => `${(l.x/VW*100).toFixed(2)}% ${(l.y/VH*100).toFixed(2)}%`).join(', ');

  return (
    <div id="map-world">
      <div className="board-container">
        <div className="board-svg-wrap">
          {/* SVG Paths */}
          <svg className="links" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2DD4BF" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
            </defs>
            {/* glow layer */}
            <polygon points={pts.map(l=>`${l.x},${l.y}`).join(' ')}
              fill="none" stroke="rgba(45,212,191,0.06)" strokeWidth={10} />
            {/* animated dashed loop */}
            <polygon points={pts.map(l=>`${l.x},${l.y}`).join(' ')}
              fill="none" stroke="rgba(232,160,32,0.38)" strokeWidth={2}
              strokeDasharray="8 5" strokeLinecap="round"
              style={{ animation: 'march 14s linear infinite' }} />
            {/* decorative dots between stops */}
            {pts.map((a, i) => {
              const b = pts[(i+1) % pts.length];
              return [0.33, 0.66].map((t, j) => (
                <circle key={`d${i}${j}`}
                  cx={a.x + (b.x-a.x)*t} cy={a.y + (b.y-a.y)*t}
                  r={2.5} fill="rgba(255,255,255,0.08)" />
              ));
            })}
          </svg>

          {/* Nodes */}
          {LOCATIONS.map(loc => {
            const here = loc.id === active.currentLocation;
            const cost = loc.tc[active.transport];
            const reachable = !here && active.timeLeft >= cost;
            const selected = inspecting === loc.id;
            const pawns = game.players.filter(p => p.currentLocation === loc.id);
            const nt = nodeType(loc.zone, loc.id);
            const xPct = (loc.x / VW * 100).toFixed(2) + '%';
            const yPct = (loc.y / VH * 100).toFixed(2) + '%';
            return (
              <div key={loc.id}
                className={'node' + (here?' here':'') + (reachable?' reachable':'') + (selected?' selected':'')}
                data-t={nt}
                style={{ left: xPct, top: yPct }}
                onClick={() => handleNodeClick(loc.id)}>
                <div className="node-icon">{loc.icon}</div>
                <div className="node-name">{loc.name}</div>
                <div className="node-time">{here ? 'aquí' : `${cost}h`}</div>
                {pawns.length > 0 && (
                  <div className="node-pawns">
                    {pawns.map(p => (
                      <span key={p.id}
                        style={{ filter: p.id===active.id ? `drop-shadow(0 0 4px ${PLAYER_COLORS[p.colorIndex]})` : 'none' }}>
                        {PAWN_ICONS[p.colorIndex]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Top bar HUD ──
function TopBar({ openPanel, setOpenPanel, turn }: {
  openPanel: PanelId;
  setOpenPanel: (p: PanelId) => void;
  turn: number;
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
      <div className="bar-right">
        <button className={'hud-btn'+(openPanel==='indicators'?' on':'')}
          onClick={() => toggle('indicators')} title="Indicadores">📊</button>
        <button className={'hud-btn'+(openPanel==='historia'?' on':'')}
          onClick={() => toggle('historia')} title="Historia">📜</button>
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

// ── Event Modal ──
function EventModal({ pend, onNext }: { pend: Pending; onNext: () => void }) {
  const { p, ev, silvered } = pend;
  const col = PLAYER_COLORS[p.colorIndex];
  return (
    <div className="modal-bg">
      <div className="modal">
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
          <div className="setup-title">🏆 Victoria</div>
          <div className="victory-title" style={{ color: col, WebkitTextFillColor: col }}>
            {winner.name} — quincena {game.turn}
          </div>
          <p className="victory-sub">Patrimonio, bienestar, conocimientos e impacto — las cuatro a la vez. Eso es una vida construida.</p>
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
export function App() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [game, setGame] = useState<GameState | null>(null);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [qi, setQi] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [cpuThinking, setCpuThinking] = useState(false);

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

  if (phase === 'setup') return <Setup onStart={g => { setGame(g); setPhase('play'); saveLocal(g); }} />;
  if (!game) return null;
  if (phase === 'victory') return <Victory game={game} onRestart={() => { clearLocal(); location.reload(); }} />;

  const active = game.players[game.activePlayerIndex];

  function doAction(idx: number) {
    mutate(g => {
      const p = g.players[g.activePlayerIndex];
      const a = actionsFor(p, g.world)[idx];
      if (!a) return;
      const log = a.run();
      g.log.push({ turn: g.turn, text: log, kind: 'plain', importance: 1 });
    });
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

  // Auto-run CPU (José) turns
  useEffect(() => {
    if (phase !== 'play' || !game || cpuThinking || queue.length > 0) return;
    const p = game.players[game.activePlayerIndex];
    if (!p.isAI) return;
    setCpuThinking(true);
    const snap = game; // capture current state
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
  }, [game?.activePlayerIndex, game?.turn, phase, queue.length]);

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
    g.turn++; g.activePlayerIndex = 0;
    for (const p of g.players) p.timeLeft = HOURS_PER_TURN;
    commit(g, true);
  }

  const zp = zoom ? game.players.find(p => p.id === zoom) : null;

  return (
    <>
      <RotateOverlay />
      <AtmosphereBg />
      <Board
        game={game}
        onMove={moveTo}
        onInspect={id => { setInspecting(id); setOpenPanel(null); }}
        inspecting={inspecting}
      />

      <div id="hud">
        <TopBar openPanel={openPanel} setOpenPanel={id => { setOpenPanel(id); setInspecting(null); }} turn={game.turn} />
        <StatsPanel game={game} onEnd={endPlayerTurn} onLegacy={retire} />
        <ActionsBar game={game} onAction={doAction} />

        {/* Lid panels */}
        {openPanel === 'indicators' && (
          <LidPanel id="indicators" title="📊 Indicadores" onClose={() => setOpenPanel(null)}>
            <IndicatorsContent game={game} />
          </LidPanel>
        )}
        {openPanel === 'historia' && (
          <LidPanel id="historia" title="📜 Historia" onClose={() => setOpenPanel(null)}>
            <HistoriaContent game={game} />
          </LidPanel>
        )}
        {openPanel === 'about' && (
          <LidPanel id="about" title="¿Qué es este juego?" onClose={() => setOpenPanel(null)}>
            <AboutContent />
          </LidPanel>
        )}

        {/* Node inspect tooltip */}
        {inspecting && (
          <NodeInspect
            locId={inspecting}
            game={game}
            onMove={() => moveTo(inspecting)}
            onAction={doAction}
            onClose={() => setInspecting(null)}
          />
        )}
      </div>

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
