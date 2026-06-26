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
  main.ts                    Bootstrap Phaser, HTML shell, botón fullscreen
  scenes/MatchScene.ts       Escena principal — orquestador del ciclo del partido
  game/
    constants.ts             Todas las constantes de física y gameplay (tuning aquí)
    types.ts                 Tipos: Player, Vector, ActiveBully, ActiveFoulRestart
    formation.ts             Posiciones iniciales por formación
    utils.ts                 Helpers generales
    entities/
      createBall.ts
      createPlayer.ts
    render/
      drawRink.ts            Pista, porterías y marcas (todo por código, sin assets)
      viewTransform.ts       Transform mundo→pantalla para perspectiva 3/4
      createProceduralPuppetTextures.ts  Texturas procedural/pixel para puppet
    systems/
      ai.ts                  IA de portero y jugadores de campo
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
    input/
      mobileJoystick.ts      nipplejs + botones táctiles (A/B/S)
tools/
  generate-comfy-asset.ps1   Helper para generar borradores 2D con ComfyUI local
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

### Controles (teclado)

| Acción | Tecla |
|---|---|
| Mover | WASD / flechas |
| Sprint | Shift |
| Tiro (con posesión) / robo (sin posesión) | U |
| Pase (con posesión) / cambio de jugador (sin posesión) | Y |

### Controles (móvil)

Joystick analógico izquierdo (nipplejs), botones A (tiro/robo), B (pase/cambio), S (sprint), ⛶ (fullscreen).

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
- Render 3/4 por transform de mundo a pantalla (`viewTransform.ts`)
- Jugadores, porteros, sticks y pelota con puppet procedural por piezas tintables
- Menú inicial, panel de ajustes, audio procedural, animación de stick
- Animación de patinaje procedural v3: fase acumulada, contrafase 180°, zancada por dirección, `sideFactor`, texturas de espalda, sprint

### Pendiente

- [ ] Ajuste de físicas de patinaje (sensación más deslizante)
- [ ] Separar sistema de reglas en módulo propio (`systems/rules.ts` puede crecer)
- [ ] UI definitiva, sprites finales

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

### 2026-06-23 (sesión 19) — patinaje procedural y profundidad por dirección

**Problema**: la animación del puppet se leía más como caminar que como patinar; el sprint no aceleraba visualmente y las proporciones no ayudaban a sugerir profundidad.

**Cambio visual**:
- `visuals.ts` liga el ciclo de animación a la velocidad real y a `player.sprinting`.
- Se reduce casi a cero el bob vertical y se reemplaza por deslizamiento lateral/diagonal de patines.
- El sprint aumenta cadencia, separación de patines, lean corporal y alargamiento de la sombra.
- Las piezas del puppet cambian escala/posición según dirección: hacia cámara se ven algo más anchas/altas; alejándose se comprimen; en lateral se estrechan.

**Validación**: `npm run build` pasa.

### 2026-06-23 (sesión 18) — corrección de lectura 3/4 del puppet

**Problema**: la primera versión procedural por piezas seguía pareciendo full top-down. Aunque las piezas estaban separadas, el container completo rotaba en 360º y el torso/casco se leían como una ficha sobre la pista.

**Cambio visual**:
- `createProceduralPuppetTextures.ts` redibuja cuerpos y cascos con silueta vertical tipo sticker: torso frontal, peto/jersey visible, casco con máscara frontal y base de patines.
- `createPlayer.ts` recoloca el puppet con root en el suelo: patines abajo, cuerpo encima y casco solapando el torso.
- `visuals.ts` deja de rotar el container completo. El personaje funciona como billboard 3/4 con flip/offsets según dirección; el stick mantiene ángulo visual en pantalla y ángulo físico separado (`stickWorldAngle`) para contactos.

**Validación**: `npm run build` pasa. El dev server sigue activo en `http://127.0.0.1:5180/`. No se añadieron dependencias nuevas para capturas automáticas.

### 2026-06-23 (sesión 17) — puppet procedural por piezas

**Decisión**: se abandona la integración de sprites completos generados por IA para jugadores/porteros. Los candidatos no eran coherentes entre equipos, mezclaban perspectivas laterales con pista 3/4 y rompían proporciones. Para mantener consistencia estilo SMOL, el personaje se construye por partes tintables compartidas.

**Limpieza**: retirados `public/assets/skaters-arcade.png`, `public/assets/goalies-arcade.png` y los PNG generados de `public/assets/generated/`. Se conservan los assets antiguos (`players.png`, `goalie-blue.png`, `goalie-red.png`) como histórico/fallback no activo.

**Runtime nuevo**:
- `src/game/render/createProceduralPuppetTextures.ts` genera texturas para cuerpo, casco, brazos, patines, stick y pelota.
- `createPlayer.ts` monta cada jugador como `Container` con piezas independientes.
- `visuals.ts` anima patines, brazos, bob corporal y stick en espacio local del container.
- `createBall.ts` usa textura `puck-pixel` y mantiene coordenadas de física separadas del visual.

**Validación**: `npm run build` pasa. Edge headless/CDP se quedó colgado al intentar sacar captura automática; se limpiaron los procesos temporales de Edge.

### 2026-06-23 (sesión 16) — sprites arcade 3/4 animados (rechazado)

**Dirección visual**: se adopta una cámara `three-quarter top-down arcade sports` para personajes. Es menos ortográfica que el top-down puro, pero mejora presencia y lectura arcade sin tocar radios de colisión.

**Assets generados e integrados inicialmente, luego retirados**:
- `public/assets/skaters-arcade.png`: spritesheet 2048×256, frames 0-3 azul y 4-7 rojo.
- `public/assets/goalies-arcade.png`: spritesheet 2048×256, frames 0-3 azul y 4-7 rojo.

**Selección visual**: los sprites fuente salieron de ComfyUI SDXL + `pixel-art-xl.safetensors`. Candidatos revisados en `public/assets/generated/candidate-contact-sheet.png` y `candidate-extra-contact-sheet.png`. Seleccionados: `candidate-player-blue-standing_00001_`, `candidate-player-red_00002_`, `candidate-goalie-blue_00003_`, `candidate-goalie-red-compact_00001_`.

**Runtime histórico**: `Player.body` pasó temporalmente a `Phaser.GameObjects.Sprite`; `MenuScene` cargaba `skaters-arcade` y `goalies-arcade`; `createPlayer.ts` elegía textura según rol y frame base por equipo; `visuals.ts` animaba frames por velocidad. Este enfoque fue reemplazado por puppet procedural en la sesión 17.

**Motivo de rechazo**: incoherencia entre equipos, perspectiva demasiado lateral y mala integración con la pista 3/4.

### 2026-06-23 (sesión 15) — actualización del pipeline ComfyUI para sprites utilizables

**Problema detectado**: el pipeline inicial usaba `v1-5-pruned-emaonly-fp16.safetensors`, demasiado genérico para generar jugadores/porteros top-down con calidad consistente. Ese modelo queda como legacy/smoke test, no como fuente de assets finales.

**Modelos instalados en D:** descargados en `D:\AI\ComfyUI\ComfyUI\models\`: `sd_xl_base_1.0.safetensors` en `checkpoints`, `pixel-art-xl.safetensors` y `spritesheet.safetensors` en `loras`.

**Helper actualizado** (`tools/generate-comfy-asset.ps1`): añade perfiles `pixel-sprite`, `spritesheet` y `legacy-sd15`; soporte de LoRA; `BatchSize`; prompts positivos enriquecidos por perfil; negativos explícitos contra escena/pista/vallas para personajes; resultado JSON con perfil, checkpoint, LoRAs, prompt final y lista de imágenes copiadas.

**Validación smoke**: `pixel-sprite` generó `public/assets/generated/smoke-player-blue-single_00001_.png`, un sprite aislado razonable como borrador de personaje, aunque no top-down puro. `spritesheet` generó `smoke-player-blue-sheet-sdxl_00001_.png`, técnicamente correcto como ejecución del workflow pero no válido todavía como hoja de 4 frames; requerirá más tuning, imagen de referencia o ControlNet antes de integrarse.

**Regla nueva**: generar tandas de candidatos y revisar visualmente antes de tocar runtime. Ningún asset de personaje se integra solo porque ComfyUI haya generado un PNG.

### 2026-06-23 (sesión 14) — intento de spritesheets rechazado

**Resultado**: se intentó sustituir los sprites ilustrados actuales por spritesheets animados procedurales (`skaters-anim.png`, `goalies-anim.png`), pero la revisión visual mostró una calidad artística claramente inferior. Los PNG fueron retirados del proyecto y el juego vuelve a usar `players.png`, `goalie-blue.png` y `goalie-red.png`.

**Estado técnico**: se deshizo la integración runtime de los spritesheets. `Player.body` vuelve a ser `Phaser.GameObjects.Image`; `MenuScene.ts` vuelve a cargar/procesar los PNG ilustrados existentes; `visuals.ts` conserva rotación, lean lateral, sombra, stick, selección y stamina sin cambio de frames.

**Lección**: ningún asset generado, procedural o IA, debe pasar a asset final sin revisión visual en el juego. Para el siguiente intento de animación, generar primero borradores en `public/assets/generated/`, revisar el PNG aislado y una captura in-game antes de tocar `createPlayer.ts` o `visuals.ts`.

### 2026-06-23 (sesión 13) — ComfyUI local para assets 2D

**ComfyUI portable en D:** instalado en `D:\AI\ComfyUI` desde la release oficial Windows portable NVIDIA (`v0.25.1`). Se configuró para escuchar solo en `127.0.0.1:8188`, con salida en `D:\AI\ComfyUI\output\`, cachés en `D:\AI\ComfyUI\.cache\` y temporales en `D:\AI\ComfyUI\tmp\`. Modelo base descargado: `v1-5-pruned-emaonly-fp16.safetensors`.

**Scripts de operación** (`D:\AI\ComfyUI`): `launch-openclaw-detached.ps1` arranca ComfyUI en segundo plano con logs locales; `start-openclaw.ps1` mantiene sesión adjunta; `stop-openclaw.ps1` detiene el proceso asociado al portable. `OPENCLAW-README.md` documenta rutas y desinstalación limpia borrando `D:\AI\ComfyUI` y opcionalmente `D:\AI\downloads\ComfyUI_windows_portable_nvidia_v0.25.1.7z`.

**Helper de assets** (`tools/generate-comfy-asset.ps1`): envía un workflow SD 1.5 mínimo a ComfyUI, arranca el servidor si no responde, espera el historial del prompt, deja el PNG crudo en `D:\AI\ComfyUI\output\rink_hockey_game\` y copia una versión no destructiva a `public/assets/generated/`.

**Skill local** (`.openclaw/skills/comfyui-asset-generation/SKILL.md`): recoge prompts recomendados, rutas, naming, límites de revisión y ejemplos para jugadores, porteros y pelota. Prueba validada con `ball-orange-test_00001_.png`.

### 2026-06-22 (sesión 12) — refactoring 0.2.0

**Helper `getGoalLineX(side)` extraído** (`utils.ts`): la expresión `RINK.x + GOAL_LINE_OFFSET` / `RINK.x + RINK.width - GOAL_LINE_OFFSET` se repetía en 9 lugares de 6 archivos distintos. Centralizada en `utils.ts`; `ai.ts`, `ball.ts`, `matchFlow.ts`, `drawRink.ts` y `MatchScene.ts` actualizados para usarla. Los archivos que solo la usaban para eso eliminaron `GOAL_LINE_OFFSET` y/o `RINK` de sus imports.

**`getRoleShort`/`getRoleName` → Record maps** (`utils.ts`): las funciones switch-case se reescribieron como lookups sobre `Record<Role, string>`. Misma semántica, sin ramas.

**Constantes de IA** (`constants.ts`): extraídos tres números inline de `ai.ts` → `AI_SHOOT_DISTANCE = 370`, `AI_MARK_RADIUS = 72`, `AI_OPEN_MATE_GAP = 80`. Úsalos en lugar de literales en `shouldAIShoot` y `shouldAIPassToOpenMate`.

**Versión**: `0.1.0` → `0.2.0` en `package.json`.

El historial detallado de sesiones anteriores (2026-04-24 → 2026-06) está preservado en git. El registro arrancó en `.copilot/work-log.md`, eliminado al migrar la documentación a este archivo.

**Punto de trabajo más reciente (2026-06):** corrección de ghost goals y requisito de entrada frontal en portería. La portería ya funciona como jaula simplificada. Punto pendiente de validar en juego: *geometría exacta de la jaula y relación entre anclaje del balón al portador, rebote en estructura trasera y gol*.

### 2026-06-21 (sesión 4) — refactor y pulido

**Constantes añadidas** (`constants.ts`): `PERIOD_COUNT`, `PERIOD_RESTART_DELAY_MS`, `BULLY_PLAYER_OFFSET`, `MAX_BALL_SPEED`, `DIRECT_FREE_HIT_FOUL_THRESHOLD`.

**Const objects** (`types.ts`): `ROLE`, `TEAM`, `SIDE`, `SANCTION` — eliminan literales de string sueltos en todo el codebase.

**Bugs corregidos**:
- `applyGoalReset` en `matchFlow.ts`: `70` hardcoded → `RINK.x`, `message.includes('azul')` → parámetro `scorer: TeamColor` tipado.
- `tryGoalieSave` en `ball.ts`: `Date.now()` → parámetro `now: number` (consistencia con reloj de escena).
- Import sin usar `getClosestPlayerToBall` en `ai.ts`.

**Simplificaciones**:
- `BULLY_PLAYER_OFFSET` en `startBullyState` y `updateBullyState` (antes `const offset = 26`).
- `DIRECT_FREE_HIT_FOUL_THRESHOLD` en `rules.ts` (antes `fouls >= 10`).
- `PERIOD_COUNT` y `PERIOD_RESTART_DELAY_MS` en `matchClock.ts`.
- `SANCTION.DIRECT_FREE_HIT/FREE_HIT` en `rules.ts`.

**CSS** (`style.css`): variables CSS en `:root` (`--c-bg`, `--c-overlay`, `--c-border`, `--z-controls`, `--z-hud-btn`, `--radius-hud-btn`). Declaración duplicada de `body` fusionada. Eliminado `-ms-touch-action` (IE11).

**HUD** (`createHud.ts`, `matchHud.ts`): tipografía cambiada a monospace, texto con stroke en lugar de fondo sólido (estética futurista alineada con MenuScene). Extraída función `formatClock()` y constante `CONTROLS_HINT`.

### 2026-06-21 (sesión 3)

- Añadida `MenuScene` (`src/scenes/MenuScene.ts`): pantalla de inicio con título, puck animado, decoración de pista esquemática y hint de controles. Muestra el resultado del partido anterior al volver del match.
- `MatchScene` al finalizar ya no reinicia directamente: va al menú pasando marcador final (`blueScore`, `redScore`).
- Mejoradas físicas de patinaje: `PLAYER_FRICTION` 0.9 → 0.925 (más deslizamiento al soltar teclas).
- Ajuste de robos desde atrás: `LOOSE_FRONT` 0.13→0.05, `FOUL_FRONT` 0.04→0.07, frecuencia de intento IA desde atrás ×0.18.

### 2026-06-21 (sesión 2)

- Actualizado el stack a versiones latest: Phaser 4.2.0, Vite 8.0.16, nipplejs 1.0.4, TypeScript 6.0.3.
- Añadido sistema de sonido procedural en `src/game/audio/sounds.ts` (WebAudio API, sin assets externos): pass, shot, pickup, save, steal, whistle, foul, goal. Integrado en `MatchScene.ts`.
- Reescrita la IA de campo (`ai.ts`) con comportamiento diferenciado por rol: pivot da opción de pase cerca del portador, ala hace carrera hacia zona de remate, defensa mantiene posición de seguridad y no sobre-ataca. En defensa: defensa presiona/cubre pasillo, ala marca ala rival, pivot cubre canal central.
- Mejorada la IA del portero: cobertura de ángulo (Y proporcional al ángulo bola-portería), vuelve al centro cuando la bola está detrás de la línea de portería.
- Mejorado `shouldAIShoot`: ya no dispara desde ángulos cerrados ni de espaldas a portería (dot product con dirección a portería > 0.28).

### 2026-06-21 (sesión 5) — evolución del juego

**Barras de stamina**: cada jugador azul de campo tiene una barra de 36×3 px debajo del cuerpo. El color cambia de azul (>50%) a amarillo (>25%) a rojo (<25%). Se actualiza en `visuals.ts`.

**Flash de gol**: overlay dorado `#ffec88` tween `alpha: 0.42→0, 460 ms, Expo.Out` sobre toda la pantalla al marcar gol.

**Etiquetas monospace**: tipografía `"Courier New", Courier, monospace` con stroke en labels de jugadores y HUD para estética futurista coherente.

**Penalización de velocidad por stamina** (`movement.ts`): cuando `stamina < STAMINA_LOW_THRESHOLD` (18), el `maxSpeed` se multiplica por `STAMINA_EXHAUSTED_SPEED_FACTOR` (0.78). El portero queda excluido.

**Faltas en el menú de resultado** (`MenuScene.ts`): la pantalla de resultado ahora muestra `faltas AZ N · RJ N` bajo el marcador. `MatchScene` pasa `blueFouls`/`redFouls` al iniciar la escena de menú. `MenuData` actualizado con los campos opcionales.

**Fix vuelta al menú en móvil** (`MatchScene.ts`): el bloque `matchEnded` ahora rastrea `prevTouchButtons` y detecta el botón A (disparo) para volver al menú desde dispositivos táctiles. Texto de fin de partido diferenciado por dispositivo (`Pulsa U` vs `Pulsa A`).

**Constante nueva**: `STAMINA_EXHAUSTED_SPEED_FACTOR = 0.78` en `constants.ts`.

### 2026-06-21 (sesión 7) — sprites de jugadores e hielo

**Sprite sheet** (`public/assets/players.png`, 1254×1254): grid 2×2 con frame 0=azul, 1=rojo, 2=pelota, 3=vacío. Cuadrante 627×627 px. Cargado en `MenuScene.preload()` con `load.spritesheet`.

**Jugadores con sprite** (`createPlayer.ts`, `visuals.ts`, `types.ts`):
- `Player.body` pasó de `Arc` a `Image` con el frame del equipo correspondiente
- Tamaño visual `radius * 3.0` (mayor que el radio de colisión, que no cambia)
- `Player.shadow`: elipse oscura achatada bajo el sprite (da ground contact)
- `Player.selectionRing`: arc sin relleno que muestra estado activo (amarillo) o portador (verde)
- La rotación del sprite sigue `player.facing` con corrección por ángulo nativo del frame (`SPRITE_NATIVE_ANGLE`: 0 para azul, π para rojo)
- El parámetro `color` en `createPlayer` ya no se usa (prefijado `_color`); la identidad de equipo se expresa por frame

**Pelota** (`createBall.ts`): color actualizado a naranja `0xf5a120` para coincidir con el sprite del pack.

**Pista visual** (`drawRink.ts`):
- Superficie: `0xfefefe` → `0xe4f2fb` (hielo azulado)
- Rayaduras horizontales de hielo: líneas a 9% opacidad cada 26px
- Líneas de zona: `0xe32626` → `0x2060cc` (azul más realista)
- Bordes de pista y líneas: `0x111111` → `0x0a1525`
- **Red de portería**: cuadrícula `0.8px` a 55% opacidad dentro del marco de cada portería
- Marco de portería: grosor `4` → `5` px

**Assets**: `tmp_sprites/` añadido a `.gitignore` (el watcher de Vite fallaba con `.crdownload` si la carpeta estaba dentro del workspace).

### 2026-06-22 (sesión 11) — reglas oficiales: zona D, tarjeta azul, libre indirecto

**Fuente**: https://elsuperhincha.com/reglas-hockey-patines/ (guardada en memory/game-rules.md)

**Zona de protección del portero / semicírculo D** (`drawRink.ts`, `constants.ts`, `rules.ts`, `MatchScene.ts`):
- `GOALIE_ZONE_RADIUS = 108` (≈ 3.8 m en escala real).
- `drawGoalCrease` reemplazado: semicírculo D con relleno rojo translúcido (7% opacidad) y borde rojo.
- `checkGoalieZoneFoul` en MatchScene: si un rival (no portero) está dentro de la zona D mientras el portero tiene la posesión → `registerGoalieZoneFoul` → falta directa + tarjeta azul automática. No se dispara si ya hay `pendingFoul`.

**Tarjeta azul / inferioridad numérica** (`types.ts`, `rules.ts`, `movement.ts`, `playerControl.ts`, `matchActions.ts`, `visuals.ts`, `matchHud.ts`):
- `Player.suspendedUntil: number` — timestamp hasta el que el jugador está expulsado.
- `BLUE_CARD_DURATION_MS = 120_000` (2 minutos reglamentarios). `BENCH_Y_TOP / BENCH_Y_BOTTOM` para posiciones de banquillo.
- `registerBlueCard(player, timeNow)` en `rules.ts`. Se llama automáticamente en falta directa por acumulación (10+ faltas) y en invasión de zona D.
- `updateSuspendedPlayers(players, timeNow, dt)` en `movement.ts`: mueve al jugador al banquillo a velocidad de sprint. No colisiona con jugadores en pista.
- IA y `playerControl.ts` saltan jugadores con `suspendedUntil > timeNow`. `matchActions.ts` los excluye de candidatos a reclamar el balón.
- `visuals.ts`: jugador suspendido mostrado en el banquillo a 35% alpha; etiqueta "AZUL", sin anillo ni stick.
- HUD (`matchHud.ts`): sub-línea muestra "⬛ AZ Ns / RJ Ns" para cada suspensión activa.
- Auto-switch: si el jugador controlado es expulsado, el control pasa al siguiente disponible.

**Libre indirecto auténtico** (`matchFlow.ts`):
- `free-hit`: solo la tecla de pase puede ejecutar el saque; la tecla de disparo no hace nada durante el saque libre. Refleja la regla real: "no puede disparar directo a portería".
- `direct-free-hit` y `penalty`: sin cambios, permiten disparo directo.

**Mensajes actualizados** (`rules.ts`): falta directa muestra "Tarjeta azul, X (N faltas)".

### 2026-06-22 (sesión 10) — posicionamiento táctico en faltas y bullys a velocidad real

**Falta desde el lugar exacto** (`matchFlow.ts`): `restartY` en `startFoulRestartState` usaba siempre `GAME_HEIGHT/2`; ahora usa `foul.restartY` para saques libres y `GAME_HEIGHT/2` solo para directas/penaltis.

**Posicionamiento táctico de IA** (`matchFlow.ts`, `updateFoulRestartState`): durante la ventana de setup de saque libre, los aliados se colocan tácticamente por rol (alas abren amplitud ~185 px adelante, pivot a ~95 px, defensor retrocede ~85 px), y los rivales se desplazan defensivamente (32%/42% hacia la bola, con distancia mínima reglamentaria de 60 px).

**Movimiento a velocidad de sprint** (`matchFlow.ts`): añadida función `movePlayerToward(player, tx, ty, dt)` que mueve al jugador como máximo `PLAYER_SPRINT_MAX_SPEED * dt` px/frame y actualiza `velocity` y `facing`. Sustituye los lerps (0.09/0.10 por frame) en `updateFoulRestartState` y `updateBullyState`. La convergencia está garantizada dentro de la ventana de setup.

**Letrero de falta menos intrusivo** (`createHud.ts`): eliminado `backgroundColor` del `centerText`; fontSize reducido a 30px; padding a cero. El mensaje de falta es solo texto con stroke — no bloquea la visión del campo.

**Letrero oculto en fase ready** (`matchFlow.ts`): durante la fase de actuación (`time >= readyAt`), `centerText` se oculta (`setVisible(false)`) para no tapar el indicador de puntería mientras el jugador apunta.

**`dt` propagado** (`MatchScene.ts`, `sceneFlow.ts`): los callbacks `updateBullyState` y `updateFoulRestartState` en `handleSpecialMatchStates` reciben `dt`; las firmas privadas en `MatchScene` y las funciones exportadas en `matchFlow.ts` actualizadas.

### 2026-06-22 (sesión 9) — faltas, bullys y penaltis animados

**Jugadores caminan a posición** (`matchFlow.ts`): eliminados los snaps instantáneos en `startFoulRestartState` y `startBullyState`. Los jugadores ahora se desplazan con lerp (0.12/frame el ejecutante, 0.09/frame los demás) hacia sus posiciones durante la ventana de setup. La pelota sí teleporta (menos jarring).

**Indicador de puntería** (`MatchScene.ts`): nuevo método `drawAimIndicator` — serie de puntos pulsantes en la dirección de `player.facing`, con color diferenciado (blanco = saque libre, amarillo = falta directa, naranja = penalti) y marcador circular en el extremo. Visible solo cuando ya se puede actuar.

**Apuntería con teclado** (`MatchScene.ts`): durante el saque libre, los jugadores humanos en teclado podían apuntar (bug: no se leía el input durante estados especiales). Ahora se leen WASD/flechas en `updateFoulRestartState` para actualizar `player.facing`.

**Mensajes mejorados** (`matchFlow.ts`): "Saque libre — apunta y saca", "Falta directa — apunta y dispara", "Penalti — apunta y dispara" en lugar de los genéricos anteriores.

**Countdown de bully** (`matchFlow.ts`): durante la animación de acercamiento del bully, el centerText muestra "Bully — 1", "Bully — 2"… en lugar de solo "Bully". Jugadores se acercan entre sí en lugar de aparecer directamente.

### 2026-06-22 (sesión 8) — animación de golpeo, lean corporal y IA de pase

**Animación de stick** (`visuals.ts`, `types.ts`, `constants.ts`): al ejecutar tiro, pase o robo exitoso, el stick barre un arco de ~63° en la dirección de cara en 160 ms (seno suave 0→peak→0). `Player.stickSwingUntil` guarda el timestamp de fin; `STICK_SWING_MS = 160` en constants. Se activa en `tryShot`, `tryPass` y `tryManualSteal` (cuando hay contacto).

**Lean corporal al patinar** (`visuals.ts`): el sprite de los jugadores de campo se inclina levemente (máx ±8.6°) en la dirección de su velocidad lateral respecto a la cara. El portero mantiene rotación fija.

**Camera shake en gol** (`MatchScene.ts`): `cameras.main.shake(300, 0.011)` al marcar gol para dar impacto físico al evento.

**IA de pase mejorada** (`ai.ts`, `MatchScene.ts`): nueva función `shouldAIPassToOpenMate` — si el portador rojo tiene un compañero desmarcado (ningún rival a <72 px) que está ≥80 px más cerca del gol, la probabilidad de pase sube de 1.2% a 4.2% por frame. Hace la IA más dinámica y menos predecible.

**Refactor de firma** (`sceneFlow.ts`, `matchFlow.ts`): `updateVisuals` ahora recibe `timeNow: number` como quinto argumento; `handleSpecialMatchStates` y `refreshKickoffVisuals` también propagado.

### 2026-06-21 (sesión 6) — menú de ajustes y HUD mínimo

**Panel de ajustes DOM** (`main.ts`, `style.css`): overlay accesible desde cualquier escena mediante el botón ⚙ (top-right). Contiene: sección PANTALLA (toggle fullscreen), sección TECLADO (referencia de controles), sección TÁCTIL (solo en dispositivos touch). Se cierra con ✕, clic en el backdrop o Escape. El partido se pausa automáticamente al abrir y se reanuda al cerrar (`game.scene.pause/resume('match')`).

**Fix fullscreen estirado**: añadido listener `fullscreenchange` que llama `requestAnimationFrame(() => game.scale.refresh())` para reajustar la escala tras entrar/salir de pantalla completa.

**HUD mínimo**: eliminada la línea de controles del sub-HUD en partida. El sub-HUD ahora solo muestra `ROL azul · Stam N%` (más `SPRINT` si activo). La referencia de controles está en el panel de ajustes.

**Limpieza**: eliminado `fullscreenButton` de `mobileJoystick.ts` y su llamada en `MatchScene.ts` (fullscreen ahora gestionado exclusivamente por `main.ts`). Variables CSS extendidas en `:root` (`--c-accent`, `--c-text`, `--c-text-dim`, `--c-text-muted`, `--z-settings`, `--font-mono`).
