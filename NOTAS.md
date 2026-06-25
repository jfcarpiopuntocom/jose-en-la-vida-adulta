# JELVA — Notas de desarrollo activo
# Última actualización: 2026-06-25

## Archivos clave
- `src/App.tsx` — todo el juego (componentes, lógica, JSX)
- `src/styles.css` — todo el CSS
- `src/citymusic.ts` — música procedural Web Audio API
- `src/data.ts` — LOCATIONS, JOBS, EVENTS, etc.
- `src/types.ts` — interfaces TypeScript
- `public/avatars/` — jose.png, player1-4.png
- `public/audio/jazz-cuenca.wav` — pista de fondo
- `docs/` — build de producción (GitHub Pages lee desde aquí)

## Deploy
```
npm run build   # genera docs/
git add src/ docs/
git commit -m "mensaje"
git push        # GitHub Pages actualiza en ~30s
```
URL: https://jfcarpiopuntocom.github.io/jose-en-la-vida-adulta/

## Estado del tablero (CSS)
- `--tc: 100px` en `:root` = dimensión corta de cada tile
- Tiles top/bottom: `height: var(--tc)`, `flex: 1` en ancho
- Tiles left/right: `width: var(--tc)`, `flex: 1` en alto
- Board: `width: 100%` — llena game-main completo
- Board-body: `height: calc(4 * var(--tc))` — 400px en desktop

## Estado del dashboard
- `#stats-panel`: `clamp(260px, 22vw, 340px)`
- `turn-banner-right`: columna flex con textos apilados (no más overlap)
- `.player-loc`, `.econ-line`: `text-overflow: ellipsis`

## Música
- BPM: 148, Speed: 1.28 (28% más rápido)
- Preload: buffer descargado en `arm()` al iniciar juego

## Avatares (PawnOverlay)
- Componente `PawnOverlay` en App.tsx (busca "PawnOverlay" ~línea 150)
- Usa `useLayoutEffect` + `getBoundingClientRect` en `[data-loc]` tiles
- `Portrait` component usa `/jose-en-la-vida-adulta/avatars/player{n}.png`
- Si imagen falla → fallback SVG de color

## Backups en src/
- `styles_2026-06-25_03-00.css` (antes del fix de splash)
- `styles_2026-06-25_03-15.css` (antes del fix masivo de tablero)
- `citymusic_2026-06-25_03-15.ts` (antes del speed bump)

## Estado reciente (2026-06-25 tarde)
- Reloj movido al board-center (debajo de "Quincena N"), mitad de tamaño (~50px), Verdana 11/13. TimeRing prop `compact`. Quitado del footer (footer ahora 64px).
- Acciones del lugar: auto-abren ~20s y hacen fade (.clerk-fading). Click/mouseover sobre el casillero actual reabren. Lógica: openActionsHere/closeActionsHere + useEffect de llegada; props fading/onReopen/onClose a Board.
- Legado (impact.comunitario) arranca en 0 (engine.ts) — 18 años, recién se lanza.
- Notificación board-toast compacta (max 300px) en banda central, no tapa tiles.
- Clerks: sprite fix (background-position %), grid-old.png. Header narrado (narrateHeadline). Feria Libre label dinámico (locName).
- Música: citymusic.ts prefiere public/audio/track.mp3 (nativo, loop, sin warp). JFC ya subió track.mp3 (6.2MB).
- Toggle velocidad José (slowJose) en footer.
- Recap fin de semana SIEMPRE dispara para humano (rollEvent force).
- Mobile: board protagonista, dashboard con tope de altura + scroll interno.

## Pendiente
- Verificar en PC/landscape que todo entra sin scroll-up con el nuevo layout.
- José VISIBLE jugando tile-por-tile (hoy solo toggle de velocidad; playback paso a paso requiere refactor de cpuTurn para emitir pasos). Confirmar con JFC si invertir.
- Celebración de logros (ej. bachillerato) con la familia si se llevan bien.
- Stops ocultos (feature futura, no tocar sin aprobación).
