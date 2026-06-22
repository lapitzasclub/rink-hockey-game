import * as Phaser from 'phaser'
import type { Player } from '../types'
import { getRoleShort } from '../utils'
import { SPRITE_NATIVE_ANGLE } from '../entities/createPlayer'
import { STICK_SWING_MS } from '../constants'

const STAMINA_BAR_W = 36
const STAMINA_BAR_H = 3
const STAMINA_BAR_Y_OFFSET = 44  // ajustado a displaySize = radius * 4.5 → mitad sprite ~40px

export function updateVisuals(
  players: Player[],
  controlled: Player,
  ball: Phaser.GameObjects.Arc,
  ballCarrierId: string | null,
  timeNow: number,
) {
  for (const player of players) {
    const suspended = !!(player.suspendedUntil && player.suspendedUntil > timeNow)
    // Jugador en el banquillo: semi-transparente, sin anillo ni stamina
    if (suspended) {
      player.body.setPosition(player.pos.x, player.pos.y).setAlpha(0.35)
      player.shadow.setPosition(player.pos.x, player.pos.y + 6).setAlpha(0.15)
      player.selectionRing.setVisible(false)
      player.stick.setVisible(false)
      player.staminaBar?.setVisible(false)
      player.label.setPosition(player.pos.x, player.pos.y - player.body.displayHeight / 2 - 8)
        .setText('AZUL').setAlpha(0.5)
      continue
    }
    player.body.setAlpha(1)
    player.shadow.setAlpha(0.28)
    player.stick.setVisible(true)
    player.staminaBar?.setVisible(true)
    player.label.setAlpha(1)

    // Posición
    player.body.setPosition(player.pos.x, player.pos.y)
    player.shadow.setPosition(player.pos.x, player.pos.y + 6)
    player.selectionRing.setPosition(player.pos.x, player.pos.y)
    player.label.setPosition(player.pos.x, player.pos.y - player.body.displayHeight / 2 - 8)

    const facingAngle = Math.atan2(player.facing.y, player.facing.x)

    // Rotación del sprite según dirección de cara
    if (player.role === 'goalie') {
      // El sprite de portero mira "hacia abajo" en el PNG (ángulo nativo +π/2).
      const fieldAngle = player.side === 'left' ? 0 : Math.PI
      player.body.setRotation(fieldAngle - Math.PI / 2)
    } else {
      // Lean lateral: componente de velocidad perpendicular a la dirección de cara
      const perpX = -Math.sin(facingAngle)
      const perpY = Math.cos(facingAngle)
      const lateralSpeed = player.velocity.x * perpX + player.velocity.y * perpY
      const lean = Phaser.Math.Clamp(lateralSpeed * 0.0006, -0.15, 0.15)
      player.body.setRotation(facingAngle - SPRITE_NATIVE_ANGLE[player.team] + lean)
    }

    // Posición base del stick: apunta a la pelota o en dirección de carry
    const aimX = ballCarrierId === player.id ? player.pos.x + player.facing.x * 40 : ball.x
    const aimY = ballCarrierId === player.id ? player.pos.y + player.facing.y * 40 : ball.y
    const baseStickAngle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, aimX, aimY)

    // Animación de golpeo: barrido del stick en arco durante STICK_SWING_MS ms
    let stickAngle = baseStickAngle
    if ((player.stickSwingUntil ?? 0) > timeNow) {
      const t = 1 - (player.stickSwingUntil! - timeNow) / STICK_SWING_MS  // 0→1
      const swingOffset = Math.sin(t * Math.PI) * 1.1  // arco: 0 → ~63° → 0
      stickAngle = facingAngle + swingOffset
    }

    player.stick.setPosition(player.pos.x + Math.cos(stickAngle) * 18, player.pos.y + Math.sin(stickAngle) * 18)
    player.stick.rotation = stickAngle

    // Anillo de selección
    const active = controlled.id === player.id
    const carrying = ballCarrierId === player.id
    if (carrying) {
      player.selectionRing.setVisible(true).setStrokeStyle(3, 0x9cff7a, 1)
    } else if (active) {
      player.selectionRing.setVisible(true).setStrokeStyle(3, 0xfff27a, 1)
    } else {
      player.selectionRing.setVisible(false)
    }

    // Etiqueta
    player.label.setText(`${getRoleShort(player.role)}${active ? '★' : ''}${carrying ? '●' : ''}`)

    // Barra de stamina
    if (player.staminaBar) {
      const stamina = Math.max(0, (player.stamina ?? 100) / 100)
      const barW = Math.max(1, Math.round(STAMINA_BAR_W * stamina))
      const color = stamina > 0.5 ? 0x4da3ff : stamina > 0.25 ? 0xf5c64f : 0xff4d5c
      player.staminaBar.setFillStyle(color)
      player.staminaBar.setPosition(player.pos.x - STAMINA_BAR_W / 2, player.pos.y + STAMINA_BAR_Y_OFFSET)
      player.staminaBar.setDisplaySize(barW, STAMINA_BAR_H)
    }
  }
}

export function getStickTip(player: Player) {
  const angle = player.stick.rotation
  return { x: player.stick.x + Math.cos(angle) * 14, y: player.stick.y + Math.sin(angle) * 14 }
}
