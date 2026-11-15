import * as Phaser from 'phaser'
import { BLUE_LINE_OFFSET, GAME_WIDTH, RINK } from '../constants'
import { getGoalLineX } from '../utils'
import { worldToScreen } from './viewTransform'
import { LINE_WHITE, RINK_CORNER_R, projFillCircle, projStrokeCircle, projStrokePath, projStrokePoly, roundedRectPts } from './rink/geometry'
import { drawPerspectiveBoards } from './rink/boards'
import { drawBenches } from './rink/benches'
import { drawAds } from './rink/ads'
import { drawFieldDots, drawGoalCrease, drawPenaltyArea } from './rink/markings'
import { drawGoal3D } from './rink/goal'

// API pública (los consumidores externos importan de aquí)
export { RINK_CORNER_R, BOARD_W, BOARD_FAR_H, roundedRectWorldPts } from './rink/geometry'
export { BENCH_SCREEN_RANGE } from './rink/benches'
export { createGoalNetFlash } from './rink/goal'

/**
 * Pista con perspectiva 3/4 real: todos los elementos se proyectan
 * explícitamente con worldToScreen (convergencia X + curva Y no-lineal).
 * Ya no se usa g.setScale como atajo — permite que el campo aparezca
 * trapezoidal con filas lejanas más comprimidas que las cercanas.
 */
export function drawRink(scene: Phaser.Scene) {
  const gBenches = scene.add.graphics().setDepth(-3)
  drawBenches(gBenches)

  const boardBack  = scene.add.graphics().setDepth(-2)
  const boardFront = scene.add.graphics().setDepth(20)
  drawPerspectiveBoards(boardBack, boardFront)

  const g  = scene.add.graphics().setDepth(0)
  const cx = GAME_WIDTH / 2
  const cy = RINK.y + RINK.height / 2   // 360 — centro mundo del campo

  const sx = RINK.width  / 40   // px/m horizontal
  const sy = RINK.height / 20   // px/m vertical (mundo)

  const leftGoalX  = getGoalLineX('left')
  const rightGoalX = getGoalLineX('right')
  const leftBlueX  = cx - BLUE_LINE_OFFSET
  const rightBlueX = cx + BLUE_LINE_OFFSET

  // El suelo pintado (azul, con reflejos) lo pone arena.ts por debajo de estas líneas
  drawAds(scene)

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
  g.fillStyle(0xffffff, 0.06)
  projFillCircle(g, cx, cy, 3 * sy)
  g.lineStyle(4, LINE_WHITE, 0.95)
  projStrokePath(g, [worldToScreen(cx, RINK.y + 8), worldToScreen(cx, RINK.y + RINK.height - 8)])
  projStrokeCircle(g, cx, cy, 3 * sy)

  const cc = worldToScreen(cx, cy)
  g.fillStyle(LINE_WHITE, 1)
  g.fillCircle(cc.x, cc.y, 6)

  // ── Líneas de anti-juego ──────────────────────────────────────────────────
  g.lineStyle(3, LINE_WHITE, 0.6)
  projStrokePath(g, [worldToScreen(leftBlueX,  RINK.y + 8), worldToScreen(leftBlueX,  RINK.y + RINK.height - 8)])
  projStrokePath(g, [worldToScreen(rightBlueX, RINK.y + 8), worldToScreen(rightBlueX, RINK.y + RINK.height - 8)])

  // ── Puntos reglamentarios ─────────────────────────────────────────────────
  drawFieldDots(g, leftGoalX, rightGoalX, cy, sx)

  // ── Borde perimetral ──────────────────────────────────────────────────────
  g.lineStyle(3, LINE_WHITE, 0.85)
  projStrokePoly(g, roundedRectPts(RINK.x, RINK.y, RINK.width, RINK.height, RINK_CORNER_R, 10))
}
