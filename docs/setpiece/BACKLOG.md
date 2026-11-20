# Backlog de lanzamientos (L-XX)

Proceso en [WORKFLOW.md](./WORKFLOW.md). Estado: ⬜ pendiente · 🟨 en curso · ✅ aceptado · ❌ rechazado.

## Decisiones

| D | Pregunta | Propuesta | Decide | Estado |
|---|---|---|---|---|
| D-01 | Cómo se pinta la escena cercana | **A**: Phaser, con una segunda proyección (detrás del lanzador) y el rig 2D con un nivel de detalle cercano; sin dependencias. **B**: Three.js solo para la escena (modelos 3D de verdad, ≈ 600 KB más, otro estilo de arte y otra cadena de producción). **Elegida A (2.5D)**: el esqueleto del rig ya es 3D (`puppet/skeleton.ts`, proyección solo por yaw); se añade la inclinación de cámara a esa proyección y piezas cercanas a más resolución. Un modo 7 solo resuelve el suelo y la proyección estenopeica ya lo cubre. B (Three.js) solo si L-00 demuestra que el rig no aguanta la vista baja, y entonces se consulta al usuario (dependencia nueva). | coordinador por delegación del usuario | ✅ 2026-11-20 |
| D-02 | Qué controla la persona cuando tira la IA | **Elegida la propuesta 2** de [propuestas-portero.html](./propuestas-portero.html): cámara detrás del lanzador rival; antes del golpeo te mueves un poco por la línea; al golpear eliges dirección (8) y pulsas a tiempo. Tirarse pronto deja que el lanzador cambie de lado; las pistas del cuerpo del lanzador son más claras en FÁCIL. Los amagos (propuesta 4) quedan como posible capa futura. | usuario | ✅ 2026-11-20 |
| D-03 | Controles | Apuntar con el stick o las flechas (retícula sobre la portería, deriva leve que crece con la carga) → cargar con el botón de tiro (la carga de siempre) → en vuelo, el stick hacia un lado curva la bola durante una ventana corta. Táctil: el joystick de nipplejs y el botón de tiro, sin gestos nuevos. | coordinador | ⬜ |
| D-04 | En qué modos | Los dos (arcade y reglamento), con opción en Ajustes «Lanzamientos: cámara cercana / clásica». En el humo, siempre la simulación sin pintar. | coordinador | ⬜ |
| D-05 | Objetivos de acierto (humano contra IA en NORMAL) | Penalti 60–70 % de gol; directo 45–55 %; portero humano para 25–35 %. FÁCIL más, EXPERTO menos, sin IC solapados entre vecinos. | coordinador (L-08) | ⬜ |
| D-07 | Qué es un lanzamiento | **Mano a mano**, no tiro parado (corrección del usuario: «los penaltis en hockey patines no es un tiro directo, se puede patinar»). El lanzador sale del punto con la bola, patina hacia la portería (puede regatear al portero, sin pasar) y tira cuando quiera, con apuntado, fuerza y efecto. La cámara le sigue por detrás. Tiempo límite, si el portero puede salir de la línea al primer toque y qué pasa con el rechace: a verificar en el reglamento al empezar L-01 (fuente primaria, como REGLAMENTO-MEDIDAS). | usuario + coordinador | ✅ 2026-11-20 (detalles por verificar) |
| D-06 | Altura de la bola | Solo en la escena: la bola del partido sigue en 2D. El resultado devuelve posición y velocidad en el plano. | coordinador | ⬜ |

## Estado

| L-XX | Título | Agente · modelo | Estado |
|---|---|---|---|
| L-00 | Prototipo de cámara 2.5D (valida D-01) | lanz-engineer · opus | ⬜ |
| L-01 | Simulación del lanzamiento y lote headless | lanz-engineer · opus | ⬜ |
| L-02 | Cámara en tercera persona, transición y enganche con el partido | lanz-engineer · opus | ⬜ |
| L-03 | Controles y HUD: retícula, fuerza, efecto | lanz-artist · sonnet | ⬜ |
| L-04a | Nivel de detalle cercano del rig | lanz-engineer · opus | ⬜ |
| L-04b | Piezas cercanas pintadas: lanzador y portero | lanz-artist · sonnet | ⬜ |
| L-05 | Escenario cercano: portería, red, valla, grada y luz | lanz-artist · sonnet | ⬜ |
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

## L-01 — Simulación del lanzamiento y lote headless

**Primero:** verificar en el reglamento de World Skate el art. 30 (libre directo y penalti): tiempo límite, conducción permitida, salida del portero, rechace; anotarlo en D-07 y en REGLAMENTO-MEDIDAS.
**Objetivo:** `setpiece/types.ts` y `setpiece/sim.ts`: fase de conducción (el lanzador patina con la bola con la física del partido, el portero puede salir según D-07) y bola 3D a 60 Hz desde el golpeo (gravedad, rozamiento, rebote en el suelo), efecto como aceleración lateral que decae y que la entrada en vuelo añade dentro de una ventana, colisión con palos, larguero, red y el volumen del portero (estirada con tiempo de reacción y alcance). Lanzador de la IA y portero de la IA provisionales (aleatorios sencillos; L-06 los hace buenos). `?lab=setpiece&batch=N` resuelve N tiros sin pintar e imprime `[sp-agg] {json}` con media ± IC compatible con `bal-compare.mjs`; `-Lab` en `gfx-smoke.ps1`.
**Archivos propios:** `src/game/setpiece/{types,sim}.ts`, `src/scenes/lab/` (escena de lote), `tools/gfx-smoke.ps1`, tabla `SETPIECE_*` en `constants.ts`.
**Aceptación:** lote de 1000 sin errores; 0 tiros que atraviesen palos o red; el efecto máximo desvía menos que media portería; build ok.

## L-02 — Cámara en tercera persona, transición y enganche con el partido

**Objetivo:** `setpiece/view.ts` y `setpiece/scene.ts`: proyección propia detrás del lanzador que le sigue mientras patina y sigue un poco la bola tras el golpeo; transición desde la cámara del partido (acercamiento ≤ 0,8 s) y vuelta al resultado. Enganche único en `MatchScene` (entregar `SetPieceRequest` al pitido y aplicar `SetPieceResult`), sustituyendo la flecha punteada y el apuntado de `updateFoulRestartState`. Opción en Ajustes «Lanzamientos: cercana / clásica». Art. 23.6 respetado (`finalShot`).
**Aceptación:** humo 20 × 2 modos dentro del IC de la base (los lanzamientos se resuelven con `sim.ts`); captura de las fases; 0 errores de consola; en clásica, el juego como antes.

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
**Aceptación:** capturas de los dos lados en las tres calidades; nada de público ni valla «flotando».

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
