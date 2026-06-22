# Rink Hockey Game

Juego de rink hockey (hockey sobre patines) 2D top-down para navegador. Vista cenital, partido 5v5 simplificado, jugable en escritorio y móvil.

## Stack

- **Motor**: Phaser 4
- **Lenguaje**: TypeScript
- **Build**: Vite
- **Móvil**: nipplejs (joystick analógico virtual)

## Cómo ejecutar

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview
```

## Controles

### Teclado

| Acción | Tecla |
|---|---|
| Mover | WASD / flechas |
| Sprint | Shift |
| Tiro / robo | U |
| Pase / cambio de jugador | Y (contextual) |

> Con posesión: Y = pase. Sin posesión: Y = cambiar jugador activo.

### Móvil

| Control | Acción |
|---|---|
| Joystick izquierdo | Mover |
| A | Tiro / robo |
| B | Pase / cambio de jugador |
| S | Sprint |
| ⛶ | Pantalla completa |

## Estado

Prototipo base jugable. Consulta [AGENTS.md](./AGENTS.md) para roadmap y estado técnico.
