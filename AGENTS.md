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
  main.ts                    Bootstrap Phaser (espera a la fuente Russo One) y coordinación del shell: Esc, pausa, paneles, mando en menús, orientación
  shell/                     Shell DOM: template (marcado e iconos SVG), pauseMenu, settingsPanel (pestañas, volumen, reasignación de teclas), graphicsSettings (pestaña Gráficos: calidad, opciones sueltas, FPS) y qualityProbe (prueba del equipo), menuNav (navegación tipo consola), fullscreen
  style.css                  Shell DOM con estética de juego; visibilidad por `data-scene` (menu/match) y `data-input` (keyboard/gamepad/touch)
  scenes/MenuScene.ts        Menú: pabellón real de fondo con cámara a la deriva, logo, tarjetas ARCADE / REGLAMENTO (localStorage `rh-mode`), resultado final
  scenes/menuSetup.ts        Segunda pantalla del menú «prepara el partido»: equipos (elegir lado con partido externo), dificultad y JUGAR / VOLVER / PARTIDO LIBRE; foco por filas
  scenes/menuStyle.ts        Paleta y paralelogramo comunes a las dos pantallas del menú
  scenes/MatchScene.ts       Escena principal — orquestador del ciclo del partido: simulación a paso fijo (stepSimulation) y pintado interpolado (renderFrame)
  scenes/LabScene.ts         Escena de laboratorio para capturas (solo DEV, `?lab=`)
  scenes/lab/                labParams, labFigures, labScenes: escenas de laboratorio (solo DEV); labActionStrips y labGoalieStrips: tiras de acciones y portero; labSmoke: partido de humo
  scenes/lab/stylePrototypes.ts  prototipos de estilo de WP-20 (A, B, C) en `?lab=style`
  scenes/lab/style/          rig, parts, paintVector, paintPixel: prototipos de estilo de WP-20; base del rig de WP-30
  game/
    constants.ts             Todas las constantes de física y gameplay (tuning aquí)
    types.ts                 Tipos: Player, Vector, ActiveBully, ActiveFoulRestart, GameMode, PowerupKind
    externalMatch.ts         Partido externo (enlace de partido v1 de loyola-hockey-matches, `#partido=<base64url JSON>`): validación a mano del payload, estado (equipo que controla la persona), escudos como texturas `escudo-local|visitante` y huecos 'blue' (humano) / 'red' (IA) → equipo del partido
    formation.ts             Posiciones de formación por lado y helpers de lado (teamSide, scorerAtGoal, attackDir, switchSides)
    utils.ts                 Helpers generales
    perf/perfMonitor.ts      Monitor de rendimiento: panel `?perf=1` (también en producción) e informe `[perf] {json}` con `?perfMs=N`
    entities/
      createBall.ts
      createPlayer.ts
    render/
      drawRink.ts            Fachada de la pista: llama a los módulos de `rink/` y hornea el resultado
      rink/                  geometry, markings, boards (vallas), ads (publicidad), goal (portería con tubos, redes y sombra), benches (banquillos), table (mesa y sancionados)
      arena.ts               Pabellón: monta suelo, gradas y público de `stands/` y anima el público según la calidad
      stands/                Gradas (WP-68): layout (anillo de 8 tramos y `standPoint`), structure (escalones, peto con LED, cristal), vomitory, fans y sideFan (bustos de cara, de espaldas y de tres cuartos), crowd (horneado del público y peñas), pack (empaquetado en pocas texturas)
      lighting.ts            Pozos de luz y viñeta horneados (WP-61)
      officials.ts           Figura y pose de los árbitros (rig `official`, `footGait`); el movimiento va en `systems/officials.ts`
      benchPlayers.ts        Suplentes, delegados, entrenadores y mesa (WP-69), con poses de `benchPoses.ts` horneadas por `figureBaker.ts` en una sola Image por figura; reaccionan a los eventos `match:*` de MatchScene
      viewTransform.ts       Cámara de perspectiva única: project(wx,wy,wz,out) → x, y, s; `leanAt`/`projectLeaned` para la inclinación de lo que tiene altura en los fondos (WP-70)
      artSpec.ts             Escala visual (PX_PER_M, FIGURE_EXAG), parámetros de cámara y capas DEPTH
      createProceduralPuppetTextures.ts  Texturas procedural/pixel para puppet
      puppet/                Rig 2D por huesos con IK de dos huesos (skeleton, rig, pose); piezas en un atlas compartido (atlas, textures, paint, kit); locomoción quad (WP-31: locomotion.ts, locomotionGaits.ts) y a pie (footGait.ts); stick y acciones (WP-32: upperBody.ts, actions.ts, actionClips.ts); portero (WP-33/WP-67: goalie.ts, goalieClips.ts)
      arcadeFx.ts            Partículas, auras, estela de bola, bloques de hielo, banners (modo arcade); densidad según la calidad
      bake.ts                Horneado de Graphics estáticos en texturas (bakeGraphics, bakeGraphicsSince): drawRink, redes, HUD
      quality.ts             Calidad gráfica auto/alta/media/baja/personalizada (`rh-quality`, `?quality=`) y opciones sueltas (nitidez, público, partículas); lo aprendido en auto (`rh-quality-auto`) y la prueba del equipo (`rh-quality-probe`)
      qualityGovernor.ts     Medidor de trabajo por fotograma (`FrameWorkMeter`, CPU con la simulación proyectada a 55 fps) y regulador de auto (`QualityGovernor`)
    systems/
      ai.ts                  IA de portero y jugadores de campo
      arcade.ts              ArcadeController: turbo, tiros turbo/fuego/súper, cargas, rachas, rubber-band; coordina los tres siguientes
      arcadePowerups.ts      Powerups arcade (9 tipos): aparición, recogida, efectos
      arcadeTricks.ts        Primer toque, efecto, barra de súper, billar, cámara lenta, combos del gol
      arcadeEvents.ts        Eventos de partido (gol doble, hielo, lluvia de powerups)
      cameraDirector.ts      Cámara dinámica (seguimiento con anticipación, zoom contextual, punch)
      ball.ts                Física y posición de la pelota
      matchActions.ts        Acciones: pase, tiro, robo, contactos, parada portero
      matchClock.ts          Reloj acelerado (2 partes de 25:00), descanso y escala tiempo de juego ↔ real (`matchTime`)
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
      arcadeHud.ts           Barras de súper y turbo y línea de estado (arcade)
      hudLayout.ts           Anclaje del HUD a las esquinas visibles con zonas seguras; en táctil el turbo sube bajo el marcador
      scoreboard.ts          Videomarcador común (ambos modos)
      prefs.ts               Preferencias: etiquetas de rol (`?labels=1|0`) y minutos reales por parte (`?half=N`)
    audio/
      sounds.ts              Audio procedural Web Audio (incluye público, cargas, powerups)
      announcer.ts           Locutor con Web Speech API (voz española si existe; on/off en ajustes)
    input/
      mobileJoystick.ts      nipplejs + botones táctiles (A/B/S)
      keyBindings.ts         Teclas configurables por acción (2 por acción, localStorage `rh-keys`)
      gamepad.ts             Gamepad API: sondeo por frame y botones lógicos con «recién pulsado» consumible
      inputMode.ts           Último dispositivo usado (touch/keyboard/gamepad) y textos de botón por dispositivo
tools/
  partido-ejemplo.json       Payload v1 de ejemplo (dos equipos con escudo y plantilla)
  partido-url.mjs            `node tools/partido-url.mjs [payload.json] [urlJuego]` imprime la URL con `#partido=`
  generate-comfy-asset.ps1   Helper para generar borradores 2D con ComfyUI local
  gfx-shot.ps1               Capturas headless (Chrome/Edge) + volcado de consola para el workflow gráfico
  gfx-smoke.ps1              Partido de humo IA contra IA headless (`?lab=match&auto=1`): imprime `[smoke] {json}`
  perf-bench.mjs             Banco de rendimiento headless (CDP, sin dependencias): perfiles escritorio/portatil/movil/movil-bajo y `--soft`; imprime `[perf-bench] {json}`
  perf-trace.mjs             Resumen de una traza de Chrome: tiempo propio y total por función
docs/
  graphics/                  Renovación gráfica: WORKFLOW (proceso y roles), SPEC (biblia de arte, medidas, cámara),
                             AUDIT (diagnóstico 2026-11-15), BACKLOG (WPs, decisiones, propiedad de archivos), shots/
  perf/                      Rendimiento y pulido: WORKFLOW (presupuestos, herramientas y reglas para todo el desarrollo),
                             BACKLOG (paquetes P-XX con medidas), bench/ (resultados en bruto del banco)
  evo/                       Evolutivo de animación, IA y dificultad: WORKFLOW (roles, ciclo, medir), BACKLOG (E-XX), smoke/ (humo en bruto)
  setpiece/                  Lanzamientos (penalti y libre directo en tercera persona): WORKFLOW, BACKLOG (D-XX y L-XX), shots/, batch/ (lotes headless)
  balance/                   Equilibrio: dificultad en móvil y simetría de porteros; WORKFLOW, BACKLOG (B-XX), smoke/, real/ (partidos reales con ?stats=1)
.claude/
  agents/gfx-*.md            Agentes del workflow gráfico: engineer (opus), builder (sonnet), qa (haiku)
  agents/perf-*.md           Agentes del workflow de rendimiento: engineer (opus), builder (sonnet), qa (haiku)
  commands/gfx.md            /gfx — coordinador del workflow gráfico
  commands/perf.md           /perf — coordinador del workflow de rendimiento
  agents/ai-engineer.md      IA táctica, portero y dificultad (opus) del workflow evolutivo
  commands/evo.md            /evo — coordinador del workflow evolutivo (docs/evo/)
  commands/lanz.md           /lanz — coordinador del workflow de lanzamientos (docs/setpiece/); agentes lanz-engineer (opus), lanz-artist (sonnet), lanz-qa (haiku), más ai-engineer y bal-tuner
  commands/bal.md            /bal — coordinador del workflow de equilibrio (docs/balance/); agentes bal-tuner (sonnet) y bal-qa (haiku)
.openclaw/
  skills/
    comfyui-asset-generation/SKILL.md
public/
  manifest.webmanifest       PWA: pantalla completa y orientación apaisada al instalarla
  icon.svg                   Icono (favicon y manifiesto)
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
- **Scale.EXPAND**: el lienzo ocupa la ventana. El área de diseño sigue siendo 1280×720 centrada; el pabellón (`ARENA_BOUNDS` en `arena.ts`) rellena lo que sobra. `#game-host` limita la proporción a 4:3–2,6:1 (siempre apaisado; fuera de ese rango, bandas). Las cámaras se reajustan en `MatchScene.fitCameras` (evento `RESIZE`) y `CameraDirector.refit`; el HUD se ancla a las esquinas visibles con `HudLayout`, fuera de las zonas seguras.
- **Bucle del partido** (docs/perf/WORKFLOW.md §5): `update` acumula el tiempo real (marca de rAF, no el `delta` de Phaser, que se recorta sin foco) y ejecuta `stepSimulation` en pasos fijos de `SIM_STEP_MS` (60 Hz, máx. `SIM_MAX_STEPS` por fotograma); después `renderFrame` pinta una vez con jugadores y bola interpolados y el tiempo visual `vt`. Las marcas de tiempo del partido usan `simNow` (no `this.time.now`, que corre en las pausas) y el reloj del marcador lo avanza la simulación. El ángulo del stick (contactos) lo fija `updateStickAngles` en la simulación. Las partículas se emiten por paso de simulación.
- **Horneado**: todo lo que dibuja `drawRink`, las redes de gol, el panel del marcador y el fondo del turbo se pintan una vez en canvas y se sustituyen por Images (`render/bake.ts`); los grandes, solo en sus tiras de baldosas con contenido (`addTrimmedImages`, también público y viñeta). La textura se nombra por contenido y resolución (una por nivel de calidad para todo el mundo) y la comparten menú y partido. Un Graphics nuevo que no cambie debe hornearse.
- **Gradas** (`render/stands/`, WP-68): un anillo de escalones de 8 tramos alrededor de la valla; `standPoint(u, o)` coloca asientos, pasillos y vomitorios con la misma perspectiva que la pista y la inclinación de WP-70 en los fondos. Obra y público se pintan una vez en canvas y se empaquetan en pocas texturas por resolución y equipación (mismo lote de dibujo). En baja el público neutro va horneado y quieto y solo se mecen las peñas, que saltan en el gol. En media y alta se anima todo el público por bandas y la grada cercana lleva brazos.
- **Menú**: `MenuScene` usa el mismo enrutado de dos cámaras que MatchScene (mundo = `createArena` + `drawRink`; UI fija). Las ayudas inferiores y el texto «jugar» se rehacen al cambiar de dispositivo (`onInputModeChange`). El menú ignora teclas, toques y mando si el shell tiene `has-overlay` o está en vertical. Con `prefers-reduced-motion` no hay intro, deriva de cámara ni bucles.
- **Shell** (`main.ts`): en cada STEP del juego, antes de las escenas, sondea el mando, lo aplica a los paneles abiertos y fija `data-scene`. Al abrir un panel apaga el teclado de Phaser (`game.input.keyboard.enabled`) para que Espacio y flechas no lleguen al juego ni sufran preventDefault, y al cerrarlo hace `resetKeys`. El partido se pausa con pausa o ajustes abiertos, o con el táctil en vertical. Solo reanuda lo que pausó el propio shell, así el congelado del laboratorio no se pisa. Esc: ajustes → pausa → partido; en el menú abre los ajustes. Al ocultar la pestaña se abre la pausa.
- **Entrada configurable**: MatchScene crea sus `Key` desde `keyBindings` y las recrea al reasignar. `isDown`/`justDown` juntan teclado y mando. `playerControl` recibe un eje ya resuelto (`keyboardAxis`) y `sprintHeld`, no las teclas.
- **Sin emojis ni símbolos Unicode** en textos del juego: flechas, chevrons, cruceta y similares se dibujan (Graphics en Phaser, SVG o clip-path en DOM). Las flechas se guardan como `ArrowUp`… y `keyText` las nombra en textos corridos.
- **Audio**: `sounds.ts` enruta efectos y público por buses de ganancia que cuelgan del general. Los volúmenes se guardan en `rh-volume` y el locutor usa el volumen general.
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

- Partido a dos partes de 25:00 de juego (reglamento). El reloj del marcador corre acelerado: cada parte dura los minutos reales elegidos en Ajustes → General (2, 3, 5, 8, 12 o 25 = tiempo real; por defecto 3). La tarjeta azul son 2 min de juego, escalados con el reloj (`matchTime.scale` y `gameToRealMs` en matchClock.ts). Las faltas de equipo se reinician en el descanso. En el descanso los equipos cambian de campo y saca el rojo
- Kickoff, bully, foul restarts: free-hit, direct-free-hit, penalty
- Stamina por jugador, sprint con drenaje y recuperación
- Robo con probabilidades distintas por ángulo (frontal / lateral / espalda) y cuatro resultados: éxito, bola suelta, fallo silencioso o falta
- IA básica de portero (cubre portería, intercepta, distribuye) y jugadores de campo (pressing, repliegue, pases, tiros)
- Física de portería como jaula
- Fullscreen, controles táctiles y teclado
- La velocidad del juego es la misma con cualquier pantalla (50, 60, 120, 144 Hz) y resolución: la simulación avanza a 60 pasos por segundo. Por debajo de 12 fps se ralentiza en vez de dar saltos
- Tras un gol, en el descanso y al final, los jugadores se deslizan hasta frenar y el equipo que marca celebra (antes se quedaban congelados a media zancada); se colocan en formación al sacar
- Ajustes → Gráficos: «Calidad gráfica» AUTO (por defecto), ALTA, MEDIA, BAJA o PERSONALIZADA, y las opciones sueltas con lo que cuesta cada una: nitidez de la pista, público (animado o solo peñas) y efectos y partículas (todas, medias, pocas o apagadas). Tocar una opción pasa a PERSONALIZADA. AUTO baja sola si el partido no llega a ~45 fps y sube un nivel entre partidos si sobra margen. «Probar equipo» juega unos segundos de arcade IA contra IA (unos 5 s si aguanta ALTA, 12 s como mucho) y deja en AUTO el nivel más alto que aguanta el equipo. «Mostrar FPS» enseña el panel de rendimiento

### Partido por enlace

- `<URL_JUEGO>/#partido=<base64url JSON>` (contrato v1 de loyola-hockey-matches). El menú muestra local | visitante con escudos y nombres, competición, fecha y hora si vienen, y la persona elige su equipo (clic, toque, ↑/↓, W/S o cruceta; preseleccionado `sugerido`). Después se elige ARCADE o REGLAMENTO como siempre.
- «PARTIDO LIBRE» (clic, toque, tecla L o B del mando) descarta el partido en esa sesión. El hash no se borra: recargar la pestaña restaura el partido, y salir de un partido vuelve al menú con el partido aún activo.

### Modo arcade (por defecto)

Estilo NBA Jam manteniendo el 5v5 y relajando las reglas. Se elige en el menú; REGLAMENTO conserva las reglas oficiales.

- Misma duración que reglamento (2 × 25:00 acelerados), cabezones (`ARCADE_HEAD_SCALE`), cámara dinámica con zoom y celebración de gol de 2,6 s.
- **Sin faltas**: el robo nunca pita falta (el resultado se convierte en bola suelta), no hay falta de zona del portero y el bully se sustituye por una melé: la bola sale disparada en dirección aleatoria.
- **Turbo**: Shift/S gasta stamina con más velocidad. **Shift+U con bola** = tiro turbo (más potencia, puede batir al portero). **Shift+U sin bola** = carga: derriba al rival cercano y, si es el portador, suelta la bola.
- **En racha (on fire)**: 2 goles seguidos del mismo jugador → turbo infinito y tiros de fuego hasta que el rival marca.
- **Powerups** sobre la pista (máx. 2, sorteo con pesos `ARCADE_POWERUP_WEIGHTS`): fuego (siguiente tiro de fuego), turbo, congelar (2 rivales), imán (bola), muro (portero más grande), rayo (aturde a los rivales cercanos y suelta la bola), bola loca (la bola sale más rápida y desviada de la valla), escudo (inmune a cargas, robos y hielo) y portería mini (el portero rival encoge y para peor). La IA también va a por ellos. Código en `systems/arcadePowerups.ts`.
- **Trucos** (`systems/arcadeTricks.ts`, mismos botones):
  - *Remate al primer toque*: tirar en menos de `ARCADE_ONE_TIMER_MS` tras recibir un pase (o pulsar tiro justo antes de que llegue: `ARCADE_ONE_TIMER_BUFFER_MS`) da más potencia y opción de batir al portero. La IA remata de primeras al recibir cerca del área.
  - *Tiro con efecto*: tirar patinando de lado curva la bola; sale abierta y el arco la devuelve al punto apuntado (más curva con turbo).
  - *Barra de súper* por equipo (HUD bajo la de turbo): se llena con pases, robos, cargas, trucos, paradones y goles de billar. Llena, el siguiente tiro es el súper (potencia ×1,55, casi siempre bate al portero, cámara lenta). Si el rival recupera la bola con la barra llena, baja a 40.
  - *Gol de billar*: el gol tras rebotar en la valla da +30 de barra.
  - *Espectáculo*: cámara lenta en el súper y en remates rápidos al límite (siempre con tiros especiales, a veces con los normales); «¡PARADÓN!»; el banner del gol suma combos (súper, billar, primer toque, efecto, por la escuadra, doblete, hat-trick).
- **Eventos de partido** (`systems/arcadeEvents.ts`): a los 40 s de juego vivo y luego cada 50–70 s, 20 s de GOL DOBLE (cada gol suma 2), PISTA DE HIELO (patines y bola deslizan: `skateMods`, `ballMods`) o LLUVIA DE POWERUPS (hasta 5 a la vez). Salen de una bolsa barajada, sin repetir hasta que salen los tres.
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
| Pantalla completa (global) | F |
| Pausa (partido) / ajustes (menú) | Esc |
| Menú: elegir modo / jugar | ← → o A D / Espacio o Enter |

Las teclas de juego se reasignan en Ajustes → Controles (dos por acción). Esc y F están reservadas.

### Controles (mando)

Stick izquierdo o cruceta: mover · X/B: tiro y robo · A: pase y cambio · RT/RB: sprint y turbo (RT+X tiro turbo o carga) · Start: pausa (en el menú, ajustes). En los menús: cruceta, A acepta y B vuelve. Los botones son fijos (standard mapping). La UI pasa a mostrar botones de mando al detectar actividad del mando y oculta los botones HUD y los controles táctiles.

### Controles (móvil)

Joystick analógico izquierdo (nipplejs), botones A (tiro/robo), B (pase/cambio), S (sprint/turbo), S+A (tiro turbo/carga en arcade). Los botones van en triángulo alrededor del pulgar: A grande en la esquina, B a su izquierda y S, en cian como la barra de turbo, en la diagonal de arriba. Cada dedo se queda con el botón donde se apoyó; el de S puede deslizarse hasta A o B sin soltar el turbo, y así S+A y S+B salen con un pulgar (`mobileJoystick.ts`). Joystick y botones escalan con la pantalla (`vmin`, con topes) y respetan las zonas seguras. En táctil la barra de turbo del arcade va bajo el marcador, no bajo el joystick. Pantalla completa desde el botón del menú o desde Ajustes; en Android además fija el apaisado (`screen.orientation.lock`), y el manifiesto pide apaisado al instalarlo. En vertical se muestra el aviso «gira el móvil», el partido queda en pausa y el juego deja de pintarse.

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
- Arcade ampliado: 4 powerups nuevos, remate al primer toque, tiro con efecto, barra de súper, gol de billar, eventos de partido, cámara lenta y combos del gol
- Menús con aspecto de videojuego: menú principal sobre el pabellón, acceso directo a pantalla completa, ajustes renovados y aviso de orientación en móvil
- Menú de pausa (Esc / Start / botón táctil), ajustes por pestañas con volúmenes, reasignación de teclas, soporte de mando y UI adaptada a teclado, mando o táctil
- Rendimiento y formato: simulación a paso fijo (velocidad igual con cualquier pantalla), pista horneada, calidad gráfica con modo automático, formato apaisado responsivo y workflow de rendimiento (`docs/perf/`, `/perf`)
- Renovación gráfica (`/gfx`, Gate F 2026-11-19): cámara única con inclinación de fondos, rig quad con IK, stick a dos manos y portero, porterías y vallas reglamentarias, gradas en anillo, banquillos, mesa y árbitros, luz horneada, calidad por niveles con ajustes personalizables y prueba del equipo. 115–120 fps en el banco de escritorio y móvil

### Pendiente

- [x] Partido por enlace (`#partido=`): carga, equipaciones, selector de equipo y «Partido libre»
- [ ] Playtest y tuning del modo arcade (frecuencia de powerups, potencia de tiros turbo/fuego, probabilidad de batir al portero, zoom de cámara)
- [ ] Verificar el modo arcade en móvil (S+A, legibilidad del HUD con zoom)
- [ ] Ajuste de físicas de patinaje (sensación más deslizante)
- [ ] Separar sistema de reglas en módulo propio (`systems/rules.ts` puede crecer)
- [ ] Próximo evolutivo (pedido del usuario, 2026-11-19): mejores animaciones de los personajes, IA mejor trabajada y niveles de dificultad
- [ ] Restos de la renovación gráfica (`docs/graphics/BACKLOG.md`): prueba en vivo del usuario del patinaje (pasada del Gate C); portero de rodillas poco distinguible de lado; banquillos y tramo central del fondo lejano sin inclinar; con calidad automática, bajar a mitad de partido mantiene el horneado completo; los controles táctiles de reglamento tapan un poco las esquinas cercanas
- [ ] Rendimiento pendiente: ver `docs/perf/BACKLOG.md` (P-08 resolución nítida en pantallas grandes, a decidir; P-09 suelo en una textura; P-10 coste del rig; P-11 menú; P-12 pruebas en móviles reales; P-13 memoria del pabellón)

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

### 2026-11-21 — gasto de IA en todos los workflows

- `docs/dev/WORKFLOW.md` §3.9–3.14 a partir del LEDGER: presupuesto S/M/L por encargo con corte a PARCIAL, escena de laboratorio antes que partido en vivo, humos de los dos modos en paralelo, scout si el encargo pide abrir más de 3 archivos, worktree estanco y revisión del LEDGER cada 5 paquetes. `/dev` y CLAUDE.md lo recogen.
- `/evo` E-19 aceptado: celebraciones de gol (gesto del autor por id, piña, portero), lamento del que encaja, descanso con estiramientos y cruce chocando la mano, y final de partido. `systems/celebration.ts` (`PauseDirector`) mueve en la simulación y `render/puppet/celebrationClips.ts` pinta según `Player.mood`; celebración 2,8 s en reglamento y 3,2 s en arcade. Humo igual que la referencia en los dos modos.
- `/evo` E-20 aceptado: reacciones cortas en juego sin tocar la física (parada, palo o fuera por poco, falta, tarjeta) en `systems/reactions.ts` (`Player.reaction`) y `render/puppet/reactionClips.ts`; solo tronco, cabeza y brazos, nunca a quien lleva la bola o actúa. Tabla `REACTION`.
- Arreglo: libre pegado a la valla del fondo que el ejecutante tiene detrás. Su sitio (detrás de la bola, que queda a 70 cm) caía fuera de la pista, nunca llegaba y el saque se quedaba esperando para siempre (el plazo solo cubría al resto). Ahora `foulTakerSpot` (`matchFlow.ts`) lo pone al lado de la bola hacia el centro y, vencido el plazo, se le coloca. Laboratorio: `?lab=match&mode=reglamento&sp=force&kind=free&wall=1&spAt=800`.

### 2026-11-21 — workflow de reglamento (/regla)

- Revisión del saque de centro contra World Skate 2026 (art. 5 y 7.3): la colocación cumple; faltan el pase obligatorio al pitar (hoy el que saca recibe la posesión), los 5 s para llevar la bola a campo rival, anular el gol directo de saque o de libre indirecto, y que el visitante abra el partido.
- `/regla` (`.claude/commands/regla.md`, `docs/rules/`): extracto literal del reglamento en `REGLAMENTO.md` como única fuente para los agentes, backlog R-01..R-05 + R-99 con decisiones D-01..D-03, y agentes `regla-engineer` (opus), `regla-builder` (sonnet) y `regla-qa` (haiku); `ai-engineer` acepta R-XX. Las reglas salen de `/evo` en el enrutado de `/dev`.
- R-05: `kickoffStats.ts` (tracker como `goaliePassStats`) mide en el humo acarreo, cruce a campo rival y pérdidas del saque; evento `at=kickoff` en labAt (requiere `auto=1`). Base en `docs/rules/smoke/2026-11-21-base-*.txt`: hoy el que saca suelta la bola al primer paso y cruza siempre, el rival nunca la gana en 3 s (142 saques reglamento, 145 arcade).
- R-04: abre el partido el rojo visitante y la 2.ª parte el azul (art. 5.3, D-02).
- R-01: al pitar el saque de centro el que saca ya no conduce: apunta y suelta como en el libre indirecto (`matchFlow.updateKickoffTakeState`, `MatchScene.takeKickoff`, apuntado común `aimSetPieceTaker`). El rojo pasa al compañero a los `KICKOFF_AI_AIM_MS`; la persona tiene `KICKOFF_AUTO_MS` antes del pase automático (D-05). Humo 20 × 2: goles/min, pases y posesión dentro de ruido; `at=kickoff` y `kickoffStats` ven el fin del saque en la suelta.
- R-02: 5 s tras el saque (art. 5.7, solo reglamento): marca `kickoffTeam/kickoffAt` en `PassivityState` desde `takeKickoff`, límite `PASSIVITY.kickoffMs` con `limitKind` 'kickoff', HUD `SAQUE n`. Humo 20: 0 libres por 5 s (la IA cruza a ~300 ms), resto en ruido.
- R-03: gol directo anulado (arts. 5.8, 7.3.b) en `systems/directRestart.ts`: marca al soltar saque o libre indirecto, se borra con portador, portero, roce o poste (`ballFrameHit.post`); `checkGoalState` anula y `rules.registerAnnulledGoal` reanuda (libre indirecto o neutral en `areaCorner`; en arcade, bola saltando). `?koshot=1` (DEV) lo fuerza en el laboratorio. Humo 20 × 2: 0 anulados en IA contra IA, resto en ruido.
- R-06 (D-04): el apuntado del libre indirecto y del saque marca al receptor de `getBestPassTarget` y la línea de pase, verde si está libre y rojo si `laneBlockPenalty` la ve tapada (colores `AIM_PASS` en `artSpec.ts`). Solo se ve cuando saca la persona (la IA suelta al pitar). Laboratorio: `sp=force&kind=free` pita un libre indirecto.
- R-99: humo de cierre 20 × 2 frente a la base de R-05: todo en ruido salvo robos en arcade (11,3 → 9,5/min, efecto de R-01: el saque ya no se conduce). Falta el partido del usuario con táctil y mando.

### 2026-11-21 — workflow general (/dev) y gasto de IA

- `/dev` (`.claude/commands/dev.md`, `docs/dev/`) para lo que no es de un dominio con workflow propio. Enruta cada tarea al modelo más barato que la hace bien: `dev-scout` (haiku, localiza y devuelve un mapa `archivo:línea`), `dev-builder` (sonnet, mecánico con patrón), `dev-engineer` (opus, lógica difícil), `dev-qa` (haiku, medir, papeleo e integración).
- Reglas de gasto comunes a todos los workflows (WORKFLOW §3) y registro de tokens y duración por paquete en `docs/dev/LEDGER.md`.
- `/evo`: E-15 (física de patinaje), E-16 (partículas de pista), E-17 (animación secundaria) y E-18 (modelo de cerca) en el backlog; contrato `player.bump` en `types.ts`. Referencia de humo nueva en main: `docs/evo/smoke/2026-11-21-referencia-main.txt`.
- E-17: muelles de peso en tronco, cadera y brazos (`render/puppet/secondary.ts`, `RIG_MOTION`), reacción a `player.bump`, zancadas de arranque, cabeza estabilizada y patín de canto en deriva; tiras `?lab=players&strip=arranque|frenada|curva|choque`.
- E-15: física de patinaje en `systems/movement.ts` (constantes `SKATE_*`): dirección de marcha con deriva, giro que se abre con la velocidad, frenada, choques con masa, rebote en la valla y `player.bump`. Los controles piden propulsión (`driveSkater`) en vez de sumar velocidad. Portero y saques sin cambios. Humo de 20 dentro de ±30 % (`docs/evo/smoke/2026-11-21-E15-fisica.txt`).
- E-18: patín quad con ruedas que giran según la distancia recorrida, espinilleras, rodilleras, guantes y pliegues de camiseta (`render/puppet/gearSpec.ts`, `gearTextures.ts`, `wheels.ts`), todo horneado una vez.
- E-16: partículas de pista (`render/rinkFx.ts`, `RINK_FX` en `artSpec.ts`): polvo y marcas de ruedas, golpes de bola en valla y palo, choques y caídas; demo en `?lab=match&rfx=demo`.
- E-99 (cierre E-15..E-18): humo de 20 en main (`docs/evo/smoke/2026-11-21-E99-cierre.txt`): reglamento 2,03 goles/min (+8 %), arcade 2,29 (+3 %), sin diferencias fuera de ruido, 0 atascos ni errores. Banco movil-bajo: arcade 53 fps (p95 29,8 ms), reglamento 66 fps (p95 20,5 ms), en RTX 5070 Ti. Falta la base en la misma máquina (worktree `.claude/worktrees/e99-base` en `b5dd031`); la de 11-18 es de otra GPU.

### 2026-11-21 — dentro del Loyola, como un juego nativo

- `inHostApp` (`shell/fullscreen.ts`): bajo `/jugar/` en la PWA instalada o en el APK, que se detecta por `LoyolaHockeyApp` en el user agent. El puente de Capacitor solo se inyecta en el origen de la app, no en `pages.dev`. Allí no se ofrece pantalla completa (`fullscreenOffered`: ni botón, ni ajuste, ni tecla F, ni la automática al empezar).
- APK: la actividad del Loyola gira a apaisado y oculta las barras mientras la URL está bajo `/jugar/`. El atrás de Android llega como evento cancelable `loyola:atras` (`onHostBackButton`) y hace de Esc (pausa, cierra paneles, vuelve al título). Solo desde el título en reposo no se cancela, y el WebView vuelve al Loyola.
- PWA de Android: `hideBarsInHostApp` pide pantalla completa en el primer toque (y en los siguientes si el sistema la quitó), para quitar las barras del sistema.
- Arranque: fondo oscuro inline en `index.html` (sin destello blanco) y Russo One servida desde `public/fonts/` con `preload`, en vez de Google Fonts.

### 2026-11-21 — el juego dentro del Loyola también en Android

- La PWA del Loyola fija el vertical en su manifest y Chrome lo aplica también a `/jugar/`: `lockLandscapeInHostApp()` (`shell/fullscreen.ts`) pide el apaisado al arrancar si va bajo `/jugar/` instalada, y «Volver» lo suelta.
- La app Android del Loyola abre ahora `https://loyola-hockey-matches.pages.dev/jugar/` en su propio WebView (`server.allowNavigation`), sin barras; el atrás de Android es el del WebView y vuelve al partido. Probado en el emulador: apaisado libre, fuente y pantalla completa (las barras del sistema siguen encima, transparentes).

### 2026-11-20 — el juego dentro de la PWA del Loyola

- En iPhone, el «Jugar» del Loyola sacaba el juego a Safari con barra, porque es otro dominio. Ahora la web del Loyola sirve el juego bajo `/jugar/` (proxy en su worker hacia `rink-hockey-game.pages.dev`), dentro de su PWA, y se abre en la misma ventana sin barras.
- En el juego: `base: './'` en Vite y rutas relativas en `index.html`, para que el mismo build sirva en la raíz y bajo `/jugar/`. Con `hostedByLoyola` (`shell/fullscreen.ts`) el menú enseña «Volver al Loyola» (`#btn-host-back`, que hace `history.back()`) y no sale el aviso de instalar. No se puede usar `pushState` ni cambiar el hash: romperían el «atrás».

### 2026-11-20 — pulido de efectos arcade y aviso de pantalla completa en iPhone

- Pedido del usuario: «el hielo es horrible» (el cuadrado del jugador congelado) y «a todos se les puede dar un efecto más wow». En `render/arcadeFx.ts` las texturas se hornean al arrancar: cristal de hielo facetado, esquirlas, destellos, tres rayos ramificados deterministas, anillos, escudo hexagonal, cinta del aviso y una viñeta radial que sustituye al tinte de pantalla completa. Congelado: el cristal crece con rebote y va acompañado de niebla y destellos (`aura-frost`/`aura-glint`); tiembla en los últimos `ICE_CRACK_MS` y estalla en esquirlas al terminar. El escudo entra con onda y estalla al caducar. El rayo cae dos veces con parpadeo y el suelo se ilumina. Los textos flotantes se apilan (6 como máximo) y el aviso entra con golpe, destello y vaivén. Coger un powerup lanza una onda del color del powerup. La portería mini y el muro del portero escalan suavemente.
- iPhone no tiene Fullscreen API para elementos, así que una web solo ocupa la pantalla entera si se abre desde la pantalla de inicio. Con `installHintSupported` (iOS, sin la API y fuera del modo app), el botón de pantalla completa y Ajustes › General › Pantalla abren un aviso de tres pasos (`#install-hint`). Se añade `public/apple-touch-icon.png` (180 px, sacado de `icon.svg`), porque iOS no usa SVG para el icono de inicio.
- Verificado en Chrome con efectos forzados en un partido arcade, y con el aviso renderizado; build OK. Pendiente: probarlo en un iPhone real.

### 2026-11-20 — arcade ampliado (trucos, powerups, eventos, espectáculo)

- Pedido del usuario: «darle un buen meneo al modo arcade». Diseño en «Modo arcade». Los powerups salen de `arcade.ts` a `arcadePowerups.ts` y llegan los nuevos (rayo, bola loca, escudo, portería mini). `arcadeTricks.ts` lleva el primer toque, el efecto, la barra de súper, el billar, la cámara lenta, «¡PARADÓN!» y los combos. `arcadeEvents.ts` lleva el gol doble, el hielo y la lluvia de powerups.
- Modificadores globales nuevos: `ballMods` (`ball.ts`: rozamiento de la bola suelta, contador de rebotes en la valla) y `skateMods` (`movement.ts`: agarre de los patines, solo jugadores de campo). `stepSimulation` los vuelve a neutro en cada paso y el hielo los aplica solo con la bola en juego. Cámara lenta: `MatchScene.update` escala el tiempo que entra al acumulador con `arcade.timeScale(simNow)` (no en la prueba del equipo). HUD: barra SÚPER encima de la de turbo.
- IA: remata de primeras al recibir cerca del área (50 %), usa el súper en cualquier tiro con la barra llena, recibe los efectos de los powerups nuevos y va a por ellos.
- Humo arcade (10 + 10 corridas, 240 s, nuevo frente a base a16b73a): 0 errores y 0 atascos. Goles 2,05 ± 0,46 frente a 1,90 ± 0,38 por minuto y tiros 9,0 ± 1,0 frente a 7,5 ± 0,9, con IC que se solapan. Robos 8,8 ± 1,4 frente a 11,8 ± 1,4, ya sin solaparse: el escudo y los remates de primeras dejan menos tiempo con la bola. Rojo − azul −0,15 ± 0,83.
- No hecho: repetición del gol (necesita grabar y reproducir el estado, mucho riesgo para este paquete). Pendiente: probarlo jugando y ajustar las ganancias de la barra (`ARCADE_SUPER_GAIN`).

### 2026-11-20 — lanz L-05b

- **Efecto wow del plano cercano** (petición del usuario):
  - suelo con las marcas de patinaje y el barniz del 2D, con reflejo de la valla y la portería (`render/setpiece/floor.ts`, `setpiece/batch.ts`);
  - público por filas con relieve, ola y banderas (`render/setpiece/crowd.ts`);
  - haces, halos, flashes y viñeta en media/alta (`render/setpiece/fx.ts`);
  - barrido lateral de la cámara en la transición.
- El decorado se monta por fases en la cola de horneado. Constantes en `SETPIECE_STAGE`. Pendientes en el BACKLOG de lanzamientos.
### 2026-11-20 — lanz L-05

- **Pabellón en la cámara cercana:** `render/setpiece/backdrop.ts` proyecta con la cámara del lanzamiento la publicidad del partido (atlas horneado), el anillo de gradas con esquinas y el público de `stands/fans.ts` (peña del equipo que defiende al fondo) y el cierre oscuro del pabellón; `setpiece/stage.ts` añade la valla del partido y la red de retención. Criterio del usuario: igual que el 2D, visto en 2.5D.
- Horneado por calidad en tandas de ≤ 8 ms; en `movil-bajo` ningún tramo pasa de 20 ms. Constantes en `SETPIECE_STAGE` (artSpec).

### 2026-11-20 — lanz L-02

- **Cámara cercana del penalti y el directo:** al pitido la cámara del partido se acerca hasta quedar detrás del lanzador (misma lente, D-09) y vuelve al acabar el duelo (gol, rechace, parada, bola suelta o conducida) sin parar el juego. Código en `setpiece/duel.ts`, `scene.ts`, `stage.ts` y `figure.ts`; enganche en `MatchScene.startDuel/stepDuel/endDuel`.
- Hasta el golpeo los demás jugadores no se mueven y la escena cercana funde a quien se ponga delante del lanzador (`SETPIECE_FOLLOW`); el reloj se para hasta que la bola está en juego; la persona tiene 5 s (`SETPIECE_MATCH.humanShotLimitMs`).
- Ajustes: «Lanzamientos: cercana / clásica» (`?lanz=classic`).
- Humo 20 × 2 modos dentro del IC de la base, 0 atascos ni errores (`docs/setpiece/batch/2026-11-20-l02-smoke-*`).

### 2026-11-20 — menú en dos pantallas

- **Problema:** con partido externo, el selector de equipo, la dificultad y las ayudas no cabían en la pantalla de título; la línea de competición pisaba la tarjeta ARCADE.
- **Pantalla de título** (`MenuScene`): logo, cinta («LOY VS PEJ» con partido) o marcador FINAL, tarjetas de modo y «PULSA ESPACIO PARA SEGUIR». Al confirmar o tocar una tarjeta se abre la segunda pantalla.
- **«Prepara el partido»** (`menuSetup.ts`):
  - fichas de los dos equipos con «VS»; con partido externo se elige el lado (TÚ / IA);
  - línea de competición o explicación de colores;
  - dificultad con pips;
  - JUGAR, VOLVER y PARTIDO LIBRE.
  - Navegación: foco con ↑↓ (o la cruceta) y ←→ para cambiar; ESPACIO o A juega; Esc, Retroceso o B vuelve; Q/E siguen cambiando la dificultad; el hover solo mueve el foco tras mover el ratón.
- **Esc en `main.ts`:** con `registry.menuSetup` activo no se hace `preventDefault` ni se abren Ajustes, porque Phaser ignora eventos ya prevenidos.
- **Verificado en Chrome:** con y sin partido, con resultado, ida y vuelta y Ajustes desde el título; `npm run build` pasa.

### 2026-11-20 — lanz L-01

- **Simulación pura del lanzamiento** (`src/game/setpiece/sim.ts`):
  - en metros y a 60 Hz;
  - bola 3D con efecto que se ajusta en vuelo dentro de una ventana;
  - palos y larguero como cápsulas, y red que frena;
  - portero de 4 cápsulas con estirada en 8 direcciones;
  - carrerilla y conducción del lanzador.
- **IA provisional** en `setpiece/ai.ts` (la rehace L-06); tablas `SETPIECE_*` en `constants.ts`.
- **Lote sin pantalla** `?lab=setpiece&batch=N`, que se pasa con `tools/sp-batch.ps1` y se compara con `bal-compare`.
- **Base** en `docs/setpiece/batch/2026-11-20-l01-base.txt`: penalti 53,6 % de gol y directo 46,5 %; 0 bolas que atraviesan la portería y resultados deterministas con la misma semilla.

### 2026-11-20 — lanz L-00 y reglas del lanzamiento

- **L-00 ✅**: `?lab=setpiece` (`kind`, `ballx/bally/ballz`, `takerm`) con una cámara estenopeica móvil detrás del lanzador (`src/game/setpiece/view.ts`, `SETPIECE_CAMERA` en artSpec) y escena en `scenes/lab/labSetPiece.ts`. El escorzo del rig pasa a ser un parámetro de `Skeleton.project`/`groundFromLocal` (0,3 por defecto, el partido no cambia). D-01 (2.5D) confirmada; los pendientes para L-04a y L-02 están en BACKLOG.
- **Reglas verificadas en el reglamento World Skate 2026, art. 28–30 (D-07)**:
  - Penalti y directo son un mano a mano: tirar o conducir.
  - En el penalti se parte parado; en el directo, con hasta 3 m de carrerilla.
  - El portero es libre tras el pitido y hay rechace.
- **D-08**: cuatro situaciones (penalti o directo, atacar o defender) con un solo motor.
- **D-09**: transición continua 2D ↔ 2.5D, y el duelo se juega en la simulación del partido.

### 2026-11-20 — workflow de lanzamientos (/lanz)

- Pedido del usuario: penalti y libre directo con cámara en tercera persona, apuntado, fuerza y efecto durante el trayecto y figuras más detalladas. Workflow en `docs/setpiece/` (WORKFLOW, BACKLOG con D-01…D-06 y L-00…L-99), coordinador `/lanz` y agentes `lanz-engineer`, `lanz-artist`, `lanz-qa`; `ai-engineer` y `bal-tuner` admiten L-XX. Sin código todavía. D-01 (delegada por el usuario): 2.5D en Phaser —el esqueleto del rig ya es 3D y se le añade la inclinación de cámara—, sin Three.js ni modo 7; L-00 lo valida.

### 2026-11-20 — workflow de equilibrio (/bal)

- Pedido del usuario tras jugar en el móvil: con los controles táctiles es demasiado difícil, y el portero rival para bastante más que el propio. Workflow nuevo en `docs/balance/` (WORKFLOW, BACKLOG con B-00…B-05 y B-99), `/bal`, agentes `bal-tuner` (sonnet, barre tablas de `constants.ts`) y `bal-qa` (haiku, lotes y papeleo); `ai-engineer` (opus) solo escribe lógica nueva. `tools/bal-compare.mjs` compara lotes de humo por IC 95 % (`<base> <nuevo>` o `<lote> --sides`) para que ningún agente lea el JSON.
- B-00: en IA contra IA los porteros son simétricos (arcade: 67,8 ± 7,2 % frente a 66,9 ± 5,7 %), así que la asimetría viene de que juega una persona. El plan mide primero a la persona: estadísticas de partido real con `?stats=1` (B-01) y un humano simulado táctil o con mando en el humo (B-02), y después ajusta porteros, niveles y ayudas táctiles. E-04 de `/evo` pasa a B-04.
- B-01: `systems/matchStats.ts` reúne la contabilidad del humo y la comparte con el partido real. Con `?stats=1` (también en producción) se registra cada tiro: calidad 0–1 (`SHOT_QUALITY`: distancia, ángulo, velocidad y presión), paradas en tiros buenos y malos, y si el portero lo llevaba la persona. Al final sale el botón «Copiar estadísticas» (`shell/statsPanel.ts`). El humo da `shotQuality*` y `savePct*Hi/Lo`.
- B-02: persona simulada en el humo con `human=touch|pad` (`scenes/lab/humanSim.ts`, tabla `HUMAN_SIM`). Juega con los controles de una persona: `joystickInput` en táctil, un Gamepad falso con mando. Arcade, rojo − azul: IA 0,25 goles/min por debajo del rival, mando 0,80 por encima, táctil 1,57. Con el táctil el azul tira y pasa un tercio que la IA. Fallo hallado: en táctil el stick llega a 0,5 y no alcanza `SWITCH_AIM_MIN`, así que el CAMBIO con dirección no funciona.
- B-03: el portero rival paraba más porque la defensa del azul dejaba libre al portador cuando la persona no presionaba (tiros tras pase o con tirador libre); los porteros estaban bien. `aiDefense.ts` elige quién presiona entre la IA y la persona solo cuenta si es la más cercana. `switchAim` escala el stick táctil ×2 y el CAMBIO con dirección ya va en móvil. `matchStats` guarda el contexto de cada tiro. Tiros buenos parados con `human=touch`: 57,6 frente a 81,3 % → 56,4 frente a 70,5 % (IC solapados); IA contra IA sin cambios. El resto es apuntado (B-05).
- B-04: niveles FÁCIL, NORMAL, DIFÍCIL y EXPERTO para el rival (`systems/difficulty.ts`, tabla `DIFFICULTY`), selector en menú y Ajustes (`rh-difficulty`), `?diffBlue/diffRed`. Ordenados en IA contra IA (rojo − azul de −0,90 a +1,35 goles/min); NORMAL es la IA anterior. Pendiente para B-05: que en FÁCIL/NORMAL se puedan cortar pases (85 %). `constants.ts` ya pasa de 660 líneas.
- B-05 y B-06 (táctil): ayuda de tiro táctil 0,95 y un NORMAL algo menos preciso. En táctil la IA coloca al portero de la persona ante un tiro rival, el tiro va al palo abierto, hay menos robos al portador y los compañeros roban. Batería de 20 corridas: táctil NORMAL +0,56 goles/min para el rojo en arcade y +0,98 en reglamento. Un partido real del usuario en el móvil (reglamento, NORMAL) se grabó por CDP/adb.
- Lo que contó el usuario tras ese partido: B-07 no encontró ventaja de la IA al robar. El CAMBIO defendiendo ya no elige al que va por detrás de la bola (`SWITCH_DEFEND`). La bola conducida no entra en la propia portería (`CARRY_OWN_GOAL`). B-11: con cualquier control, el stick hacia la bola al pulsar CAMBIO cuenta como sin dirección. B-08: el tiro táctil cercano daba en el palo; ahora apunta 9 px hacia dentro (`TOUCH_SHOT_AIM`), y en táctil arcade queda −0,10 goles/min, dentro del IC del 0.
- B-10: tiempo de posesión y juego pasivo en reglamento (`systems/passivity.ts`, `ui/passivityHud.ts`). B-09: pase al portero propio para la persona y para la IA al salir de presión (`GOALIE_PASS`).
- Abierto en B-12: tiros cercanos con mando (9 % frente a 50 %, n = 11), el hueco de NORMAL en reglamento y con mando, los autogoles sin tiro tras B-09 (sin aclarar) y la batería por control y nivel. Pendiente en B-99: el partido final del usuario en el móvil.

### 2026-11-19 (sesión 28) — evolutivo de animación, IA y dificultad (/evo)

- Workflow evolutivo montado: `docs/evo/` (WORKFLOW, BACKLOG con E-00…E-11 y E-99, `smoke/`), agente `ai-engineer` y `/evo`. Animación (`gfx-engineer`) e IA (`ai-engineer`) en paralelo en worktrees `evo-anim` (5186) y `evo-ai` (5187).
- E-00: el humo cuenta por equipo pases intentados y completados, robos, posesión y paradas de su portero. Los tiros siguen el lado del equipo: el humo de 240 s cruza el descanso (partes de 3 min) y antes contaba mal los de la segunda parte. Referencia de main: solo un 34–36 % de pases completados y 26–36 robos por minuto.
- E-01: el sesgo rojo/azul del humo venía de la ayuda de tiro humana (0,75) que recibía el azul con piloto automático. Rojo − azul en arcade: 0,50 ± 0,34 → −0,01 ± 0,34 goles/min. El juego humano no cambia.
- Pedido del usuario añadido a E-03: portero seleccionable y revisar sus movimientos raros.
- E-10 y E-11 (animación, `render/puppet/`): portero de rodillas legible de lado, respiración en parado, cruces de espaldas, derrape en las frenadas fuertes, inclinación al acelerar y en curvas, caída que suelta el stick, recepción amortiguada y dos celebraciones. Nuevas tiras de laboratorio `breath`, `backc`, `stops`, `lean` y `kneelside`. El choque arcade ya no gira todo el contenedor (se sumaba a la caída del rig). Pendiente: `artSpec.ts` pasa de 900 líneas.
- Partido externo (Loyola, contrato `#partido=` v1): la etiqueta de dorsal y nombre existe para todos los jugadores. `updateVisuals` la enseña al controlado y a quien tiene la bola, incluido el portero que la ha blocado (`goalieCatchTime`, con tope `PLAYER_UI.nameCatchMaxMs`). Entra y sale con fundido (`nameFadeMs`) y se queda `nameLingerMs` tras perder la bola, para no parpadear en rebotes. El rival lleva contorno rojo (`nameStroke`). Sin partido externo, solo el dorsal. Dorsales normalizados sin ceros a la izquierda («02» → 2, también al buscar repetidos); se acepta un entero 0–999. `enPista` (exportada) asigna en dos pasadas: antes los dorsales reales y después los generados, porque un titular sin dorsal podía quitarle el «4» a un compañero que sí lo traía. Tests con `npm test` (`node --test`, sin dependencias) en `tests/externalMatch.test.ts`. Probado en vivo en 5174, sin errores.
- E-02 (IA de equipo) integrado: plan por paso, apoyos, presión y lectura de líneas de pase; 90 % de pases completados.
- E-05 y E-12 (reglas y transiciones): área de penalti real delante de la línea de gol; libre directo en la 10.ª falta de equipo y cada 5 más (art. 23.3, aviso en la 9.ª); faltas detrás de la portería y saques neutrales en la esquina del área; saque de centro y descanso patinando, sin teletransporte. Faltas al ~70 % de E-02 por diversión, no por realismo (decisión del usuario): 7,2 faltas/min y unos 3 libres directos por partido. El sancionado patina a la puerta de su banquillo (que se abre con `createBoardDoorLeaves`/`updateBoardDoors`, horneadas), va por el pasillo hasta su asiento y vuelve por el mismo camino (`penPhase`, `penaltyPath`); la sanción solo corre con el reloj en marcha. Humo de 20: `docs/evo/smoke/2026-11-19-E12-expulsado-puerta.txt` (reglamento 1,76 ± 0,23 goles/min, arcade 1,86 ± 0,20; 0 atascos, 0 errores).
- Art. 23.6 (último lanzamiento): con el tiro de un libre directo o un penalti en el aire, la parte no acaba hasta resolverlo y no hay rechace (`MatchScene.finalShot`, `FINAL_SHOT_DEAD_SPEED`, `FINAL_SHOT_MAX_MS`). Humo de 20: reglamento 1,64 ± 0,26 goles/min, arcade 2,04 ± 0,19; 0 atascos, 0 errores. Las medidas de rendimiento pasan al cierre (E-99) por decisión del usuario.
- E-13: sombra de contacto casi redonda sobre el suelo (1,75 × 1,5 radios; antes 2,6 × 0,82, demasiado aplastada para la cámara) y marcador del seleccionado nuevo: aro del color del equipo con perfilado oscuro y punta de flecha hacia donde mira (`Player.selectionArrow`, texturas `player-arrow-*`). Capturas en `docs/evo/shots/E-13/`.
- E-03 (portero) integrado: IA propia en `systems/goalieAI.ts` (bisectriz, salida en el mano a mano, reacción al tiro, cubre la bola muerta), sin velocidad fantasma ni teletransportes; portero seleccionable y movible dentro de su zona. Cambio de jugador con dirección (como en los juegos de fútbol): con el stick marcado va al compañero hacia donde apunta (`SWITCH_AIM_*`); sin stick, al más cercano a la bola o al siguiente si ya era él; al portero solo con la bola cerca de su portería. Se quita la doble pulsación al portero. Rig: rodilleras, pantalón y guantes toman la profundidad de su pierna o brazo y el orden de pintado tiene histéresis (`RIG_SORT_HYSTERESIS`), sin parpadeos al patinar; dorsal de la espalda subido entre los omóplatos. Humo 20 por modo (`docs/evo/smoke/2026-11-20-E03-integrado.txt`): reglamento 1,83 ± 0,20 goles/min, arcade 2,00 ± 0,27; 0 atascos, 0 errores.
- Equipamiento real de rink hockey (fotos del usuario): stick de madera con la pala como final curvo del mango, en gancho y algo más ancha en la punta (`STICK_BLADE`, `RIG_GEAR.blade`; también los del banquillo), en vez de la pala negra y recta de hielo. Casco de jugador homologado: gorro acolchado negro con costuras, franja del color del equipo y pantalla transparente de la frente a la barbilla (`paintVisor`, `RIG_GEAR.softCap`/`visor*`); el portero mantiene su carcasa con rejilla. Queda un poco de codo entre mango y pala visto desde arriba.
- Pase y tiro cargados (petición del usuario): mantener el botón llena la carga en la barra del jugador (blanca el pase, naranja el tiro, parpadea llena) y sale al soltar; toque corto = fuerza normal, a 1,15 s sale solo. Al máximo pase ×1,5 y tiro ×1,3; más fuerza es menos precisión, con desvío cuadrático hasta 0,12 rad el tiro y 0,07 el pase (`CHARGE_*`). Igual en faltas y penaltis (`foulChargeInput`). La IA carga con las mismas reglas y tiempos, pero solo con espacio (rival a más de `AI_CHARGE_PRESSURE_PX`; si no, toca al momento): el tiro según la distancia a la portería, el pase a veces, y guarda su dirección de pase mientras carga (`peekAIPassAim`). Una primera versión que cargaba bajo presión bajaba los pases un 30 % y subía los penaltis de 9 a 40. Humo (`docs/evo/smoke/2026-11-20-carga.txt`): arcade sin cambios; reglamento con paradas 70,6 → 60,9 % y faltas 7,3 → 6,2/min (los tiros de lejos salen más fuertes), sin atascos ni errores; E-04 ajustará porteros y niveles.
- E-14 controles táctiles (petición del usuario, con patrones de los juegos de deportes para móvil): sin botón S, se corre llevando el joystick al borde (`TOUCH_SPRINT_STICK`, el círculo se perfila en cian) y el tiro turbo de arcade es tirar corriendo. Mantener tiro sin la bola presiona: el controlado va a donde estará el portador (`PRESS_LEAD_S`, mezclado con el stick a `PRESS_STICK_BLEND`) y entra a robar al llegar, cada `PRESS_STEAL_INTERVAL_MS` (también con teclado y mando). TIRO y PASE en arco al alcance del pulgar, no en la esquina, con etiquetas ROBAR / CAMBIO cuando la lleva el rival. La IA no usa nada de esto: humo corto de 4 + 4 solo para errores y atascos.

### 2026-11-19 (sesión 27) — renovación gráfica, segunda pasada (/gfx)

- Gate F (revisión final) aprobado por el coordinador, por delegación. Juego `standard` completo en `docs/graphics/shots/GATE-F/` más partido en vivo a los 20 s en los dos modos (`arcade-vivo`, `reglamento-vivo`), todo con 0 errores de consola. Arquitectura y Roadmap al día. La prueba en vivo del patinaje sigue pendiente para el usuario.
- WP-62 cerrado. Banco de main en escritorio y movil, en los dos modos, con ALTA y MEDIA: 115–120 fps y p95 de 8,4 ms, con el techo del banco en 120. Objetos activos unos 600 (601 en arcade alta). Tabla en BACKLOG WP-62.
- WP-71 (ajustes gráficos personalizables y prueba del equipo) integrado. Ajustes gana la pestaña Gráficos: calidad con PERSONALIZADA, opciones sueltas con su coste medido en movil-bajo arcade (solo peñas −14 %, partículas apagadas −9 %; la nitidez solo ahorra memoria y horneado), «Probar equipo» y «Mostrar FPS». El regulador de auto pasa a `render/qualityGovernor.ts` y además sube entre partidos. MEDIA usa nitidez 2, que da lo mismo que 1,5 con el zoom del arcade. Prueba: OnePlus 9 Pro ALTA (6,2 ms, unos 5 s); movil-bajo BAJA (ALTA 15,9 ms, MEDIA 13,9 ms). Banco movil-bajo reglamento main → rama sin regresión: en baja 90,7 → 96,3 fps. Al integrarlo: no se pide pantalla completa en los partidos de la prueba, se ocultan los controles mientras mide y al acabar se baja hasta el resultado. Humo de 20 corridas por modo, dentro del IC 95 % de la referencia del 2026-11-18: reglamento 1,28 ± 0,25 goles/min y arcade 2,03 ± 0,21, con 0 atascos y 0 errores.
- Botones táctiles rehechos: van en triángulo (A en la esquina, B a la izquierda, S arriba en diagonal) y dejan libre la franja de abajo. Desde S se desliza hasta A o B sin soltar el turbo: antes, S+A pedía dos botones con el mismo pulgar. Comprobado con toques simulados (S→A da turbo y tiro, S→B turbo y pase, A→S no activa el turbo) y en el OnePlus.
- Móvil en arcade (WP-63, corregido): con controles táctiles, la cámara encuadra la acción un 10 % del alto visible por encima del centro (`ARCADE_CAMERA_TOUCH_BIAS`, `CameraDirector.setTouchControls`, que se fija en `fitCameras`). Así los botones A/B/S caen sobre la grada y no sobre la pista. Además, en táctil `main.ts` pide pantalla completa al empezar un partido; si el usuario sale de ella, no se vuelve a pedir. Probado en el OnePlus.
- WP-68 (gradas y recinto v2) integrado. `render/arena.ts` se reparte en `render/stands/`: `layout` (asientos y `standPoint` con `projectLeaned`), `structure` (escalones, peto con LED, cristal), `crowd` y `fans` (público horneado por bandas, peñas animadas), `sideFan` (bustos laterales), `vomitory` y `pack` (atlas por línea de horizonte). Por niveles: en baja el público neutro va quieto y horneado y solo se mueven las peñas; en media y alta se anima todo. Sin regresión de render en baja.
- Marcador cortado en móviles con esquinas redondeadas (corregido): Android no declara en `env(safe-area-inset-*)` las esquinas ni el borde curvo, solo la cámara. `safeAreaInsetsCss()` (`ui/hudLayout.ts`) usa en táctil un mínimo de 11 px CSS por lado, y el marcador queda alineado con el botón de pausa (14 px). En escritorio no cambia nada.
- Franjas negras en móvil a pantalla completa (corregido): en Android las barras del navegador desaparecen después de `fullscreenchange` y de `resize`, y el lienzo se quedaba con el alto viejo. `main.ts` reajusta la escala con un `ResizeObserver` sobre `#game-host`. Verificado en un OnePlus 9 Pro: lienzo de 919 × 411 en una pantalla de 919 × 411.
- WP-70: una sola inclinación de perspectiva para lo que tiene altura en los fondos. `viewTransform.ts` añade `leanAt(wx)` y `projectLeaned()`: x += k · (wx − CX) · (y del suelo − y), con `LEAN.atGoalLine = 0.45` en artSpec (la de la portería de WP-67, que sustituye a `GOAL_VIS.leanX`). La usan la portería, las caras y el remate de las vallas, las puertas, la red de protección y los paneles de publicidad. Con z = 0 coincide con `project`: pies, bases y sombras no se mueven. Los rótulos se rasterizan ya cizallados en un CanvasTexture a `bakeResolution` (Phaser no cizalla texto), con clave `bake-w-…` para que `pruneWorldBakes` los pode. Banco `movil-bajo` en calidad baja, alternando con main: render 5,61–5,67 ms frente a 5,65–7,61 ms. Pendiente: las gradas de los fondos siguen verticales (las inclina WP-68).
- WP-69: banquillos, mesa, sancionados y árbitro rehechos. `rink/benches.ts`: suelo, pared con franja, cartel con nombre y escudo, tarima, dos bancos con patas y remate del equipo, bolsa, botellas y sticks. `rink/table.ts`: faldón con el nombre de la competición, portátil, papeles, reloj y marcador LED (`setText` solo al cambiar) y bancos de sancionados a los lados. `benchPlayers.ts` con `figureBaker.ts` y `benchPoses.ts`: 17 figuras horneadas (una Image cada una) que siguen la bola con histéresis y reaccionan a gol, falta, tarjeta y saque. MatchScene solo emite `match:clock|goal|foul|card|kickoff`, sin cambios de juego. Árbitro con chaleco (`refereeKit`, `paintVest`). Revisado de cerca y en Chrome. Banco movil-bajo: render 4,69 ms en reglamento (base 5,42) y 5,67 ms en arcade (base 7,05). Humo de 20 corridas por modo, dentro del IC 95 % de la referencia del 2026-11-18: reglamento 1,23 ± 0,21 goles/min y arcade 2,27 ± 0,28, con 0 atascos y 0 errores. Arreglo posterior: `quad()` pinta un solo polígono, porque dos triángulos horneados en lienzo dejaban una costura diagonal oscura en mesa, bancos y carteles (aviso del usuario). Riesgos: las figuras horneadas no siguen un cambio de equipación en vivo, y los paneles del árbitro se leen peor de lado.
- WP-67: portería rehecha (`render/rink/goal.ts`, `GOAL_VIS` en artSpec). Tubos redondos con brillo, arco trasero y techo con malla, red de fondo y de techo con caída, y sombra en el suelo. Una inclinación visual (`leanX`) separa postes y larguero desde la cámara lateral, y lo que toca el suelo queda exacto: postes en la línea, jaula física y bola dentro de la red. Fuera la base delantera que parecía un cuarto poste. El portero se ordena con `depthBesideGoal()`, que vale para las dos porterías tras el cambio de campo. Sin cambios de juego (`GOAL_*`/`GOALIE_*` intactos). Banco movil-bajo: render 5,62 ms en reglamento (base 5,42) y 6,73 ms en arcade (base 7,05). Pendiente: `at=save` del lab no se dispara (`labAt.ts`).
### 2026-11-18 (sesión 26) — rendimiento, velocidad constante y formato apaisado

- **Velocidad variable con la resolución o el refresco (corregido).** El rozamiento de jugadores y bola (`PLAYER_FRICTION`, `BALL_FRICTION`), los empujes de separación, el imán de la bola y las probabilidades de la IA se aplicaban por fotograma, y `dt` se recortaba a 33 ms: a 50 Hz los jugadores iban un ~20 % más rápido que a 60 Hz, a 144 Hz bastante más lentos, y por debajo de 30 fps todo se ralentizaba. Ahora `MatchScene.update` acumula el tiempo real (marca de rAF; el `delta` de Phaser se recorta a 16,7 ms con la ventana sin foco) y ejecuta `stepSimulation` en pasos fijos de 1/60 s (`SIM_*` en constants.ts); `renderFrame` pinta una vez interpolando jugadores y bola. Tiempos del partido con `simNow`; el reloj del marcador lo avanza la simulación (fuera el `time.addEvent`); el ángulo del stick pasa a `updateStickAngles` (simulación). Comprobado: con CPU ×3 a 36 fps, 5,1 s simulados en 5,04 s reales.
- **Celebración visible.** Tras un gol, en el descanso y al final los jugadores se deslizan hasta frenar y el equipo que marca celebra (`celebrateGoal` existía pero no se veía: el pintado se congelaba). `applyGoalReset` ya no teletransporta: lo hace el saque.
- **Render.** Horneado de Graphics estáticos (`render/bake.ts`): 30 Graphics y ~38 000 comandos que WebGL re-triangulaba cada fotograma, un tercio del coste. Los horneados grandes, el público y la viñeta se colocan solo en sus tiras de baldosas con contenido (`addTrimmedImages`): sin eso, la GPU por software caía de 10 a 7 fps por rellenar rectángulos casi transparentes. Una sola resolución de horneado del mundo por nivel (menú y modos la comparten; las de otro nivel se podan). Anillo del controlado y sombra de la bola como texturas; el reloj del marcador ya no hace `setColor` cada fotograma (re-rasterizaba el texto). Partículas por paso de simulación y con densidad según la calidad.
- **Calidad gráfica** (`render/quality.ts`, `render/qualityGovernor.ts`, Ajustes → Gráficos en `shell/graphicsSettings.ts`): preferencia AUTO/ALTA/MEDIA/BAJA/PERSONALIZADA; un nivel rellena tres opciones (`bakeMax` 1|2, `crowd`, `particles` 0|0,4|0,7|1) y tocar una pasa a personalizada (`rh-quality-custom`; en la URL `?quality=custom&sharp=&crowd=&fx=`). Todo mide lo mismo: `FrameWorkMeter`, trabajo de CPU por fotograma (update + envío del pintado) con la simulación proyectada a 55 fps, así que ni vsync ni una pantalla de 30 o 120 Hz lo sesgan. El regulador de auto (`QualityGovernor`, `QUALITY_WATCH`) baja un escalón tras dos ventanas de 3 s por debajo de ~45 fps con el equipo cargado, en orden público → partículas → nitidez; si en el partido no bajó y sobró margen (trabajo < 30 % del fotograma objetivo), sube un nivel para el siguiente. Lo aprendido dura 7 días. La prueba del equipo (`shell/qualityProbe.ts`, `?probe=1` la lanza sola) juega arcade IA contra IA con `MatchSceneData.probe` (sin locutor ni ambiente; los saques del azul se hacen solos): ALTA y luego MEDIA, 1,5 s de calentamiento y 2,5 s de medida; aprueba un nivel cuyo trabajo cabe en la mitad del fotograma de 55 fps (9,1 ms), y si ninguno cabe se queda en BAJA. El resultado (`rh-quality-probe`, 30 días) es el punto de partida y el techo de auto, y borra lo aprendido antes. Se cancela con el botón, Esc, B o Start del mando, al ocultar la pestaña o al girar a vertical; mientras mide se ocultan joystick, botones y pausa y no se pide pantalla completa. El regulador no actúa en el laboratorio ni en el banco. BAJA funde las gradas lejanas en una capa y deja quieto al público.
- **Formato apaisado responsivo.** `#game-host` entre 4:3 y 2,6:1; HUD anclado a las esquinas visibles con zonas seguras (`ui/hudLayout.ts`); en táctil la barra de turbo va bajo el marcador (antes quedaba debajo del joystick); joystick y botones en `vmin` con topes y `env(safe-area-inset-*)`; `viewport-fit=cover`, manifiesto PWA apaisado e icono (adiós al 404 del favicon); en vertical táctil el juego deja de pintarse detrás del aviso. El menú hornea la pista a su zoom máximo.
- **Workflow de rendimiento** (`docs/perf/WORKFLOW.md`, `BACKLOG.md`, `/perf`, agentes `perf-engineer|builder|qa`): presupuestos por perfil de dispositivo, reglas de rendimiento para todo el desarrollo (§5), banco headless `tools/perf-bench.mjs` (CDP sin dependencias, `?lab=match&ai=1&perfMs=`), panel `?perf=1` (también en producción), `tools/perf-trace.mjs` y scripts `npm run typecheck|perf|perf:trace`. `?lab=match&ai=1`: IA contra IA en tiempo real; `driveBlueRestarts` sale de labSmoke para reutilizarlo.
- **Revisión independiente** del bucle (subagente): sin fallos graves. Corregido lo que encontró: el regulador de calidad (ver arriba), horneados duplicados por escena, gestos de árbitro fechados con el fotograma anterior (`Officials.syncTime` al empezar cada paso), redondeo del paso manual del laboratorio (tolerancia de 1 µs) y posible temblor de la inclinación a 120/144 Hz (también se interpolan las velocidades). En el humo y en `ai=1`, el sacador azul de las faltas apuntaba siempre a +x, también tras el cambio de campo; ahora apunta a la portería que ataca (cambia las referencias de reglamento del humo a partir de esta sesión).
- **Medidas** (mediana de 3; tope de 50 Hz en el equipo): perfil `movil` (CPU ×4, 844×390@3), arcade de 24,7 a 49,7 fps y render de 30,0 a 5,6 ms; `movil-bajo` (CPU ×6, 740×360@2), arcade de 11,3 a 47,6 fps y reglamento de 23,3 a 49,9. Tabla completa en `docs/perf/BACKLOG.md` y en bruto en `docs/perf/bench/`.
- **Humo** (20 corridas por modo, nuevo frente a base a78720b): sin diferencias (todos los IC 95 % se solapan). Reglamento 1,18 ± 0,20 frente a 1,28 ± 0,16 goles/min; arcade 2,00 ± 0,19 frente a 2,06 ± 0,35. 0 atascos y 0 errores.
- Pendiente: P-08 (render a la resolución de la pantalla en calidad alta) espera decisión DP-1; probar en móviles reales con `?perf=1` (P-12).

### 2026-11-17 — partido por enlace: nombre del jugador, marcador y pausa

- Etiqueta de dorsal y nombre (`Player.nameTag`, creada en `createPlayer` solo para controlables) entre el anillo y la barra de stamina del jugador controlado. El nombre sale de la plantilla del partido externo (`EquipoExterno.nombres`, en el mismo orden que `dorsales`; `nameFor` en render/puppet/kit.ts); sin partido o en un hueco generado, solo el dorsal. Tamaños en `PLAYER_UI.nameFontPx` y `nameGapPx`.
- Videomarcador con partido: escudo y tanteo juntos en la fila de arriba, con el escudo en el lado exterior de cada bloque; las faltas, centradas en el bloque para que no se salgan. Sin escudo, la abreviatura ocupa su sitio.
- Menú de pausa: con partido, escudo encima del nombre a cada lado del tanteo (rejilla de cinco columnas), local a la izquierda y cada tanteo con el color de su camiseta y dorsal.

### 2026-11-17 — partido desde loyola-hockey-matches (paso 2: selección y cierre)

- (Sustituido el 2026-11-20 por el menú en dos pantallas.) Menú con partido (`MenuScene`): sin cinta de subtítulo; fila local | visitante con escudo, nombre y «TU EQUIPO», línea con competición, fecha y hora, y botón «PARTIDO LIBRE (L)». Las tarjetas de modo bajan 28 px. `descartarPartido()` (externalMatch.ts) limpia el estado sin tocar el hash.
- Roadmap: partido por enlace completado (carga, equipaciones, selector y salida al modo normal).
- Verificado con `tools/gfx-shot.ps1` (con `--force-prefers-reduced-motion` en una copia temporal para saltar la animación de entrada): menú con partido y sin él.
- Pendiente: el atajo ↑/↓ y L no figuran en la barra de ayudas; el menú con resultado final y partido no se ha visto en captura.
- Tras la revisión: dorsales repetidos en el payload se tratan como ausentes y se genera uno libre (`dorsalesEnPista`); el texto de sanciones del marcador aclara camisetas oscuras (`legible`). El banner arcade de gol y final y el ganador del menú siguen en azul/rojo fijos.

### 2026-11-17 — partido desde loyola-hockey-matches (paso 1: carga y equipaciones)

- `game/externalMatch.ts` lee y valida `#partido=` (v1, sin librerías; payload inválido → juego normal y `console.warn`). `main.ts` lo espera junto a la fuente y recarga la página si cambia el fragmento.
- Los huecos internos siguen siendo 'blue' (humano) y 'red' (IA). `teamKit(team)` y `lookFor` (render/puppet/kit.ts) toman colores y dorsales del partido (casco = camiseta, guantes = detalle; dorsales: portero + 4 de la plantilla, huecos generados sin repetir). `RigKit.id` incluye los colores para que las cachés de atlas no mezclen equipaciones. Sin partido, `TEAM_KITS` / `TEAM_NUMBERS` como antes.
- Videomarcador (`ui/scoreboard.ts`): con partido, local a la izquierda y visitante a la derecha sea cual sea el humano, bloque del color de la camiseta, escudo sobre disco claro y abreviatura. El texto de gol/falta, el banner y el locutor usan los nombres (`nombreDeHueco`).
- Menú: selector de equipo (clic, ↑/↓ o cruceta; preseleccionado `sugerido`) y resultado final con nombres.
- Pendiente: el anillo de selección, arcadeFx y los colores de partículas siguen en azul/rojo por hueco; la plantilla solo aporta dorsales (los nombres de jugador no se muestran).

### 2026-11-16 (sesión 25, cont.) — cambio de campo en el descanso

- El lado que defiende cada equipo vive solo en `player.side`, y `switchSides` lo invierte en el descanso (`MatchScene.startSecondHalf`). Los equipos se colocan ya en su nueva mitad durante el cartel «Descanso · cambio de campo», el marcador pasa a 25:00 y 2ª parte, y saca el rojo.
- Lo que suponía «azul = izquierda» ahora sale del lado: formaciones (`getFormation(player.side)`), bola del saque, gol (`scorerAtGoal`: marca quien ataca esa portería), bola retenida en la red tras gol, red que se ilumina, foco de cámara del gol arcade y colocación del bully (`attackDir`). Los helpers están en `formation.ts`. La IA, los porteros, las faltas y los penaltis ya usaban `side`. Los banquillos y la mesa no cambian.
- Validación: `npm run build` pasa. En navegador, tras el descanso los porteros se intercambian y `checkGoal` en la 2.ª parte da el gol de la portería izquierda al azul. Un partido nuevo vuelve a empezar con el azul a la izquierda. Humo reglamento con 2 corridas de 420 s (cruzan el descanso): 0 atascos, 0 fuera de pista y 0 errores.

### 2026-11-16 (sesión 25, cont.) — partido a dos partes de 25 minutos

- `PERIOD_COUNT` 4 → 2 y `HALF_GAME_SECONDS` = 25 × 60; fuera `MATCH_DURATION` y `ARCADE_PERIOD_DURATION`. Los dos modos comparten duración.
- Reloj acelerado al estilo de los juegos de deporte: el marcador cuenta 25:00 por parte y el tick de 1 s de juego se dispara cada `1000 / matchTime.scale` ms reales. La escala sale de `getHalfRealMinutes()` (ui/prefs.ts, `rh-half-minutes`, `?half=N` para pruebas). Por defecto son 3 min reales por parte: unos 7–8 min con paradas y descanso, parecido a lo que duraba antes (4 × 90 s en arcade, 4 × 120 s en reglamento).
- Tarjeta azul en tiempo de juego, y la cuenta atrás de sancionados del marcador en m:ss de juego. Reloj en rojo en el último minuto de juego. Marcador con «1ª PARTE» y «2ª PARTE»; descanso de 2,6 s con «Descanso / Empieza la 2ª parte».
- Ajustes → General → «Duración de cada parte»: selector con flechas dibujadas (← → o clic). Durante un partido avisa de que se aplica en el siguiente. Las tarjetas del menú muestran «2 × N MIN» y se actualizan al momento.
- Validación: `npm run build` pasa. Con `?half=0.15`, el reloj avanza al ritmo esperado, entra el descanso, empieza la 2.ª parte y el partido termina en «Empate / Pulsa U para continuar». El selector y las tarjetas del menú se actualizan.

### 2026-11-16 (sesión 25, cont.) — pausa, controles, mando y UI por dispositivo

- Menú de pausa (`shell/pauseMenu.ts`): cabecera con modo, periodo, reloj y marcador; opciones continuar, reiniciar, ajustes, controles y salir al menú. Reiniciar y salir piden confirmación con «No» por defecto, salvo con el partido acabado. Al pausar se silencian el público y el locutor (`MatchScene.getPauseSummary` y eventos PAUSE/RESUME).
- Ajustes por pestañas (General, Audio y Controles). Audio con volúmenes general, efectos y público (buses en `sounds.ts`). Controles con la tabla de reasignación: captura de la siguiente tecla, Supr vacía, Esc cancela, Esc/F/Tab reservadas, y la tecla repetida se quita de la otra acción con aviso.
- Mando: `input/gamepad.ts` (sondeo en STEP, botones lógicos consumibles; aceptar y pase comparten A sin dispararse dos veces) integrado en el partido, el menú Phaser y los paneles DOM (teclas sintéticas para la navegación existente).
- UI por dispositivo (`input/inputMode.ts`, `data-input`): ayudas con teclas, botones de mando de colores o nada en táctil. Controles táctiles solo en partido y en modo táctil; los HUD se ocultan con mando. El texto «Pulsa X para continuar» del final usa la tecla o botón real. La sección de Controles del dispositivo actual sale primero.
- Navegación de menús tipo consola (`shell/menuNav.ts`): ↑/↓ con vuelta, ←/→ en filas Sí/No y pestañas, el ratón selecciona al pasar, Tab atrapado y sonidos `playUiMove`, `playUiConfirm` y `playUiBack`.
- Fuera emojis y símbolos Unicode en todo el juego: chevrons y viñetas del menú, cruceta, flechas de teclas, viñeta de los menús, cerrar, TURBO ∞/▶▶ (ahora TURBO MÁX y doble chevrón dibujado) y ★/● en las etiquetas de rol.
- Validación: `npm run build` pasa. Probado en Chrome: Esc → pausa → controles → reasignar (conflicto y reservada) → Esc → Esc reanuda; salir con confirmación. Con un mando simulado (`getGamepads` falso): A juega, Start pausa, cruceta y A abren ajustes, B vuelve y Start reanuda. En táctil apaisado se ven el joystick, A/B/S y el botón de pausa. Sin errores en consola, salvo el 404 del favicon.

### 2026-11-16 (sesión 25) — menús con aspecto de videojuego

- `MenuScene` rehecha: el fondo es el pabellón real (gradas con público y pista) con una deriva lenta de cámara, un velo de degradado y dos haces de foco. Encima, en cámara de UI: logo extruido con degradado, cinta «hockey sobre patines», tarjetas inclinadas con icono dibujado (llama para arcade, tarjetas azul y roja para reglamento), chevrons en la tarjeta activa, ayudas de teclado con teclas dibujadas y marcador FINAL de videomarcador al volver de un partido.
- Coreografía: fundido desde negro, golpe del logo (escala, sacudida y destello), barrido de la cinta, tarjetas escalonadas y ayudas. Al confirmar: pulso de la tarjeta, destello y fundido. Sonidos procedurales `playUiMove`, `playUiConfirm` y `playUiThump` en `sounds.ts`. Los de hover solo suenan si ya hubo gesto (`userActivation`), para que Chrome no avise en consola.
- Shell DOM: botón de pantalla completa junto al engranaje, visible solo en el menú (`scene-menu`), con iconos SVG. La tecla F es global, hay fallback `webkit*` y en Android se fija el apaisado. El botón no aparece donde no hay Fullscreen API (iPhone).
- Ajustes renovados: tarjeta con esquinas cortadas, cabecera con franja naranja, filas inclinadas con interruptores ON/OFF (`role="switch"` + `aria-checked`), teclas en `<kbd>` y animaciones de entrada solo con CSS.
- Aviso de orientación: `#rotate-overlay` con un móvil SVG que gira en bucle, flecha que se dibuja y una pista esquemática de fondo. En vertical el partido se pausa y el menú no responde.
- Reduced motion respetado en Phaser (sin intro, sin deriva ni bucles) y en CSS (sin rebotes y con el móvil ya girado).
- Validación: `npm run build` pasa. Probado en Chrome a 1280×720, con resultado final, con el panel de ajustes, en móvil emulado en vertical (aviso) y en apaisado, y arrancando un partido desde el menú. Sin errores en consola, salvo el 404 del favicon, que ya estaba.

### 2026-11-16 (sesión 24, cont.) — renovación gráfica (/gfx)

- WP-66: en `lab=match`, `zoom`/`cx`/`cy` bloquean la cámara (`MatchScene.labCameraLock`). Con `follow=ball|referee|goalie-blue|goalie-red` la cámara sigue a ese objeto. Con `auto=1&at=goal|foul|card|save|<ms>&after=` la simulación avanza a paso fijo con semilla (`seed=`) hasta el evento y congela (`scenes/lab/labAt.ts`). `gfx-shot.ps1 -Set detail` saca 11 capturas de detalle (gradas, banquillos, mesa, porterías, árbitro, reacción al gol y gesto de falta).
- WP-50: dos árbitros a pie (`systems/officials.ts` + `render/officials.ts`, locomoción `puppet/footGait.ts`, `refereeKit`). Uno por mitad, con la diagonal de SPEC §9, siguen la bola y esquivan jugadores. Gestos de silbato, falta, tarjeta, gol y bully enganchados en MatchScene. `?lab=officials&strip=referee`. Pendiente: a escala de partido el uniforme oscuro se lee poco; el dorsal flúor apenas se ve de frente.
- WP-61: nuevo `render/lighting.ts` con pozos de luz cenitales sobre el suelo y viñeteado de gradas, horneados en 2 texturas y colocados como 9 imágenes estáticas (sin coste por frame). Sombras de valla y portería ajustadas; los parámetros están en `LIGHT` (artSpec).
- WP-65: pista parametrizada en `RINK_LENGTH_M` (constants.ts), con `K = 40 / RINK_LENGTH_M` sobre todo lo que mide metros reales. Las velocidades, los tiempos y las distancias tácticas de la IA no cambian. Por defecto 36 × 18 m (D11): los jugadores y la portería se ven un 11 % más grandes en la misma pantalla. `?rinkm=` en DEV; drawRink usa `WORLD_PX_PER_M` en vez de 40/20 fijos. Humo con 20 corridas por caso: entre 40 y 36 m no hay diferencia significativa; a 34 m el arcade sube a 2,36 goles/min. `gfx-smoke.ps1 -Runs N` da media ± IC 95 %, y el método pasa a 20 corridas por modo, porque la referencia con 3–4 corridas no permitía concluir nada.
- gfx Gate C aprobado por el coordinador (por delegación) con players, tiras de WP-31, WP-32 y WP-33 y capturas de partido. La prueba en vivo del usuario («¿el patinaje camina?») pasa al Gate F. Notas: la C de espaldas y la respiración en parado apenas se ven; de lado, el portero de rodillas se distingue poco del portero de pie.
- gfx WP-33: portero con careta, pads y manopla; postura de pie o de rodillas con histéresis (según distancia y cierre de la bola), pasos laterales o deslizamiento, y 4 paradas de 280 ms (split, manopla, stick, cuerpo) elegidas por lado y distancia en `markGoalieSave` (una línea en `handleGoalieSaveAction`, solo marca `anim`). Al encajar, cabeza gacha y golpes de stick. Lab `?lab=players&strip=goalie`.
- gfx WP-64: partido de humo IA contra IA (`?lab=match&auto=1&smokeMs=N`, `scenes/lab/labSmoke.ts`, `tools/gfx-smoke.ps1`). Avanza `match.sys.step()` a 60 Hz sin render; el azul juega con `autopilot` (playerControl) y la rama de IA rival (MatchScene, 3 líneas). Medido: base 450751b → main e8ed16b, reglamento 0,75 → 0,94 goles/min y paradas 90 % → 72 %; arcade 2,00 → 1,88 goles/min; 0 atascos, NaN y errores.
- gfx WP-32: stick a dos manos según `hand` con la pala siempre sobre la bola física, pala curva por mano (`STICK_BLADE`), largo en pantalla ≤ 1,2× real; clips de pase, tiro (latigazo: impacto a 36 ms), turbo, carga, robo, recepción y celebración (`Player.anim`, `startAnim`, `celebrateGoal`; `save` reservado a WP-33). Juego: `BALL_PROTECT_VELOCITY_BLEND` 0,12 → 0,04 (bola a ≤ 47 px en sprint). Tiras de acciones en `scenes/lab/labActionStrips.ts`.
- gfx WP-51: mesa de oficiales en mundo (render/rink/table.ts) con 3 figuras sentadas del rig, kit de oficial (`officialKit`) y marcador; asientos de sancionados a ambos lados (`penaltySeat`) con seatedPose; lab `?lab=officials&pen=N`. Adelantado a Gate C por decisión del coordinador (solo usa poses estáticas del rig).
- gfx WP-31: locomoción quad (puppet/locomotion.ts + locomotionGaits.ts): zancada lateral-atrás con deslizamiento, cadencia por aceleración, sprint, cruces, marcha atrás en C, frenada en cuña/T, espera y caída; strips stride/sprint/crossover/backward/brake/idle/fall en el lab.
- gfx WP-34: etiquetas de rol apagadas por defecto (ajuste en el panel, `?labels=1|0`, src/game/ui/prefs.ts); anillo en perspectiva con borde claro y banda del equipo y barra de stamina bajo los pies, solo para el jugador controlado.
- WP-60: videomarcador común (`ui/scoreboard.ts`) en Russo One para ambos modos: goles, periodo y reloj; en reglamento, además, faltas por equipo y sancionados con cuenta atrás. Esquina superior izquierda, sin tapar banquillos. Fuera la tipografía monoespaciada y la línea de stamina.
- WP-20: tres prototipos de estilo en `?lab=style` (A cartoon, B pixel-art y C semirrealista) con esqueleto 3D, IK de brazos y pintores por estilo (`src/scenes/lab/style/`).
- Gate B ✅ (coordinador, por delegación del usuario): D1 = A (cartoon limpio): es el único que se lee bien a 57 px, escala limpio con `s` y sale barato con rig por piezas. D4 = casco ligero en el color del equipo.
- WP-42: suelo sin rejilla con grano y reflejos suaves; marcas a 2,5 px según el reglamento; sin línea azul (D10); la D ya no cruza la portería. Libre directo a 7,40 m (D9) y penalti a 5,40 m (`PENALTY_SPOT_OFFSET`, nuevo), los dos medidos desde la línea de gol en la marca y en matchFlow; antes el balón caía junto a la línea. Depths de drawRink en DEPTH.*.
- WP-41: vallas sin facetas (28 segmentos por esquina), canto, rodapié y sombra; publicidad en las 4 vallas con hueco en las puertas de los banquillos; redes de protección tras las porterías. Corte de la valla cercana con la variante `edge`: la bola nunca queda tapada. Pendiente para WP-43: el público cercano tapa la cara exterior de la valla cercana.
- WP-43: gradas con escalones reales, huecos y ropa variada (rayas, bufanda, capucha), y salto en el gol reutilizando `cheer()`. Hay un pasillo de 2,5 m entre la valla y la primera fila, así que el público cercano ya no tapa la publicidad de la valla cercana. Escala: el público cercano es mayor que los jugadores cercanos y el lejano, menor (`STANDS_STYLE` en artSpec.ts).
- WP-30: rig 2D con IK de dos huesos (`src/game/render/puppet/`), 8 vistas cacheadas en atlas, capas locomoción/tronco/acciones/portero, poses de pie y sentada; Player gana rig/pose.
- gfx WP-40/44: portería reglamentaria 1,70 × 1,05 m (tubos, red doble, partida trasera/delantera); física a escala: GOAL_HALF_H 25,5, GOAL_BACK_DEPTH 18, portero GOALIE_RADIUS 9 / SAVE 7 / CLAIM 7, tiro asistido IA 1 y humano 0,75, zona de falta del portero centrada en la línea de gol; goles arcade +16 % (6 semillas).

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
