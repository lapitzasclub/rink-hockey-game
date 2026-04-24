# Registro de trabajo

## 2026-04-24

- Se creó la carpeta `.copilot` como memoria operativa del proyecto.
- Se definió la regla principal para agentes: mantener `.copilot` actualizada con información veraz e indexada.
- Se fijó el stack inicial: Phaser 3 + TypeScript + Vite.
- Se definió el alcance del primer prototipo como un partido 2D top-down 1v1 jugable en navegador.
- Se creó la aplicación web en `app/` con Vite + TypeScript.
- Se integró Phaser 3 como base del juego.
- Se implementó un primer prototipo jugable con pista, dos jugadores, bola, goles, marcador, tiempo e IA rival básica.
- Se validó el build de producción correctamente con `npm run build`.
- Se reorganizó la estructura para que la app web viva en la raíz del proyecto y `.copilot` quede como carpeta interna al mismo nivel.
- Se evolucionó el prototipo desde un 1v1 mínimo a una base 5v5 simplificada con portero y 4 jugadores de campo por equipo.
- Se añadió control de jugador activo y cambio de jugador con `Shift`.
- Se eliminó la restricción artificial de media pista para jugadores de campo.
- Se introdujo una IA táctica simple con roles básicos: portero, defensas, ala y pivote.
- Se añadió una posesión básica de la bola con portador activo.
- Se separaron pase y tiro como acciones distintas (`X` y `Espacio`).
- Se mejoró el cambio de jugador para priorizar portador azul o jugador más cercano a la bola.
- Se ajustaron colisiones y contactos para que el juego sea menos caótico y más legible.
- Se inició la modularización real del código, separando constantes, tipos, utilidades, formaciones, entidades, render y escena principal.
- `src/main.ts` quedó reducido al arranque del juego para evitar que el archivo principal siguiera creciendo.
- Se extrajeron sistemas jugables desde `MatchScene` hacia módulos separados para balón, movimiento, helpers de jugadores y visuales.
- La escena principal quedó bastante más limpia y preparada para seguir escalando sin convertir cada cambio en una edición gigante.
- Se extrajo además la IA de porteros y jugadores de campo a `src/game/systems/ai.ts`, reduciendo todavía más la responsabilidad de `MatchScene`.
- Se añadieron comentarios útiles en escena y systems clave para explicar intención, heurísticas y orden de ejecución.
- Se documentó una convención explícita de comentarios en `.copilot/code-style.md` para mantener coherencia entre agentes.
