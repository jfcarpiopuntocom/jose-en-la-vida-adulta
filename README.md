# José En La Vida Adulta — v0.91

**El juego de la vida adulta**, ambientado en Cuenca, Ecuador.
Tributo libre a *Jones in the Fast Lane* (Sierra On-Line, 1990) — el viejo "juego de la vida" en disquete — llevado más allá con mecánicas modernas, barrios reales y una tesis sobre cómo construir una vida con criterio.

> "No importa cuántas veces cambie el camino. Lo importante es seguir avanzando."

🎮 **Jugar:** https://jfcarpiopuntocom.github.io/jose-en-la-vida-adulta/

---

## El tema central

**El tiempo es el recurso escaso.** No el dinero. No el talento. El tiempo.

Cada quincena son 112 horas. Decides dónde invertirlas — trabajo, familia, educación, negocios, descanso. Las cuatro métricas para ganar (Patrimonio, Bienestar, Conocimientos, Impacto) deben cumplirse *todas a la vez*. No sirve ser rico si no tienes salud. No sirve ser culto si no has dejado huella.

---

## Dos rutas, una lección

El juego propone dos caminos que se bifurcan y que se necesitan mutuamente:

**Ruta empleado:** escalera de 9 peldaños (Aprendiz → Director). El empleado comprometido sostiene la empresa, genera valor real y merece aprecio genuino — no es un recurso intercambiable.

**Ruta empresario:** emprender requiere capital, clientes, empleados y resiliencia. El emprendedor crea el espacio donde otros pueden crecer.

**La lección que une ambas rutas:** hay aprecio mutuo necesario entre empleado y empresario. El uno no existe sin el otro. El juego lo muestra en ambas direcciones — no hay ruta superior.

### Negocio → Empresa: el salto que más cuesta

Un negocio con empleados que depende del fundador para apagar todos los fuegos no es una empresa — es un autoempleo de alta complejidad. El salto a empresa ocurre cuando existen **procedimientos documentados y manuales claros** que permiten que el sistema funcione sin que el fundador esté presente en cada decisión. Sin eso, la dependencia del fundador es total y el negocio no escala.

---

## El tablero

13 paradas funcionales en un loop cerrado inspirado en Jones/Monopoly:

| Stop | Zona | Color |
|---|---|---|
| 🏠 Tu Casa | Hogar | Dorado |
| 🎓 Universidad (UDA) | Educativa | Violeta |
| 🏦 Z. Financiera | Financiera | Amarillo |
| 🚌 Terminal Terrestre | Transporte | Cielo |
| 🏭 Z. Industrial | Industrial | Naranja |
| 🏥 Hospital | Salud | Rosa |
| 🛒 Feria Libre | Comercial | Teal |
| ⛪ Centro Histórico | Centro | Ámbar |
| 🌳 Parque Calderón | Naturaleza | Verde |
| 🌉 Río Tomebamba | Río | Azul |
| 🏛️ Municipio | Político | Azul oscuro |
| 🛍️ Mall del Río | Comercial | Cian |
| ⚽ Estadio | Deporte | Lima |

**Barrios de nacimiento** (lista separada — no son stops del tablero): 18 barrios reales de Cuenca, núcleo histórico + alrededores del río. San Sebastián, El Vado, Todos Santos, Las Herrerías, El Ejido, Yanuncay, Remigio Crespo, Gran Colombia, Totoracocha, Miraflores, Bellavista, María Auxiliadora, Sayausí, Monay, El Arenal, etc.

**Tiempos calibrados a Cuenca real:** ciudad compacta con tranvía. La mayoría de trayectos cuestan 0.15–0.5h. Periferia (Terminal, Z. Industrial) 0.5–1.2h. Muy por debajo de Quito, Guayaquil o Ambato.

---

## Las 4 métricas (todas a la vez para ganar)

- **Patrimonio** `●` liquidez + banco + negocios + vehículos
- **Bienestar** `●` salud, felicidad, estrés invertido
- **Conocimientos** `●` educación formal + experiencia + autodidacta
- **Impacto** `●` red de 4 dimensiones: profesional, familiar, comunitario, empresarial

---

## Sistemas

- **Career Engine** — 9 peldaños: Aprendiz → Auxiliar → Asistente → Técnico → Supervisor → Coordinador → Jefe → Gerente → Director
- **Education Engine** — árbol formal (bachillerato → técnico/universidad → especialización/maestría/doctorado) + técnica + autodidacta
- **Empleados persistentes** — honestidad, iniciativa, lealtad, competencia propias; cada quincena puede haber robo, innovación o renuncia
- **Impacto 4D** — cada acción/evento alimenta una dimensión independiente
- **Modo Legado** — desde ~1 año puedes pasar el antorcha: heredero arranca con parte de tu patrimonio y reputación

---

## Diseño duro

- Todo evento negativo **tiene** un `silverLining` — el juego no arranca sin él (validación en runtime)
- ~25% de quincenas sin evento aleatorio: el jugador retiene el timón
- El destino es ~70-80% decisiones
- Resiliencia es una estadística oculta que crece con cada adversidad

---

## Visual

Tema cinematográfico oscuro (Claude Design): fuente Cinzel + Nunito, partículas flotantes, atmósfera de gradientes radiales, nodos con color semántico por tipo de lugar, animación de path tipo "marching ants", panel de stats fijo a la derecha, barra de acciones en la parte inferior, panels colapsables (indicadores, historia, about).

---

## Stack

Vite + React 18 + TypeScript. Motor puro en `src/engine.ts` (+ `data.ts`, `types.ts`), UI en `src/App.tsx`. Persistencia en `src/nostr.ts`.

```
src/
  types.ts      tipos centrales
  data.ts       tablero (13 stops), barrios reales, empleos, grados, 33 eventos
  engine.ts     lógica pura: familia, métricas, carrera, educación, empleados, eventos, legado
  nostr.ts      keypair, localStorage, publish a relays Nostr
  App.tsx       UI React: tablero cinematográfico, overlays HUD, lid panels
  styles.css    tema oscuro cinematográfico, iOS/WhatsApp seguro
```

---

## Persistencia

- **localStorage** — autosave al cerrar cada quincena
- **Nostr** (mejor esfuerzo) — keypair generado en el navegador, partida como kind `30078`, historia al ganar como kind `1`
- **GitHub** — pendiente en roadmap

---

## Deploy

Token sin scope `workflow`. Pages en modo legacy desde `main` → `/docs`.

```bash
npm run build        # genera /docs
touch docs/.nojekyll # necesario después de cada build (Vite limpia /docs)
git add docs && git commit -m "..." && git push
# Si Pages tarda:
gh api -X POST repos/jfcarpiopuntocom/jose-en-la-vida-adulta/pages/builds
```

---

## Desarrollo local

```bash
npm install
npm run dev      # HMR local
npm run build    # build de producción a /docs
```
