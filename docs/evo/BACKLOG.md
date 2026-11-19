# Backlog evolutivo (E-XX)

Proceso en [WORKFLOW.md](./WORKFLOW.md). Estado: ⬜ pendiente · 🟨 en curso · ✅ aceptado · ❌ rechazado.

## Estado

| E-XX | Título | Agente · modelo | Estado |
|---|---|---|---|
| E-00 | Humo ampliado y referencia | coordinador | ✅ 2026-11-19 |
| E-01 | Sesgo rojo/azul en IA contra IA | coordinador | ✅ 2026-11-19 |
| E-02 | IA de equipo: desmarques, presión y repliegue, pase o tiro | ai-engineer · opus | ✅ 2026-11-19 |
| E-03 | Portero: IA, movimientos raros y portero seleccionable | ai-engineer · opus | 🟨 |
| E-04 | Niveles de dificultad | ai-engineer · opus (+ UI sonnet) | ⬜ |
| E-05 | Reglas: faltas de equipo, libre directo, penalti, saque neutral | coordinador | 🟨 |
| E-12 | Transiciones sin teletransporte: gol, saque de centro, descanso | coordinador | 🟨 |
| E-13 | Sombra de los jugadores y marcador del seleccionado | coordinador | ⬜ |
| E-10 | Animación: pendientes del portero, respiración y C de espaldas | gfx-engineer · opus | ✅ 2026-11-19 |
| E-11 | Animación: frenada, giro, inclinación, celebración, caída, recepción | gfx-engineer · opus | ✅ 2026-11-19 |
| E-99 | Cierre: humo final, prueba de niveles, informe | coordinador + perf-qa · haiku | ⬜ |

IA (E-01…E-04) y animación (E-10, E-11) van en paralelo en worktrees distintos: no comparten archivos.

---

## E-00 — Humo ampliado y referencia

**Objetivo:** el informe del humo da, por equipo, pases intentados y completados, tiros, a puerta, paradas de su portero, posesión (% del tiempo) y robos. Referencia de 20 corridas por modo en main.
**Archivos:** `src/scenes/lab/labSmoke.ts`, `tools/gfx-smoke.ps1`.
**Aceptación:** build; 20 corridas por modo sin fallidas ni errores; salida en `docs/evo/smoke/`.
**Hecho:** `smoke/2026-11-19-referencia-main.txt`. Los tiros ahora siguen el lado de cada equipo: con partes de 3 min, el humo de 240 s cruza el descanso y antes contaba los tiros de la 2.ª parte hacia la portería equivocada. Reglamento: 1,21 ± 0,26 goles/min, 33,8 ± 3,6 % de pases completados, 25,9 ± 1,7 robos/min, posesión azul 50,3 ± 1,2 %. Arcade: 2,10 ± 0,20 goles/min, 36,0 ± 3,0 % de pases, 35,6 ± 1,2 robos/min.

## E-01 — Sesgo rojo/azul

**Objetivo:** explicar y quitar la ventaja del rojo en IA contra IA (+0,2 a +0,4 goles/min en la referencia anterior). Sospechas: el azul controlado apunta con `SHOT_ASSIST_BLEND_HUMAN` aunque lo lleve el piloto automático (`targeting.ts`); los saques del azul en el humo se hacen con un pulso hacia delante y los del rojo apuntan (`matchFlow.ts`); el orden de iteración de los equipos.
**Archivos:** `systems/targeting.ts`, `scenes/lab/labSmoke.ts` y, si hace falta, el saque de IA en `systems/matchFlow.ts`.
**Aceptación:** `redMinusBluePerMin` con IC 95 % que contiene el 0 en los dos modos. El juego humano contra IA no cambia.
**Hecho:** la causa era el apuntado. Con piloto automático el azul tiraba con `SHOT_ASSIST_BLEND_HUMAN` (0,75); en arcade tiraba más que el rojo (6,3 frente a 5,3/min) y marcaba menos (0,80 frente a 1,30). Ahora `getAssistedShotDirection` usa la ayuda de la IA también con `autopilot.on`. Rojo − azul: arcade 0,50 ± 0,34 → −0,01 ± 0,34; reglamento 0,29 ± 0,26 → 0,21 ± 0,27. **Nueva referencia** para la IA: `smoke/2026-11-19-E01-apuntado.txt` (reglamento 1,34 ± 0,24 goles/min, 36,5 ± 2,6 % pases; arcade 2,44 ± 0,25, 37,9 ± 2,9 %).

## E-02 — IA de equipo

**Objetivo:** desmarques y apoyos con línea de pase libre; presión al portador y repliegue por zonas según dónde está la bola; elegir pase o tiro con una valoración (ángulo, distancia, presión, compañero mejor colocado) en vez de probabilidades fijas por paso.
**Archivos:** `systems/ai.ts` (dividir si pasa de 500 líneas, p. ej. `systems/aiTeam.ts`), `systems/playerControl.ts`, `systems/targeting.ts`, constantes `AI_*` de `constants.ts`, el bloque `updateTeamAI` de `MatchScene.ts`.
**Aceptación:** humo frente a la referencia de E-00/E-01: más pases completados por minuto y % de pases completados mayor (IC sin solapar); goles/min dentro de ±30 % de la referencia; 0 atascos, 0 errores, 0 jugadores fuera de pista. Partido visto en vivo sin jugadores amontonados ni temblores.

**Hecho:** plan de equipo por paso (`aiTeam.ts`: apoyo corto, ala lejana, pivot entre líneas, reparto por permutación de menor coste; bola suelta a quien antes corta su trayectoria), defensa con presionador, cortador de la línea más peligrosa y zona (`aiDefense.ts`), decisión pase/tiro/conducir con valoración y tiempo de reacción (`aiDecision.ts`), perfil `AiProfile` con `aiProfileFor(team)` preparado para E-04. Humo de 20 (`smoke/2026-11-19-E02-ia-equipo.txt`): reglamento 1,48 ± 0,25 goles/min (ref. 1,34 ± 0,24), 90,7 % de pases completados (ref. 36,5), 14,2/12,2 completados/min azul/rojo; arcade 2,26 ± 0,26 (ref. 2,44 ± 0,25), 88,0 % de pases. Rojo − azul contiene el 0 en los dos. 0 atascos, 0 errores. Las faltas en reglamento suben a 12/min por la presión: las baja E-05.

## E-03 — Portero

**Objetivo:** (a) quitar los movimientos raros del portero (temblor, salidas y vueltas bruscas, giros de mirada): suavizado y zona muerta en su objetivo, sin perder paradas; (b) mejor colocación: ángulo, salida ante el mano a mano, reacción al tiro con tiempo de reacción; (c) **portero seleccionable** (pedido del usuario): el cambio de jugador puede pasar al portero propio; con él controlado se mueve con el mando dentro de su zona y para con la mano y el stick; al soltar la bola o con el cambio, vuelve a la IA.
**Archivos:** `systems/ai.ts` (portero), `systems/playerHelpers.ts`, `systems/playerControl.ts`, `systems/matchActions.ts` (parada), `systems/sceneFlow.ts` (cambio), constantes `GOALIE_*`, lo mínimo de `MatchScene.ts`.
**Aceptación:** humo: % de paradas dentro del IC de la referencia o mejor; capturas o vídeo de la tira del portero sin temblor; cambio al portero probado con teclado, mando y táctil.

## E-04 — Niveles de dificultad

**Objetivo:** cuatro niveles (FÁCIL, NORMAL, DIFÍCIL, EXPERTO) que cambian tiempo de reacción, precisión de pase y tiro, agresividad (presión y robo), acierto del portero y lectura de la jugada. No cambian la física.
**Parámetros:** tabla `DIFFICULTY` en `constants.ts`. Se elige en el menú y en los ajustes y se guarda en `localStorage` (`rh-difficulty`). `?diffBlue=` y `?diffRed=` lo fijan por equipo en el laboratorio.
**Ayuda arcade (`ARCADE_RUBBER_BAND_*`):** decisión: se mantiene para el humano; la IA solo recibe la ayuda en FÁCIL y NORMAL (en DIFÍCIL y EXPERTO no).
**Aceptación:** prueba de WORKFLOW §3.2; NORMAL dentro del IC de la IA anterior al partido humano; build; menú y ajustes revisados en escritorio y móvil.
**Pedido del usuario (tras E-02):** «el truco estará en un buen balanceo y los niveles de dificultad»; con controles táctiles el juego es más difícil, así que la IA baja algo más (un ajuste táctil sobre el nivel elegido). La IA de E-02 completa ~90 % de pases: en FÁCIL y NORMAL debe fallar pases y leer peor las líneas, para que se pueda cortar.

## E-05 — Reglas y saques

**Pedido del usuario:** «las faltas también están mal hechas, debes revisar las reglas del hockey patines. nunca he visto un bully o un penalti».
**Fuente:** reglamento World Skate 2026 (versión española), art. 3, 5, 13, 17, 23, 24, 27–30.
**Objetivo:** faltas de equipo acumuladas en todo el partido (no se reinician en el descanso), libre directo en la 10.ª y cada 5 más, libre directo por ocasión clara, penalti dentro del área real (9 × 5,40 m delante de la línea de gol), tarjeta azul por falta grave (no cuenta como falta de equipo), libre indirecto con los rivales a 3 m y a 70 cm de la valla, en libre directo y penalti todos en el área contraria y el portero en la línea. Saque neutral (el antiguo bully) cuando la bola queda trabada, antes si es contra la valla; detrás de la portería, en la esquina del área. Reloj parado en los reinicios.
**Archivos:** `systems/rules.ts`, `systems/matchFlow.ts`, `systems/matchActions.ts`, `systems/matchClock.ts`, constantes de reinicio.
**Aceptación:** humo de 20 por modo dentro del IC de E-02; en reglamento salen penaltis, libres directos y saques neutrales; partido visto en vivo.
**Balance (decisión del usuario):** «hay que pensar en la gamificación y que es un juego y qué es divertido». No se busca el realismo estadístico: el libre directo y el penalti son momentos de tensión y deben salir. Probabilidades de falta al ~70 % de las de E-02 (con la mitad casi ningún equipo llegaba a la 10.ª). Objetivo: 1–2 libres directos por acumulación por partido, pocas tarjetas, sin parones continuos.
**Pendiente:** libre directo que coincide con el final de una parte, un solo remate sin rechace (art. 23.6).

## E-12 — Transiciones sin teletransporte

**Pedido del usuario:** «los jugadores se teletransportan en los goles, en los fines de tiempo… debería de continuar la animación, celebrar, volver al medio y hacer el saque. por cierto los saques de medio están mal hechos».
**Objetivo:** tras el gol se celebra y todos patinan a su sitio de saque de centro; saca el equipo que encajó (art. 5), con el que saca y un compañero dentro del círculo y los rivales fuera; el árbitro pita cuando están colocados. En el descanso cruzan el campo patinando. Solo el inicio del partido coloca de golpe.
**Archivos:** `systems/matchFlow.ts` (`resetKickoffState`, `updateKickoffState`, `skateToward`), `systems/sceneFlow.ts`, `scenes/MatchScene.ts`.
**Expulsado:** «en las tarjetas que causan expulsados no hay animación del expulsado saliendo al banquillo». El sancionado patina a la puerta de su banquillo («se ve una puerta delante de cada banquillo»), va por el pasillo hasta su asiento y vuelve a la pista por la misma puerta (`penPhase` en `movement.ts`, `penaltyDoor` en `render/rink/table.ts`). La sanción solo corre con el reloj en marcha.

## E-13 — Sombra y marcador del seleccionado

**Pedido del usuario:** «no te parece que hace un raro la perspectiva del campo con la sombra que proyectan los jugadores?» y «el marcador de jugador seleccionado tampoco me gusta cómo queda».
**Diagnóstico:** la sombra es una elipse 2,6 × 0,82 radios sobre los ejes del suelo, que ya vienen acortados por la cámara: queda unas tres veces más aplastada que el círculo central y se lee como vista de lado sobre un suelo visto casi desde arriba. El anillo blanco del seleccionado se confunde con las líneas de la pista.
**Objetivo:** sombra con la proporción del suelo; marcador del seleccionado que no parezca una marca de la pista y que diga hacia dónde mira.
**Archivos:** `systems/visuals.ts`, `entities/createPlayer.ts`, `render/artSpec.ts` (`PLAYER_UI`).
**Aceptación:** capturas de cerca antes y después en los dos modos y en móvil; banco movil-bajo sin regresión > 10 %.

## E-10 — Animación: pendientes

**Objetivo:** portero de rodillas distinguible de lado; respiración en parado visible pero sobria; la C de espaldas legible.
**Archivos:** `render/puppet/` (goalie, goalieClips, locomotion, pose), `render/artSpec.ts`.
**Aceptación:** capturas de las tiras de laboratorio antes/después; banco movil-bajo sin regresión > 10 %.
**Hecho:** rodilla del portero más baja y con las espinilleras hacia atrás (tira `kneelside`); respiración en parado con fase por jugador (`breath`); la C de espaldas leída como los cruces de patinar hacia atrás, con polo de rodilla propio (`backc`). Capturas en `shots/E-10/`.

## E-11 — Animación: nuevas

**Objetivo:** frenada y giro cerrado, inclinación al acelerar, celebración de gol, caída tras un choque, gesto al recibir. Revisar lo que ya existe (`setLocoState`, `fallProgress`, `celebrateGoal`) y llevarlo al listón de un indie publicado.
**Archivos:** `render/puppet/`, `systems/visuals.ts`, `render/artSpec.ts`; en `MatchScene.ts` solo un gancho en el pintado si no hay otra forma.
**Aceptación:** capturas de cada acción; partido en vivo; banco movil-bajo sin regresión > 10 %; calidad baja también se ve bien.
**Hecho:** derrape en cuña o en T con histéresis solo en frenadas fuertes (el cuerpo gira de lado con `skidTurn`), inclinación hacia delante al acelerar y de lado en las curvas, caída con la mano soltando el stick, recepción que amortigua con el tronco y dos celebraciones por id. Todo sale del estado existente al pintar. El giro del contenedor del choque arcade (`arcade.ts`, hasta 1,25 rad) se sumaba a la caída del rig: queda solo el tambaleo. Banco movil-bajo sin regresión (la base se midió con el equipo cargado). Capturas en `shots/E-11/`.

## E-99 — Cierre

Humo final en los dos modos frente a la referencia nueva, una prueba por nivel (goles encajados por minuto contra la IA), AGENTS.md al día e informe corto.
