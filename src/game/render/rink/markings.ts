/** Marcas de la pista: área de penalti, semicírculo del portero y puntos reglamentarios. */
import * as Phaser from 'phaser'
import { DIRECT_FREE_HIT_SPOT_OFFSET, GOAL_HALF_H, PENALTY_SPOT_OFFSET } from '../../constants'
import { MARKINGS } from '../artSpec'
import { worldToScreen } from '../viewTransform'
import { arcPts } from './geometry'

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

  g.lineStyle(MARKINGS.lineWidth, MARKINGS.lineColor, MARKINGS.lineAlpha)
  g.beginPath()
  g.moveTo(tl.x, tl.y); g.lineTo(tr.x, tr.y)
  g.lineTo(br.x, br.y); g.lineTo(bl.x, bl.y)
  g.closePath()
  g.strokePath()
}

/**
 * Semicírculo de protección del portero: de poste a poste (r = GOAL_HALF_H),
 * con el diámetro sobre la línea de gol. Solo abre hacia el campo, así que
 * nunca entra en la portería (que queda detrás de la línea).
 */
export function drawGoalCrease(g: Phaser.GameObjects.Graphics, goalLineX: number, cy: number, leftSide: boolean) {
  const startDeg = leftSide ? 270 : 90
  const arc = arcPts(goalLineX, cy, GOAL_HALF_H, startDeg, startDeg + 180, 28)
  g.lineStyle(MARKINGS.lineWidth, MARKINGS.lineColor, MARKINGS.lineAlpha)
  g.beginPath()
  g.moveTo(arc[0].x, arc[0].y)
  for (let i = 1; i < arc.length; i++) g.lineTo(arc[i].x, arc[i].y)
  g.strokePath()
}

/** Puntos de penalti (5,40 m) y de libre directo (`DIRECT_FREE_HIT_SPOT_OFFSET`, 7,40 m), desde la línea de gol. */
export function drawFieldDots(
  g: Phaser.GameObjects.Graphics,
  leftGoalX: number, rightGoalX: number, cy: number,
) {
  const penaltyDepth  = PENALTY_SPOT_OFFSET
  const freeHitDepth  = DIRECT_FREE_HIT_SPOT_OFFSET

  g.fillStyle(MARKINGS.lineColor, 1)
  const dots = [
    worldToScreen(leftGoalX  + penaltyDepth,  cy),
    worldToScreen(rightGoalX - penaltyDepth,  cy),
    worldToScreen(leftGoalX  + freeHitDepth,  cy),
    worldToScreen(rightGoalX - freeHitDepth,  cy),
  ]
  for (const d of dots) g.fillCircle(d.x, d.y, MARKINGS.dotRadius)
}
