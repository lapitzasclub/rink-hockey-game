# BACKLOG gráfico

Paquetes de trabajo (WP) para la renovación gráfica.

- Proceso: [WORKFLOW.md](./WORKFLOW.md).
- Especificación: [SPEC.md](./SPEC.md).
- Diagnóstico: [AUDIT.md](./AUDIT.md).
- Estados: ⬜ pendiente · 🔵 en curso · 🟡 en revisión · ✅ aceptado · ⛔ bloqueado. QA actualiza el estado y la fecha.

## Decisiones del usuario

| ID | Decisión | Opciones | Recomendación | Antes de | Estado |
|---|---|---|---|---|---|
| D1 | Estilo de arte | A cartoon limpio · B pixel-art HD · C semirrealista TV | A | Gate B (WP-30) | ⬜ |
| D2 | Tamaño de la portería | **Real** (1,70 × 1,05 m visual y física, con reajuste del portero y la IA) · **Exagerada** (visual real ×1,5 y física actual) | Real | WP-40 | ✅ Real (2026-11-15) |
| D3 | Árbitros en arcade | sí (silbato y gol, sin tarjetas) · no | sí | WP-50 | ⬜ |
| D4 | Casco de jugador de campo | casco ligero sin rejilla · sin casco | casco ligero | WP-20 (se enseñan ambos) | ⬜ |
| D5 | Commitear las sesiones 21–22 pendientes antes de empezar | sí · no | sí (los worktrees parten de HEAD) | primer `/gfx` | ✅ sí — commits b14abd2, c78de1a (2026-11-15) |
| D6 | Commit automático por WP aceptado (`gfx(WP-XX): ...`, sin autoría) | sí · no (todo en secuencia, sin worktrees) | sí | primer WP en paralelo | ✅ sí (2026-11-15) |
| D7 | Archivar el work log antiguo de AGENTS.md en `docs/worklog-archive.md` | sí · no | sí (ahorra ~8 k tokens por agente) | WP-01 | ✅ sí (2026-11-15) |
| D8 | Fondo de portería y zona de falta del portero a escala real | sí: `GOAL_BACK_DEPTH` 34 → ~18 px y zona de falta con el radio del semicírculo (26 px) en vez de `GOAL_HEIGHT` · no | sí | WP-44 | ⬜ |
| D9 | Punto de libre directo a 7,40 m reglamentarios | sí: `DIRECT_FREE_HIT_SPOT_OFFSET` 160 → 211 px · no | sí | WP-42 | ⬜ |
| D10 | Línea azul (no existe en rink hockey) | retirar · mantener como marca decorativa | retirar | WP-42 | ⬜ |

D8–D10 salen de WP-02: ver `docs/graphics/REGLAMENTO-MEDIDAS.md` §3.

## Mapa de fases

```
Fase 0  WP-00 lab ─┬─ WP-12 split drawRink ─┐     WP-01 (D7)   WP-02 reglamento
                   │                        │
Fase 1  WP-10 cámara ──► WP-11 escalas ─────┴──► [Gate A]
Fase 2  WP-20 prototipos de estilo ──► [Gate B: usuario elige D1]
Fase 3  pista P (opus):    WP-30 rig ─► WP-31 patinaje ∥ WP-32 stick ─► WP-33 portero ─► WP-34 UI de jugador ─► [Gate C]
        pista E (sonnet):  WP-40 portería (+WP-44 si D2=real) · WP-41 vallas · WP-42 suelo · WP-43 gradas · WP-60 HUD
Fase 4  WP-50 árbitros · WP-51 mesa y sancionados · WP-52 banquillos y entrenadores · WP-61 luz
Fase 5  WP-62 rendimiento · WP-63 móvil ──► [Gate final]
```

## Tabla de estado

| WP | Título | Rol · modelo | Depende de | Estado |
|---|---|---|---|---|
| WP-00 | Escena de laboratorio `?lab=` | builder · sonnet | — | ✅ 2026-11-15 |
| WP-01 | Archivar el work log antiguo | qa · haiku | D7 | ✅ 2026-11-15 |
| WP-02 | Verificar medidas oficiales | builder · sonnet | — | ✅ 2026-11-15 |
| WP-12 | Dividir `drawRink.ts` en módulos | builder · sonnet | — | ⬜ |
| WP-10 | Cámara única | engineer · opus | WP-00 | ⬜ |
| WP-11 | Migrar todo a la cámara única | builder · sonnet | WP-10, WP-12 | ⬜ |
| Gate A | Perspectiva y escalas | coordinador | WP-11 | ⬜ |
| WP-20 | Tres prototipos de estilo | engineer · opus | Gate A | ⬜ |
| Gate B | Elección de estilo (D1, D4) | usuario | WP-20 | ⬜ |
| WP-30 | Rig 2D jerárquico + equipamiento | engineer · opus | Gate B | ⬜ |
| WP-31 | Locomoción quad | engineer · opus | WP-30 | ⬜ |
| WP-32 | Stick a dos manos y acciones | engineer · opus | WP-30 | ⬜ |
| WP-33 | Portero: posturas y paradas | builder · sonnet | WP-31, WP-32 | ⬜ |
| WP-34 | UI sobre jugadores | builder · sonnet | WP-30 | ⬜ |
| Gate C | Personajes y animación | coordinador + usuario | WP-31…34 | ⬜ |
| WP-40 | Portería reglamentaria | builder · sonnet | Gate B, WP-12, D2 | ⬜ |
| WP-44 | Física de portería a escala (solo si D2 = real) | builder · sonnet | WP-40 | ⬜ |
| WP-41 | Vallas perimetrales | builder · sonnet | Gate B, WP-12 | ⬜ |
| WP-42 | Suelo y marcas | builder · sonnet | Gate B, WP-12, WP-02 | ⬜ |
| WP-43 | Gradas | builder · sonnet | Gate B | ⬜ |
| WP-50 | Árbitros | builder · sonnet | Gate C, D3 | ⬜ |
| WP-51 | Mesa de árbitros y sancionados | builder · sonnet | Gate C, WP-12 | ⬜ |
| WP-52 | Banquillos, entrenadores y delegados | builder · sonnet | Gate C, WP-12 | ⬜ |
| WP-60 | HUD unificado | builder · sonnet | Gate A | ⬜ |
| WP-61 | Luz y sombras | builder · sonnet | Gate C, WP-40…43 | ⬜ |
| WP-62 | Rendimiento | qa · haiku (medir) → builder · sonnet (arreglar) | WP-61 | ⬜ |
| WP-63 | Móvil | qa · haiku (medir) → builder · sonnet (arreglar) | WP-61 | ⬜ |
| Gate F | Revisión final | coordinador + usuario | todo | ⬜ |

## Propiedad de archivos

Dos WPs en paralelo nunca comparten archivo propio. `MatchScene.ts` lo serializa el coordinador: solo un WP activo a la vez puede tocarlo, y solo con los enganches listados en su encargo.

| Archivo | WPs que lo tocan (en orden) |
|---|---|
| `src/main.ts` | WP-00, WP-34 (ajuste de etiquetas) |
| `src/scenes/LabScene.ts` (nuevo) | WP-00; después, quien añada escenas al lab (líneas propias) |
| `src/game/render/viewTransform.ts`, `artSpec.ts` (nuevo) | WP-10; los demás solo **añaden** constantes a `artSpec.ts` |
| `src/game/render/drawRink.ts` → `render/rink/*` | WP-12 crea `render/rink/{markings,boards,ads,goal,benches}.ts` |
| `render/rink/goal.ts` | WP-40 |
| `render/rink/boards.ts`, `ads.ts` | WP-41 |
| `render/rink/markings.ts`, `render/arena.ts` (paintFloor) | WP-42 |
| `render/arena.ts` (gradas) | WP-11, WP-43 |
| `render/rink/benches.ts`, `render/benchPlayers.ts` | WP-11, WP-52 |
| `render/rink/table.ts` (nuevo) | WP-51 |
| `entities/createPlayer.ts`, `render/createProceduralPuppetTextures.ts` | WP-11, WP-30 |
| `render/puppet/{rig,pose,textures}.ts` (nuevos) | WP-30 |
| `render/puppet/locomotion.ts` | WP-31 |
| `render/puppet/upperBody.ts`, `actions.ts` | WP-32 |
| `render/puppet/goalie.ts` | WP-33 |
| `systems/visuals.ts` | WP-11, WP-30 (lo deja como orquestador de capas), WP-34 |
| `systems/officials.ts`, `render/officials.ts` (nuevos) | WP-50 |
| `ui/createHud.ts`, `ui/arcadeHud.ts` | WP-60 |
| `render/lighting.ts` (nuevo) | WP-61 |
| `constants.ts` (gameplay) | solo WP-44, y WP-32 si el coordinador aprueba un cambio |
| `systems/{ball,physics,rules,ai}.ts` | solo WP-44. Excepción: una línea por acción para registrar eventos visuales (WP-32, WP-33), listada en el encargo |

---

## Encargos

Cada bloque se copia en la plantilla de encargo (WORKFLOW §4).

### WP-00 — Escena de laboratorio `?lab=`

- **Rol:** gfx-builder · sonnet
- **Lee:**
  - SPEC §2 (solo para saber qué vendrá);
  - `src/main.ts`;
  - `src/scenes/MatchScene.ts` líneas 180–330;
  - `src/game/entities/createPlayer.ts`;
  - las firmas exportadas de `render/drawRink.ts`, `render/arena.ts` y `render/benchPlayers.ts` (sin leerlos enteros).
- **Propios:** `src/scenes/LabScene.ts` (nuevo) y `src/main.ts` (registro y arranque).
- **Objetivo:** escenas estáticas y deterministas para capturas headless que reutilizan los constructores reales del juego, no copias.

**Arranque:** solo con `import.meta.env.DEV` y `?lab=` en la URL; si no, el juego arranca igual que ahora. El build de producción no arranca nunca el lab.

**Escenas:**

| Escena | Contenido |
|---|---|
| `rink` | pabellón + pista + 10 jugadores en la formación de saque inicial, quietos |
| `scale` | figura de jugador en una rejilla de 3 × 3 de la pista (cerca, centro y lejos × izquierda, centro y derecha), más suplentes y primera fila de gradas. Rotulado con texto pequeño. Las reglas de 1 m las añadirá WP-10 |
| `goal` | zoom sobre la portería izquierda, con portero, un jugador en el área y otro detrás de la portería |
| `players` | rejilla de jugadores (ambos equipos) y porteros: 8 direcciones en columnas × estados en filas (parado, patinando en las fases 0, ¼, ½ y ¾, con bola). Sobre el suelo de la pista, con la cámara encuadrada |
| `players&strip=stride` | un jugador, 8 fotogramas consecutivos del ciclo en fila (hoja de contactos). Más valores de `strip` los añaden WP-31 y WP-32 |
| `officials` | zoom al lado lejano: banquillos y zona de mesa (por ahora vacía) |
| `style` | escena vacía con el título "WP-20" |
| `match&mode=arcade\|reglamento` | partido real |

**Parámetros:**

- `zoom`, `cx`, `cy` (centro de cámara en mundo).
- `t` (tiempo de animación fijo en ms para las poses).
- `freeze` (ms): en `match`, pausar la escena desde fuera con `game.scene.pause('match')`, **sin editar MatchScene**.
- `anim=1`: animación viva para revisión manual.
- `hud=0`.

**Gancho:** `window.__lab = { setTime(ms), freeze(), resume() }`, solo en DEV.

**Aceptación:**

- `tools/gfx-shot.ps1 -Set standard -Dir docs/graphics/shots/WP-00/after` produce 7 capturas distintas y correctas, con 0 errores de consola.
- `npm run build` pasa y `/` sin parámetros sigue mostrando el menú.
- La misma URL da dos veces la misma imagen en las escenas estáticas.

### WP-01 — Archivar el work log antiguo (solo con D7 = sí)

- **Rol:** gfx-qa · haiku
- **Propios:** `AGENTS.md` y `docs/worklog-archive.md` (nuevo).

**Encargo:**

- Mover a `docs/worklog-archive.md`, **sin reescribir**, todas las entradas del Work log anteriores a la sesión 20.
- Dejar en AGENTS.md las sesiones 20–22 (y las nuevas), más una línea: `Entradas anteriores: docs/worklog-archive.md`.
- No tocar ninguna otra sección.

**Aceptación:** `wc -c AGENTS.md` < 26 KB, y el texto movido es idéntico (diff de líneas).

### WP-02 — Verificar medidas oficiales

- **Rol:** gfx-builder · sonnet (con WebSearch/WebFetch)
- **Lee:** SPEC §1 y §9; `src/game/constants.ts`.
- **Propios:** `docs/graphics/SPEC.md` (solo las celdas VERIFICAR de §1 y §9) y `docs/graphics/REGLAMENTO-MEDIDAS.md` (nuevo).

**Encargo:**

- Buscar el reglamento técnico vigente de rink hockey de World Skate y la RFEP. Fuente primaria (PDF oficial), no wikis.
- Para cada VERIFICAR: valor, artículo y URL.
- Comprobar además:
  - si los árbitros van a pie;
  - la regla de *stick alto*;
  - el color de la portería;
  - la disposición de mesa y banquillos.

**Entrega:** tabla de discrepancias juego ↔ reglamento con impacto (visual o gameplay), **sin tocar código**. Los cambios de gameplay se proponen como decisión.

**Aceptación:** cada VERIFICAR resuelto con fuente o marcado "sin fuente" con explicación.

### WP-12 — Dividir `drawRink.ts` en módulos (refactor sin cambio visual)

- **Rol:** gfx-builder · sonnet
- **Lee:** `src/game/render/drawRink.ts`.
- **Propios:** `src/game/render/drawRink.ts` y `src/game/render/rink/*.ts` (nuevos).

**Encargo:**

- Partir los 731 líneas en `rink/markings.ts`, `rink/boards.ts`, `rink/ads.ts`, `rink/goal.ts` y `rink/benches.ts` (más `rink/geometry.ts` si hace falta compartir helpers).
- `drawRink.ts` queda como fachada: misma firma `drawRink(scene)` y reexporta `RINK_CORNER_R`, `BOARD_W`, `BOARD_FAR_H`, `BENCH_SCREEN_RANGE`, `roundedRectWorldPts` y `createGoalNetFlash`. **Ningún import externo cambia.**
- Ninguna lógica ni constante cambia.

**Aceptación:**

- Build ok.
- La captura `rink` es indistinguible de la anterior: QA compara a ojo con la de WP-00.
- Ningún archivo pasa de 300 líneas.

### WP-10 — Cámara única

- **Rol:** gfx-engineer · opus
- **Lee:** SPEC §1–§3; `src/game/render/viewTransform.ts`; los usos con `grep -rn "worldToScreen\|localYScale\|VIEW_Y_SCALE\|VIEW_ANCHOR_Y" src`, mirando solo esas líneas; `src/game/systems/cameraDirector.ts`.
- **Propios:** `render/viewTransform.ts`, `render/artSpec.ts` (nuevo) y la escena `scale` de `LabScene.ts`.

**Encargo:**

- Implementar el contrato de SPEC §2: cámara de perspectiva parametrizada (altura, distancia, inclinación, focal) ajustada para conservar el encuadre actual.
- `artSpec.ts` con `PX_PER_M`, `FIGURE_EXAG` y `DEPTH.*` (SPEC §3).
- Mantener `worldToScreen`, `localYScale` y `worldToScreenExt` como envoltorios de compatibilidad marcados `@deprecated`. `worldToScreenExt` ya **no** aplana.
- En `?lab=scale`: reglas verticales de 1 m dibujadas con `project` junto a cada figura, y rejilla de suelo de 5 m de depuración (solo en el lab).
- No migrar todavía los demás módulos: eso es WP-11.

**Aceptación:**

- El encuadre de la pista en `rink` no varía más del 5 %.
- La regla de 1 m y la figura escalada con `s` coinciden (±5 %) en las 9 posiciones de `scale`.
- `project` no asigna memoria con `out`.
- Build ok; `arcade` y `reglamento` siguen jugables a la vista.
- Informe con los parámetros elegidos y la fórmula en 5 líneas.

### WP-11 — Migrar todo a la cámara única

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §2–§3; el informe de WP-10; los archivos propios.
- **Propios:** `entities/createPlayer.ts`, `systems/visuals.ts` (solo escala, posición y profundidad), `render/benchPlayers.ts`, `render/arena.ts` (`standToScreen` y escala del público), `render/rink/{boards,benches}.ts` y `createBall.ts`.

**Encargo:**

- Toda figura usa `project` + `s · FIGURE_EXAG` y el origen en los pies. Fuera `PLAYER_PUPPET_VISUAL_SCALE` como escala única.
- Los suplentes se sitúan en coordenadas de mundo detrás de la valla lejana. Fuera `SEAT_Y` y `XS`.
- Las gradas usan `project` con `wz` por escalón. Fuera su `depthScale` propio.
- La valla gana su altura real con `wz` (aspecto final en WP-41).
- La zona de sancionados pasa a coordenadas de mundo junto a la futura mesa. Fuera `PEN_BASE_X` y `PEN_Y`.
- Las profundidades salen de `DEPTH.*`.

**Aceptación:**

- En `scale`: suplente lejano < jugador central < jugador cercano, con la proporción de `s`.
- Público cercano ≥ jugador cercano; altura de la valla ≈ 1 m frente a la regla.
- Las capturas `arcade` y `reglamento` son jugables y el HUD no se solapa con los banquillos.

### Gate A — Perspectiva y escalas (coordinador)

Revisar `scale.jpg`, `rink.jpg` y `reglamento.jpg` con los criterios de WP-10 y WP-11 y SPEC §2. Si `FIGURE_EXAG` necesita ajuste, se cambia aquí y solo aquí.

### WP-20 — Tres prototipos de estilo

- **Rol:** gfx-engineer · opus
- **Lee:** SPEC §4, §5 y §8; `render/createProceduralPuppetTextures.ts` (como referencia de técnica).
- **Propios:** `src/game/lab/stylePrototypes.ts` (nuevo, desechable salvo el ganador) y la escena `style` del lab.

**Encargo:**

- Dibujar en `?lab=style` los estilos A, B y C de SPEC §4. En cada uno:
  - jugador de campo de frente, 3/4 y espalda, en postura de patinaje, con stick a dos manos y patines quad;
  - la variante de casco D4 (con casco ligero y sin casco);
  - portero de rodillas;
  - árbitro a pie.
- Todo sobre la pista a `s=1` y con un recuadro ampliado ×3.
- Estático: sin animación ni rig todavía.

**Aceptación:** captura `style` legible y, en el informe, 2 líneas de pros y contras por estilo y coste estimado de animarlo.

### Gate B — Estilo (usuario)

El coordinador enseña `style.jpg` y pide al usuario D1 y D4. También puede abrir `?lab=style` en el navegador.

### WP-30 — Rig 2D jerárquico y equipamiento

- **Rol:** gfx-engineer · opus
- **Lee:** SPEC §1–§2 y §4–§8; el informe de WP-20 y el estilo elegido; `entities/createPlayer.ts`; `systems/visuals.ts`; `src/game/types.ts` (tipo Player).
- **Propios:** `render/puppet/{rig,pose,textures}.ts` (nuevos), `entities/createPlayer.ts`, `systems/visuals.ts`, `types.ts` (solo campos visuales del Player) y `render/createProceduralPuppetTextures.ts` (se sustituye o reduce).

**Encargo:**

- Rig de huesos: pelvis (raíz), torso, cabeza, brazo y antebrazo ×2, y muslo y espinilla ×2, con **IK de 2 huesos** hacia objetivos de mano (en el stick) y de patín.
- Patín quad (bota, placa, 4 ruedas y freno).
- Texturas por vista de 8 direcciones (5 más espejos) con orden de miembros por dirección.
- Equipación tintada (camiseta, pantalón y medias), dorsal, `hand`, `skin` y `hair`. Portero con su equipamiento (SPEC §5).
- Definir `PuppetPose` en `pose.ts`: es el **contrato** para WP-31, WP-32 y WP-33.
- Dejar `visuals.ts` como orquestador: `pose = locomotion(…) ⊕ upperBody(…) ⊕ actions(…)` → `rig.apply(pose)`, con implementaciones mínimas (postura de espera y stick estático) para que WP-31 y WP-32 trabajen en archivos separados.
- El rig debe servir también para figuras a pie y sentadas (WP-50 y WP-52).

**Aceptación:**

- `players.jpg`: 8 direcciones coherentes, dos manos en el stick, patines quad, dorsales y variedad, sin rejilla en jugadores de campo.
- Build ok y archivos de 500 líneas o menos.
- El partido sigue funcionando.

### WP-31 — Locomoción quad

- **Rol:** gfx-engineer · opus
- **Lee:** SPEC §6; `render/puppet/pose.ts`; el informe de WP-30.
- **Propios:** `render/puppet/locomotion.ts` y nuevos valores de `strip` en `LabScene.ts`.

**Encargo:**

- Implementar SPEC §6 completo: postura, zancada lateral-atrás con deslizamiento, cadencia por aceleración, sprint, cruces, hacia atrás en C, frenada en cuña o T, espera y caída.
- Entradas: velocidad, aceleración, facing, velocidad de giro y sprint (sin tocar la física).
- Añadir `strip=stride|sprint|crossover|backward|brake|idle` al lab.

**Aceptación:**

- Las hojas de contactos muestran empuje **lateral**, no adelante-atrás; rodillas flexionadas; torso inclinado; deslizamiento entre zancadas.
- Revisión en vivo del usuario en el Gate C.

### WP-32 — Stick a dos manos, bola y acciones

- **Rol:** gfx-engineer · opus
- **Lee:** SPEC §7; `render/puppet/pose.ts`; `systems/ball.ts` líneas 1–40 (carry offset); `systems/matchActions.ts` (solo dónde se pasa, tira y roba); `visuals.ts getStickTip`.
- **Propios:** `render/puppet/{upperBody,actions}.ts`, `strip=shot|pass|steal|dribble` en el lab, y **una línea por acción** en `matchActions.ts` para registrar `player.anim = {type, at}`.

**Encargo:**

- Implementar SPEC §7: agarre a dos manos según `hand`, pala curva apoyada en el suelo, contacto visual de la pala = bola conducida, y alcance de robo = `getStickTip`.
- Acciones: conducción, pase, tiro (stick alto ≤ hombro), turbo, robo, recepción, carga y celebración.
- La celebración de gol necesita enganche en MatchScene: lo pide al coordinador y no lo hace.

**Aceptación:**

- En `strip=dribble` la bola está siempre en la pala.
- El tiro tiene armado y follow-through legibles.
- 0 cambios de física salvo propuesta aprobada.

### WP-33 — Portero: posturas y paradas

- **Rol:** gfx-builder · sonnet (escalar a opus si falla 2 veces)
- **Lee:** SPEC §8; `render/puppet/pose.ts`; los informes de WP-31 y WP-32; dónde se detectan las paradas (grep `save|goalie` en `systems/`).
- **Propios:** `render/puppet/goalie.ts`, `strip=goalie` en el lab y una línea en el sistema que detecta la parada para registrar `anim`.

**Encargo:** SPEC §8: de pie, de rodillas, desplazamiento lateral y paradas con pad, manopla, stick y cuerpo.

**Aceptación:** el portero se lee como portero a 50 px y las paradas son visibles en `strip=goalie`.

### WP-34 — UI sobre jugadores

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §11; `entities/createPlayer.ts` (etiqueta, anillo y barra); el panel de ajustes de `main.ts`.
- **Propios:**
  - en `createPlayer.ts` y `visuals.ts`, solo la etiqueta, el anillo y la barra;
  - el ajuste en `main.ts`.

**Encargo:**

- Etiquetas de rol desactivadas por defecto, con un ajuste para activarlas.
- Anillo de selección en el suelo con el color del equipo, escalado por `s` y en perspectiva.
- Barra de stamina compacta solo para el jugador controlado.

**Aceptación:** `arcade.jpg` y `reglamento.jpg` sin texto sobre las cabezas por defecto, y el jugador controlado se identifica al instante.

### Gate C — Personajes y animación (coordinador + usuario)

- **Coordinador:** revisa `players.jpg` y los `strip`.
- **Usuario:** prueba `?lab=players&anim=1` y un partido. Si el patinaje "camina", vuelve a WP-31.

### WP-40 — Portería reglamentaria

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §1, §3 y §10 (portería); `render/rink/goal.ts`; las constantes `GOAL_*`.
- **Propios:** `render/rink/goal.ts` y las medidas visuales de portería en `artSpec.ts`.

**Encargo:**

- SPEC §10: tubos 3D, red doble, base, sombra y partición en trasera y delantera por profundidad.
- Adaptar `createGoalNetFlash`.
- Tamaño según D2: si D2 = real, la visual va a escala real **y** WP-44 ajusta la física; si D2 = exagerada, la visual va a ×1,5.

**Aceptación:**

- `goal.jpg`: parece una portería de rink hockey; un jugador puede estar detrás y dentro con la oclusión correcta.
- La boca visual coincide con la física.

### WP-44 — Física de portería a escala (solo si D2 = real)

- **Rol:** gfx-builder · sonnet
- **Lee:** `constants.ts` (`GOAL_*`, `GOALIE_*`); los sistemas que usan `GOAL_*` (grep); IA del portero.
- **Propios:** `constants.ts` (`GOAL_*`, `GOALIE_*`), `systems/ball.ts` (jaula de portería) y la IA del portero.

**Encargo:**

- Llevar la boca a 1,70 m (51 px) con fondo real.
- Reajustar el portero y el punto de tiro de la IA para que el gol siga siendo posible y el portero no sea invencible.
- Medir con 3 partidos `?lab=match` simulados: goles por partido antes y después.

**Aceptación:** goles por partido dentro de ±30 % del valor actual (lo reporta el informe); sin goles fantasma.

### WP-41 — Vallas perimetrales

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §1, §3 y §10 (vallas); `render/rink/{boards,ads}.ts`.
- **Propios:** `render/rink/{boards,ads}.ts`.

**Encargo:**

- SPEC §10: altura real, canto y rodapié, esquinas lisas, publicidad en las 4 vallas, puertas frente a los banquillos, redes tras las porterías y sombra.
- **Corte de la valla cercana** (SPEC §3): probar las dos variantes en el lab y elegir con capturas.

**Aceptación:**

- `rink.jpg` sin facetas.
- La valla cercana no tapa nunca la bola: captura `reglamento` con la jugada pegada a la valla cercana (`-Query` con `cx`/`cy`).

### WP-42 — Suelo y marcas

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §1 y §10 (suelo); `REGLAMENTO-MEDIDAS.md` (WP-02); `render/rink/markings.ts`; `render/arena.ts` (paintFloor).
- **Propios:** `render/rink/markings.ts` y `paintFloor` en `arena.ts`.

**Encargo:**

- Quitar la rejilla.
- Suelo uniforme con grano y reflejos suaves.
- Líneas según el reglamento verificado, alineadas con la física actual. Las discrepancias se reportan y no se arreglan.
- La D no atraviesa la portería.

**Aceptación:** `rink.jpg` y `goal.jpg` con marcas limpias, de grosor ≈ 2–3 px.

### WP-43 — Gradas

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §2, §3 y §10 (gradas); `render/arena.ts` (gradas).
- **Propios:** `render/arena.ts` (gradas y público).

**Encargo:** SPEC §10: escalones reales, escala de figura coherente, variación de ropa, huecos y salto en el gol, dentro del presupuesto de SPEC §12.

**Aceptación:** en `scale.jpg` el público cercano es ≥ que los jugadores cercanos y el lejano menor; FPS sin pérdida apreciable.

### WP-50 — Árbitros

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §9; `render/puppet/pose.ts` + la API de `rig.ts`; `MatchScene.ts` líneas 700–840 (eventos de falta, gol y saque).
- **Propios:** `systems/officials.ts` y `render/officials.ts` (nuevos), la escena `officials` del lab, y en `MatchScene.ts` **solo**: crear, actualizar y 4 enganches de evento (falta, tarjeta, gol, saque o bully).

**Encargo:**

- 2 árbitros a pie con el rig (locomoción a pie simple: andar y correr), sistema en diagonal siguiendo la bola y evitación de jugadores.
- Gestos de SPEC §9 enganchados a los eventos.
- En arcade, según D3.

**Aceptación:**

- `officials.jpg` y `reglamento.jpg` con árbitros a escala correcta.
- Una captura con `freeze` justo tras una falta muestra el gesto.
- No tapan la bola de forma persistente.

### WP-51 — Mesa de árbitros y sancionados

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §3 y §9; la API del rig; el informe de WP-11 (zona de sancionados).
- **Propios:** `render/rink/table.ts` (nuevo) y la parte de sancionados en `visuals.ts`.

**Encargo:**

- Mesa centrada en el lado lejano, en coordenadas de mundo, con 3 figuras sentadas (auxiliar, cronometrador y anotador) y un marcador pequeño.
- Asientos de sancionados a ambos lados: los jugadores con tarjeta azul van ahí.

**Aceptación:** `officials.jpg` con la mesa a escala; un sancionado se sienta en su sitio (captura con `freeze` tras una tarjeta azul).

### WP-52 — Banquillos, entrenadores y delegados

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §9; la API del rig; `render/benchPlayers.ts`; `render/rink/benches.ts`; `MatchScene.ts` (llamada a `updateBenchPlayers` y eventos de gol y falta).
- **Propios:** `render/benchPlayers.ts`, `render/rink/benches.ts` y en `MatchScene.ts` solo los enganches de reacción.

**Encargo:**

- Banquillos en coordenadas de mundo con banco, puerta y cartel.
- 5 suplentes sentados con el rig.
- Entrenador de pie y delegado sentado, con reacciones de SPEC §9.

**Aceptación:** en `officials.jpg` todo es coherente en escala con la mesa y los jugadores lejanos; los suplentes se levantan en el gol (captura con `freeze`).

### WP-60 — HUD unificado

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §11; `ui/createHud.ts`; `ui/arcadeHud.ts`; los textos centrales de `MatchScene.ts` (grep `centerText`).
- **Propios:** `ui/*` y en `MatchScene.ts` solo la creación y actualización del HUD y `centerText`.

**Encargo:**

- Un videomarcador común para ambos modos (en REGLAMENTO, con periodo, faltas y sancionados), en Russo One.
- Fuera la tipografía monoespaciada.
- Margen superior reservado sin solapes.

**Aceptación:** `reglamento.jpg` y `arcade.jpg` con el mismo lenguaje visual y sin solapes.

### WP-61 — Luz y sombras

- **Rol:** gfx-builder · sonnet
- **Lee:** SPEC §4 y §10; las APIs de `rig.ts`, `boards.ts` y `goal.ts`.
- **Propios:** `render/lighting.ts` (nuevo) y las sombras del rig, la valla y la portería (por coordinación, en serie).

**Encargo:** focos cenitales coherentes, sombras de contacto, sombra de valla y portería, y viñeteado suave del pabellón.

**Aceptación:** set `standard` con luz coherente y sin pérdida de FPS.

### WP-62 — Rendimiento

- **Rol:** gfx-qa · haiku para medir; gfx-builder · sonnet para arreglar si hace falta.

**Encargo:**

- Medir FPS y objetos activos en `?lab=match&mode=arcade&anim=1` (escritorio) con un contador temporal en el lab, sin dejarlo en el juego.
- Si no se cumple SPEC §12, el builder hornea texturas y Graphics estáticos.

**Aceptación:** SPEC §12 cumplido y reportado con números.

### WP-63 — Móvil

- **Rol:** gfx-qa · haiku para medir; gfx-builder · sonnet para arreglar.

**Encargo:**

- Capturas con `-Width 844 -Height 390` y `-Width 390 -Height 844` de `arcade` y `reglamento`.
- Comprobar que la zona nipplejs (`#left-zone`) y los botones no tapan la jugada y que el HUD es legible.
- No mover nipplejs a controles Phaser.

**Aceptación:** capturas legibles; problemas listados y arreglados por el builder.

### Gate F — Revisión final

- Set `standard` completo y partido en vivo en ambos modos.
- Actualizar AGENTS.md: Arquitectura (render y puppet) y Roadmap.
