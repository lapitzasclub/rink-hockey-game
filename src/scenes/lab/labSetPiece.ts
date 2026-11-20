import * as Phaser from 'phaser'
import { DIRECT_FREE_HIT_SPOT_OFFSET, PENALTY_SPOT_OFFSET, RINK } from '../../game/constants'
import { ACTION_CLIP_MS, PX_PER_M, SETPIECE_CAMERA } from '../../game/render/artSpec'
import { SetPieceBallView, placeFigure, type FigureState } from '../../game/setpiece/figure'
import { SetPieceStage } from '../../game/setpiece/stage'
import { SetPieceView } from '../../game/setpiece/view'
import { setVisualHeadScale } from '../../game/systems/visuals'
import type { Ball } from '../../game/types'
import { createFigure, createHiddenBall } from './labFigures'
import type { LabParams } from './labParams'

/**
 * Prototipo L-00 (`?lab=setpiece`): la cámara baja de los lanzamientos (D-01) con
 * el decorado, la bola y las figuras compartidos con la escena del partido
 * (`setpiece/stage.ts`, `setpiece/figure.ts`). Se pinta una vez en `create`.
 */

const P = SETPIECE_CAMERA

export function buildSetPieceLab(scene: Phaser.Scene, params: LabParams) {
  scene.cameras.main.setBackgroundColor(P.colors.backdrop)
  setVisualHeadScale(1)
  // El lanzador puede patinar con la bola hacia la portería: `takerm` lo acerca
  const spot = params.takerm ?? (params.kind === 'direct' ? DIRECT_FREE_HIT_SPOT_OFFSET : PENALTY_SPOT_OFFSET) / PX_PER_M
  const view = new SetPieceView().follow(0, spot)
  const flight = params.ballx !== null || params.bally !== null || params.ballz !== null
  const ball = flight
    ? { x: params.ballx ?? 0, y: params.bally ?? spot / 2, z: params.ballz ?? 0 }
    : { x: 0, y: spot, z: 0 }

  new SetPieceStage(scene).draw(view)

  const hidden = createHiddenBall(scene)
  const mid = { x: RINK.x + RINK.width / 2, y: RINK.y + RINK.height / 2 }
  const shooter = createFigure(scene, 'sp-shooter', { team: 'blue', role: 'pivot', x: mid.x, y: mid.y }, hidden)
  const goalie = createFigure(scene, 'sp-goalie', { team: 'red', role: 'goalie', x: mid.x, y: mid.y }, hidden)
  // La bola queda del lado del stick: el lanzador se aparta al contrario
  const side = shooter.player.rig.stickSide === 1 ? 1 : -1
  const proxy: Ball = { x: 0, y: 0, visual: hidden.visual }
  const sFeet: FigureState = { x: -side * P.shooterSide, y: spot + P.shooterBack, fx: 0, fy: -1, vx: 0, vy: 0 }
  const gFeet: FigureState = { x: 0, y: P.goalieFront, fx: 0, fy: 1, vx: 0, vy: 0 }
  for (const f of [shooter, goalie]) {
    const ct = f.player.container
    ct.setData('ab', 0)
    ct.setData('sp', 0)
    ct.setData('pt', params.t)
    f.player.sprinting = false
  }
  if (flight) shooter.player.anim = { type: 'shot', at: params.t - 0.8 * ACTION_CLIP_MS.shot }
  placeFigure(view, shooter.player, proxy, sFeet, 0, spot, !flight, params.t, 1)
  placeFigure(view, goalie.player, proxy, gFeet, ball.x, ball.y, false, params.t, 1)
  new SetPieceBallView(scene).place(view, ball.x, ball.y, ball.z, 1)
}
