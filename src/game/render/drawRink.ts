import * as Phaser from 'phaser'
import { BLUE_LINE_OFFSET, GAME_HEIGHT, GAME_WIDTH, GOAL_HEIGHT, RINK } from '../constants'
import { getGoalLineX } from '../utils'
import { VIEW_ANCHOR_Y, VIEW_Y_SCALE } from './viewTransform'

/**
 * Escala real: pista oficial 40 m × 20 m
 * Horizontal: RINK.width / 40 = 28,5 px/m
 * Vertical:   RINK.height / 20 = 30 px/m
 *
 * Perspectiva 3/4: la pista se ve desde ~65° sobre el suelo.
 * Las porterías muestran profundidad; los tableros tienen grosor visible en el borde inferior.
 */
export function drawRink(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  // Perspectiva 3/4: comprimir Y desde el borde superior de la pista.
  // Todo lo dibujado en coords mundo queda automáticamente transformado.
  // Los círculos se convierten en elipses, las líneas se comprimen — correcto para vista oblicua.
  g.setPosition(0, VIEW_ANCHOR_Y * (1 - VIEW_Y_SCALE))
  g.setScale(1, VIEW_Y_SCALE)
  const cx = GAME_WIDTH / 2
  const cy = GAME_HEIGHT / 2
  const sx = RINK.width / 40
  const sy = RINK.height / 20

  const leftGoalX  = getGoalLineX('left')
  const rightGoalX = getGoalLineX('right')
  const leftBlueX  = cx - BLUE_LINE_OFFSET
  const rightBlueX = cx + BLUE_LINE_OFFSET

  // ── Tableros: grosor visible (perspectiva 3/4 — borde inferior más grueso) ──
  // El rect oscuro queda asomando debajo/a los lados del rect de hielo.
  g.fillStyle(0x08192e, 1)
  g.fillRoundedRect(RINK.x + 4, RINK.y + 10, RINK.width - 8, RINK.height + 6, 88)

  // ── Superficie de hielo ───────────────────────────────────────────────────
  g.fillStyle(0xe4f2fb, 1)
  g.fillRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)

  // Rayaduras horizontales de hielo
  g.lineStyle(1, 0x9ec8de, 0.09)
  for (let iy = RINK.y + 22; iy < RINK.y + RINK.height; iy += 26) {
    g.lineBetween(RINK.x + 40, iy, RINK.x + RINK.width - 40, iy)
  }

  // ── Áreas de penalti ─────────────────────────────────────────────────────
  drawPenaltyArea(g, leftGoalX,  cy, true,  sx, sy)
  drawPenaltyArea(g, rightGoalX, cy, false, sx, sy)

  // ── Semicírculo D del portero ─────────────────────────────────────────────
  drawGoalCrease(g, leftGoalX,  cy, true)
  drawGoalCrease(g, rightGoalX, cy, false)

  // ── Porterías 3D ─────────────────────────────────────────────────────────
  drawGoal3D(g, leftGoalX,  cy, true)
  drawGoal3D(g, rightGoalX, cy, false)

  // ── Línea central y círculo ───────────────────────────────────────────────
  g.lineStyle(4, 0x0a1525, 1)
  g.lineBetween(cx, RINK.y + 8, cx, RINK.y + RINK.height - 8)
  g.strokeCircle(cx, cy, 3 * sy)
  g.fillStyle(0x0a1525, 1)
  g.fillCircle(cx, cy, 7)

  // ── Líneas azules de zona ─────────────────────────────────────────────────
  g.lineStyle(4, 0x2060cc, 1)
  g.lineBetween(leftBlueX,  RINK.y + 8, leftBlueX,  RINK.y + RINK.height - 8)
  g.lineBetween(rightBlueX, RINK.y + 8, rightBlueX, RINK.y + RINK.height - 8)

  // ── Puntos reglamentarios ─────────────────────────────────────────────────
  drawFieldDots(g, leftGoalX, rightGoalX, cy, sx)

  // ── Borde perimetral (encima de todo) ────────────────────────────────────
  g.lineStyle(7, 0x0a1525, 1)
  g.strokeRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)
}

/**
 * Portería con perspectiva 3/4.
 * La boca (apertura) está en el plano del campo; la parte trasera aparece
 * desplazada unos píxeles hacia arriba en pantalla (truco de profundidad).
 */
function drawGoal3D(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  const halfH  = (GOAL_HEIGHT - 36) / 2  // 57 px
  const depth  = 28                        // profundidad visual en px
  const yOff   = 9                         // píxeles hacia arriba para la parte trasera
  const postR  = 4                         // radio de los puntos de poste

  // Coordenadas de los 4 vértices de la portería
  const frontX = goalLineX
  const backX  = leftSide ? goalLineX - depth : goalLineX + depth

  const fTop = { x: frontX, y: centerY - halfH }
  const fBot = { x: frontX, y: centerY + halfH }
  const bTop = { x: backX,  y: centerY - halfH - yOff }
  const bBot = { x: backX,  y: centerY + halfH - yOff }

  // Interior de la red: trapezoide translúcido
  g.fillStyle(0xffffff, 0.06)
  g.beginPath()
  g.moveTo(fTop.x, fTop.y)
  g.lineTo(bTop.x, bTop.y)
  g.lineTo(bBot.x, bBot.y)
  g.lineTo(fBot.x, fBot.y)
  g.closePath()
  g.fillPath()

  // Red: cuadrícula con perspectiva
  g.lineStyle(0.8, 0x888888, 0.45)
  const cols = 4
  for (let i = 1; i < cols; i++) {
    const t = i / cols
    const gx = fTop.x + (bTop.x - fTop.x) * t
    const ty = fTop.y + (bTop.y - fTop.y) * t
    const by = fBot.y + (bBot.y - fBot.y) * t
    g.lineBetween(gx, ty, gx, by)
  }
  const rows = 4
  for (let i = 1; i < rows; i++) {
    const t = i / rows
    g.lineBetween(
      fTop.x + (fBot.x - fTop.x) * t, fTop.y + (fBot.y - fTop.y) * t,
      bTop.x + (bBot.x - bTop.x) * t, bTop.y + (bBot.y - bTop.y) * t,
    )
  }

  // Techo de la portería: cara superior con relleno tintado (da sensación de volumen)
  g.fillStyle(0xcc2020, 0.28)
  g.beginPath()
  g.moveTo(fTop.x, fTop.y)
  g.lineTo(bTop.x, bTop.y)
  g.lineTo(bTop.x, bTop.y + 5)
  g.lineTo(fTop.x, fTop.y + 5)
  g.closePath()
  g.fillPath()

  // Estructura metálica: poste trasero + barras de techo/suelo
  g.lineStyle(4, 0xcc2020, 0.85)
  g.lineBetween(bTop.x, bTop.y, bBot.x, bBot.y)   // poste trasero
  g.lineBetween(fTop.x, fTop.y, bTop.x, bTop.y)   // barra superior
  g.lineBetween(fBot.x, fBot.y, bBot.x, bBot.y)   // barra inferior

  // Postes delanteros (boca de la portería): más gruesos y vivos
  g.lineStyle(6, 0xcc2020, 1)
  g.lineBetween(fTop.x, fTop.y, fBot.x, fBot.y)

  // Puntos de esquina (remaches visuales)
  g.fillStyle(0xcc2020, 1)
  g.fillCircle(fTop.x, fTop.y, postR)
  g.fillCircle(fBot.x, fBot.y, postR)
  g.fillStyle(0xcc2020, 0.7)
  g.fillCircle(bTop.x, bTop.y, postR - 1)
  g.fillCircle(bBot.x, bBot.y, postR - 1)
}

function drawPenaltyArea(
  g: Phaser.GameObjects.Graphics,
  goalLineX: number,
  cy: number,
  leftSide: boolean,
  sx: number,
  sy: number,
) {
  g.lineStyle(3, 0xcc2020, 0.80)
  const halfH = 4.5 * sy
  const depth = 5.40 * sx
  const top   = cy - halfH

  if (leftSide) {
    g.strokeRect(goalLineX, top, depth, halfH * 2)
  } else {
    g.strokeRect(goalLineX - depth, top, depth, halfH * 2)
  }
}

function drawGoalCrease(g: Phaser.GameObjects.Graphics, goalLineX: number, cy: number, leftSide: boolean) {
  const r        = (GOAL_HEIGHT - 36) / 2
  const startDeg = leftSide ? 270 : 90
  const endDeg   = leftSide ? 90 : 270

  g.fillStyle(0xee2222, 0.07)
  g.beginPath()
  g.arc(goalLineX, cy, r, Phaser.Math.DegToRad(startDeg), Phaser.Math.DegToRad(endDeg), false)
  g.closePath()
  g.fillPath()

  g.lineStyle(2, 0xcc2020, 0.70)
  g.beginPath()
  g.arc(goalLineX, cy, r, Phaser.Math.DegToRad(startDeg), Phaser.Math.DegToRad(endDeg), false)
  g.strokePath()
}

function drawFieldDots(
  g: Phaser.GameObjects.Graphics,
  leftGoalX: number,
  rightGoalX: number,
  cy: number,
  sx: number,
) {
  const penaltyDepth = 5.40 * sx
  const freeHitDepth = 7.40 * sx

  g.fillStyle(0xcc2020, 0.85)
  g.fillCircle(leftGoalX  + penaltyDepth, cy, 5)
  g.fillCircle(rightGoalX - penaltyDepth, cy, 5)
  g.fillCircle(leftGoalX  + freeHitDepth, cy, 5)
  g.fillCircle(rightGoalX - freeHitDepth, cy, 5)
}
