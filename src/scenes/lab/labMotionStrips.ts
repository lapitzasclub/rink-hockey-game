/**
 * Hojas de la animación secundaria (E-17): `?strip=arranque|frenada|curva|choque`.
 * Columnas = instantes de una historia simulada a 60 Hz con el pintado real (muelles,
 * retardo de brazos, choque); filas = vistas o variantes.
 */
import { RINK } from '../../game/constants'
import type { FigureSpec, LabScript } from './labFigures'

const MID_Y = RINK.y + RINK.height / 2
const MID_X = RINK.x + RINK.width / 2
/** Separación de columnas y filas de la hoja (px de mundo). */
const COL_DX = 120
const ROW_DY = 100
/** Centro de la hoja algo por debajo del medio: en la fila de arriba del lab se pintan mal piezas sueltas. */
const Y0 = MID_Y + 50

/** Vistas: perfil (mira a la derecha de pantalla), tres cuartos y de frente o espalda. */
const SIDE = 0
const THREE_Q = Math.PI / 4
const FRONT = Math.PI / 2
const BACK = -Math.PI / 2

type Row = { angle: number, script: Omit<LabScript, 'ms'> }

/** Hoja: una fila por variante y una columna por instante (ms desde que empieza el perfil). */
function motionStrip(rows: Row[], times: number[]): FigureSpec[] {
  const specs: FigureSpec[] = []
  rows.forEach((row, r) => {
    times.forEach((ms, k) => {
      specs.push({
        team: 'blue', role: 'defender', aimAhead: true, angle: row.angle,
        loco: { script: { ...row.script, ms } },
        x: MID_X + (k - (times.length - 1) / 2) * COL_DX, y: Y0 + (r - (rows.length - 1) / 2) * ROW_DY,
      })
    })
  })
  return specs
}

const START_MS = [0, 80, 160, 260, 380, 540, 760, 1100]
const STOP_MS = [0, 70, 150, 240, 340, 460, 640, 900]
const CURVE_MS = [0, 60, 130, 220, 330, 480, 700, 1000]
const BUMP_MS = [0, 30, 70, 120, 190, 280, 400, 600]

export const MOTION_STRIPS: Record<string, () => FigureSpec[]> = {
  /** Arranque desde parado: carga del tronco, zancadas marcadas y en V, asiento con rebote. */
  arranque: () => motionStrip([
    { angle: SIDE, script: { kind: 'start' } },
    { angle: THREE_Q, script: { kind: 'start' } },
    { angle: BACK, script: { kind: 'start', sprint: true } },
  ], START_MS),
  /** Frenada desde crucero: tronco atrás, cadera abajo y rebote al quedarse quieto. */
  frenada: () => motionStrip([
    { angle: SIDE, script: { kind: 'stop', tau: 220 } },
    { angle: THREE_Q, script: { kind: 'stop', tau: 220 } },
    { angle: SIDE, script: { kind: 'stop', tau: 120, sprint: true } },
  ], STOP_MS),
  /** Entrada en curva (ladeo hacia dentro con masa) y deriva (patines de canto). */
  curva: () => motionStrip([
    { angle: FRONT, script: { kind: 'curve', turn: 2.6 } },
    { angle: BACK, script: { kind: 'curve', turn: -2.6 } },
    { angle: THREE_Q, script: { kind: 'drift', turn: 2.6 } },
  ], CURVE_MS),
  /** Choque: de lado (hacia su derecha), de frente (hacia atrás) y por detrás, a 320 px/s. */
  choque: () => motionStrip([
    { angle: FRONT, script: { kind: 'bump', bumpAngle: Math.PI / 2, bumpMag: 320 } },
    { angle: SIDE, script: { kind: 'bump', bumpAngle: Math.PI, bumpMag: 320 } },
    { angle: SIDE, script: { kind: 'bump', bumpAngle: 0, bumpMag: 420 } },
  ], BUMP_MS),
}
