# José en la Vida Adulta — v0.88

Simulador estratégico de vida adulta ambientado en Cuenca, Ecuador. Tributo libre a *Jones in the Fast Lane* con dos caminos: empleado o emprendedor.

> "No importa cuántas veces cambie el camino. Lo importante es seguir avanzando."

## Versión actual: v0.88 (CLI a colores)

Versión jugable en terminal — ASCII colorido, sin gráficos todavía. Los sprites y maquetas vienen después.

## Cómo jugar

```bash
npm install
npm run play
```

Te pregunta cuántos jugadores (1–4), nombres, y arrancas en el Barrio Residencial.

### Controles (cada quincena, por jugador)
- `m` — moverse a otra zona
- `a` — ejecutar acción local
- `d` — ver detalle del jugador
- `p` — pasar (terminar tu tiempo y disparar el evento del turno)
- `q` — salir

### Las 4 métricas
- **Patrimonio** (oro) — liquidez + banco + negocios + vehículos
- **Bienestar** (verde) — salud, felicidad, estrés invertido
- **Conocimientos** (rosa) — knowledge formal + experiencia
- **Impacto** (magenta) — reputación + liderazgo

Ganas cuando alcanzas simultáneamente las 4 metas configuradas.

## Arquitectura

```
src/
  types/        tipos puros (GameState, PlayerState, GameEvent, ...)
  engine/       lógica pura (eventBus, timeEngine, cosasQuePasanEngine, metrics)
  data/         tablas estáticas (locations, jobs, events)
  store/        createInitialState
  cli/          render ANSI, acciones, loop de juego
```

### Reglas duras de diseño
- `GameState` **inmutable**: todo cambio retorna un nuevo estado.
- Todo efecto pasa por el **Event Bus** (`applyEffect`/`applyEffects`).
- Todo evento negativo **TIENE** `silverLining` — validado en runtime al cargar `events.ts`.
- 1 evento como máximo por jugador por quincena, y 25% de las veces no pasa nada. El destino es ~70-80% decisiones.
- `experience` y `knowledge` sin tope; el resto de stats se clampean 0-100.

## Tests

```bash
npm test
npm run typecheck
```

## Próximos pasos

- Semana 3: más acciones por locación (estudiar en universidad formal, contratar empleados).
- Semana 4: sistema familiar generado proceduralmente.
- Semana 5: Modo Legado.
- Semana 6+: UI gráfica con sprites de José y los edificios, persistencia en Nostr.
