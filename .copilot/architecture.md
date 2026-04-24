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
- `public/assets/` sprites, audio y UI.

## Riesgos conocidos

- La sensación de patinaje puede requerir varios ajustes finos.
- La IA rival inicial será simple.
- Los assets iniciales serán funcionales antes que artísticos.
