# Backlog evolutivo (E-XX)

Proceso en [WORKFLOW.md](./WORKFLOW.md). Estado: ⬜ pendiente · 🟨 en curso · ✅ aceptado · ❌ rechazado.

## Estado

| E-XX | Título | Agente · modelo | Estado |
|---|---|---|---|
| E-00 | Humo ampliado y referencia | coordinador | ✅ 2026-11-19 |
| E-01 | Sesgo rojo/azul en IA contra IA | coordinador | ✅ 2026-11-19 |
| E-02 | IA de equipo: desmarques, presión y repliegue, pase o tiro | ai-engineer · opus | ✅ 2026-11-19 |
| E-03 | Portero: IA, movimientos raros y portero seleccionable | ai-engineer · opus | ✅ 2026-11-20 (mando y táctil sin probar en aparato real) |
| E-04 | Niveles de dificultad | → `/bal` B-04 | ➡️ |
| E-14 | Controles táctiles: sprint en el stick, presionar para robar, botones al alcance del pulgar | coordinador | ✅ 2026-11-20 |
| E-05 | Reglas: faltas de equipo, libre directo, penalti, saque neutral | coordinador | ✅ 2026-11-19 (lo siguiente de reglas va por `/regla`) |
| E-12 | Transiciones sin teletransporte: gol, saque de centro, descanso | coordinador | ✅ 2026-11-19 (humo `smoke/2026-11-19-E12-expulsado-puerta.txt`) |
| E-13 | Sombra de los jugadores y marcador del seleccionado | coordinador | ✅ 2026-11-20 |
| E-10 | Animación: pendientes del portero, respiración y C de espaldas | gfx-engineer · opus | ✅ 2026-11-19 |
| E-11 | Animación: frenada, giro, inclinación, celebración, caída, recepción | gfx-engineer · opus | ✅ 2026-11-19 |
| E-15 | Física de patinaje: inercia, giro limitado por velocidad, choques con masa, rebote en la valla | ai-engineer · opus | ✅ 2026-11-21 |
| E-16 | Partículas de pista en los dos modos: ruedas, frenadas, marcas, impactos | gfx-engineer · opus | ✅ 2026-11-21 |
| E-17 | Animación secundaria: muelles de peso, acción superpuesta, reacción a choques | gfx-engineer · opus | ✅ 2026-11-21 |
| E-18 | Modelo: patín quad con ruedas que giran, protecciones, detalle de cerca | gfx-engineer · opus | ✅ 2026-11-21 |
| E-19 | Celebraciones y parones: gol, descanso y final de partido | gfx-engineer · opus | ✅ 2026-11-21 (falta el partido del usuario) |
| E-20 | Reacciones en juego: parada, palo, falta, tarjeta | gfx-engineer · opus | ✅ 2026-11-21 (falta el partido del usuario) |
| E-21 | Ceremonia: salida al campo, saludo final y goles con peso | gfx-engineer · opus | ✅ 2026-11-21 (falta el partido del usuario) |
| E-99 | Cierre: humo final, banco movil-bajo frente a base en la misma máquina, informe (los niveles van en `/bal` B-04) | coordinador + perf-qa · haiku | 🟨 |

IA (E-01…E-04) y animación (E-10, E-11) van en paralelo en worktrees distintos: no comparten archivos. E-15 (física), E-16 (partículas) y E-17 (animación) van en paralelo; E-18 tras E-17 (mismos archivos del rig).

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

**Movido a `/bal` (2026-11-20):** se hace como B-04 de [../balance/BACKLOG.md](../balance/BACKLOG.md), junto con el ajuste táctil y la simetría de porteros. Lo de abajo queda como antecedente.

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
**Hecho (art. 23.6):** si la parte acaba con el tiro de un libre directo o un penalti en juego, el reloj se queda en 0:00 hasta que se resuelve (alguien controla la bola, entra, se para o pasan `FINAL_SHOT_MAX_MS`) y la parte acaba ahí, sin rechace (`MatchScene.finalShot`, `resolveFinalShot`). Humo: `smoke/2026-11-19-E05-ultimo-lanzamiento.txt`.

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
**Hecho:** sombra de 1,75 × 1,5 radios sobre los ejes del suelo (antes 2,6 × 0,82), con la misma proporción que el círculo central. Marcador: aro cian (azul) o rojo vivo con perfilado oscuro, sin el blanco de las líneas, y punta de flecha en el borde hacia donde mira, girada en el plano del suelo (`selectionArrow`, `PLAYER_UI.arrow*`). Capturas en `docs/evo/shots/E-13/`. El banco movil-bajo pasa al cierre (E-99) por decisión del usuario.

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

## E-14 — Controles táctiles

Petición del usuario: el botón de correr se pulsaba casi siempre, robar costaba y el tiro en la esquina obligaba a encoger el dedo. Se resuelve con lo que ya hacen los juegos de deportes en el móvil.

**Hecho:** sprint llevando el joystick al borde (sin botón S); mantener tiro sin la bola presiona al portador y entra a robar sola en distancia (también con teclado y mando); TIRO y PASE en arco al alcance del pulgar, con etiquetas ROBAR / CAMBIO cuando defiendes. Constantes `PRESS_*` y `TOUCH_SPRINT_STICK`. Falta probarlo en un móvil real. El ajuste de dificultad para el táctil va en E-04.

## E-15 — Física de patinaje

**Pedido del usuario (2026-11-21):** «que los jugadores tengan momentum, inercia, físicas».
**Diagnóstico:** `applySkating` es un rozamiento isótropo (0,925 por paso) con aceleración libre en cualquier dirección: el jugador cambia de sentido casi en el sitio, no hay deriva en las curvas y los choques son un empujón fijo de 25 px/s (`resolvePlayerSpacing`). Contra la valla la posición se recorta y la velocidad sigue empujando.
**Objetivo:** el patín agarra en la dirección de las ruedas y la componente lateral se disipa con un agarre finito (deriva en curvas rápidas); el radio de giro crece con la velocidad (a sprint las curvas son abiertas; dar la vuelta es frenar y volver a arrancar); arranque fuerte y aceleración más dura cerca de la punta; con la bola, algo menos de agarre; choques entre jugadores por impulso con masas (el portero pesa más) y restitución baja; rebote amortiguado en la valla. Cada choque o rebote deja `player.bump` (impulso y `simNow`) para la animación de E-17. La IA anticipa la frenada (no se pasa de largo ni tiembla en su objetivo). Igual para humano e IA; la dificultad no la cambia. El portero conserva su manejo para no perder paradas.
**Archivos:** `systems/movement.ts`, `systems/playerControl.ts`, el `seek` y la llegada de la IA (`systems/aiTeam.ts`, `systems/matchFlow.ts` `skateToward`), `systems/goalieAI.ts` solo si hace falta, constantes `SKATE_*` en `constants.ts`.
**Aceptación:** humo 20 × modo frente a la referencia fresca de main: goles/min dentro de ±30 %, % de pases completados dentro del IC o mejor, % de paradas dentro del IC, 0 atascos, 0 errores, 0 fuera de pista; el evento «pista de hielo» sigue funcionando; partido en vivo con teclado: se nota la inercia sin que el control sea pesado.
**Hecho:** los jugadores de campo tienen dirección de marcha propia: agarre lateral finito (deriva), giro que se abre con la velocidad (28 rad/s ÷ (1 + v/55)), frenada de 1100 px/s² cuando la dirección pedida se opone a la marcha y una curva de empuje de 0,26 s. Con bola, ×0,9. `seek` frena a tiempo al llegar. Choques por impulso con masas (portero 1,8, restitución 0,15, empujón de contacto 40), rebote en la valla (0,25) y `player.bump` desde 60 px/s. El portero, los saques (`skateToward`) y el banquillo no cambian. Constantes `SKATE_*`. Humo de 20 (`smoke/2026-11-21-E15-fisica.txt`) frente a la referencia: reglamento 1,95 ± 0,21 goles/min (+4 %), pases 89,3 %; arcade 1,89 ± 0,24 (−15 %), pases 85,2 %; ningún IC sin solapar; 0 atascos ni errores. Pendiente: probarlo a mano con teclado, mando y táctil; los empujones del arcade deslizan más que antes.

## E-16 — Partículas de pista

**Objetivo:** hoy solo el arcade tiene partículas. En los dos modos: polvo y virutas de rueda en frenadas fuertes, derrapes y arranques a sprint; marcas de goma tenues en el suelo que se desvanecen (alta y media); impacto de la bola contra valla y poste; golpe de dos jugadores que chocan; polvo al caer. Sobrio en reglamento, más vivo en arcade. Todo en el pintado, a partir del estado (velocidad entre fotogramas, bola que rebota), sin tocar la simulación.
**Archivos:** nuevo `render/rinkFx.ts`, el gancho mínimo en `MatchScene.ts` (`create` y `renderFrame`), bloque `RINK_FX` al final de `render/artSpec.ts`, la densidad de `render/quality.ts`.
**Aceptación:** capturas de cerca de cada efecto en los dos modos y en calidad baja (debe verse bien); emisores compartidos, sin crear objetos por fotograma; partido en vivo; banco movil-bajo en E-99.
**Hecho:** `render/rinkFx.ts` con pool propio (`rinkFxPool.ts`) y texturas horneadas (`rinkFxTextures.ts`), bloque `RINK_FX` en `artSpec.ts`. Muestra polvo fino al frenar, al derrapar y al arrancar a sprint, marcas de goma que se apagan, golpes de la bola en la valla y en el palo, choques (con `player.bump` de E-15) y caídas. Proyectado en el suelo y ordenado en profundidad con los jugadores. Reglamento sobrio pero legible; arcade más vivo. En calidad baja hay menos motas y no hay marcas. Para comprobarlo: `?lab=match&rfx=demo` y `?rfx=log`. No cuenta como palo si un jugador está pegado a la bola o cambia el poseedor. Pendiente: recalibrar `skate.brake/skid/start` con la física de E-15.

## E-17 — Animación secundaria

**Objetivo:** que el cuerpo tenga peso: tronco y cadera sobre muelles amortiguados que siguen la aceleración (se echa atrás al frenar, se carga al arrancar, se inclina hacia dentro con la aceleración centrípeta v²/r), brazos y stick con acción superpuesta y retardo, cabeza estabilizada mirando al juego, impulsos de zancada proporcionales a la aceleración, y reacción a `player.bump` (sacudida en la dirección del impulso y paso de recuperación). Patines de canto cuando la velocidad y el rumbo no coinciden (deriva de E-15).
**Archivos:** `render/puppet/` (locomotion, upperBody, pose, rig), `systems/visuals.ts`, `render/artSpec.ts`.
**Aceptación:** tiras del laboratorio antes y después (arranque, frenada, curva, choque); partido en vivo sin temblores; calidad baja también se ve bien; banco movil-bajo en E-99.
**Hecho:** `render/puppet/secondary.ts`: muelles por jugador (cabeceo, ladeo de la curva, cadera, brazos) con subpasos de 8 ms y estado preasignado; la inclinación de E-11 es su objetivo. `player.bump` se lee una vez por choque (umbral 40 px/s): golpe al tronco, brazos abiertos, mano baja suelta y paso de recuperación en 250–450 ms. Zancadas en V y más largas al arrancar, cabeza estabilizada (`headLean`), patín de canto en deriva (`foot.roll`). Constantes en `RIG_MOTION`. Tiras `?lab=players&strip=arranque|frenada|curva|choque` (`labMotionStrips.ts`). Capturas en `shots/E-17/`. Pendiente: el portero sin animación secundaria; calibrar el bump con la magnitud real de E-15; fallo del laboratorio que ya existía (piezas sueltas en la fila superior de las hojas con muchas figuras).

## E-18 — Modelo de cerca

**Objetivo:** patín quad con cuatro ruedas visibles que giran con la velocidad y freno delantero; rodilleras, espinilleras y guantes; pliegue de la camiseta con el movimiento; dorsal legible de espaldas. Que pase el listón de un indie publicado en el plano normal y en el cercano.
**Archivos:** `render/puppet/` (paint, textures, kit, skeleton), `render/artSpec.ts`.
**Aceptación:** capturas de cerca antes y después en los dos equipos; calidad baja bien; banco movil-bajo en E-99.
**Hecho:** `puppet/gearSpec.ts` (medidas y colores), `gearTextures.ts` (texturas horneadas una vez: patín quad con 4 ruedas, placa, freno y bota en 8 vistas × 4 fases de giro + 1 corrida; espinillera, rodillera y guante) y `wheels.ts` (giro por distancia recorrida; quieto, la rueda no gira; marcha atrás, al revés; con histéresis pasa al marco corrido por encima de 55 rad/s). Fase de rueda desfasada entre pies, pliegue de camiseta 0–2 según la inclinación del tronco, guante que sigue el antebrazo, dorsal más legible. Los oficiales no cambian. Pendiente: el portero solo se ha revisado a escala de pista; cortes rectos en piezas del tronco en el lab a zoom 3.2 (ya estaban antes, no se ven en partido).

## E-19 — Celebraciones y parones

**Pedido del usuario (2026-11-21):** «mejora las animaciones de distintas celebraciones en los goles, de cambio de campo, etc.».
**Diagnóstico:** tras el gol todos se deslizan hasta frenar (`coastPlayers`) y hacen un gesto en el sitio de 1,8 s (dos variantes); el que encaja no reacciona; en el descanso esperan quietos y cruzan con la postura de juego; al final del partido nadie celebra.
**Objetivo:** gol: el goleador sale patinando hacia la valla del fondo atacado con una celebración propia (varias variantes), los compañeros van a abrazarle (piña), su portero celebra en su área y el equipo que encaja se lamenta (cabeza baja, manos en las rodillas, el portero golpea el stick). Descanso: postura relajada, se cruzan chocando la mano. Final: el ganador hace piña y el que pierde patina cabizbajo; en empate se saludan. Movimiento en `stepSimulation`, poses en el pintado.
**Aceptación:** build; tiras del laboratorio de cada clip y capturas en partido en los dos modos y en calidad baja; humo 20 × modo frente a `docs/rules/smoke/2026-11-21-R99-*.txt` con goles/min dentro de ±30 %, 0 atascos, 0 errores y 0 fuera de pista; banco movil-bajo en E-99.
**Hecho:** `systems/celebration.ts` (`PauseDirector`, sustituye a `coastPlayers` en los parones) y `celebrationMotion.ts` mueven a los jugadores en la simulación; `render/puppet/celebrationClips.ts` pinta las poses a partir de `Player.mood`. Gol: el autor va al borde del área atacada (≥ 2,5 m de las vallas) con su gesto por id (avión, rodillazo, salto con puño, señalar); los compañeros esperan abiertos y cierran la piña; su portero sale y vuelve; los que encajan se hunden y pasan a manos en las rodillas, en la cadera (girándose de espaldas) o al casco; el portero golpea el stick. Descanso: estiramientos, cruce relajado con choque de manos, porteros por la banda. Final: piña del ganador, perdedor cabizbajo, saludo en empate. `GOAL_CELEBRATION_MS` 2800 (antes 1800 inline) y arcade 3200; tabla `CELEBRATION` y `MOOD_POSE`. Tiras `?lab=actions&strip=moods…moods6|lament`, `?lab=goalie&strip=gkmoods`; capturas en `shots/E-19/`. Humo (`smoke/2026-11-21-E19-*.txt`): reglamento 1,64 ± 0,17 goles/min (ref. 1,61 ± 0,16), arcade 1,89 ± 0,27 (ref. 1,89 ± 0,25); bal-compare todo igual; 0 atascos ni errores. Pendiente: el lamento sigue discreto a escala de pista; piezas troceadas en tiras de zoom ≥ 2 (ya pasaba en E-11).

## E-20 — Reacciones en juego

**Pedido del usuario (2026-11-21):** «seguro que se te ocurren más» (tras E-19).
**Objetivo:** gestos cortos (≤ 900 ms) sin parar el juego ni tocar la física: parada (portero «¡mía!», compañeros golpean el stick, el tirador se lleva las manos al casco), palo o tiro fuera por poco (tirador echa la cabeza atrás, portero resopla), falta (víctima protesta al árbitro con los brazos abiertos, infractor levanta la mano), tarjeta (sancionado se queja y sale cabizbajo; un compañero le da una palmada). Capa sobre el tronco y los brazos; nunca a quien lleva la bola o hace una acción.
**Aceptación:** build; tira `?lab=actions&strip=reactions`; capturas en partido en los dos modos; humo 20 × modo frente a `smoke/2026-11-21-E19-*.txt` sin diferencias en bal-compare, 0 atascos, 0 errores.
**Hecho:** `systems/reactions.ts` decide en la simulación (`Player.reaction`, simNow, objeto reutilizado) y `render/puppet/reactionClips.ts` pinta tronco, cabeza y brazos encima del patinaje. Parada: «¡mía!» del portero que bloca, dos compañeros golpean el stick, el tirador al casco. Palo o fuera a menos de 22·K px del poste tras un tiro: cabeza atrás del tirador, resoplido del portero con la manopla al casco. Falta: la víctima (el que la saca) protesta girada hacia el árbitro, el infractor levanta la mano. Tarjeta: protesta y salida cabizbaja; palmada de un compañero cercano. Tabla `REACTION`, `REACTION_POSE`. Tira `?lab=players&strip=reactions`; capturas en `shots/E-20/`. Humo (`smoke/2026-11-21-E20-*.txt`): reglamento 1,48 ± 0,28 goles/min (E-19 1,64 ± 0,18), arcade 1,68 ± 0,22 (1,89 ± 0,27); todo solapa; 0 atascos ni errores; 1 fuera de pista en reglamento (también en la referencia de main, R01–R03: física, no lo toca E-20). Pendiente: el golpe de stick solo se nota en movimiento (sin mota de polvo); el árbitro al que se mira es aproximado.

## E-21 — Ceremonia y goles con peso

**Pedido del usuario (2026-11-21):** el mismo que E-20.
**Objetivo:** salida al campo patinando desde los banquillos con saludo de capitanes antes del primer saque (reloj parado); saludo final en fila, choque de manos entre equipos y saludo a la grada; celebración escalada por importancia (gol en el último minuto, del empate o de la remontada: más grande y el banquillo salta a la pista; hat-trick con gesto propio y grada más fuerte).
**Aceptación:** build; capturas de la salida, el saludo y un gol con peso (laboratorio que los fuerce); humo 20 × modo frente a `smoke/2026-11-21-E19-*.txt` sin diferencias en bal-compare, 0 atascos, 0 errores, 0 fuera de pista.
**Hecho:** `systems/ceremony.ts` (tabla `CEREMONY`, `CEREMONY_POSE`). Salida: los cinco de cada equipo salen escalonados por la puerta abierta de su banquillo (bandera `doorHold` en `render/rink/boards.ts`), los capitanes se dan la mano en el centro y vuelven; reloj parado, ≤ 4,8 s, se salta con cualquier entrada y no se hace en humo, `ai` ni `autopilot`. Final: tras la coreografía de E-19, cruce en dos filas chocando la mano y fila horizontal en el tercio inferior de cara a la grada, en paralelo al cartel. Peso del gol (último minuto, empate, remontada, hat-trick; tope 1): hasta +1 s de pausa, piña más apretada, salto mayor del autor (`mood.big`), grada más fuerte (`arena.cheer` con `power`) y, en el último minuto, los suplentes saltan a la puerta del banquillo. Laboratorio `cer=intro|final|weight` y `?lab=players&strip=hattrick`; capturas en `shots/E-21/`. Humo con E-20 fusionado (`smoke/2026-11-21-E21-*.txt`): reglamento 1,44 ± 0,17 goles/min (E-20 1,48 ± 0,28), arcade 1,88 ± 0,27 (1,68 ± 0,22); 0 atascos ni errores; 2 fuera de pista en reglamento (física, como en main). Pendiente: el gesto del hat-trick se lee como puño, no como tres dedos; un árbitro queda en medio de la fila final.

## E-99 — Cierre

**Banco 2026-11-21** (`smoke/2026-11-21-E99-banco.txt`, movil-bajo, base `b5dd031` frente a main en la misma máquina): arcade igual (82,4 → 83,3 fps); reglamento −20 % (100,5 → 80,1 fps, p95 10,3 → 20,4 ms, lógica +42 %). Dudoso: la medida de main en reglamento fue la última y coincidió con el arranque de E-20 y E-21 (dos Vite y humos en la máquina). Repetir con la máquina libre y orden alterno (main, base, main, base) antes de abrir un paquete `/perf`.
**Repetición** (máquina libre, orden alterno, main = E-21): reglamento 99,1 → 94,3 y 100,2 → 95,7 fps (−5 %), p95 10,3 → 19,3 / 18,4 ms (+80 %), lógica +16–19 %; arcade 95,5 → 84,9 fps (−11 %), lógica +30 %. La regresión es real y acumulada (E-15…E-21): pasa a `/perf` P-14. E-99 queda abierto hasta que P-14 cierre.

Humo final en los dos modos frente a la referencia nueva, una prueba por nivel (goles encajados por minuto contra la IA), AGENTS.md al día e informe corto.
