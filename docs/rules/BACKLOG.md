# Backlog de reglamento (`/regla`)

Paquetes R-XX y decisiones D-XX. Reglas citadas por artículo de [REGLAMENTO.md](./REGLAMENTO.md); ciclo y gasto en [WORKFLOW.md](./WORKFLOW.md).

## Decisiones

| ID | Decisión | Estado |
|---|---|---|
| D-01 | El saque con pase (art. 5.2) y el gol directo anulado (art. 5.8) valen en **ambos modos**; los 5 s (art. 5.7) solo en reglamento, como el resto de `PASSIVITY`. | decidida (coordinador) |
| D-02 | Quién es local: el azul (equipo de la persona) es local, así que el rojo visitante abre la 1.ª parte y la prórroga, y el azul la 2.ª (art. 5.3). | decidida (coordinador); se revisa si el usuario lo pide |
| D-03 | Control del saque para la persona: igual que el libre indirecto (apuntar con el stick y soltar con pase o tiro). Sin botón, a los `KICKOFF_AUTO_MS` pasa solo al compañero del círculo para no atascar el partido. | decidida (coordinador) |
| D-04 | El libre indirecto **no** va a la escena 2.5D: sale ~21 veces por partido de 4 min (humo E-99: 431 en 20 partidos) frente a ~4 penaltis y directos, y es un pase, no un duelo con el portero. Se mejora su apuntado en la cámara del partido (R-06). | decidida (usuario, 2026-11-21) |
| D-05 | En el saque de centro, entre el pitido y el pase el resto queda quieto como en el libre indirecto (el rival entra al soltar): la IA pasa a los `KICKOFF_AI_AIM_MS` y la persona tiene `KICKOFF_AUTO_MS` antes del pase automático al compañero del círculo. R-01 baja a `regla-builder` porque copia el apuntado de `updateFoulRestartState`. | decidida (coordinador) |

## Estado

| ID | Paquete | Agente · modelo | Depende de | Estado |
|---|---|---|---|---|
| R-05 | Contadores del saque en el humo y base | regla-builder · sonnet | — | ✅ |
| R-01 | Saque de centro con pase | regla-builder · sonnet | R-05 | ✅ |
| R-02 | Cinco segundos tras el saque | regla-builder · sonnet | R-01 | ⏳ |
| R-03 | Gol directo de saque o libre indirecto anulado | regla-engineer · opus | R-01 | ⏳ |
| R-04 | El visitante abre el partido | coordinador | — | ✅ |
| R-06 | Apuntado del libre indirecto: receptor y línea de pase | regla-builder · sonnet | R-03 | ⏳ |
| R-99 | Cierre: humo 20 × 2 modos y partido del usuario | regla-qa · haiku | R-01..R-04 | ⏳ |

## R-05 — Contadores del saque en el humo y base

- **Objetivo:** que el humo mida el saque antes de cambiarlo. En `matchStats.ts`, por equipo: saques, saques en que el que saca juega la bola antes de que nadie la toque, ms del pitido a que la bola entre en campo rival, saques en que el rival toca primero en ≤ 3 s, libres por los 5 s (0 hasta R-02), goles anulados por art. 5.8/7.3.b (0 hasta R-03). Salen en `[smoke-agg]` con la forma que lee `bal-compare`.
- **Además:** evento `at=kickoff` en `src/scenes/lab/labAt.ts` (`detect`, ~115: pasa a true cuando `activeKickoff` vuelve a null, es decir, al pitar), para capturar `after=<ms>` del pitido.
- **Archivos:** `src/game/systems/matchStats.ts`, `src/scenes/lab/labAt.ts`; si hace falta un evento, `match:kickoff` ya existe en `MatchScene.updateKickoff`.
- **Aceptación:** build; humo 20 reglamento + 20 arcade en main → `docs/rules/smoke/<fecha>-base.txt` con los contadores nuevos y el resto dentro de ruido.

## R-01 — Saque de centro con pase (art. 5.2, 5.6, 5.7, D-03)

- **Objetivo:** al pitar, el que saca no recibe la posesión: está pegado a la bola y la juega con un pase o un tiro (adelante o atrás). El rival puede entrar desde el pitido. La IA pasa al compañero del círculo o en largo según el patrón de los libres del rojo. La persona apunta y suelta como en el libre indirecto.
- **Diagnóstico:** `MatchScene.updateKickoff` (~1442) pone `ballCarrierId = taker.id` al pitar. Humo de R-05 (5 corridas): el que saca suelta la bola al primer paso (16,7 ms) y siempre cruza al instante; el rival nunca la gana en 3 s. El patrón de apuntar y soltar ya está en `MatchScene.updateFoulRestartState` (1500–1567), así que el paquete puede bajar a `regla-builder` si el encargo lo deja en copiar ese patrón. El patrón de «apuntar y soltar» está en `matchFlow.updateFoulRestartState` (412–444) y su uso en `MatchScene`.
- **Archivos:** `matchFlow.ts` (bloque del saque), `MatchScene.ts` (`updateKickoff` y la resolución del pase de saque), `constants.ts` (`KICKOFF_AUTO_MS`, `KICKOFF_AI_AIM_MS`), `types.ts` (`ActiveKickoff`).
- **Aceptación:** humo 20 × 2 modos: % de saques jugados por el que saca ≈ 100 %, 0 atascos, goles/min dentro de ruido frente a la base. 3 capturas `at=kickoff` (colocación, pitido, pase).

## R-02 — Cinco segundos tras el saque (art. 5.7, D-01)

- **Objetivo:** tras el saque, el equipo que saca tiene `PASSIVITY.kickoffMs` (5000) para meter la bola en campo rival; si no, libre indirecto para el rival como el tiempo de posesión. Cuenta atrás en el HUD como la de posesión y urgencia para la IA por `passivityView`.
- **Patrón:** `passivity.ts` (límite `ownHalfMs` y `registerPassivity`); hoy un hueco entre pasos reinicia la posesión (`resumeGapMs`), así que el saque necesita una marca propia.
- **Archivos:** `passivity.ts`, `constants.ts` (`PASSIVITY`), `rules.ts` (mensaje), `MatchScene.ts` (marcar el saque, una línea).
- **Aceptación:** humo 20 reglamento: libres por 5 s ≤ 0,2 por partido (la IA cruza a tiempo), ms del pitido a campo rival < 5000 de media, resto en ruido.

## R-03 — Gol directo de saque o libre indirecto anulado (art. 5.8, 7.3.b)

- **Objetivo:** si la bola de un saque de centro o de un libre indirecto entra en la portería rival sin tocar a otro jugador ni la portería, el gol no sube: aviso del árbitro y libre indirecto desde la esquina inferior del área más cercana a donde entró la bola (en el saque de centro) o saque neutral en la esquina (resto de 7.3).
- **Diagnóstico pendiente:** el coordinador localiza la validación de gol y si ya existe un reinicio desde la esquina del área (rebote en el cuerpo, art. 7.3.a) antes de despachar; si existe, el paquete baja a `regla-builder`.
- **Aceptación:** humo 20 × 2 modos con los goles anulados contados; capturas del aviso con un caso forzado en el laboratorio.

## R-04 — El visitante abre el partido (art. 5.3, D-02)

- **Objetivo:** `nextKickoffTeam` empieza en rojo (`MatchScene` ~148, ~246 y `resetKickoff('blue', true)` ~414) y la 2.ª parte la abre el azul (`startSecondHalf` ~1750). Prórroga igual que la 1.ª parte.
- Trivial: el coordinador, sin agente.

## R-06 — Apuntado del libre indirecto (D-04)

- **Pedido (2026-11-21):** dar más presencia al libre indirecto sin escena 2.5D (D-04).
- **Objetivo:** mientras apunta la persona, el indicador marca al compañero que recibiría el pase (el mismo que elegiría `tryPass`) y la línea de pase, libre o tapada por un rival. También en el saque de centro de R-01, que usa el mismo apuntado.
- **Diagnóstico pendiente:** `MatchScene.drawAimIndicator` (llamado ~1536) y la elección de receptor de `tryPass`; el coordinador da rangos al despachar. Indicador horneado o reutilizado, sin formas nuevas por fotograma (perf §5); colores en `artSpec.ts`.
- **Aceptación:** build; 3 capturas `at=foul` (libre con línea libre, tapada y en saque de centro); humo de 5 sin cambios fuera de ruido (solo pinta).

## R-99 — Cierre

- Humo 20 × reglamento y 20 × arcade en main contra la base de R-05; tabla de estado de REGLAMENTO.md al día; un partido del usuario (táctil y mando) para el control del saque.
