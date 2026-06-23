import { useState, useEffect } from 'react';
import { GameState, PlayerState, GameEvent, Goals } from './types';
import {
  newGame, actionsFor, metrics, rollEvent, applyEff, closeBusinessAndEmployees,
  hasWon, canRetire, makeHeir, HOURS_PER_TURN, DEFAULT_GOALS, PLAYER_COLORS, careerTitle,
} from './engine';
import { LOCATIONS, LINKS, locById } from './data';
import {
  saveLocal, loadLocal, hasLocalSave, clearLocal, publishToNostr, publishStory,
} from './nostr';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type Phase = 'setup' | 'play' | 'victory';

interface Pending { p: PlayerState; ev: GameEvent; silvered: boolean }

export function App() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [game, setGame] = useState<GameState | null>(null);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [qi, setQi] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string>('');

  // autosave + nostr en cada cambio de quincena
  function commit(g: GameState, persist = false) {
    setGame({ ...g });
    if (persist) {
      saveLocal(g);
      setSavedAt(new Date().toLocaleTimeString());
      publishToNostr(g); // mejor esfuerzo, no bloquea
    }
  }
  function mutate(fn: (g: GameState) => void, persist = false) {
    if (!game) return;
    const g: GameState = structuredClone(game);
    fn(g);
    commit(g, persist);
  }

  if (phase === 'setup') return <Setup onStart={(g) => { setGame(g); setPhase('play'); saveLocal(g); }} />;
  if (!game) return null;
  if (phase === 'victory') return <Victory game={game} onRestart={() => { clearLocal(); location.reload(); }} />;

  const active = game.players[game.activePlayerIndex];

  function doAction(idx: number) {
    mutate((g) => {
      const p = g.players[g.activePlayerIndex];
      const acts = actionsFor(p, g.world);
      const a = acts[idx];
      if (!a) return;
      const log = a.run();
      g.log.push({ turn: g.turn, text: log, kind: 'plain', importance: 1 });
    });
  }

  function moveTo(locId: string) {
    if (locId === active.currentLocation) return;
    const cost = locById(locId).tc[active.transport];
    if (active.timeLeft < cost) { setFlash('No te alcanza el tiempo para moverte.'); return; }
    mutate((g) => {
      const p = g.players[g.activePlayerIndex];
      p.timeLeft -= cost; p.currentLocation = locId;
    });
  }

  function endPlayerTurn() {
    const g: GameState = structuredClone(game!);
    g.players[g.activePlayerIndex].timeLeft = 0;
    if (g.activePlayerIndex < g.players.length - 1) {
      g.activePlayerIndex++;
      commit(g);
    } else {
      runEvents(g);
    }
  }

  function retire() {
    mutate((g) => {
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
        if (ev.firesJob) { p.job = null; }
        if (ev.setEcon) { g.world.economy = ev.setEcon; g.world.wageMult = ev.setEcon === 'good' ? 1 : 0.8; g.world.salesMult = ev.setEcon === 'good' ? 1 : 0.8; }
        g.log.push({ turn: g.turn, text: `${p.name}: ${ev.title}`, kind: ev.neg ? 'neg' : 'pos', importance: ev.imp });
        pend.push({ p, ev, silvered });
      }
    }
    // cierre de negocios/empleados
    for (const p of g.players) {
      const logs = closeBusinessAndEmployees(p);
      logs.forEach((t) => g.log.push({ turn: g.turn, text: `${p.name}: ${t}`, kind: 'neg', importance: 1 }));
    }
    // cambio económico raro
    if (Math.random() < 0.08) {
      const ne = g.world.economy === 'good' ? 'bad' : 'good';
      g.world.economy = ne; g.world.wageMult = ne === 'good' ? 1 : 0.8; g.world.salesMult = ne === 'good' ? 1 : 0.8;
      g.log.push({ turn: g.turn, text: `La economía cambió a ${ne === 'good' ? 'buen año' : 'mal año'}`, kind: ne === 'good' ? 'pos' : 'neg', importance: 2 });
    }
    setGame({ ...g });
    setQueue(pend); setQi(0);
    if (pend.length === 0) finishTurn(g);
  }

  function advanceQueue() {
    if (qi + 1 < queue.length) { setQi(qi + 1); }
    else { setQueue([]); finishTurn(game!); }
  }

  function finishTurn(g0: GameState) {
    const g: GameState = structuredClone(g0);
    const winner = g.players.find((p) => hasWon(p, g.goals));
    if (winner) {
      g.over = true; g.winnerId = winner.id;
      commit(g, true);
      setPhase('victory');
      return;
    }
    g.turn++; g.activePlayerIndex = 0;
    for (const p of g.players) p.timeLeft = HOURS_PER_TURN;
    commit(g, true); // autosave al cerrar quincena
  }

  const acts = actionsFor(active, game.world);

  return (
    <>
      <Hdr />
      <Board game={game} onMove={moveTo} />

      <div className="card">
        <div className="turnbar">
          <div className="who">Turno de {active.name} — {Math.round(active.timeLeft)}h</div>
          <div>Quincena {game.turn} · {game.world.economy === 'good'
            ? <span className="econ-good">● buen año</span> : <span className="econ-bad">● mal año</span>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canRetire(active, game.turn) && <button onClick={retire} title="Modo Legado">Pasar el legado ✦</button>}
            <button className="primary" onClick={endPlayerTurn}>Terminar mi quincena ▶</button>
          </div>
        </div>
        <div className="section-tag">Acciones en {locById(active.currentLocation).name}</div>
        <div className="actions">
          {acts.length === 0
            ? <div className="pmeta">No hay acciones aquí. Muévete o termina tu quincena.</div>
            : acts.map((a, i) => (
              <button key={a.id} onClick={() => doAction(i)}>
                <span>{a.label}</span><span className="desc">{a.desc}</span>
              </button>
            ))}
        </div>
        <div className="saveline">{savedAt ? `Guardado automático ${savedAt} · local + Nostr` : 'Se guarda solo al cerrar cada quincena'}</div>
      </div>

      <div className="players-row">
        {game.players.map((p) => <PlayerCard key={p.id} p={p} game={game} />)}
      </div>

      <div className="card">
        <div className="section-tag">Tu historia (eventos recientes)</div>
        <div className="log">
          {[...game.log].slice(-14).reverse().map((l, i) => (
            <div key={i} className={'logline ' + (l.kind === 'pos' ? 'ev-pos' : l.kind === 'neg' ? 'ev-neg' : '')}>
              Q{l.turn} · {l.text}
            </div>
          ))}
        </div>
      </div>

      {queue.length > 0 && qi < queue.length && (
        <EventModal pend={queue[qi]} onNext={advanceQueue} />
      )}
      {flash && (
        <div className="modal-bg"><div className="modal"><div className="body">{flash}</div>
          <button className="primary" onClick={() => setFlash(null)}>Ok</button></div></div>
      )}
    </>
  );
}

function Hdr() {
  return (
    <header>
      <div className="title">JOSÉ EN LA VIDA ADULTA</div>
      <div className="ver">v0.90 · un simulador de Cuenca, Ecuador</div>
      <div className="sub">"No importa cuántas veces cambie el camino. Lo importante es seguir avanzando."</div>
    </header>
  );
}

function Setup({ onStart }: { onStart: (g: GameState) => void }) {
  const [n, setN] = useState(1);
  const [names, setNames] = useState<string[]>(['José']);
  const [step, setStep] = useState<1 | 2>(1);

  function go() {
    const arr = Array.from({ length: n }, (_, i) => names[i] || (i === 0 ? 'José' : 'Jugador' + (i + 1)));
    setNames(arr); setStep(2);
  }
  function start() {
    const players = names.slice(0, n).map((nm, i) => ({ id: 'p' + i, name: nm.trim() || 'Jugador' + (i + 1) }));
    onStart(newGame(players, DEFAULT_GOALS));
  }
  function resume() {
    const g = loadLocal();
    if (g) onStart(g);
  }

  return (
    <>
      <Hdr />
      <div className="card">
        <div className="section-tag">Nueva partida — 1 a 4 jugadores, por turnos quincenales</div>
        {step === 1 && (
          <div className="row">
            <label>¿Cuántos jugadores? (1-4)</label>
            <input type="number" min={1} max={4} value={n}
              onChange={(e) => setN(clamp(parseInt(e.target.value) || 1, 1, 4))} style={{ width: 80 }} />
            <button onClick={go}>Continuar</button>
          </div>
        )}
        {step === 2 && (
          <>
            {Array.from({ length: n }).map((_, i) => (
              <div className="row" key={i}>
                <label>Nombre jugador {i + 1}</label>
                <input type="text" maxLength={14} value={names[i] || ''}
                  onChange={(e) => { const a = [...names]; a[i] = e.target.value; setNames(a); }} />
              </div>
            ))}
            <div className="row"><button className="primary" onClick={start}>Empezar a jugar</button></div>
          </>
        )}
        {hasLocalSave() && (
          <div className="row"><button onClick={resume}>Continuar partida guardada</button></div>
        )}
      </div>
    </>
  );
}

function Board({ game, onMove }: { game: GameState; onMove: (id: string) => void }) {
  const active = game.players[game.activePlayerIndex];
  return (
    <div className="board-wrap">
      <div className="board-title">CUENCA · click en una zona para moverte</div>
      <div className="board">
        <svg className="links" viewBox="0 0 640 320">
          {LINKS.map(([a, b], i) => {
            const la = locById(a), lb = locById(b);
            return <line key={i} x1={la.x} y1={la.y} x2={lb.x} y2={lb.y} stroke="#2a2a2a" strokeWidth={2} strokeDasharray="3 4" />;
          })}
        </svg>
        {LOCATIONS.map((loc) => {
          const here = loc.id === active.currentLocation;
          const cost = loc.tc[active.transport];
          const reachable = !here && active.timeLeft >= cost;
          const isHome = loc.id === active.birthBarrio;
          const pawns = game.players.filter((p) => p.currentLocation === loc.id);
          return (
            <div key={loc.id} className={'node' + (here ? ' here' : '') + (reachable ? ' reachable' : '')}
              style={{ left: loc.x, top: loc.y }} onClick={() => onMove(loc.id)}>
              <span className="code">{loc.code}</span>
              <span className="nm">{loc.name}</span>
              {isHome && <span className="nm" style={{ color: 'var(--gold)', WebkitTextFillColor: 'var(--gold)' }}>🏠 casa</span>}
              {here ? <span className="nm">aquí</span> : <span className="cost">{cost}h</span>}
              <div className="pawns">
                {pawns.map((p) => (
                  <span key={p.id} style={{ color: PLAYER_COLORS[p.colorIndex], WebkitTextFillColor: PLAYER_COLORS[p.colorIndex] }}>
                    {p.id === active.id ? '★' : '●'}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricBar({ label, val, goal, color }: { label: string; val: number; goal: number; color: string }) {
  const pct = Math.min(100, (val / goal) * 100);
  return (
    <div className="metric">
      <div className="lab"><span>{label}</span><span>{Math.round(val)} / {goal}{val >= goal ? <span className="check"> ✓</span> : ''}</span></div>
      <div className="barbg"><div className="barfill" style={{ width: pct + '%', background: color }} /></div>
    </div>
  );
}

function PlayerCard({ p, game }: { p: PlayerState; game: GameState }) {
  const m = metrics(p);
  const col = PLAYER_COLORS[p.colorIndex];
  const active = p.id === game.players[game.activePlayerIndex].id;
  const loc = locById(p.currentLocation);
  const eduCount = p.education.completed.length;
  return (
    <div className={'pcard' + (active ? ' active' : '')}>
      <div className="pname" style={{ color: col, WebkitTextFillColor: col }}>{active ? '▶ ' : ''}{p.name}{p.generation > 1 ? ` (gen.${p.generation})` : ''}</div>
      <div className="pmeta">
        nació en {locById(p.birthBarrio).name} 🏠 · ahora en {loc.name}<br />
        {p.job ? `${p.job.title}` : 'sin empleo'} · <b>{careerTitle(p.careerLevel)}</b><br />
        tiempo <b>{Math.round(p.timeLeft)}</b>/112h · <span className="money">${p.liquidity}</span> · banco ${p.bank}<br />
        estudios: {eduCount ? p.education.completed.join(', ') : '—'}{p.education.enrolledId ? ` (cursando ${p.education.enrolledId})` : ''}
      </div>
      <div className="famblock">
        <span className="famtag">Familia</span><br />
        {p.family.map((f, i) => (
          <span key={i}>
            <span style={{ color: col, WebkitTextFillColor: col }}>●</span> {f.rel} {f.name} <span className="famp">({f.pers})</span><br />
          </span>
        ))}
      </div>
      <MetricBar label="Patrimonio" val={m.patrimonio} goal={game.goals.patrimonio} color="var(--gold)" />
      <MetricBar label="Bienestar" val={m.bienestar} goal={game.goals.bienestar} color="var(--green)" />
      <MetricBar label="Conocimientos" val={m.conocimientos} goal={game.goals.conocimientos} color="var(--pink)" />
      <MetricBar label="Impacto" val={m.impacto} goal={game.goals.impacto} color="var(--magenta)" />
      <div className="subdims">
        impacto → prof {p.impact.profesional} · fam {p.impact.familiar} · com {p.impact.comunitario} · emp {p.impact.empresarial}
      </div>
    </div>
  );
}

function EventModal({ pend, onNext }: { pend: Pending; onNext: () => void }) {
  const { p, ev, silvered } = pend;
  const col = PLAYER_COLORS[p.colorIndex];
  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>
          <span style={{ color: ev.neg ? 'var(--red)' : 'var(--green)', WebkitTextFillColor: ev.neg ? 'var(--red)' : 'var(--green)' }}>{ev.neg ? '✗' : '✦'}</span>{' '}
          <span style={{ color: col, WebkitTextFillColor: col }}>{p.name}</span> — {ev.title}
        </h3>
        <div className="body">{ev.body}</div>
        {silvered && ev.sl && <div className="silver">↪ {ev.sl}</div>}
        <button className="primary" onClick={onNext}>Continuar</button>
      </div>
    </div>
  );
}

function Victory({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const winner = game.players.find((p) => p.id === game.winnerId) || game.players[0];
  const col = PLAYER_COLORS[winner.colorIndex];
  const [realName, setRealName] = useState('');
  const [saved, setSaved] = useState(false);
  const hist = game.log.filter((l) => l.importance >= 2).slice(-10);

  async function saveStory() {
    const summary = `${winner.name} alcanzó sus metas en la quincena ${game.turn}.\n` +
      hist.map((l) => `Q${l.turn} · ${l.text}`).join('\n');
    await publishStory(realName || winner.name, summary);
    setSaved(true);
  }

  return (
    <>
      <Hdr />
      <div className="card">
        <div className="section-tag" style={{ fontSize: 16 }}>🏆 Victoria</div>
        <div style={{ fontSize: 24, fontWeight: 800, margin: '8px 0', color: col, WebkitTextFillColor: col }}>
          {winner.name} alcanzó sus metas en la quincena {game.turn}
        </div>
        <p className="pmeta">Patrimonio, bienestar, conocimientos e impacto: las cuatro al tiempo. Eso es una vida construida.</p>
        <div style={{ marginTop: 14 }}>
          <b>Momentos de tu historia:</b>
          {hist.map((l, i) => <div key={i} className="logline">Q{l.turn} · {l.text}</div>)}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <label>Tu nombre real (para guardar tu aventura)</label>
          <input type="text" value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="opcional" />
          <button onClick={saveStory} disabled={saved}>{saved ? 'Historia guardada en Nostr ✓' : 'Guardar mi historia'}</button>
        </div>
        <button className="primary" style={{ maxWidth: 240 }} onClick={onRestart}>Jugar de nuevo</button>
      </div>
    </>
  );
}
