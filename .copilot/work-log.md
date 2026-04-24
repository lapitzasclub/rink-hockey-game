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
