# Backlog de lanzamientos (L-XX)

Proceso en [WORKFLOW.md](./WORKFLOW.md). Estado: ⬜ pendiente · 🟨 en curso · ✅ aceptado · ❌ rechazado.

## Decisiones

| D | Pregunta | Propuesta | Decide | Estado |
|---|---|---|---|---|
| D-01 | Cómo se pinta la escena cercana | **A**: Phaser, con una segunda proyección (detrás del lanzador) y el rig 2D con un nivel de detalle cercano; sin dependencias. **B**: Three.js solo para la escena (modelos 3D de verdad, ≈ 600 KB más, otro estilo de arte y otra cadena de producción). **Elegida A (2.5D)**: el esqueleto del rig ya es 3D (`puppet/skeleton.ts`, proyección solo por yaw); se añade la inclinación de cámara a esa proyección y piezas cercanas a más resolución. Un modo 7 solo resuelve el suelo y la proyección estenopeica ya lo cubre. B (Three.js) solo si L-00 demuestra que el rig no aguanta la vista baja, y entonces se consulta al usuario (dependencia nueva). | coordinador por delegación del usuario | ✅ 2026-11-20 |
| D-02 | Qué controla la persona cuando tira la IA | **Elegida la propuesta 2**, ampliada por D-07/D-08 (el portero puede salir tras el pitido: primero colocarse y luego estirarse) de [propuestas-portero.html](./propuestas-portero.html): cámara detrás del lanzador rival; antes del golpeo te mueves un poco por la línea; al golpear eliges dirección (8) y pulsas a tiempo. Tirarse pronto deja que el lanzador cambie de lado; las pistas del cuerpo del lanzador son más claras en FÁCIL. Los amagos (propuesta 4) quedan como posible capa futura. | usuario | ✅ 2026-11-20 |
| D-03 | Controles | Apuntar con el stick o las flechas (retícula sobre la portería, deriva leve que crece con la carga) → cargar con el botón de tiro (la carga de siempre) → en vuelo, el stick hacia un lado curva la bola durante una ventana corta. Táctil: el joystick de nipplejs y el botón de tiro, sin gestos nuevos. | coordinador | ⬜ |
| D-04 | En qué modos | Los dos (arcade y reglamento), con opción en Ajustes «Lanzamientos: cámara cercana / clásica». En el humo, siempre la simulación sin pintar. | coordinador | ⬜ |
| D-05 | Objetivos de acierto (humano contra IA en NORMAL) | Penalti 60–70 % de gol; directo 45–55 %; portero humano para 25–35 %. FÁCIL más, EXPERTO menos, sin IC solapados entre vecinos. | coordinador (L-08) | ⬜ |
| D-07 | Qué es un lanzamiento (reglamento World Skate 2026, art. 28–30, verificado) | **Mano a mano** con el portero. **Común:** tras el pitido, tiro directo o conducir la bola hacia la portería para superar al portero (28.4, 29.4); prohibido pasar a un compañero o llevarla detrás de la portería (28.6); el portero espera quieto de pie con los patines en la línea y el stick horizontal, y **tras el pitido es libre de moverse y salir** (30.2, 30.11); el lanzador puede volver a jugar la bola tras tocarla el portero, la portería o la valla: hay rechace (30.8); los demás esperan en el área de la otra mitad y se mueven al pitido (30.4), así que vuelven corriendo mientras dura el duelo; sin límite propio de segundos (corre el tiempo de juego, 30.5). *Desvío en el juego (L-02):* el reloj se para hasta que la bola está en juego (golpeo o conducción), como el flujo clásico, y la persona tiene 5 s para tirar (`SETPIECE_MATCH.humanShotLimitMs`, la cifra de 30.14); si no, tira sola con carga media. **Penalti** (29): a 5,40 m, el lanzador **parte parado junto a la bola**, sin carrerilla. **Directo** (28): a 7,40 m, puede **partir con carrerilla de hasta 3 m** detrás de la bola. **Final de periodo** (30.9, 30.14): solo tiro directo, sin segundo intento, 5 s. Infracciones: portero que se mueve antes → amarilla y se repite si no es gol; lanzador que sale antes → libre indirecto en contra (30.12–13). | usuario + coordinador | ✅ 2026-11-20 |
| D-08 | Las cuatro situaciones | Una sola escena y un solo motor con dos ajustes (penalti: parado y a 5,40; directo: carrerilla y a 7,40) y dos papeles. **Atacas:** conduces, regateas y tiras (apuntado, fuerza, efecto) contra el portero de la IA. **Defiendes:** llevas al portero, la mecánica contraria: antes del pitido quieto (moverse es amarilla); tras el pitido sales a cerrar el ángulo o esperas, y ante el tiro te estiras eligiendo lado y momento (D-02). Con el lanzador conduciendo, lo que cuenta es el ángulo y no tirarse antes de tiempo ante el regate. Final de periodo: solo tiro, sin conducción. | coordinador (a petición del usuario) | ✅ 2026-11-20 |
| D-09 | Paso de 2D a 2.5D y vuelta | Sin corte: las dos cámaras son estenopeicas del mismo mundo, así que la transición interpola ojo, objetivo y foco de la cámara del partido a la de detrás del lanzador (≈ 0,8 s, con suavizado), y el escorzo del rig de 0,3 a h/a. El duelo **se juega dentro de la simulación del partido** (mismo mundo, mismos 10 jugadores: los demás vuelven corriendo desde la otra área); la escena cercana solo cambia la cámara y el detalle, y añade la altura y el efecto de la bola mientras vuela. Vuelta: cuando acaba el duelo (gol, fuera, el portero se la queda, o el rechace se aleja más de ≈ 3 m o lo toca otro jugador), la cámara vuelve a la del partido en ≈ 0,6 s **sin parar el juego**: el rechace sigue vivo. | coordinador | ✅ 2026-11-20 |
| D-06 | Altura de la bola | Solo en la escena: la bola del partido sigue en 2D. El resultado devuelve posición y velocidad en el plano. | coordinador | ⬜ |

## Estado

| L-XX | Título | Agente · modelo | Estado |
|---|---|---|---|
| L-00 | Prototipo de cámara 2.5D (valida D-01) | lanz-engineer · opus | ✅ 2026-11-20 |
| L-01 | Simulación del lanzamiento y lote headless | lanz-engineer · opus | ✅ 2026-11-20 |
| L-02 | Cámara en tercera persona, transición y enganche con el partido | lanz-engineer · opus | ✅ 2026-11-20 |
| L-03 | Controles y HUD: retícula, fuerza, efecto | lanz-artist · sonnet | ⬜ |
| L-04a | Nivel de detalle cercano del rig | lanz-engineer · opus | ⬜ |
| L-04b | Piezas cercanas pintadas: lanzador y portero | lanz-artist · sonnet | ⬜ |
| L-05 | Escenario cercano: portería, red, valla, grada y luz | lanz-artist · sonnet | ✅ 2026-11-20 |
| L-06 | IA del lanzamiento y portero humano | ai-engineer · opus | ⬜ |
| L-07 | Animación: armado, golpeo, estirada, reacción | lanz-engineer · opus | ⬜ |
| L-08 | Ajuste de acierto por nivel y control | bal-tuner · sonnet | ⬜ |
| L-09 | Sonido y efectos: cámara lenta del golpeo, estela, red | lanz-artist · sonnet | ⬜ |
| L-99 | Cierre: humo, banco movil-bajo y partido real | lanz-qa · haiku + usuario | ⬜ |

Orden: L-00 → L-01 → L-02 → (L-03, L-04a → L-04b, L-05 en paralelo) → L-06 → L-07 → L-08 → L-09 → L-99.

---

## L-00 — Prototipo de cámara 2.5D (valida D-01)

**Objetivo:** en `?lab=setpiece`, una cámara estenopeica detrás del lanzador (≈ 2 m atrás, 1,4 m de alto, mirando a la portería) que proyecta suelo, marcas, portería y las figuras del rig actual (lanzador de espaldas, portero de frente). Tres capturas: penalti, directo y la bola a mitad de vuelo.
**Pregunta que responde:** ¿aguanta el rig con la inclinación de cámara añadida a `Skeleton.project` (hoy solo yaw) una vista tan baja y cercana? Lo que hay que mirar: torso y cabeza pintados para la inclinación del partido, orden de pintado y patines. Si se rompe y no se arregla con piezas cercanas (L-04), se plantea B al usuario.
**Lee:** `render/viewTransform.ts`, `render/artSpec.ts` (CAMERA y escala de figura), `render/puppet/rig.ts` y `skeleton.ts` (por rangos), `scenes/lab/labScenes.ts`.
**Aceptación:** 3 capturas y un informe de ≤ 10 líneas: qué piezas fallan con la vista baja y qué haría falta en L-04. Sin tocar el partido. Una sola ronda.
**Resultado (✅ 2026-11-20):** D-01 se confirma. Portería, red, marcas y portero se ven bien en perspectiva (`shots/L-00/after/`); el control `lab=players` sale idéntico (md5). Para después: **L-04a** necesita escorzo por articulación según la altura, (ojo.z − z)/a, y un atlas cercano propio, porque el lanzador sale ampliado 4–5× y borroso, se le ve la coronilla del casco, y las texturas de `textures.ts` y `upperBody.ts` están horneadas con 0,3. **L-02**: la cámara de seguimiento va desplazada al lado contrario del stick, porque el lanzador tapa un poste. **L-05/L-09**: la bola en vuelo ocupa unos 6 px; contorno o estela.

## L-01 — Simulación del lanzamiento y lote headless

**Reglas:** D-07 (verificado). Por D-09, la conducción y el rechace son del motor del partido. `sim.ts` añade la altura y el efecto de la bola en vuelo y la estirada del portero, y el lote headless juega duelos sueltos (lanzador, portero y bola, con los demás llegando desde la otra área).
**Objetivo:** `setpiece/types.ts` y `setpiece/sim.ts`: fase de conducción (el lanzador patina con la bola con la física del partido, el portero puede salir según D-07) y bola 3D a 60 Hz desde el golpeo (gravedad, rozamiento, rebote en el suelo), efecto como aceleración lateral que decae y que la entrada en vuelo añade dentro de una ventana, colisión con palos, larguero, red y el volumen del portero (estirada con tiempo de reacción y alcance). Lanzador de la IA y portero de la IA provisionales (aleatorios sencillos; L-06 los hace buenos). `?lab=setpiece&batch=N` resuelve N tiros sin pintar e imprime `[sp-agg] {json}` con media ± IC compatible con `bal-compare.mjs`; `-Lab` en `gfx-smoke.ps1`.
**Archivos propios:** `src/game/setpiece/{types,sim}.ts`, `src/scenes/lab/` (escena de lote), `tools/gfx-smoke.ps1`, tabla `SETPIECE_*` en `constants.ts`.
**Aceptación:** lote de 1000 sin errores; 0 tiros que atraviesen palos o red; el efecto máximo desvía menos que media portería; build ok.
**Resultado (✅ 2026-11-20):** `setpiece/{types,sim,ai}.ts`, `scenes/lab/labSetPieceBatch.ts` y `tools/sp-batch.ps1` (imprime `[smoke-agg]`, que lee `bal-compare`). Base en `batch/2026-11-20-l01-base.txt`, con 1000 duelos, NORMAL, lanzador humano simulado y seed=7:

| Tipo | Gol | Parada | Palo | Fuera | Imparables |
|---|---|---|---|---|---|
| Penalti | 53,6 ± 3,1 % | 25,3 % | 9,3 % | 8,6 % | 14,1 % |
| Directo | 46,5 ± 3,1 % | 32,8 % | 7,9 % | 8,1 % | 9,7 % |

0 bolas que atraviesan la portería, 0 errores, efecto máximo de 0,60 m y resultados deterministas con la misma semilla.

Pendiente:
- La IA es provisional (`ai.ts`, la rehace L-06).
- Imparables del 10–14 %: L-06 y L-08 deben bajarlos.
- El penalti humano queda algo bajo frente a D-05 (L-08).
- `constants.ts` pasa de 1000 líneas: partirlo en un paquete aparte.

## L-02 — Cámara en tercera persona, transición y enganche con el partido

**Objetivo:** `setpiece/view.ts` y `setpiece/scene.ts`: proyección propia detrás del lanzador que le sigue mientras patina y sigue un poco la bola tras el golpeo; transición desde la cámara del partido (acercamiento ≤ 0,8 s) y vuelta al resultado. Enganche único en `MatchScene` (entregar `SetPieceRequest` al pitido y aplicar `SetPieceResult`), sustituyendo la flecha punteada y el apuntado de `updateFoulRestartState`. Opción en Ajustes «Lanzamientos: cercana / clásica». Art. 23.6 respetado (`finalShot`).
**Aceptación:** humo 20 × 2 modos dentro del IC de la base (los lanzamientos se resuelven con `sim.ts`); captura de las fases; 0 errores de consola; en clásica, el juego como antes.

**Resultado (✅ 2026-11-20, 1 ronda de cambios):** `setpiece/duel.ts`, `scene.ts`, `stage.ts` y `figure.ts`; enganche en `MatchScene` (`startDuel`/`stepDuel`/`endDuel`); opción «Lanzamientos: cercana / clásica» (`?lanz=`). Ronda 1: los demás quietos hasta el golpeo, fundido de figuras delante del lanzador (`SETPIECE_FOLLOW`), reloj parado hasta bola en juego y plazo de 5 s. Humo 20 × 2 (`batch/2026-11-20-l02-smoke-{base,after}-*.txt`): reglamento 1,68 ± 0,24 → 1,90 ± 0,22 goles/min, arcade 2,04 ± 0,28 → 1,81 ± 0,29, IC solapados; 57 penaltis y 28 directos resueltos; 0 atascos, 0 errores. Pendiente para **L-05**: doble imagen de la red en la transición (probablemente el LEAN de la portería del partido). Para **L-03**: la bola se ve diminuta y la tapan las piernas del lanzador.

## L-03 — Controles y HUD: retícula, fuerza, efecto

**Objetivo:** `setpiece/input.ts` y HUD: conducción con el stick (como en el partido, con regate), retícula sobre la boca de la portería al preparar el tiro, barra de fuerza (la carga de siempre, `CHARGE_*`), indicador de la ventana de efecto. Teclado, mando y táctil (joystick de nipplejs y botón de tiro; sin migrar). Textos de botón según `inputMode`. HUD registrado en `HudLayout`, fuera de las zonas seguras.
**Aceptación:** capturas en los tres controles; la persona juega 3 lanzamientos por control en el móvil y da el visto bueno al tacto (partido real n.º 1).

## L-04a — Nivel de detalle cercano del rig

**Objetivo:** que el rig pueda montarse con un atlas cercano (≈ 3–4 × la resolución actual) y piezas extra opcionales (cara, guantes, cinta del stick, ruedas, rodilleras con relieve, número grande) sin cambiar el rig del partido. Generación una vez, por calidad (en baja, ×2).
**Aceptación:** tira de laboratorio del lanzador de espaldas y tres cuartos y del portero de frente; banco de laboratorio `movil-bajo` sin tirones al entrar en la escena (> 50 ms prohibido).

## L-04b — Piezas cercanas pintadas

**Objetivo:** pintar las piezas cercanas con el estilo de la SPEC (luz, contorno, equipación por equipo y por el partido externo con escudo). Lanzador y portero de los dos equipos.
**Aceptación:** capturas cercanas revisadas pieza a pieza con el listón de un indie publicado.

## L-05 — Escenario cercano

**Objetivo:** `render/setpiece/backdrop.ts`: portería con tubos y red con profundidad, valla y publicidad detrás, grada de fondo (desenfocada y horneada, con peña que se mueve en media y alta), pozos de luz. Por lado y calidad, horneado.
**Debe verse como el partido, de cerca**: la misma valla con su publicidad (`render/rink/boards.ts`, `ads.ts`), la misma grada y la misma afición (`render/stands/`), la misma luz (`render/lighting.ts`, `arena.ts`) y la misma portería (`rink/goal.ts`), con el mismo color y estilo, pero vistas desde la cámara baja y con más detalle. Además, **la red de retención** detrás de la portería, sobre la valla del fondo. El partido aún no la pinta; se añade también allí por `/gfx`. El prototipo L-00 solo lleva el suelo y una portería esquemática.
**Aceptación:** capturas de los dos lados en las tres calidades, junto a una captura del partido para comparar que es «el mismo pabellón»; nada de público ni valla «flotando».

**Resultado (✅ 2026-11-20, 2 rondas):** `render/setpiece/backdrop.ts` (mallas UV proyectadas con la cámara cercana): publicidad `ADS` en atlas horneado, anillo de gradas con esquinas y peña del equipo que defiende, horneado por calidad en tandas de ≤ 8 ms; cierre del pabellón oscuro con tira LED. `stage.ts`: valla como la del partido y red de retención (`BOARDS.net*`; el partido ya la pintaba). Constantes en `SETPIECE_STAGE`. Horneado en `movil-bajo` (CPU ×6): tramo máximo 13,6 ms y cierre de textura 19,7 ms (< 50). Pendiente para **L-09**: el suelo queda sin degradado de luz (los pozos se recortaban con el plano cercano; solo queda el de la portería), el público de cerca aún se lee algo más «cabeza sobre asiento» que la masa del 2D, y el balanceo de la peña no se ha visto en movimiento. Sigue pendiente la doble imagen de la red en la transición (L-02).

## L-05b — Efecto wow del plano cercano

**Origen:** el usuario, tras L-05: «el público parece una pegatina, el suelo no tiene marcas de patinaje como el de 2d... Le falta efecto wow».
**Resultado (✅ 2026-11-20, sin rondas; integrado a petición del usuario):**
- `render/setpiece/floor.ts`: suelo horneado con la receta de `arena.ts` (grano, marcas de ruedas, barniz, sombra junto a la valla).
- `stage.ts` / `batch.ts`: reflejo espejado de la valla y la portería.
- `render/setpiece/crowd.ts`: público en tarjetas por fila con paralaje, de pie, brazos arriba, bufandas; ola y banderas en media/alta.
- `fx.ts` (media/alta): haces, halo de la tira LED y los focos, flashes y viñeta.
- Arco de cámara en la transición, nulo en los extremos (D-09).
- Decorado montado por fases. Tanda más larga en `movil-bajo` (CPU ×6): 31 ms en baja y 38 en media; fotograma p95 ≈ 27 ms.

**Pendiente (L-09):**
- escala del público de las primeras filas, algo grande frente al portero;
- banderas cortadas por arriba;
- el decorado aparece por partes durante 1–2 s con `sp=force` en `movil-bajo`;
- posible aliasing del suelo lejano (sin mipmaps);
- doble imagen de la red en la transición.
## L-06 — IA del lanzamiento y portero humano

**Objetivo:** `setpiece/ai.ts`: el lanzador de la IA elige entre tiro desde lejos o conducir y regatear, y luego zona, fuerza y efecto según el nivel; el portero de la IA lee la dirección con error y retraso por nivel (`DIFFICULTY`). Cuando tira la IA, la persona coloca a su portero (salir a achicar o esperar, según D-07) y controla la estirada (D-02), con las ayudas táctiles de `TOUCH_ASSIST`.
**Aceptación:** lotes de 1000 por nivel ordenados FÁCIL < NORMAL < DIFÍCIL < EXPERTO en % parada sin IC solapados entre vecinos; humo 20 × 2 modos.

## L-07 — Animación

**Objetivo:** clips de armado, golpeo (más largo con más carga), seguimiento del lanzador; estirada y caída del portero, reacción al gol o la parada. Reutiliza `puppet/actions.ts` y `goalieClips.ts` con poses nuevas.
**Aceptación:** tiras de laboratorio por fase; nada de pies que patinan ni stick que atraviesa el cuerpo.

## L-08 — Ajuste de acierto

**Objetivo:** barrer las tablas `SETPIECE_*` (deriva de la retícula, ventana y fuerza del efecto, reacción y alcance del portero) hasta cumplir D-05 por control.
**Aceptación:** lotes de 1000 por nivel y control; salida de `bal-compare` dentro de los objetivos.

## L-09 — Sonido y efectos

**Objetivo:** cámara lenta breve en el golpeo (solo en el pintado; la simulación sigue a 60 Hz con su propio reloj de escena), estela de la bola con efecto, sacudida de red, sonidos de golpeo, palo y red. Según `render/quality.ts`.
**Aceptación:** capturas; banco de laboratorio en `movil-bajo` sin regresión > 10 %.

## L-99 — Cierre

Humo 20 × 2 modos, banco `movil-bajo` del partido completo con lanzamientos y un partido real del usuario por control (táctil y mando) con `?stats=1`.
