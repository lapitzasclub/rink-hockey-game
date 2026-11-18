import * as Phaser from 'phaser'
import { GAME_HEIGHT, STAMINA_MAX } from '../constants'
import { ARCADE_FONT } from '../render/arcadeFx'
import type { Player } from '../types'
import { bakeGraphics } from '../render/bake'

const BAR_W = 220
const BAR_H = 14
const BAR_Y = GAME_HEIGHT - 34
/** Borde superior del HUD de turbo en el área de diseño. */
const HUD_TOP = BAR_Y - 26
/**
 * Desplazamiento vertical en táctil: el bloque sube de abajo a la izquierda a justo
 * bajo el marcador compacto del arcade (y = 66), lejos del joystick (HudLayout).
 */
export const ARCADE_HUD_TOUCH_DY = 66 - HUD_TOP

/**
 * HUD extra del modo arcade (el videomarcador es común, ver scoreboard.ts):
 * barra de turbo del jugador controlado y línea de estado (powerups, racha).
 * Se crea dentro de withUi para que no le afecte el zoom de la cámara.
 */
export function createArcadeHud(scene: Phaser.Scene) {
  const barX = 24
  const barY = BAR_Y
  const barBg = scene.add.graphics().setDepth(50)
  barBg.fillStyle(0x050b13, 0.82)
  barBg.fillRoundedRect(barX - 8, barY - 26, BAR_W + 16, BAR_H + 34, 8)
  barBg.fillStyle(0x1a2838, 1)
  barBg.fillRect(barX, barY, BAR_W, BAR_H)
  bakeGraphics(barBg, 'turbo-bg')
  const bar = scene.add.rectangle(barX, barY, BAR_W, BAR_H, 0x3ee8ff).setOrigin(0, 0).setDepth(51)
  const barLabel = scene.add.text(barX, barY - 22, 'TURBO', { fontFamily: ARCADE_FONT, fontSize: '15px', color: '#3ee8ff' }).setDepth(51)
  // Doble chevrón dibujado (sin caracteres Unicode) mientras se esprinta
  const chevronsG = scene.add.graphics({ x: barX + barLabel.width + 10, y: barY - 14 }).setDepth(51).setVisible(false)
  chevronsG.fillStyle(0x3ee8ff, 1)
  for (const dx of [0, 9]) chevronsG.fillTriangle(dx, -6, dx + 8, 0, dx, 6)
  const chevrons = bakeGraphics(chevronsG, 'turbo-chev')
  const status = scene.add.text(barX + BAR_W + 22, barY - 2, '', {
    fontFamily: ARCADE_FONT,
    fontSize: '16px',
    color: '#ffe36a',
    stroke: '#050b13',
    strokeThickness: 5,
  }).setOrigin(0, 0.5).setDepth(51)

  return {
    update(options: { controlled: Player, statusLine: string, timeNow: number }) {
      const player = options.controlled
      const ratio = Phaser.Math.Clamp((player.stamina ?? STAMINA_MAX) / STAMINA_MAX, 0, 1)
      const infinite = !!player.onFire || (player.turboUntil ?? 0) > options.timeNow
      bar.width = Math.max(1, BAR_W * ratio)
      const color = infinite ? (Math.floor(options.timeNow / 90) % 2 === 0 ? 0xffe36a : 0xff8a1a)
        : ratio > 0.5 ? 0x3ee8ff : ratio > 0.22 ? 0xf5c64f : 0xff4d5c
      bar.setFillStyle(color)
      barLabel.setText(infinite ? 'TURBO MÁX' : 'TURBO')
      chevrons.setVisible(!infinite && !!player.sprinting)
      status.setText(options.statusLine)
    },
  }
}

export type ArcadeHud = ReturnType<typeof createArcadeHud>
