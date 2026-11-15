/** Marcas de la pista: área de penalti, semicírculo del portero y puntos reglamentarios. */
import * as Phaser from 'phaser'
import { GOAL_HEIGHT } from '../../constants'
import { worldToScreen } from '../viewTransform'
import { LINE_RED, LINE_WHITE, arcPts } from './geometry'

// ─── Elementos del campo ──────────────────────────────────────────────────────

export function drawPenaltyArea(
  g: Phaser.GameObjects.Graphics,
  goalLineX: number, cy: number, leftSide: boolean,
  sx: number, sy: number,
) {
  const halfH = 4.5 * sy
  const depth = 5.40 * sx
  const top   = cy - halfH
  const bot   = cy + halfH

  let tl, tr, br, bl
  if (leftSide) {
    tl = worldToScreen(goalLineX,         top)
    tr = worldToScreen(goalLineX + depth, top)
    br = worldToScreen(goalLineX + depth, bot)
    bl = worldToScreen(goalLineX,         bot)
  } else {
    tl = worldToScreen(goalLineX - depth, top)
    tr = worldToScreen(goalLineX,         top)
    br = worldToScreen(goalLineX,         bot)
    bl = worldToScreen(goalLineX - depth, bot)
  }

  g.lineStyle(3, LINE_WHITE, 0.9)
  g.beginPath()
  g.moveTo(tl.x, tl.y); g.lineTo(tr.x, tr.y)
  g.lineTo(br.x, br.y); g.lineTo(bl.x, bl.y)
  g.closePath()
  g.strokePath()
}

export function drawGoalCrease(g: Phaser.GameObjects.Graphics, goalLineX: number, cy: number, leftSide: boolean) {
  const r = (GOAL_HEIGHT - 36) / 2
  // Arco que abre hacia el campo: derecha para portería izq, izquierda para portería dcha
  const startDeg = leftSide ? 270 : 90
  const endDeg   = leftSide ? 270 + 180 : 90 + 180

  const arc = arcPts(goalLineX, cy, r, startDeg, endDeg, 24)
  const gpt = worldToScreen(goalLineX, cy)

  g.fillStyle(0x7fb4ff, 0.22)
  g.beginPath()
  g.moveTo(gpt.x, gpt.y)
  for (const p of arc) g.lineTo(p.x, p.y)
  g.closePath()
  g.fillPath()

  g.lineStyle(3, LINE_RED, 0.9)
  g.beginPath()
  g.moveTo(arc[0].x, arc[0].y)
  for (let i = 1; i < arc.length; i++) g.lineTo(arc[i].x, arc[i].y)
  g.strokePath()
}




export function drawFieldDots(
  g: Phaser.GameObjects.Graphics,
  leftGoalX: number, rightGoalX: number, cy: number, sx: number,
) {
  const penaltyDepth  = 5.40 * sx
  const freeHitDepth  = 7.40 * sx

  g.fillStyle(LINE_WHITE, 0.95)
  const dots = [
    worldToScreen(leftGoalX  + penaltyDepth,  cy),
    worldToScreen(rightGoalX - penaltyDepth,  cy),
    worldToScreen(leftGoalX  + freeHitDepth,  cy),
    worldToScreen(rightGoalX - freeHitDepth,  cy),
  ]
  for (const d of dots) g.fillCircle(d.x, d.y, 5)
}
