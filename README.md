# José En La Vida Adulta — v0.90

**El juego de la vida**, ambientado en Cuenca, Ecuador. Tributo libre a *Jones in the Fast Lane* (Sierra On-Line, 1990) — el viejo "juego de la vida" en disquete — llevado más allá.

> "No importa cuántas veces cambie el camino. Lo importante es seguir avanzando."

🎮 **Jugar:** https://jfcarpiopuntocom.github.io/jose-en-la-vida-adulta/

## Qué es

1 a 4 jugadores, por turnos **quincenales** (hotseat, uno se turna por mesa — como en Jones). Cada jugador nace al azar en un barrio real de Cuenca con una familia procedural propia, y se mueve por un **tablero** de la ciudad tomando decisiones: estudiar, trabajar, ascender, emprender, contratar gente, criar una familia, dejar un legado. El tiempo es el recurso escaso — esa es la mecánica central.

Al ganar (alcanzar las 4 metas a la vez), se pide tu nombre real para guardar tu historia. Antes de eso solo eres "Jugador 1", "Jugador 2"...

## El tablero

13 paradas funcionales en un recorrido tipo loop (Casa, Universidad/UDA, Z. Financiera, Terminal Terrestre, Z. Industrial, Hospital, Feria Libre, Centro Histórico, Parque Calderón, Río Tomebamba, Municipio, Mall del Río, Estadio) — no son zonas sueltas, es un tablero por el que tu ícono camina, como en Monopoly/Jones.

**Los barrios de nacimiento son una lista aparte**, sin posición en el tablero: 18 barrios reales de Cuenca (María Auxiliadora, Bellavista, San Sebastián, El Vado, Todos Santos, Remigio Crespo, Totoracocha, Yanuncay, El Vergel, Sayausí, Monay, etc.) — núcleo tradicional del Centro + alrededores del río. Ahí solo naces; "Tu Casa" en el tablero es el lugar genérico donde descansas y ves a tu familia, sin importar tu barrio de origen.

**Tiempos de viaje calibrados a Cuenca real.** Cuenca tiene tranvía y es una ciudad compacta — cruzar el centro a pie toma 15-20 minutos reales, llegar a la periferia (Terminal, Z. Industrial) 45-70 minutos. Nada que ver con los tiempos de Quito, Guayaquil o incluso Ambato. Los costos de movimiento del juego reflejan eso: la mayoría de trayectos cuestan fracciones de hora, no horas completas.

## Las 4 métricas (todas a la vez para ganar)

- **Patrimonio** (oro) — liquidez + banco + negocios + vehículos
- **Bienestar** (verde) — salud, felicidad, estrés invertido
- **Conocimientos** (rosa) — conocimiento formal + experiencia
- **Impacto** (magenta) — red de 4 dimensiones: profesional, familiar, comunitario, empresarial

## Sistemas (espiral de complejidad — arrancan rudimentarios, expandibles)

- **Career Engine** — escalera de 9 peldaños (Aprendiz → Auxiliar → Asistente → Técnico → Supervisor → Coordinador → Jefe → Gerente → Director). Asciendes por experiencia + confiabilidad; la educación da un boost.
- **Education Engine** — árbol formal (bachillerato → técnico/universidad → especialización/maestría/doctorado) + técnica (electricidad, gastronomía) + autodidacta (ventas, programación).
- **Empleados persistentes** — contratas gente con honestidad/iniciativa/lealtad/competencia propias; cada quincena puede haber robo, innovación o renuncia según esos atributos.
- **Impacto como red (4D)** — cada acción/evento alimenta una dimensión distinta (profesional/familiar/comunitario/empresarial); el indicador mostrado es el promedio.
- **Modo Legado** — desde ~1 año de juego puedes "pasar el legado": tu heredero arranca con parte de tu patrimonio, reputación y resiliencia, generación tras generación.

## Diseño duro (no negociable)

- Todo evento negativo **tiene** un `silverLining` — validado en runtime al cargar `data.ts`, el juego no arranca si falta uno.
- ~25% de las quincenas no pasa nada al azar: el jugador retiene el timón. El destino es ~70-80% decisiones.
- Resiliencia es una estadística oculta.

## Stack

Vite + React 18 + TypeScript. Motor puro en `src/engine.ts` (+ `data.ts`, `types.ts`), UI en `src/App.tsx`. Persistencia en `src/nostr.ts`.

```
src/
  types.ts      tipos centrales (GameState, PlayerState, Location, Barrio, Effect, ...)
  data.ts       tablero (13 stops), barrios reales de Cuenca, empleos, grados, eventos
  engine.ts     lógica pura: familia, métricas, carrera, educación, empleados, eventos, legado
  nostr.ts      keypair, localStorage, publish a relays Nostr
  App.tsx       UI React: tablero, reloj de tiempo, acciones, modal de eventos
  styles.css    tema oscuro, accesible en iOS/WhatsApp
```

## Persistencia

- **localStorage** — autosave al cerrar cada quincena + "continuar partida guardada".
- **Nostr** (mejor esfuerzo, nunca bloquea el juego) — keypair propio generado en el navegador, guardado de partida como evento kind `30078`, historia al ganar como kind `1` en relays públicos (damus.io, nos.lol, nostr.band).
- **GitHub** (pendiente) — guardar scores/historias también en el repo está en el roadmap, no implementado aún.

## Deploy — importante

El token de `gh` de esta cuenta no tiene scope `workflow`, así que no se pueden pushear archivos de GitHub Actions. Pages está en modo **legacy**, sirviendo desde `main` → `/docs`.

```bash
npm run build        # genera /docs (vite build.outDir = 'docs')
git add docs && git commit -m "..." && git push
```

Si Pages tarda en reflejar el cambio:

```bash
gh api -X POST repos/jfcarpiopuntocom/jose-en-la-vida-adulta/pages/builds
gh api repos/jfcarpiopuntocom/jose-en-la-vida-adulta/pages/builds/latest --jq '.status+" "+.commit'
```

## Desarrollo local

```bash
npm install
npm run dev      # servidor local con HMR
npm run build    # build de producción a /docs
```
