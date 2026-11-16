/**
 * Hojas de contactos de las acciones con stick (WP-32): `?strip=dribble|shot|pass|…`.
 * Filas = vista y mano (zurdos del equipo rojo, que conduce la bola al otro lado).
 */
import { RINK } from '../../game/constants'
import type { ActionType } from '../../game/render/puppet/pose'
import type { FigureSpec } from './labFigures'

const MID_Y = RINK.y + RINK.height / 2
const MID_X = RINK.x + RINK.width / 2
const TAU = Math.PI * 2
/** Separación de columnas y filas de la hoja (px de mundo). */
const COL_DX = 120
const ROW_DY = 125

type StripRow = { angle: number, hand: 'L' | 'R' }
const SIDE_R: StripRow = { angle: 0, hand: 'R' }
const SIDE_L: StripRow = { angle: 0, hand: 'L' }
const FRONT_R: StripRow = { angle: Math.PI / 2, hand: 'R' }
const BACK_R: StripRow = { angle: -Math.PI / 2, hand: 'R' }

/**
 * Hoja de una acción: columnas = progreso del clip o, sin acción, fase de zancada.
 */
function actionStrip(action: ActionType | null, rows: StripRow[], frames: number, carrying = false): FigureSpec[] {
  const specs: FigureSpec[] = []
  rows.forEach((row, r) => {
    for (let k = 0; k < frames; k++) {
      specs.push({
        hand: row.hand, action: action ?? undefined, actionT: (k / (frames - 1)) * 0.95,
        team: row.hand === 'R' ? 'blue' : 'red', role: 'defender', angle: row.angle, carrying, aimAhead: !carrying,
        phase: action ? null : (k / frames) * TAU,
        x: MID_X + (k - (frames - 1) / 2) * COL_DX, y: MID_Y + (r - (rows.length - 1) / 2) * ROW_DY,
      })
    }
  })
  return specs
}

/** Entradas que `labScenes` añade a su tabla de hojas. */
export const ACTION_STRIPS: Record<string, () => FigureSpec[]> = {
  /** WP-32: conducción en marcha (columnas = fase de zancada): de espaldas, de lado (diestro y zurdo) y de frente. */
  dribble: () => actionStrip(null, [BACK_R, SIDE_R, SIDE_L, FRONT_R], 6, true),
  /** WP-32: columnas = progreso del clip (0 → 0,95). */
  shot: () => actionStrip('shot', [SIDE_R, SIDE_L, FRONT_R], 7),
  pass: () => actionStrip('pass', [SIDE_R, SIDE_L, FRONT_R], 7),
  steal: () => actionStrip('steal', [SIDE_R, SIDE_L, FRONT_R], 7),
  receive: () => actionStrip('receive', [SIDE_R, SIDE_L, FRONT_R], 7, true),
  check: () => actionStrip('check', [SIDE_R, SIDE_L, FRONT_R], 7),
  celebrate: () => actionStrip('celebrate', [SIDE_R, SIDE_L, FRONT_R], 7),
}
