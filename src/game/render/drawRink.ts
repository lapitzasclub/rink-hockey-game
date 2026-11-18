import * as Phaser from 'phaser'
import { GAME_WIDTH, RINK } from '../constants'
import { getGoalLineX } from '../utils'
import { worldToScreen } from './viewTransform'
import { DEPTH, MARKINGS, WORLD_PX_PER_M } from './artSpec'
import { RINK_CORNER_R, projStrokeCircle, projStrokePath, projStrokePoly, roundedRectPts } from './rink/geometry'
import { drawPerspectiveBoards } from './rink/boards'
import { drawBenches } from './rink/benches'
import { drawOfficialsTable } from './rink/table'
import { drawAds } from './rink/ads'
import { drawFieldDots, drawGoalCrease, drawPenaltyArea } from './rink/markings'
import { drawGoal3D } from './rink/goal'
import { createLighting } from './lighting'
import { bakeGraphicsSince } from './bake'

// API pública (los consumidores externos importan de aquí)
export { RINK_CORNER_R, BOARD_W, BOARD_FAR_H, roundedRectWorldPts } from './rink/geometry'
export { BENCH_SCREEN_RANGE } from './rink/benches'
export { createGoalNetFlash } from './rink/goal'

/**
 * Pista con perspectiva 3/4 real: todos los elementos se proyectan
 * explícitamente con worldToScreen (convergencia X + curva Y no-lineal).
 * Ya no se usa g.setScale como atajo — permite que el campo aparezca
 * trapezoidal con filas lejanas más comprimidas que las cercanas.
 *
 * Todo lo que se dibuja aquí es estático: al final se hornea en texturas
 * (bake.ts), nítidas hasta el zoom habitual de la cámara arcade.
 */
export function drawRink(scene: Phaser.Scene) {
  const firstObject = scene.sys.displayList.length
  const gBenches = scene.add.graphics().setDepth(DEPTH.OFFCOURT_FAR)
  drawBenches(gBenches)
  drawOfficialsTable(scene)

  const boardBack  = scene.add.graphics().setDepth(DEPTH.BOARD_FAR)
  const boardFront = scene.add.graphics().setDepth(DEPTH.BOARD_NEAR)
  drawPerspectiveBoards(boardBack, boardFront)

  const g  = scene.add.graphics().setDepth(DEPTH.COURT)
  const cx = GAME_WIDTH / 2
  const cy = RINK.y + RINK.height / 2   // 360 — centro mundo del campo

  const sx = WORLD_PX_PER_M.x
  const sy = WORLD_PX_PER_M.y

  const leftGoalX  = getGoalLineX('left')
  const rightGoalX = getGoalLineX('right')

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
  g.lineStyle(MARKINGS.lineWidth, MARKINGS.lineColor, MARKINGS.lineAlpha)
  projStrokePath(g, [worldToScreen(cx, RINK.y + 8), worldToScreen(cx, RINK.y + RINK.height - 8)])
  projStrokeCircle(g, cx, cy, 3 * sy)

  const cc = worldToScreen(cx, cy)
  g.fillStyle(MARKINGS.lineColor, 1)
  g.fillCircle(cc.x, cc.y, MARKINGS.dotRadius)

  // ── Puntos reglamentarios ─────────────────────────────────────────────────
  drawFieldDots(g, leftGoalX, rightGoalX, cy)

  // ── Borde perimetral ──────────────────────────────────────────────────────
  g.lineStyle(MARKINGS.lineWidth, MARKINGS.lineColor, MARKINGS.lineAlpha)
  projStrokePoly(g, roundedRectPts(RINK.x, RINK.y, RINK.width, RINK.height, RINK_CORNER_R, 10))

  // Pozos de luz cenitales y viñeteado del pabellón (WP-61)
  createLighting(scene)
  bakeGraphicsSince(scene, firstObject, 'rink')
}
