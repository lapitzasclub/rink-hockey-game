/**
 * Hoja de contactos de los árbitros (WP-50): `?lab=officials&strip=referee`.
 * Filas: andar y correr (de frente, de lado y de espaldas, 8 fases del ciclo) y
 * una fila de gestos (silbato, falta, libre directo, penalti, tarjetas azul y
 * roja, gol). Dibuja con el mismo `drawReferee` que el partido.
 */
import { RINK } from '../../game/constants'
import { REFEREES } from '../../game/render/artSpec'
import { createReferee, drawReferee, type GestureDraw } from '../../game/render/officials'
import { worldToScreen } from '../../game/render/viewTransform'
import type { LabBuild, LabBuildCtx } from './labScenes'

const MID_X = RINK.x + RINK.width / 2
const MID_Y = RINK.y + RINK.height / 2
const TAU = Math.PI * 2
/** Separación entre figuras y entre filas (px de mundo). */
const COL_DX = 110
const ROW_DY = 78
/** Vistas de las filas de marcha: de frente, de lado (derecha) y de espaldas. */
const VIEWS = [0, Math.PI / 2, Math.PI]

type Gesture = Omit<GestureDraw, 'env'>
const R = REFEREES
const AIM_RIGHT = Math.PI / 2

/** Gestos de la última fila; el árbitro mira a cámara (yaw 0). */
const GESTURES: Gesture[] = [
  { kind: 'whistle', aim: 0, down: 0, cardColor: 0 },
  { kind: 'point', aim: AIM_RIGHT, down: 0.12, cardColor: 0 },
  { kind: 'point', aim: AIM_RIGHT, down: R.pointDown, cardColor: 0 },
  { kind: 'point', aim: -AIM_RIGHT, down: R.pointDown, cardColor: 0 },
  { kind: 'card', aim: 0, down: 0, cardColor: R.cardBlue },
  { kind: 'card', aim: 0, down: 0, cardColor: R.cardRed },
  { kind: 'point', aim: Math.PI * 0.75, down: R.pointDown, cardColor: 0 },
  { kind: 'point', aim: 0, down: R.pointDown, cardColor: 0 },
]

export function refereeStrip(ctx: LabBuildCtx): LabBuild {
  let n = 0
  const place = (col: number, row: number, run: boolean, yaw: number, phase: number, gesture: GestureDraw | null) => {
    const v = createReferee(ctx.scene, n++)
    drawReferee(v, {
      x: MID_X + (col - 3.5) * COL_DX, y: MID_Y + row * ROW_DY, yaw,
      speedMps: gesture ? 0 : run ? R.runMps : R.walkMps, phase, gesture,
    })
  }
  // Andar (filas -3..-1) y correr (0..2); la fila 3 son los gestos
  for (const run of [false, true]) {
    VIEWS.forEach((yaw, vi) => {
      const row = (run ? 0 : -3) + vi
      for (let k = 0; k < 8; k++) place(k, row, run, yaw, (k / 8) * TAU, null)
    })
  }
  GESTURES.forEach((g, k) => place(k, 3, false, 0, 0, { ...g, env: 1 }))
  const c = worldToScreen(MID_X, MID_Y)
  return { figures: [], frame: { sx: c.x, sy: c.y, zoom: 1 } }
}
