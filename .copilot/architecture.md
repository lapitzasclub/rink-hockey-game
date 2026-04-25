# Arquitectura

## Stack elegido

- **Motor/render**: Phaser 3
- **Lenguaje**: TypeScript
- **Build tool**: Vite
- **Audio**: WebAudio / assets ligeros locales
- **Arte inicial**: sprites 2D simples en SVG/PNG y formas dibujadas

## Motivos de la elección

### Phaser 3

Se elige Phaser 3 porque:

- encaja muy bien con juegos 2D pequeños para navegador,
- tiene ciclo de desarrollo rápido,
- permite iterar gameplay antes de sofisticar rendering,
- reduce complejidad frente a motores más pesados.

### TypeScript

Se usa para mantener claridad estructural y facilitar colaboración multiagente.

### Vite

Permite arranque rápido, build sencillo y buen flujo para prototipado web.

## Decisiones técnicas iniciales

- Vista cenital 2D.
- Física arcade simple, ajustada manualmente.
- Un único escenario de partido en la primera iteración.
- Assets versionados dentro del repo.
- Documentación operativa en `.copilot`.

## Estructura inicial actual

- `.copilot/` documentación operativa y memoria del proyecto.
- `src/main.ts` bootstrap de Phaser.
- `src/scenes/MatchScene.ts` escena principal del partido.
- `src/game/constants.ts` constantes globales del juego.
- `src/game/types.ts` tipos principales.
- `src/game/formation.ts` formaciones base.
- `src/game/entities/` creación de entidades.
- `src/game/render/` rendering de pista.
- `src/game/ui/` HUD y elementos de interfaz.
- `src/game/utils.ts` utilidades compartidas.
- `src/style.css` estilos mínimos del contenedor web.
- `public/` recursos públicos del proyecto.

## Evolución estructural prevista

- `src/game/systems/ball.ts` lógica de posesión, pase, tiro y gol.
- `src/game/systems/movement.ts` movimiento, skating y separación.
- `src/game/systems/ai.ts` comportamiento táctico base de porteros y jugadores.
- `src/game/systems/playerHelpers.ts` selección y consulta de jugadores.
- `src/game/systems/visuals.ts` actualización visual de jugadores/sticks.
- `src/game/audio/` sonido y música.
- `.copilot/code-style.md` convención de comentarios y estilo interno.
- `public/assets/` sprites, audio y UI.

## Riesgos conocidos

- La sensación de patinaje puede requerir varios ajustes finos.
- La IA rival inicial será simple.
- Los assets iniciales serán funcionales antes que artísticos.
- El input móvil con overlays DOM encima del canvas resultó frágil en despliegues reales, así que se prefiere mover controles táctiles críticos dentro de la propia escena Phaser.
- El equilibrio entre conservar la bola, robar limpiamente y sancionar entradas por detrás sigue siendo una zona de tuning sensible y debe validarse mucho por sensaciones reales.

## Decisión reciente sobre input móvil

Tras varios intentos con overlay DOM y `nipplejs`, el proyecto pasa a priorizar controles táctiles dibujados y gestionados dentro de Phaser. La razón no es solo compatibilidad, sino también simplificar depuración, evitar problemas de capas/z-index y mantener toda la lógica de input en el mismo runtime que el juego.

## Dirección actual del refactor

La escena principal se está reduciendo para actuar como orquestador, no como contenedor de toda la lógica. La agrupación buscada es por responsabilidades reales:

- `input/` para lectura de joystick y otras fuentes de control
- `systems/playerControl.ts` para control humano e integración básica del movimiento
- `systems/matchActions.ts` para acciones del jugador y contactos de balón
- `systems/matchFlow.ts` para reinicios, goles, bully y faltas
- `systems/matchClock.ts` para progreso temporal del partido
- `ui/matchHud.ts` para HUD y texto de depuración

El objetivo no es solo bajar líneas, sino hacer que cada módulo tenga una razón clara para cambiar.

## Estado jugable actual

- Controles de teclado actuales orientados a ergonomía y contexto: `WASD` mover, `SHIFT` sprint, `U` tiro/robo y `Y` pase o cambio de jugador según posesión.
- Controles táctiles alineados con la misma filosofía contextual: botón principal para tiro/robo, botón secundario para pase/cambio y botón dedicado de sprint.
- Cada jugador mantiene su propia estamina y el sprint ya afecta a aceleración, velocidad punta y recuperación.
- La lógica de robo distingue frontal, lateral y espalda, con castigo mucho más fuerte a entradas por detrás y más resultados de bola suelta en vez de posesión instantánea.
- La detección de gol ya no acepta entradas por detrás de la portería: exige cruce desde la boca del arco y convive con rebotes más explícitos en postes.
- La reanudación de faltas ya funciona tanto para humano como para IA rival.
