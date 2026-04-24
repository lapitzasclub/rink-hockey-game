# Diseño del juego

## Género

Deportivo arcade, vista cenital 2D.

## Fantasía jugable

Controlar a un jugador de rink hockey y disputar un partido corto, rápido y legible.

## Primera implementación

- Formato 5v5 simplificado.
- Cada equipo tiene 1 portero y 4 jugadores de campo.
- El jugador humano controla un jugador activo del equipo azul.
- Puede cambiar de jugador activo rápidamente.
- Partido corto con marcador visible.
- La bola puede ser empujada y golpeada.
- Se marcan goles al cruzar completamente la línea de portería.

## Controles actuales

- `WASD` o flechas: movimiento.
- `X`: pase.
- `Espacio`: tiro.
- `Shift`: cambio del jugador activo.

## Controles futuros

- Pase separado del tiro.
- Sprint.
- Cambio de jugador más inteligente/manual.

## Sensación objetivo

- Movimiento con cierta inercia, no totalmente rígido.
- Ritmo rápido.
- Fácil de entender, difícil de dominar.

## IA inicial

- Los porteros se mueven sobre su zona para cubrir portería.
- Pueden adelantarse ligeramente y realizar paradas/desvíos simples cerca del arco.
- El compañero más cercano puede ir a la bola.
- El resto intenta guardar una forma táctica simple alrededor de su posición base.
- Los rivales buscan bola, portería y remate cercano de forma básica.
- Cuando un jugador tiene control de bola, puede avanzar, pasar o chutar según contexto simplificado.

## Reglas simplificadas

- Sin faltas ni reglas avanzadas en la primera versión.
- Hay una posesión básica: la bola puede quedar controlada por un jugador cercano.
- Pase y tiro están separados.
- Reinicio simple tras gol.
- Duración corta de partido.
