# Diseño del juego

## Género

Deportivo arcade, vista cenital 2D.

## Fantasía jugable

Controlar a un jugador de rink hockey y disputar un partido corto, rápido y legible.

## Primera implementación

- Formato 1v1.
- Un jugador humano contra un rival controlado por IA.
- Partido corto con marcador visible.
- La bola puede ser empujada y golpeada.
- Se marcan goles al cruzar completamente la línea de portería.

## Controles previstos

- `WASD` o flechas: movimiento.
- `Espacio`: golpeo/tiro.
- Más adelante: pase, sprint, cambio de jugador.

## Sensación objetivo

- Movimiento con cierta inercia, no totalmente rígido.
- Ritmo rápido.
- Fácil de entender, difícil de dominar.

## IA inicial

- Persigue la bola.
- Intenta orientarse hacia la portería rival.
- Dispara cuando tiene oportunidad cercana.

## Reglas simplificadas

- Sin faltas ni reglas avanzadas en la primera versión.
- Reinicio simple tras gol.
- Duración corta de partido.
