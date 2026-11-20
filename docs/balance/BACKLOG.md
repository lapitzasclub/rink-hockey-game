# Backlog de equilibrio (B-XX)

Proceso en [WORKFLOW.md](./WORKFLOW.md). Estado: ⬜ pendiente · 🟨 en curso · ✅ aceptado · ❌ rechazado.

**Pedido del usuario (2026-11-20):** «estuve probando jugar unas partidas en móvil y es demasiado difícil usando los controles táctiles… en móvil hay que rebajar la dificultad. Además me fijé que el portero contrario paraba bastante más de lo que paraba el mío».

## Estado

| B-XX | Título | Agente · modelo | Estado |
|---|---|---|---|
| B-00 | Referencia: simetría IA contra IA y partido real de partida | coordinador + usuario | 🟨 (IA contra IA hecho) |
| B-01 | Instrumentar: calidad de tiro, portero controlado y `?stats=1` | ai-engineer · opus | ✅ 2026-11-20 |
| B-02 | Humano simulado en el humo (`human=touch\|pad`) | ai-engineer · opus | ✅ 2026-11-20 (sin calibrar) |
| B-03 | Porteros: encontrar y quitar la asimetría | ai-engineer · opus | ✅ 2026-11-20 (resto → B-05) |
| B-04 | Niveles de dificultad (antes E-04) | ai-engineer · opus | ✅ 2026-11-20 (pases → B-05) |
| B-05 | Ajuste táctil y por nivel (barrido) | bal-tuner · sonnet | ✅ 2026-11-20 (criba de 5) |
| B-06 | Jugabilidad táctil: portero, tiro al hueco, pérdidas | ai-engineer · opus | ✅ 2026-11-20 (ronda 2 rechazada) |
| B-07 | Partido real: robos, CAMBIO defendiendo, autogoles conduciendo | ai-engineer · opus | ✅ 2026-11-20 |
| B-08 | Tiros cercanos táctiles al palo | ai-engineer · opus | ✅ 2026-11-20 |
| B-09 | Pase al portero propio | ai-engineer · opus | ✅ 2026-11-20 (lado humano sin humo) |
| B-10 | Posesión y juego pasivo en reglamento | ai-engineer · opus | ✅ 2026-11-20 |
| B-11 | CAMBIO defendiendo con el stick hacia la bola (todos los controles) | coordinador | ✅ 2026-11-20 |
| B-12 | Tiros cercanos con mando y batería por control y nivel | ai-engineer / bal-tuner | ⬜ |
| B-99 | Cierre: batería final y partido real en el móvil | bal-qa · haiku + usuario | 🟨 (falta el partido final) |

Orden: B-01 → B-02 → (B-03 y B-04 en paralelo: no comparten archivos salvo `constants.ts`) → B-05 → B-99.

---

## B-00 — Referencia

**IA contra IA (hecho, sin coste):** los porteros son simétricos. `evo/smoke/2026-11-20-carga.txt`, arcade 20 corridas: paradas azul 67,8 ± 7,2 %, rojo 66,9 ± 5,7 %; rojo − azul −0,03 ± 0,34 goles/min. La asimetría que vio el usuario viene de que juega una persona.
**Falta:** con B-01 listo, un partido real del usuario en el móvil (arcade, NORMAL) con `?stats=1`, guardado en `real/`.

## B-01 — Instrumentar

**Objetivo:** que el humo y un partido real digan *por qué* para un portero y no el otro.
- Por tiro: distancia a la portería, ángulo, velocidad, si el tirador estaba presionado (rival a < `AI_PRESS_DISTANCE`) y una **calidad** 0–1 a partir de eso (tabla en `constants.ts`). Agregados por equipo: `shotQualityBlue/Red` y % de paradas en tiros buenos y malos (`savePctBlueHi/Lo`, `savePctRedHi/Lo`, corte en 0,5).
- Por parada o gol: si el portero lo llevaba la IA o la persona (`goalieHumanSec`, `goalsAgainstHumanGoalie`).
- `?stats=1` en partido normal (también en producción): al terminar, un botón «Copiar estadísticas» con el mismo JSON que `[smoke]` más el control usado (táctil, mando, teclado).
**Archivos:** `src/scenes/lab/labSmoke.ts` (extraer la contabilidad a `src/game/systems/matchStats.ts` para compartirla), `tools/gfx-smoke.ps1` (claves nuevas en el agregado), el gancho mínimo en `MatchScene.ts` y la pantalla final.
**Aceptación:** build; humo de 5 por modo sin errores y con las claves nuevas; `bal-compare --sides` las muestra; el botón copia un JSON válido en móvil (captura headless con `pointer: coarse` emulado).
**Hecho:** contabilidad compartida en `systems/matchStats.ts` (labSmoke la usa sin cambiar sus claves); `shell/statsPanel.ts` con `?stats=1` registra cada tiro (`shotLog`), el control usado y deja el botón «Copiar estadísticas» al final. `SHOT_QUALITY` calibrada con 298 tiros IA contra IA: la mitad queda ≥ 0,5 y esos acaban en gol el 47 % frente al 19 %. La presión se mide de borde a borde de los cuerpos. Humo de 5 por modo (`smoke/2026-11-20-B01-*5.txt`): IA contra IA simétrica en calidad de tiro (0,51/0,51) y paradas; 0 errores. Las métricas de portero humano están sin probar con una persona: las prueba el partido real de B-00.

## B-02 — Humano simulado

**Objetivo:** con `human=touch|pad` el jugador controlado del azul lo mueve un conductor que pasa por el mismo camino que la persona (`playerControl` y las acciones de pase, tiro, cambio y presión de E-14), no por la IA: reacción ~250 ms (táctil) / ~180 ms (mando), dirección del stick con ruido y retraso, apuntado con `SHOT_ASSIST_BLEND_HUMAN` hacia donde mira, pases sin la anticipación de la IA, cambio de jugador con CAMBIO (y por tanto el portero cuando toca), tiro y pase cargados. El resto del azul sigue con la IA.
**Calibrar:** con el partido real de B-00, el humano simulado táctil contra NORMAL debe dar tiros, % de pases y goles encajados dentro de un margen razonable (±30 %) del partido real. Los parámetros van en `HUMAN_SIM` de `constants.ts`.
**Archivos:** nuevo `src/scenes/lab/humanSim.ts`, `labSmoke.ts`, lo mínimo de `playerControl.ts` para inyectar la entrada simulada.
**Aceptación:** build; 20 corridas `human=touch` y 20 `human=pad` en arcade sin atascos ni errores; el táctil pierde por más que el mando (IC sin solapar) y reproduce la queja del usuario.

**Hecho:** `scenes/lab/humanSim.ts` juega por el camino de la persona: en táctil escribe `joystickInput` como nipplejs; con mando usa un Gamepad falso que pasa por la zona muerta y los flancos reales. Reacción, ruido del pulgar, cargas variables, CAMBIO, ROBAR mantenido y faltas del azul salen de `HUMAN_SIM`. Decide con `shotScore`, `evaluatePasses` y `dribbleScore`, pero sin la dirección exacta de la IA. Humo arcade de 10 (`smoke/2026-11-20-B02-*10.txt`), rojo − azul: IA contra IA −0,25 ± 0,20; mando 0,80 ± 0,55; táctil 1,57 ± 0,60 goles/min. Táctil: el azul marca 0,45 y encaja 2,02; tira 1,8 veces por minuto frente a 5,5 del rojo y completa 3,7 pases por minuto frente a 10,0. Calidad de tiro 0,64 frente a 0,58. Paradas 61 % frente a 68 % (se solapan). Queda calibrarlo con el partido real.

## B-03 — Porteros

**Hallazgo de B-02 (fallo del juego real):** nipplejs da un vector de como mucho 0,5, y `SWITCH_AIM_MIN` también es 0,5, así que en táctil el CAMBIO casi nunca elige por dirección y cae en el más cercano a la bola. Con la bola cerca de la portería propia, ese puede ser el portero (hipótesis 2).

**Objetivo:** a igual calidad de tiro, los dos porteros paran lo mismo (IC solapados) con `human=touch`.
**Hipótesis del coordinador (comprobar con B-01/B-02, en este orden):**
1. *Calidad de tiro.* El rojo tira con apuntado exacto (`SHOT_ASSIST_BLEND` 1, `targeting.ts:177`) y solo cuando la valoración de `aiDecision.ts` lo aconseja; la persona tira con 0,75 hacia donde mira, bajo presión y de lejos. Entonces el portero rival no es mejor: recibe peores tiros. Arreglo: ayuda de apuntado táctil (B-05), no tocar el portero.
2. *Portero propio en manos de la persona.* Con la bola a < `GOALIE_SELECT_RANGE` (280) de la portería propia, el cambio puede elegir al portero (`playerHelpers.ts:62`); en táctil, con CAMBIO en el arco del pulgar, se acaba controlando sin querer, y una persona para peor que la IA. Arreglo posible: en táctil el portero solo se elige con el stick apuntándole, o el control vuelve a la IA ante un tiro.
3. *Contragolpes.* Las pérdidas de la persona dan al rojo 2 contra 1 de calidad alta. Esto es dificultad (B-04/B-05), no portero.
**Archivos:** según la hipótesis confirmada; `playerHelpers.ts`, `goalieAI.ts`, `targeting.ts`, constantes `GOALIE_*`.
**Aceptación:** `bal-compare --sides` con `savePctBlueHi/Lo` frente a `savePctRedHi/Lo` en `=` en 20 corridas; IA contra IA sigue simétrica.
**Hecho:** antes del arreglo, tiros buenos parados: azul 57,6 % frente a rojo 81,3 % en arcade y 40,6 % frente a 70,9 % en reglamento (`smoke/…-B03-touch20*.txt`). Los porteros estaban bien colocados (H1a descartada). El hueco venía de la defensa del azul: con la persona sin presionar, nadie salía al portador y el 42 % de los tiros contra el azul eran tras pase o con el tirador libre. `aiDefense.ts` ahora elige quién presiona entre la IA; la persona solo cuenta si es la más cercana y está en el lado de la portería. Arreglado H3: `switchAim` escala el stick táctil ×2 (`SWITCH_AIM_TOUCH_SCALE`). `matchStats` añade el contexto de cada tiro (`SHOT_CONTEXT`). Después (`…-B03-fix-touch20.txt`): tiros con tirador libre 35 % (parados 68 %); savePct·Hi 56,4 ± 6,0 frente a 70,5 ± 10,3, «=»; IA contra IA todo «=». Lo que queda viene del apuntado: la IA tira al primer palo y la persona al centro (B-05). Reglamento sin repetir tras el arreglo.

## B-04 — Niveles de dificultad (antes E-04 de `/evo`)

**Objetivo:** cuatro niveles (FÁCIL, NORMAL, DIFÍCIL, EXPERTO) que cambian tiempo de reacción, precisión de pase y tiro, agresividad (presión y robo), acierto del portero y lectura de la jugada; no la física. Tabla `DIFFICULTY` en `constants.ts` que `aiProfileFor(team)` (`constants.ts:458`) aplica sobre `AI_PROFILE_NORMAL`. Menú y ajustes con el selector, guardado en `localStorage` (`rh-difficulty`); `?diffBlue=` y `?diffRed=` en el laboratorio. Ayuda arcade (`ARCADE_RUBBER_BAND_*`): para el humano siempre; la IA solo en FÁCIL y NORMAL.
**Pedido previo (tras E-02):** la IA completa ~90 % de pases; en FÁCIL y NORMAL debe fallar pases y leer peor las líneas para que se pueda cortar.
**Hecho:** `systems/difficulty.ts` con niveles por equipo (rival = elegido − `DIFFICULTY_TOUCH_SHIFT` en táctil; compañeros NORMAL), selector en menú y Ajustes (`rh-difficulty`), `?diffBlue/diffRed`, ayuda arcade para la IA solo en FÁCIL/NORMAL. Arcade 10 corridas, rojo − azul: FÁCIL −0,90 ± 0,52, NORMAL 0,13 ± 0,67, DIFÍCIL 0,90 ± 0,60, EXPERTO 1,35 ± 0,51; NORMAL = IA anterior (todo «=»). Orden correcto, pero solo EXPERTO se separa de NORMAL con 10 corridas. Pendiente para B-05: en FÁCIL/NORMAL la IA aún completa 85–86 % de pases (`passErrorRad`, `laneRead`).
**Aceptación:** IA contra IA, cada nivel contra NORMAL ordenado FÁCIL < NORMAL < DIFÍCIL < EXPERTO sin IC solapados entre vecinos (en arcade al menos); NORMAL dentro del IC de la IA actual; menú revisado en escritorio y móvil.

## B-05 — Ajuste táctil y por nivel

**Objetivo:** cumplir la tabla de objetivos de WORKFLOW §4.
**Mandos (sin tocar código fuera de tablas):** `TOUCH_ASSIST` (en táctil: apuntado del humano más cerca del de la IA, más anticipación en el pase, radio de robo con presión) y un ajuste de la IA rival cuando el humano juega en táctil (`DIFFICULTY_TOUCH_SHIFT`: p. ej. NORMAL táctil = entre FÁCIL y NORMAL).
**Método:** `bal-tuner` criba cada candidato con 5 corridas `human=touch` en arcade; el mejor pasa a 20 × 2 modos con `bal-qa`. Máximo 6 candidatos por ronda.
**Aceptación:** tabla de objetivos con `bal-compare`; con `human=pad` y teclado no cambia nada (las ayudas son solo táctiles).

## B-06 — Jugabilidad táctil

**Pedido del usuario (2026-11-20):** «hay que mejorar bien la jugabilidad en controles táctiles porque se siente difícil e injusto al jugar». No basta con barrer números (B-05).
**Objetivo (solo táctil):** (1) el portero en manos de la persona acelera a la mitad porque el stick táctil llega a 0,5 (`moveHumanGoalie`); no se autoselecciona el portero en táctil. (2) El tiro táctil apunta al lado que deja abierto el portero (`TOUCH_SHOT_AIM`), no al centro. (3) Medir pérdidas en conducción e intentos de robo por lado y ayudar donde falle. Tablas nuevas con valor neutro para que B-05 las barra después.
**Aceptación:** humano táctil contra NORMAL ↓ rojo − azul o ↑ tiros y pases del azul frente a la base; mando e IA contra IA sin cambios.

**Hecho:** ronda 2 (doble marcaje) rechazada y guardada en `bal/b-06`. Lo aceptado: en táctil la IA coloca al portero de la persona ante un tiro rival, tiro al palo abierto, menos robos al portador y compañeros que roban. Lote de aceptación B-05 + B-06, 20 corridas (`smoke/…-B99-*`): táctil NORMAL rojo − azul +0,56 en arcade y +0,98 en reglamento; no cierra el objetivo.

## B-07 — Lo que dijo el usuario tras el partido real

**Hecho:** robos: sin ventaja de la IA (por intento 32 % frente a 28 %). CAMBIO defendiendo: el que va por detrás de la bola cuenta más lejos (`SWITCH_DEFEND`). Autogoles conduciendo: la bola conducida no cruza la propia línea de gol por la boca (`CARRY_OWN_GOAL`). El humo cuenta autogoles e intentos de robo.

## B-08 — Tiros cercanos táctiles

**Hecho:** el hueco de cerca venía de `shotAimPost` 0,9 de B-06, que apuntaba al borde del palo. `TOUCH_SHOT_AIM.postMarginPx` 9 lo mete hacia dentro. Táctil arcade de 0 a 50 px: 40 ± 22 % frente a 47 ± 14 % del rival; rojo − azul 0,55 → −0,10. Reglamento sigue en +1,10 por volumen de tiro del rojo (24 frente a 5 por corrida). El humo da % de gol por distancia (`goalPct<Equipo>B0|B50|B100|B180`).

## B-09 — Pase al portero

**Hecho:** tabla `GOALIE_PASS` (cono 0,9, 80–380 px, línea limpia, sin rival cerca del portero). La persona puede pasarle con cualquier control; la IA solo para salir de la presión en su campo. La bola llega a 230 px/s y los compañeros la dejan pasar. Contadores en `systems/goaliePassStats.ts`. IA: 1–3 pases por partido, 84–100 % atrapados, sin más goles en los 5 s siguientes; `bal-compare` todo «=». Abierto: autogoles sin tiro en táctil 1 → 4 de 10 (sin aclarar, posible ruido), y el humano simulado nunca pasa al portero.

## B-10 — Pasividad en reglamento

**Hecho:** `systems/passivity.ts`: posesión 10 s / 5 s, juego pasivo 10 s con aviso de 5 s y presión a 3 m. Se pita golpe franco indirecto, que no cuenta como falta de equipo (`registerPassivity` en `rules.ts`). Cuenta atrás en el HUD (`ui/passivityHud.ts`) y la IA atenta a los contadores. Con los valores reales el aviso de pasivo no llegó a saltar en el humo.

## B-11 — CAMBIO con el stick hacia la bola

**Hecho:** el usuario explicó que nadie pide un cambio sin mover el stick, porque es un reflejo empujarlo hacia la bola, con cualquier control. Defendiendo, el stick a menos de `SWITCH_DEFEND.ballAimRad` (0,7 rad) de la bola cuenta como sin dirección: decide la cercanía de B-07.

## B-12 — Tiros cercanos con mando y batería por control y nivel

**Pedido del usuario:** el equilibrio debe ser correcto con todos los controles y en todas las dificultades. Con mando, de 0 a 50 px el azul marcaba 9 % frente a 50 % del rival (n = 11, sin confirmar). Medirlo con 20 corridas y buscar la causa. Después, batería táctil y mando × FÁCIL…EXPERTO × arcade y reglamento: porteros iguales, misma curva por nivel en ambos controles. Pendientes: el hueco de NORMAL en reglamento y con mando; recalibrar `HUMAN_SIM` con la persona real.

## B-99 — Cierre

Batería final: IA contra IA (simetría), `human=touch` y `human=pad` en los niveles de la tabla. Partido real del usuario en el móvil con `?stats=1` en arcade NORMAL. AGENTS.md al día e informe corto.
