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

## Pendiente
- Verificar tablero ocupa 75-80% en PC (screenshot pendiente de JFC)
- Verificar overlay de avatares se mueve correctamente
- Setup screen: verificar 2-columnas en PC (fix cascade especificidad)
- Stops ocultos (feature futura, no tocar sin aprobación)
