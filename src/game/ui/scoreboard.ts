import * as Phaser from 'phaser'
import { CLOCK_WARNING_GAME_SECONDS, PERIOD_COUNT } from '../constants'
import { ARCADE_FONT } from '../render/arcadeFx'
import { claveEscudo, equipoDeHueco, ladoDeHueco, registrarEscudos } from '../externalMatch'
import { teamKit } from '../render/puppet/kit'

/** Videomarcador en la esquina superior izquierda: no toca banquillos (x 320-960) ni valla lejana. */
const MARGIN = 16
const PANEL_W = 300
const PANEL_H_FULL = 58
const PANEL_H_COMPACT = 52
const PANEL_Y = 6
const BLOCK_W = 90
/** Con partido externo: columna del escudo dentro de cada bloque y lado del escudo. */
const CREST_COL = 34
const CREST_SIZE = 24

const hexStr = (c: number) => `#${c.toString(16).padStart(6, '0')}`
/** Luminancia relativa aproximada (0..1) para elegir texto claro u oscuro sobre un color. */
function luminance(c: number) {
  const ch = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * ch((c >> 16) & 255) + 0.7152 * ch((c >> 8) & 255) + 0.0722 * ch(c & 255)
}

/** Aclara hacia blanco un color oscuro para que se lea sobre el fondo oscuro del juego. */
function legible(c: number) {
  let out = c
  for (let t = 0.15; luminance(out) < 0.25 && t <= 1; t += 0.15) {
    const mix = (v: number) => Math.round(v + (255 - v) * t)
    out = (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255)
  }
  return out
}

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
  // Partido externo: el local va siempre a la izquierda, sea quien sea el humano ('blue'); sin él, azul a la izquierda
  const external = equipoDeHueco('blue') !== null
  const leftSlot: 'blue' | 'red' = external && ladoDeHueco('blue') === 'visitante' ? 'red' : 'blue'
  const rightSlot = leftSlot === 'blue' ? 'red' : 'blue'
  const colorOf = (slot: 'blue' | 'red', fallback: number) => (external ? teamKit(slot).jersey : fallback)
  const leftColor = colorOf(leftSlot, 0x1f6fd1)
  const rightColor = colorOf(rightSlot, 0xd12a3c)
  // Sobre camisetas claras el texto pasa a oscuro; el trazo hace de contorno claro
  const ink = (c: number) => (external && luminance(c) > 0.45 ? { text: '#08111b', stroke: '#ffffff' } : { text: '#ffffff', stroke: '#050b13' })
  const leftInk = ink(leftColor)
  const rightInk = ink(rightColor)

  const panel = scene.add.graphics().setDepth(50)
  panel.fillStyle(0x050b13, 0.86)
  panel.fillRoundedRect(left, PANEL_Y, PANEL_W, PANEL_H, 12)
  panel.fillStyle(leftColor, 1)
  panel.fillRoundedRect(left, PANEL_Y, BLOCK_W, PANEL_H, { tl: 12, bl: 12, tr: 0, br: 0 })
  panel.fillStyle(rightColor, 1)
  panel.fillRoundedRect(left + PANEL_W - BLOCK_W, PANEL_Y, BLOCK_W, PANEL_H, { tl: 0, bl: 0, tr: 12, br: 12 })
  panel.lineStyle(2, 0xffffff, 0.18)
  panel.strokeRoundedRect(left, PANEL_Y, PANEL_W, PANEL_H, 12)

  const mk = (x: number, y: number, size: number, color: string, text = '') =>
    scene.add.text(x, y, text, { fontFamily: ARCADE_FONT, fontSize: `${size}px`, color }).setOrigin(0.5).setDepth(51)

  // Con escudo, el marcador se desplaza al lado opuesto de la columna del escudo
  const shift = external ? CREST_COL / 2 : 0
  const leftX = left + BLOCK_W / 2 + shift
  const rightX = left + PANEL_W - BLOCK_W / 2 - shift
  const scoreStyle = (i: { text: string, stroke: string }) => ({ fontFamily: ARCADE_FONT, fontSize: '34px', color: i.text, stroke: i.stroke, strokeThickness: 5 })
  const scoreY = PANEL_Y + (showFouls ? 22 : PANEL_H / 2)
  const leftScoreText = scene.add.text(leftX, scoreY, '0', scoreStyle(leftInk)).setOrigin(0.5).setDepth(51)
  const rightScoreText = scene.add.text(rightX, scoreY, '0', scoreStyle(rightInk)).setOrigin(0.5).setDepth(51)
  const foulsSize = external ? 11 : 12
  const leftFouls = mk(leftX, PANEL_Y + 46, foulsSize, external ? leftInk.text : '#dcebff')
  const rightFouls = mk(rightX, PANEL_Y + 46, foulsSize, external ? rightInk.text : '#ffe2e5')
  const clock = mk(left + PANEL_W / 2, PANEL_Y + (showFouls ? 21 : 17), 28, '#ffe36a', '25:00')
  const period = mk(left + PANEL_W / 2, PANEL_Y + (showFouls ? 45 : 39), 13, '#9fb6cf')

  if (external) {
    registrarEscudos(scene.textures)
    // Escudo (o abreviatura grande si no hay) sobre un disco claro: el color del escudo coincide con el de la camiseta
    const badge = (slot: 'blue' | 'red', cx: number) => {
      const team = equipoDeHueco(slot)!
      const key = claveEscudo(ladoDeHueco(slot))
      const cy = PANEL_Y + 18
      if (key) {
        panel.fillStyle(0xffffff, 0.93)
        panel.fillCircle(cx, cy, CREST_SIZE / 2 + 3)
        const img = scene.add.image(cx, cy, key).setDepth(51)
        img.setScale(CREST_SIZE / Math.max(img.width, img.height))
        mk(cx, PANEL_Y + 41, 11, '#ffffff', team.abrev).setStroke('#050b13', 3)
      } else {
        mk(cx, cy + 4, 15, '#ffffff', team.abrev).setStroke('#050b13', 4)
      }
    }
    badge(leftSlot, left + CREST_COL / 2 + 2)
    badge(rightSlot, left + PANEL_W - CREST_COL / 2 - 2)
  }

  const susStyle = { fontFamily: ARCADE_FONT, fontSize: '15px', stroke: '#050b13', strokeThickness: 4 }
  const leftSusColor = external ? hexStr(legible(leftColor)) : '#6fb1ff'
  const rightSusColor = external ? hexStr(legible(rightColor)) : '#ff7b8a'
  const leftSus = scene.add.text(left + 4, PANEL_Y + PANEL_H + 6, '', { ...susStyle, color: leftSusColor }).setOrigin(0, 0).setDepth(51)
  const rightSus = scene.add.text(left + PANEL_W - 4, PANEL_Y + PANEL_H + 6, '', { ...susStyle, color: rightSusColor, align: 'right' }).setOrigin(1, 0).setDepth(51)

  let lastLeft = 0
  let lastRight = 0
  const pop = (t: Phaser.GameObjects.Text) => {
    scene.tweens.add({ targets: t, scale: { from: 1.8, to: 1 }, duration: 420, ease: 'Back.Out' })
  }
  const fmt = (list: ScoreboardState['suspensions'], team: 'blue' | 'red') =>
    list.filter(s => s.team === team).map(s => `${Math.floor(s.secondsLeft / 60)}:${String(s.secondsLeft % 60).padStart(2, '0')}`).join('\n')

  return {
    update(s: ScoreboardState) {
      const scoreOf = (slot: 'blue' | 'red') => (slot === 'blue' ? s.blueScore : s.redScore)
      const leftScore = scoreOf(leftSlot)
      const rightScore = scoreOf(rightSlot)
      if (leftScore !== lastLeft) pop(leftScoreText)
      if (rightScore !== lastRight) pop(rightScoreText)
      lastLeft = leftScore
      lastRight = rightScore
      leftScoreText.setText(`${leftScore}`)
      rightScoreText.setText(`${rightScore}`)
      if (showFouls) leftFouls.setText(`FALTAS ${s.teamFouls[leftSlot]}`)
      if (showFouls) rightFouls.setText(`FALTAS ${s.teamFouls[rightSlot]}`)
      const m = Math.floor(s.remainingSeconds / 60)
      const sec = s.remainingSeconds % 60
      clock.setText(`${m}:${sec.toString().padStart(2, '0')}`)
      clock.setColor(s.remainingSeconds <= CLOCK_WARNING_GAME_SECONDS ? '#ff5d6c' : '#ffe36a')
      period.setText(PERIOD_COUNT === 2 ? `${s.currentPeriod}ª PARTE` : `${s.currentPeriod} / ${PERIOD_COUNT}`)
      if (showFouls) leftSus.setText(fmt(s.suspensions, leftSlot))
      if (showFouls) rightSus.setText(fmt(s.suspensions, rightSlot))
    },
  }
}

export type Scoreboard = ReturnType<typeof createScoreboard>
