import * as Phaser from 'phaser'
import { PERIOD_COUNT } from '../constants'
import { ARCADE_FONT } from '../render/arcadeFx'

/** Videomarcador en la esquina superior izquierda: no toca banquillos (x 320-960) ni valla lejana. */
const MARGIN = 16
const PANEL_W = 300
const PANEL_H_FULL = 58
const PANEL_H_COMPACT = 52
const PANEL_Y = 6
const BLOCK_W = 90

export interface ScoreboardState {
  blueScore: number
  redScore: number
  remainingSeconds: number
  currentPeriod: number
  teamFouls: { blue: number, red: number }
  /** Sancionados con su cuenta atrás en segundos. */
  suspensions: { team: 'blue' | 'red', secondsLeft: number }[]
}

/**
 * Videomarcador común a arcade y reglamento: goles, periodo, reloj, faltas de
 * equipo y sancionados. Se crea dentro de withUi (sin zoom de cámara).
 */
export function createScoreboard(scene: Phaser.Scene, showFouls = true) {
  const PANEL_H = showFouls ? PANEL_H_FULL : PANEL_H_COMPACT
  const left = MARGIN
  const panel = scene.add.graphics().setDepth(50)
  panel.fillStyle(0x050b13, 0.86)
  panel.fillRoundedRect(left, PANEL_Y, PANEL_W, PANEL_H, 12)
  panel.fillStyle(0x1f6fd1, 1)
  panel.fillRoundedRect(left, PANEL_Y, BLOCK_W, PANEL_H, { tl: 12, bl: 12, tr: 0, br: 0 })
  panel.fillStyle(0xd12a3c, 1)
  panel.fillRoundedRect(left + PANEL_W - BLOCK_W, PANEL_Y, BLOCK_W, PANEL_H, { tl: 0, bl: 0, tr: 12, br: 12 })
  panel.lineStyle(2, 0xffffff, 0.18)
  panel.strokeRoundedRect(left, PANEL_Y, PANEL_W, PANEL_H, 12)

  const mk = (x: number, y: number, size: number, color: string, text = '') =>
    scene.add.text(x, y, text, { fontFamily: ARCADE_FONT, fontSize: `${size}px`, color }).setOrigin(0.5).setDepth(51)

  const scoreStyle = { fontFamily: ARCADE_FONT, fontSize: '34px', color: '#ffffff', stroke: '#050b13', strokeThickness: 5 }
  const blueScore = scene.add.text(left + BLOCK_W / 2, PANEL_Y + (showFouls ? 22 : PANEL_H / 2), '0', scoreStyle).setOrigin(0.5).setDepth(51)
  const redScore = scene.add.text(left + PANEL_W - BLOCK_W / 2, PANEL_Y + (showFouls ? 22 : PANEL_H / 2), '0', scoreStyle).setOrigin(0.5).setDepth(51)
  const blueFouls = mk(left + BLOCK_W / 2, PANEL_Y + 46, 12, '#dcebff')
  const redFouls = mk(left + PANEL_W - BLOCK_W / 2, PANEL_Y + 46, 12, '#ffe2e5')
  const clock = mk(left + PANEL_W / 2, PANEL_Y + (showFouls ? 21 : 17), 28, '#ffe36a', '1:30')
  const period = mk(left + PANEL_W / 2, PANEL_Y + (showFouls ? 45 : 39), 13, '#9fb6cf')

  const susStyle = { fontFamily: ARCADE_FONT, fontSize: '15px', stroke: '#050b13', strokeThickness: 4 }
  const blueSus = scene.add.text(left + 4, PANEL_Y + PANEL_H + 6, '', { ...susStyle, color: '#6fb1ff' }).setOrigin(0, 0).setDepth(51)
  const redSus = scene.add.text(left + PANEL_W - 4, PANEL_Y + PANEL_H + 6, '', { ...susStyle, color: '#ff7b8a', align: 'right' }).setOrigin(1, 0).setDepth(51)

  let lastBlue = 0
  let lastRed = 0
  const pop = (t: Phaser.GameObjects.Text) => {
    scene.tweens.add({ targets: t, scale: { from: 1.8, to: 1 }, duration: 420, ease: 'Back.Out' })
  }
  const fmt = (list: ScoreboardState['suspensions'], team: 'blue' | 'red') =>
    list.filter(s => s.team === team).map(s => `2' ${s.secondsLeft}s`).join('\n')

  return {
    update(s: ScoreboardState) {
      if (s.blueScore !== lastBlue) pop(blueScore)
      if (s.redScore !== lastRed) pop(redScore)
      lastBlue = s.blueScore
      lastRed = s.redScore
      blueScore.setText(`${s.blueScore}`)
      redScore.setText(`${s.redScore}`)
      if (showFouls) blueFouls.setText(`FALTAS ${s.teamFouls.blue}`)
      if (showFouls) redFouls.setText(`FALTAS ${s.teamFouls.red}`)
      const m = Math.floor(s.remainingSeconds / 60)
      const sec = s.remainingSeconds % 60
      clock.setText(`${m}:${sec.toString().padStart(2, '0')}`)
      clock.setColor(s.remainingSeconds <= 10 ? '#ff5d6c' : '#ffe36a')
      period.setText(`${s.currentPeriod}º / ${PERIOD_COUNT}`)
      if (showFouls) blueSus.setText(fmt(s.suspensions, 'blue'))
      if (showFouls) redSus.setText(fmt(s.suspensions, 'red'))
    },
  }
}

export type Scoreboard = ReturnType<typeof createScoreboard>
