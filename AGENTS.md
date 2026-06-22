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
- Menú inicial, panel de ajustes, audio procedural, animación de stick

### Pendiente

- [ ] Ajuste de físicas de patinaje (sensación más deslizante)
- [ ] Separar sistema de reglas en módulo propio (`systems/rules.ts` puede crecer)
- [ ] Animación de patinaje
- [ ] UI definitiva, sprites finales

### Backlog

- [ ] Multijugador local
- [ ] Portero con IA más especializada
- [ ] IA táctica avanzada
- [ ] Selección de equipos

## Assets

Todo renderizado por código, sin archivos de imagen o audio externos.

| Asset | Estado |
|---|---|
| Jugadores (shapes por equipo + stick) | Implementado |
| Bola | Implementada |
| Pista y porterías | Implementadas en `drawRink.ts` |
| HUD | Implementado |
| Sprites ilustrados definitivos | Pendiente |
| Audio (golpeo, gol, silbato, ambiente) | Pendiente |
| Animación de patinaje | Pendiente |

## Work log

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
