import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, PERIOD_COUNT, STAMINA_MAX } from '../constants'
import { ARCADE_FONT } from '../render/arcadeFx'
import type { Player } from '../types'

const PANEL_W = 360
const PANEL_H = 64
const BAR_W = 220
const BAR_H = 14

/**
 * HUD del modo arcade: marcador central tipo videomarcador, barra de turbo
 * del jugador controlado y línea de estado (powerups, racha).
 * Se crea dentro de withUi para que no le afecte el zoom de la cámara.
 */
export function createArcadeHud(scene: Phaser.Scene) {
  const cx = GAME_WIDTH / 2
  const panel = scene.add.graphics().setDepth(50)
  panel.fillStyle(0x050b13, 0.86)
  panel.fillRoundedRect(cx - PANEL_W / 2, 8, PANEL_W, PANEL_H, 12)
  panel.fillStyle(0x1f6fd1, 1)
  panel.fillRoundedRect(cx - PANEL_W / 2, 8, 96, PANEL_H, { tl: 12, bl: 12, tr: 0, br: 0 })
  panel.fillStyle(0xd12a3c, 1)
  panel.fillRoundedRect(cx + PANEL_W / 2 - 96, 8, 96, PANEL_H, { tl: 0, bl: 0, tr: 12, br: 12 })
  panel.lineStyle(2, 0xffffff, 0.18)
  panel.strokeRoundedRect(cx - PANEL_W / 2, 8, PANEL_W, PANEL_H, 12)

  const scoreStyle = { fontFamily: ARCADE_FONT, fontSize: '42px', color: '#ffffff', stroke: '#050b13', strokeThickness: 6 }
  const blueScore = scene.add.text(cx - PANEL_W / 2 + 48, 40, '0', scoreStyle).setOrigin(0.5).setDepth(51)
  const redScore = scene.add.text(cx + PANEL_W / 2 - 48, 40, '0', scoreStyle).setOrigin(0.5).setDepth(51)
  const clock = scene.add.text(cx, 32, '1:30', { fontFamily: ARCADE_FONT, fontSize: '30px', color: '#ffe36a' }).setOrigin(0.5).setDepth(51)
  const period = scene.add.text(cx, 58, '1º', { fontFamily: ARCADE_FONT, fontSize: '14px', color: '#9fb6cf' }).setOrigin(0.5).setDepth(51)

  const barX = 24
  const barY = GAME_HEIGHT - 34
  const barBg = scene.add.graphics().setDepth(50)
  barBg.fillStyle(0x050b13, 0.82)
  barBg.fillRoundedRect(barX - 8, barY - 26, BAR_W + 16, BAR_H + 34, 8)
  barBg.fillStyle(0x1a2838, 1)
  barBg.fillRect(barX, barY, BAR_W, BAR_H)
  const bar = scene.add.rectangle(barX, barY, BAR_W, BAR_H, 0x3ee8ff).setOrigin(0, 0).setDepth(51)
  const barLabel = scene.add.text(barX, barY - 22, 'TURBO', { fontFamily: ARCADE_FONT, fontSize: '15px', color: '#3ee8ff' }).setDepth(51)
  const status = scene.add.text(barX + BAR_W + 22, barY - 2, '', {
    fontFamily: ARCADE_FONT,
    fontSize: '16px',
    color: '#ffe36a',
    stroke: '#050b13',
    strokeThickness: 5,
  }).setOrigin(0, 0.5).setDepth(51)

  let lastBlue = 0
  let lastRed = 0

  const pop = (text: Phaser.GameObjects.Text) => {
    scene.tweens.add({ targets: text, scale: { from: 1.8, to: 1 }, duration: 420, ease: 'Back.Out' })
  }

  return {
    update(options: { blueScore: number, redScore: number, remainingSeconds: number, currentPeriod: number, controlled: Player, statusLine: string, timeNow: number }) {
      if (options.blueScore !== lastBlue) pop(blueScore)
      if (options.redScore !== lastRed) pop(redScore)
      lastBlue = options.blueScore
      lastRed = options.redScore
      blueScore.setText(`${options.blueScore}`)
      redScore.setText(`${options.redScore}`)
      const m = Math.floor(options.remainingSeconds / 60)
      const s = options.remainingSeconds % 60
      clock.setText(`${m}:${s.toString().padStart(2, '0')}`)
      clock.setColor(options.remainingSeconds <= 10 ? '#ff5d6c' : '#ffe36a')
      period.setText(`${options.currentPeriod}º / ${PERIOD_COUNT}`)

      const player = options.controlled
      const ratio = Phaser.Math.Clamp((player.stamina ?? STAMINA_MAX) / STAMINA_MAX, 0, 1)
      const infinite = !!player.onFire || (player.turboUntil ?? 0) > options.timeNow
      bar.width = Math.max(1, BAR_W * ratio)
      const color = infinite ? (Math.floor(options.timeNow / 90) % 2 === 0 ? 0xffe36a : 0xff8a1a)
        : ratio > 0.5 ? 0x3ee8ff : ratio > 0.22 ? 0xf5c64f : 0xff4d5c
      bar.setFillStyle(color)
      barLabel.setText(infinite ? 'TURBO ∞' : player.sprinting ? 'TURBO ▶▶' : 'TURBO')
      status.setText(options.statusLine)
    },
  }
}

export type ArcadeHud = ReturnType<typeof createArcadeHud>
