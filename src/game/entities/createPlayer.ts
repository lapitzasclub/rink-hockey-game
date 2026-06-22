import * as Phaser from 'phaser'
import { GOALIE_RADIUS, PLAYER_RADIUS } from '../constants'
import type { Player, Role, TeamColor, TeamSide } from '../types'
import { getRoleShort } from '../utils'

const FONT = '"Courier New", Courier, monospace'
const STAMINA_BAR_W = 36
const STAMINA_BAR_H = 3

// Ángulo base del sprite en la hoja: azul mira a la derecha (0), rojo a la izquierda (π)
const SPRITE_NATIVE_ANGLE: Record<TeamColor, number> = { blue: 0, red: Math.PI }

// Índice de frame en players.png: 0=azul, 1=rojo (2=pelota, 3=vacío)
const SPRITE_FRAME: Record<TeamColor, number> = { blue: 0, red: 1 }

export function createPlayer(
  scene: Phaser.Scene,
  id: string,
  team: TeamColor,
  side: TeamSide,
  role: Role,
  x: number,
  y: number,
  _color: number,
  controllable: boolean,
): Player {
  const radius = role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  // Los sprites de campo ocupan ~50% del frame (627px); los de portero ~75% del frame (1254px).
  // Multiplicador 4.5 da figuras visibles de ~40px campo y ~67px portero a 90px de displaySize.
  const displaySize = radius * 4.5

  // Sombra de planta — ellipse achatada bajo el jugador
  const shadow = scene.add.ellipse(x, y + 6, displaySize * 1.1, displaySize * 0.55, 0x000000, 0.22)

  // Stick creado ANTES del sprite para renderizar detrás de él
  const stick = scene.add.rectangle(x + (side === 'left' ? 18 : -18), y, 28, 4, 0x2a1a08)

  // Sprite del jugador — porteros usan texturas independientes; campo usa el spritesheet
  const body = role === 'goalie'
    ? scene.add.image(x, y, team === 'blue' ? 'goalie-blue' : 'goalie-red')
    : scene.add.image(x, y, 'players', SPRITE_FRAME[team])
  body.setDisplaySize(displaySize, displaySize)

  // Anillo de selección creado DESPUÉS del sprite para renderizar encima
  const selectionRing = scene.add.circle(x, y, radius + 7)
  selectionRing.setStrokeStyle(3, 0xffffff, 1)
  selectionRing.setFillStyle(0, 0)
  selectionRing.setVisible(false)

  const staminaBar = controllable
    ? scene.add.rectangle(x - STAMINA_BAR_W / 2, y + radius + 5, STAMINA_BAR_W, STAMINA_BAR_H, 0x4da3ff)
        .setOrigin(0, 0.5)
    : null

  const label = scene.add.text(x, y - radius - 16, getRoleShort(role), {
    fontFamily: FONT,
    fontSize: '11px',
    color: '#d0e8ff',
    stroke: '#06101a',
    strokeThickness: 3,
  }).setOrigin(0.5)

  return {
    id,
    team,
    side,
    role,
    body,
    shadow,
    selectionRing,
    stick,
    label,
    staminaBar,
    pos: { x, y },
    velocity: { x: 0, y: 0 },
    facing: { x: side === 'left' ? 1 : -1, y: 0 },
    home: { x, y },
    controllable,
    possessionCooldownUntil: 0,
    goalieCatchTime: 0,
    ignoreBallUntil: 0,
    goalieRecoverUntil: 0,
    stamina: 100,
    sprinting: false,
    ballProtectionUntil: 0,
  }
}

export { SPRITE_NATIVE_ANGLE }
