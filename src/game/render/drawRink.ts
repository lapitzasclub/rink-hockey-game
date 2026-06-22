import * as Phaser from 'phaser'
import { BLUE_LINE_OFFSET, GAME_HEIGHT, GAME_WIDTH, GOAL_HEIGHT, RINK } from '../constants'
import { getGoalLineX } from '../utils'

/**
 * Escala real: pista oficial 40 m × 20 m
 * Horizontal: RINK.width / 40 = 28,5 px/m
 * Vertical:   RINK.height / 20 = 30 px/m
 *
 * Coordenadas de referencia (especificación geométrica oficial):
 *  - Línea de gol:    3 m desde tabla de fondo → GOAL_LINE_OFFSET = 86 px
 *  - Área de penalti: 9 m × 5,40 m (y: ±4,50 m → ±135 px; x: desde línea de gol +154 px)
 *  - Semicírculo D:   radio 0,85 m (= 26 px), centrado en la línea de gol
 *  - Punto penalti:   5,40 m desde línea de gol (154 px)
 *  - Punto libre dir: 7,40 m desde línea de gol (211 px)
 *  - Círculo central: radio 3 m = 90 px
 *  - Esquinas:        radio 3 m = 86 px
 */
export function drawRink(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  const cx = GAME_WIDTH / 2
  const cy = GAME_HEIGHT / 2
  const sx = RINK.width / 40   // 28.5 px/m (eje X, largo)
  const sy = RINK.height / 20  // 30    px/m (eje Y, ancho)

  const leftGoalX  = getGoalLineX('left')
  const rightGoalX = getGoalLineX('right')
  const leftBlueX  = cx - BLUE_LINE_OFFSET
  const rightBlueX = cx + BLUE_LINE_OFFSET

  // ── Superficie de hielo ──────────────────────────────────────────────────
  g.fillStyle(0xe4f2fb, 1)
  g.fillRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)

  // Rayaduras horizontales de hielo
  g.lineStyle(1, 0x9ec8de, 0.09)
  for (let iy = RINK.y + 22; iy < RINK.y + RINK.height; iy += 26) {
    g.lineBetween(RINK.x + 40, iy, RINK.x + RINK.width - 40, iy)
  }

  // ── Borde perimetral ─────────────────────────────────────────────────────
  g.lineStyle(7, 0x0a1525, 1)
  g.strokeRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)

  // ── Áreas de penalti (rectangulares, desde línea de gol hacia el centro) ─
  drawPenaltyArea(g, leftGoalX, cy, true, sx, sy)
  drawPenaltyArea(g, rightGoalX, cy, false, sx, sy)

  // ── Semicírculo D del portero ─────────────────────────────────────────────
  drawGoalCrease(g, leftGoalX, cy, true)
  drawGoalCrease(g, rightGoalX, cy, false)

  // ── Red y marco de portería ───────────────────────────────────────────────
  drawGoalNet(g, leftGoalX, cy, true)
  drawGoalNet(g, rightGoalX, cy, false)
  drawGoalFrame(g, leftGoalX, cy, true)
  drawGoalFrame(g, rightGoalX, cy, false)

  // ── Línea central y círculo (radio 3 m = 90 px) ──────────────────────────
  g.lineStyle(4, 0x0a1525, 1)
  g.strokeLineShape(new Phaser.Geom.Line(cx, RINK.y + 8, cx, RINK.y + RINK.height - 8))
  g.strokeCircle(cx, cy, 3 * sy)   // 90 px (3 m)
  g.fillStyle(0x0a1525, 1)
  g.fillCircle(cx, cy, 7)

  // ── Líneas azules de zona (ayuda visual de juego, no reglamentarias) ──────
  g.lineStyle(4, 0x2060cc, 1)
  g.strokeLineShape(new Phaser.Geom.Line(leftBlueX,  RINK.y + 8, leftBlueX,  RINK.y + RINK.height - 8))
  g.strokeLineShape(new Phaser.Geom.Line(rightBlueX, RINK.y + 8, rightBlueX, RINK.y + RINK.height - 8))

  // ── Puntos reglamentarios ─────────────────────────────────────────────────
  drawFieldDots(g, leftGoalX, rightGoalX, cy, sx)
}

/**
 * Área de penalti: 9 m × 5,40 m desde la línea de gol.
 * El lado posterior del área es la propia línea de gol (NO se extiende a la pared).
 */
function drawPenaltyArea(
  g: Phaser.GameObjects.Graphics,
  goalLineX: number,
  cy: number,
  leftSide: boolean,
  sx: number,
  sy: number,
) {
  g.lineStyle(3, 0xcc2020, 0.80)
  const halfH  = 4.5 * sy   // 135 px (9 m / 2 × 30)
  const depth  = 5.40 * sx  // 154 px (5,40 m × 28,5)
  const top    = cy - halfH
  const height = halfH * 2

  if (leftSide) {
    g.strokeRect(goalLineX, top, depth, height)
  } else {
    g.strokeRect(goalLineX - depth, top, depth, height)
  }
}

/**
 * Semicírculo D del portero.
 * Radio = 0,85 m (mitad de la apertura de la portería, 1,70 m).
 * Centro en la línea de gol; la curva se abre hacia el campo.
 *
 * Para el juego se usa GOAL_HEIGHT como radio de detección de invasión
 * (mucho mayor, pero sin cambiar esta representación visual fiel al reglamento).
 */
function drawGoalCrease(g: Phaser.GameObjects.Graphics, goalLineX: number, cy: number, leftSide: boolean) {
  // Radio = distancia del centro al poste = (GOAL_HEIGHT - 36) / 2
  // El marco de portería tiene altura GOAL_HEIGHT-36, así el D toca exactamente los postes.
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

function drawGoalFrame(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  g.lineStyle(5, 0xcc2020, 1)
  const top      = centerY - GOAL_HEIGHT / 2 + 18
  const goalWidth = 24
  const x = leftSide ? goalLineX - goalWidth : goalLineX
  g.strokeRoundedRect(x, top, goalWidth, GOAL_HEIGHT - 36, 8)
}

function drawGoalNet(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  const netH = GOAL_HEIGHT - 36
  const netW = 24
  const top  = centerY - netH / 2
  const x    = leftSide ? goalLineX - netW : goalLineX

  g.lineStyle(0.8, 0x888888, 0.55)
  for (let i = 6; i < netW; i += 6) {
    g.lineBetween(x + i, top, x + i, top + netH)
  }
  for (let i = 6; i < netH; i += 6) {
    g.lineBetween(x, top + i, x + netW, top + i)
  }
}

/**
 * Puntos reglamentarios:
 *  - Punto de penalti:    5,40 m desde la línea de gol (= frente del área)
 *  - Punto libre directo: 7,40 m desde la línea de gol
 */
function drawFieldDots(
  g: Phaser.GameObjects.Graphics,
  leftGoalX: number,
  rightGoalX: number,
  cy: number,
  sx: number,
) {
  const penaltyDepth  = 5.40 * sx   // 154 px
  const freeHitDepth  = 7.40 * sx   // 211 px

  g.fillStyle(0xcc2020, 0.85)
  g.fillCircle(leftGoalX  + penaltyDepth, cy, 5)
  g.fillCircle(rightGoalX - penaltyDepth, cy, 5)
  g.fillCircle(leftGoalX  + freeHitDepth, cy, 5)
  g.fillCircle(rightGoalX - freeHitDepth, cy, 5)
}
