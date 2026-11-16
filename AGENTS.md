# AGENTS.md

Instrucciones y contexto para agentes IA que trabajen en este proyecto.

## Regla principal

Antes de terminar cualquier bloque de trabajo, actualiza este archivo con información veraz e indexada: arquitectura si cambió, roadmap si avanzó, diseño si se ajustaron reglas o controles, y una entrada en el work log.

## Sobre el proyecto

Juego de rink hockey 2D top-down para navegador. Formato 5v5 simplificado. El jugador humano controla el equipo azul; el equipo rojo es IA. Partido corto, ritmo rápido, estética minimalista.

## Arquitectura

### Stack

- Motor: Phaser 4
- Lenguaje: TypeScript ~6.0.2
- Build: Vite 8
- Móvil: nipplejs con zona DOM dedicada (`#left-zone`)

### Estructura de archivos

```
src/
  main.ts                    Bootstrap Phaser (espera a la fuente Russo One), HTML shell, ajustes
  scenes/MenuScene.ts        Menú con selección de modo ARCADE / REGLAMENTO (localStorage `rh-mode`)
  scenes/MatchScene.ts       Escena principal — orquestador del ciclo del partido
  scenes/LabScene.ts         Escena de laboratorio para capturas (solo DEV, `?lab=`)
  scenes/lab/                labParams, labFigures, labScenes: escenas de laboratorio (solo DEV)
  scenes/lab/stylePrototypes.ts  prototipos de estilo de WP-20 (A, B, C) en `?lab=style`
  scenes/lab/style/          rig, parts, paintVector, paintPixel: prototipos de estilo de WP-20; base del rig de WP-30
  game/
    constants.ts             Todas las constantes de física y gameplay (tuning aquí)
    types.ts                 Tipos: Player, Vector, ActiveBully, ActiveFoulRestart, GameMode, PowerupKind
    formation.ts             Posiciones iniciales por formación
    utils.ts                 Helpers generales
    entities/
      createBall.ts
      createPlayer.ts
    render/
      drawRink.ts            Vallas, líneas blancas, porterías y vallas publicitarias (todo por código)
      rink/                  Fachada `drawRink.ts` y módulos: geometry, markings, boards, ads, goal, benches
      arena.ts               Pabellón: suelo azul pintado, gradas en anfiteatro con perspectiva y público animado
      viewTransform.ts       Cámara de perspectiva única: project(wx,wy,wz,out) → x, y, s
      artSpec.ts             Escala visual (PX_PER_M, FIGURE_EXAG), parámetros de cámara y capas DEPTH
      createProceduralPuppetTextures.ts  Texturas procedural/pixel para puppet
      arcadeFx.ts            Partículas, auras, estela de bola, bloques de hielo, banners (modo arcade)
    systems/
      ai.ts                  IA de portero y jugadores de campo
      arcade.ts              ArcadeController: turbo, tiros turbo/fuego, cargas, rachas, powerups, rubber-band
      cameraDirector.ts      Cámara dinámica (seguimiento con anticipación, zoom contextual, punch)
      ball.ts                Física y posición de la pelota
      matchActions.ts        Acciones: pase, tiro, robo, contactos, parada portero
      matchClock.ts          Reloj del partido y periodos
      matchFlow.ts           Bully, kickoff, foul restart
      movement.ts            Seek, resolvePlayerSpacing
      playerControl.ts       Control humano y coordinación de IA de equipo
      playerHelpers.ts       findPlayerById, getControlledPlayer, etc.
      rules.ts               Detección de faltas y estado de reglas
      sceneFlow.ts           Comprobación de gol, reinicio pendiente, switch jugador
      visuals.ts             Actualización visual de jugadores y stick
    ui/
      createHud.ts
      matchHud.ts
      arcadeHud.ts           Barra de turbo y línea de estado (arcade)
      scoreboard.ts          Videomarcador común (ambos modos)
    audio/
      sounds.ts              Audio procedural Web Audio (incluye público, cargas, powerups)
      announcer.ts           Locutor con Web Speech API (voz española si existe; on/off en ajustes)
    input/
      mobileJoystick.ts      nipplejs + botones táctiles (A/B/S)
tools/
  generate-comfy-asset.ps1   Helper para generar borradores 2D con ComfyUI local
  gfx-shot.ps1               Capturas headless (Chrome/Edge) + volcado de consola para el workflow gráfico
docs/
  graphics/                  Renovación gráfica: WORKFLOW (proceso y roles), SPEC (biblia de arte, medidas, cámara),
                             AUDIT (diagnóstico 2026-11-15), BACKLOG (WPs, decisiones, propiedad de archivos), shots/
.claude/
  agents/gfx-*.md            Agentes del workflow gráfico: engineer (opus), builder (sonnet), qa (haiku)
  commands/gfx.md            /gfx — coordinador del workflow gráfico
.openclaw/
  skills/
    comfyui-asset-generation/SKILL.md
public/
  assets/
    players.png              Sprites ilustrados de jugadores y bola
    goalie-blue.png          Sprite ilustrado del portero azul
    goalie-red.png           Sprite ilustrado del portero rojo
    generated/               Borradores IA; revisar antes de integrar
```

`MatchScene.ts` actúa como orquestador puro. La lógica detallada vive en `systems/`. Las constantes de gameplay van siempre en `constants.ts`, no inline.

### Notas de implementación relevantes

- Los controles táctiles usan nipplejs anclado a `#left-zone` (zona DOM separada del canvas). Esta solución funciona correctamente; no migrar a controles Phaser nativos salvo decisión explícita.
- `btn-switch` se pasa a `createMobileJoystick` pero no tiene elemento HTML ni binding; en móvil el cambio de jugador se gestiona con B (botón de pase) cuando no hay posesión — comportamiento contextual intencional.
- **Dos cámaras en MatchScene**: la principal (mundo, con zoom en arcade) y una de UI fija. Todo objeto nuevo se enruta en `ADDED_TO_SCENE`: lo creado dentro de `withUi(() => ...)` lo ignora la principal; el resto lo ignora la UI. Cualquier HUD/overlay nuevo debe crearse dentro de `withUi`.
- La cámara trabaja en coordenadas de pantalla ya proyectadas (`worldToScreen`); la física sigue en mundo.
- **Scale.EXPAND**: el lienzo ocupa toda la ventana (sin bandas negras). El área de juego sigue siendo 1280×720 centrada; el pabellón (`ARENA_BOUNDS` en `arena.ts`) rellena lo que sobra. Las cámaras se reajustan en `MatchScene.fitCameras` (evento `RESIZE`) y `CameraDirector.refit`; el HUD queda dentro del área 16:9.
- **Gradas** (`arena.ts`): anillos concéntricos alrededor de la valla (`roundedRectWorldPts` desplazado) proyectados con `standToScreen` (misma perspectiva que la pista + retroceso tras el fondo + altura del escalón). Se pintan una vez en canvas: estructura (profundidad -6), dos capas de público que se mecen (-5) y filas cercanas de espaldas (21, delante del tablero).
- `MatchScene.init(data)` resetea todo el estado: Phaser reutiliza la instancia de escena entre partidos.
- Modo arcade vs reglamento: `this.mode` en MatchScene; con `classic` no se crean `ArcadeController`/`ArcadeFx`/cámara dinámica y el juego se comporta como antes.
- La portería se trata como jaula: boca frontal válida para gol, estructura trasera/lateral hace rebotar la pelota. El anclaje del balón al portador está blindado cerca de la portería para evitar goles fantasma.

## Reglas de trabajo

1. No afirmar como terminado algo que no esté implementado.
2. Cambio de arquitectura → actualizar la sección **Arquitectura** de este archivo.
3. Cambio de alcance o prioridades → actualizar la sección **Roadmap**.
4. Cambio de reglas del juego, controles o IA → actualizar la sección **Diseño del juego**.
5. Registrar lo que se hizo al final del **Work log** con fecha.

## Convención de comentarios

Escribir en español. No comentar lo obvio. Sí comentar:

- Intención de un módulo o sistema
- Decisiones de diseño no evidentes
- Orden importante de ejecución
- Heurísticas o simplificaciones temporales
- Reglas de juego que no se deduzcan rápido del código

Formato preferido: `/** ... */` en funciones o módulos clave. Inline solo cuando una línea concreta lo necesite. No bloques largos que envejecen mal.

## Diseño del juego

### Mecánicas implementadas

- Partido con 2 periodos, reloj de 120 s
- Kickoff, bully, foul restarts: free-hit, direct-free-hit, penalty
- Stamina por jugador, sprint con drenaje y recuperación
- Robo con probabilidades distintas por ángulo (frontal / lateral / espalda) y cuatro resultados: éxito, bola suelta, fallo silencioso o falta
- IA básica de portero (cubre portería, intercepta, distribuye) y jugadores de campo (pressing, repliegue, pases, tiros)
- Física de portería como jaula
- Fullscreen, controles táctiles y teclado

### Modo arcade (por defecto)

Estilo NBA Jam manteniendo el 5v5 y relajando las reglas. Se elige en el menú; REGLAMENTO conserva las reglas oficiales.

- Periodos de 90 s (`ARCADE_PERIOD_DURATION`), cabezones (`ARCADE_HEAD_SCALE`), cámara dinámica con zoom y celebración de gol de 2,6 s.
- **Sin faltas**: el robo nunca pita falta (el resultado se convierte en bola suelta), no hay falta de zona del portero y el bully se sustituye por una melé: la bola sale disparada en dirección aleatoria.
- **Turbo**: Shift/S gasta stamina con más velocidad. **Shift+U con bola** = tiro turbo (más potencia, puede batir al portero). **Shift+U sin bola** = carga: derriba al rival cercano y, si es el portador, suelta la bola.
- **En racha (on fire)**: 2 goles seguidos del mismo jugador → turbo infinito y tiros de fuego hasta que el rival marca.
- **Powerups** sobre la pista (máx. 2): fuego (siguiente tiro de fuego), turbo, congelar (2 rivales), imán (bola), muro (portero más grande). La IA también va a por ellos.
- **Rubber-band**: el equipo que pierde recibe un pequeño bonus de velocidad.
- La IA hace cargas (`ARCADE_AI_CHECK_CHANCE`) y tiros turbo.
- Locutor por síntesis de voz y ambiente de público procedural cuya intensidad sube cerca de las porterías.

### Controles (teclado)

| Acción | Tecla |
|---|---|
| Mover | WASD / flechas |
| Sprint / turbo | Shift |
| Tiro (con posesión) / robo (sin posesión) | U |
| Tiro turbo (con posesión) / carga (sin posesión) — solo arcade | Shift + U |
| Pase (con posesión) / cambio de jugador (sin posesión) | Y |

### Controles (móvil)

Joystick analógico izquierdo (nipplejs), botones A (tiro/robo), B (pase/cambio), S (sprint/turbo), S+A (tiro turbo/carga en arcade), ⛶ (fullscreen).

## Roadmap

### Completado

- Estructura base, pista, entidades, Phaser 4
- 5v5 con porteros y 4 jugadores de campo
- Cambio de jugador, pase y tiro diferenciados
- Refactor completo en systems separados
- Robo con consecuencias (foul, éxito, bola suelta)
- Bully visual, foul restart manual (humano) y automático (IA)
- Stamina y sprint
- Controles táctiles móvil completos con nipplejs
- Física de portería como jaula, fix ghost goals, requisito de entrada frontal
- Geometría de pista oficial (40×20 m, escala real, D semicírculo, área de penalti)
- Tarjeta azul con inferioridad numérica y banquillo
- Libre indirecto auténtico (solo pase válido para el saque)
- Zona de protección del portero con falta automática + tarjeta azul
- Sprites ilustrados para jugadores y porteros, hielo texturizado
- Render con una cámara de perspectiva única (`viewTransform.ts`, parámetros en `artSpec.ts`)
- Jugadores, porteros, sticks y pelota con puppet procedural por piezas tintables
- Menú inicial, panel de ajustes, audio procedural, animación de stick
- Animación de patinaje procedural v3: fase acumulada, contrafase 180°, zancada por dirección, `sideFactor`, texturas de espalda, sprint
- Modo arcade estilo NBA Jam (cámara dinámica, turbo, cargas, powerups, racha de fuego, locutor, HUD arcade) con selección de modo en el menú

### Pendiente

- [ ] Playtest y tuning del modo arcade (frecuencia de powerups, potencia de tiros turbo/fuego, probabilidad de batir al portero, zoom de cámara)
- [ ] Verificar el modo arcade en móvil (S+A, legibilidad del HUD con zoom)
- [ ] Ajuste de físicas de patinaje (sensación más deslizante)
- [ ] Separar sistema de reglas en módulo propio (`systems/rules.ts` puede crecer)
- [ ] UI definitiva, sprites finales → sustituido por la renovación gráfica: ver `docs/graphics/BACKLOG.md` (cámara única, rig con patines quad y stick a dos manos, porterías y vallas reglamentarias, árbitros, mesa, entrenadores, HUD unificado)

### Backlog

- [ ] Multijugador local
- [ ] Portero con IA más especializada
- [ ] IA táctica avanzada
- [ ] Selección de equipos

## Assets

El juego empezó renderizado por código, pero ya admite assets visuales en `public/assets/`. Los borradores IA se generan en `public/assets/generated/` y solo deben convertirse en assets definitivos tras revisión visual.

| Asset | Estado |
|---|---|
| Jugadores y porteros | Puppet procedural por piezas: cuerpo, casco, brazos, patines y stick |
| Bola | Textura procedural `puck-pixel` |
| Pista y porterías | Implementadas en `drawRink.ts` |
| HUD | Implementado |
| Sprites ilustrados antiguos | Conservados en `public/assets/`, no usados por el puppet actual |
| Audio (golpeo, gol, silbato, ambiente) | Implementado de forma procedural |
| Animación de patinaje | V2 procedural: deslizamiento de patines, cadencia acelerada en sprint, lean y escala por profundidad |

### Generación IA local

- Runtime: ComfyUI portable NVIDIA en `D:\AI\ComfyUI`.
- API local: `http://127.0.0.1:8188`.
- Arranque: `powershell -NoProfile -ExecutionPolicy Bypass -File D:\AI\ComfyUI\launch-openclaw-detached.ps1`.
- Parada: `powershell -NoProfile -ExecutionPolicy Bypass -File D:\AI\ComfyUI\stop-openclaw.ps1`.
- Token Hugging Face local: `D:\AI\huggingface_token.txt`. Los scripts de arranque lo cargan como `HF_TOKEN` / `HUGGING_FACE_HUB_TOKEN`; no imprimirlo ni copiarlo al repo.
- Modelos disponibles:
  - `sd_xl_base_1.0.safetensors` — checkpoint principal para assets.
  - `pixel-art-xl.safetensors` — LoRA principal para sprites 2D/pixel art.
  - `spritesheet.safetensors` — LoRA auxiliar para borradores de hojas de animación.
  - `v1-5-pruned-emaonly-fp16.safetensors` — legacy/smoke tests; no usar para jugadores/porteros finales.
- Helper del proyecto: `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\generate-comfy-asset.ps1 -Profile pixel-sprite -Prompt "<prompt>" -Prefix "<nombre>" -BatchSize 4`.
- Skill local: `.openclaw/skills/comfyui-asset-generation/SKILL.md`.
- Perfiles del helper:
  - `pixel-sprite`: SDXL + `pixel-art-xl`; usar por defecto para personajes, porteros, pelota, iconos y props.
  - `spritesheet`: SDXL + `pixel-art-xl` + `spritesheet`; usar solo para explorar animaciones, siempre revisando antes.
  - `legacy-sd15`: ruta antigua de SD 1.5; no usar para assets finales de personajes.
- Para personajes, usar `roller hockey skater` en prompts y evitar `rink hockey skater`; `rink` tiende a generar pista/vallas/fondo en vez de un sprite aislado.
- No sobrescribir assets finales con salidas IA sin revisión. Generar candidatos en `public/assets/generated/`, inspeccionar PNG aislado y captura in-game, y solo entonces integrar.

## Work log

### 2026-11-16 (sesión 24, cont.) — renovación gráfica (/gfx)

- WP-60: videomarcador común (`ui/scoreboard.ts`) en Russo One para ambos modos: goles, periodo y reloj; en reglamento, además, faltas por equipo y sancionados con cuenta atrás. Esquina superior izquierda, sin tapar banquillos. Fuera la tipografía monoespaciada y la línea de stamina.
- WP-20: tres prototipos de estilo en `?lab=style` (A cartoon, B pixel-art y C semirrealista) con esqueleto 3D, IK de brazos y pintores por estilo (`src/scenes/lab/style/`).
- Gate B ✅ (coordinador, por delegación del usuario): D1 = A (cartoon limpio): es el único que se lee bien a 57 px, escala limpio con `s` y sale barato con rig por piezas. D4 = casco ligero en el color del equipo.
- WP-42: suelo sin rejilla con grano y reflejos suaves; marcas a 2,5 px según el reglamento; sin línea azul (D10); la D ya no cruza la portería. Libre directo a 7,40 m (D9) y penalti a 5,40 m (`PENALTY_SPOT_OFFSET`, nuevo), los dos medidos desde la línea de gol en la marca y en matchFlow; antes el balón caía junto a la línea. Depths de drawRink en DEPTH.*.

### 2026-11-15 (sesión 24) — renovación gráfica (/gfx)

- WP-01: work log anterior a la sesión 20 archivado en `docs/worklog-archive.md`.
- WP-02: medidas oficiales verificadas contra el *Rink Hockey Rulebook* 2027 de World Skate (`docs/graphics/REGLAMENTO-MEDIDAS.md`); SPEC §1/§9 sin VERIFICAR; propuestas D8–D10.
- WP-00: escena de laboratorio `?lab=` (solo DEV): rink, scale, goal, players, strip, officials, style y match; capturas deterministas con PRNG con semilla y tiempo fijo `t`.
- WP-12: `drawRink.ts` partido en `render/rink/{geometry,markings,boards,ads,goal,benches}.ts` con fachada; captura idéntica (hash) a la de WP-00.
- Workflow gfx: integrar cada WP en `main` en cuanto se acepta; WPs en paralelo con worktrees manuales desde `main` (no `isolation: "worktree"`, que parte de `origin/main`). Ver WORKFLOW §3 y `/gfx` guarda 3.
- WP-10: cámara de perspectiva única (`project` con escala `s`, sin asignar memoria) y `artSpec.ts` (PX_PER_M 28,5, FIGURE_EXAG 1,15, DEPTH); encuadre de la pista igual que antes; `?lab=scale` con reglas de 1 m y rejilla de 5 m.
- WP-11: jugadores, bola, suplentes, público, valla (1 m con `wz`) y sancionados (en mundo, lado lejano) proyectados con `project` y `figureScale(s)`; profundidades con `DEPTH.*`; fuera `PLAYER_PUPPET_VISUAL_SCALE`, `SEAT_Y`, `PEN_BASE_X` y el `FAR_RECESS` doble. Jugador de pie: 53/57/62 px (lejos/centro/cerca).
- Gate A ✅: una sola cámara y escalas coherentes. Pendientes asignados: el HUD de reglamento se solapa con el banquillo azul (WP-60); el público cercano tapa los anuncios de la valla cercana (WP-41/43); los depths de `drawRink.ts` siguen sin pasar a `DEPTH.*` (WP-40/42).

### 2026-11-15 (sesión 23) — auditoría gráfica y workflow de agentes

- Auditoría visual completa (Chrome, ambos modos + lectura del código de render): `docs/graphics/AUDIT.md`, capturas en `docs/graphics/shots/baseline/`. Causa raíz principal: no hay cámara única (banquillos, gradas, sancionados y jugadores escalan cada uno a su manera).
- Workflow gráfico por agentes con coordinador: `docs/graphics/{WORKFLOW,SPEC,BACKLOG}.md`, agentes `.claude/agents/gfx-{engineer,builder,qa}.md`, comando `/gfx`, script `tools/gfx-shot.ps1` (capturas headless + consola, probado).
- Decisiones abiertas para el usuario: D1–D7 en `docs/graphics/BACKLOG.md` (estilo, tamaño de portería, árbitros en arcade, casco, commits).
- Sin cambios en `src/`.

### 2026-11-15 (sesión 22) — pabellón, gráficos y ajustes tras pruebas

- Suelo azul de pista pintada (gradiente, juntas en perspectiva, grano, marcas de ruedas, reflejos de focos) en `render/arena.ts`; se quitó el hielo blanco. Líneas de la pista en blanco, área de portería azul claro con arco rojo, vallas oscuras y vallas publicitarias ficticias (`drawAds`).
- Gradas rehechas con perspectiva real (anfiteatro de 22 escalones alrededor de toda la pista) y público por asiento, escalado por profundidad; vibra con la intensidad del partido y salta en los goles.
- `Scale.FIT` → `Scale.EXPAND`: se eliminan las bandas negras; cámaras y límites se adaptan al tamaño de ventana.
- Piernas en el puppet (`field-leg`/`goalie-leg`, `placeLeg` en `visuals.ts`); patines bajados a y=35 para que se vean.
- IA: el defensor más cercano presiona al portador rival (`AI_PRESS_DISTANCE`). Antes, si el humano se quedaba quieto con la bola, nadie entraba a robar.
- Nota: el análisis inicial de "98 % de posesión azul" era un artefacto del arnés de pruebas (en escritorio el joystick se ignora); simulando teclado el arcade sale equilibrado.

**Validación**: `npm run build` pasa; verificado en Chrome en clásico y arcade, y con proporción forzada ultra-ancha.

### 2026-11-15 (sesión 21) — modo arcade estilo NBA Jam

**Objetivo**: dar al juego un giro arcade (zoom, turbo, powerups, "magias", exageración) manteniendo el 5v5 y relajando reglas. Sin dependencias nuevas: audio y gráficos procedurales.

- Nuevos módulos: `systems/arcade.ts`, `systems/cameraDirector.ts`, `render/arcadeFx.ts`, `ui/arcadeHud.ts`, `audio/announcer.ts`; sonidos nuevos en `audio/sounds.ts` (carga, powerup, tiros turbo/fuego, congelar, rugido y ambiente de público).
- Hooks mínimos en sistemas existentes: `speedMultiplier` en `movement.ts`, `saveDisabledUntil`/`saveRadiusScale` en `ball.ts`, `powerMultiplier` y `allowFouls` en `matchActions.ts`, aturdidos en `playerControl.ts`, `setVisualHeadScale` en `visuals.ts`.
- `MatchScene`: cámara UI separada (`withUi`), `init(data)` con reseteo completo (corrige que al volver del menú el partido arrancase con estado del anterior, p. ej. `matchEnded`), integración arcade, celebración de gol, conversión de bully en melé.
- `MenuScene`: tarjetas ARCADE / REGLAMENTO (←/→ o A/D, ESPACIO/ENTER o clic); el modo se guarda en `rh-mode`.
- Fuente Russo One (Google Fonts) para HUD/menú; `main.ts` espera a la fuente (máx. 1,5 s). Botón de locutor ON/OFF en ajustes.
- Constructores sin parameter properties: el tsconfig tiene `erasableSyntaxOnly`.

**Validación**: `npm run build` pasa. Menú y arranque del modo arcade comprobados en navegador sin errores de consola (zoom, marcador, banner). El gameplay arcade completo (powerups, cargas, rachas, goles) **no se ha playtesteado** a velocidad real: queda pendiente de tuning.

### 2026-06-26 (sesión 20) — animación de patinaje completa, texturas de espalda y 0.3.0

**Mejoras de animación en `visuals.ts`** (iteración continuada durante la sesión):

- **Fase acumulada por frame** (`'sp'`, `'pt'` en container data): el `skatePhase` ya no depende de `timeNow * cycleSpeed`; solo avanza `frameDt / cycleMs * cycleSpeed` por frame. Esto elimina el salto de fase al cambiar velocidad (`Δphase = T1*(v2-v1)/ms` crecía enorme cuando T1 era grande), que se manifestaba como "convulsión" cada vez que se pulsaba una tecla de movimiento.
- **Contrafase 180° real**: `lSin = -rSin`. El patín izquierdo es exactamente el opuesto al derecho en todo el ciclo.
- **Zancada alineada a la dirección**: se calcula el vector de facing normalizado en espacio contenedor (con compresión `VIEW_Y_SCALE` en Y) y su perpendicular. La separación de patines sigue el eje perpendicular a la dirección de movimiento, no siempre horizontal.
- **`sideFactor` blend**: cuando el jugador va de lado (`sideFactor → 1`), el spread se interpola de perpendicular a +Y puro, evitando que un patín quede por encima del cuerpo y oculto por z-order.
- **Sprint**: `cycleMs` 130 → 52 ms, amplitud extra de stride y spread via `sprintBoost`. A mayor velocidad, patines más separados y ciclo más rápido.
- **`animBlend`** suaviza la amplitud con lerp 0.1/frame; el jugador no arranca a máxima amplitud instantáneamente.

**Texturas de espalda en `createProceduralPuppetTextures.ts`**:
- Añadidos `paintFieldBodyBack`, `paintGoalieBodyBack`, `paintFieldHeadBack`, `paintGoalieHeadBack`.
- Mismo sistema de paleta `OUTLINE/WHITE/SHADE/MID`; sin jaula ni peto frontal — collar trasero, dorsal, domo de casco.
- `visuals.ts` cambia textura en runtime (`setTexture`) cuando `forwardY < -0.35` (jugador alejándose de cámara).

**Pendiente de roadmap actualizado**:
- Animación de patinaje procedural v3: COMPLETADA → movida a completado.

**Validación**: `npm run build` pasa.

Entradas anteriores: docs/worklog-archive.md
