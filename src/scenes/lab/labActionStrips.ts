/**
 * Hojas de contactos de las acciones con stick (WP-32): `?strip=dribble|shot|pass|…`.
 * Filas = vista y mano (zurdos del equipo rojo, que conduce la bola al otro lado).
 */
import { RINK } from '../../game/constants'
import type { ActionType } from '../../game/render/puppet/pose'
import type { Role } from '../../game/types'
import type { FigureSpec, LabMood } from './labFigures'

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

/** Separación de columnas y filas de las hojas de cerca (para `zoom` ≈ 2). */
const CLOSE_DX = 100
const CLOSE_DY = 90
/** Vistas de las hojas de cerca: a cámara, 3/4, de lado, 3/4 de espaldas, de espaldas y 3/4 al otro lado. */
const CLOSE_VIEWS = [Math.PI / 2, Math.PI / 4, 0, -Math.PI / 4, -Math.PI / 2, (3 * Math.PI) / 4]

/** Fila de `n` figuras centrada en la pista; `row` en filas desde el centro. */
function closeRow(row: number, n: number, make: (k: number) => Partial<FigureSpec>, role: Role = 'defender'): FigureSpec[] {
  return Array.from({ length: n }, (_, k) => ({
    team: 'blue' as const, role, aimAhead: true, angle: 0,
    x: MID_X + (k - (n - 1) / 2) * CLOSE_DX, y: MID_Y + row * CLOSE_DY, ...make(k),
  }))
}

/** Hojas de gestos (E-19): más holgadas, los brazos en alto y el stick en cruz ocupan sitio. */
const MOOD_DX = 140
const MOOD_DY = 125
/** A cámara, 3/4, de lado, 3/4 de espaldas y de espaldas. */
const MOOD_VIEWS = [Math.PI / 2, Math.PI / 4, 0, -Math.PI / 4, -Math.PI / 2]

/** Fila `row` (−1, 0, 1) de un gesto de parón en cinco vistas; `moving` patina a media velocidad. */
function moodRow(row: number, mood: LabMood, moving = false): FigureSpec[] {
  return MOOD_VIEWS.map((angle, k) => ({
    team: 'blue' as const, role: 'defender' as const, aimAhead: true, angle, mood,
    x: MID_X + (k - 2) * MOOD_DX, y: MID_Y + row * MOOD_DY,
    ...(moving ? { phase: TAU * 0.3, loco: { speed: 0.6 } } : {}),
  }))
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
  /** E-10: respiración en espera, un ciclo en 6 columnas (de lado, 3/4 y portero a cámara). */
  breath: () => [
    ...closeRow(-1, 6, k => ({ angle: 0, phase: (k / 6) * TAU, loco: { speed: 0 } })),
    ...closeRow(0, 6, k => ({ angle: Math.PI / 4, phase: (k / 6) * TAU, loco: { speed: 0 } })),
    ...closeRow(1, 6, k => ({ angle: Math.PI / 2, phase: (k / 6) * TAU, loco: { speed: 0 }, gk: { kneel: false } }), 'goalie'),
  ],
  /** E-10: patinaje hacia atrás en «C» (columnas = fase): 3/4 a cámara, 3/4 de espaldas y a cámara. */
  backc: () => [
    ...closeRow(-1, 6, k => ({ angle: Math.PI / 4, phase: (k / 6) * TAU, loco: { moveAngle: Math.PI } })),
    ...closeRow(0, 6, k => ({ angle: (-3 * Math.PI) / 4, phase: (k / 6) * TAU, loco: { moveAngle: Math.PI } })),
    ...closeRow(1, 6, k => ({ angle: Math.PI / 2, phase: (k / 6) * TAU, loco: { moveAngle: Math.PI } })),
  ],
  /** E-11: frenadas en cuña, en T y derrape desde sprint (columnas = vistas). */
  stops: () => [
    ...closeRow(-1, 6, k => ({ angle: CLOSE_VIEWS[k], phase: 0, loco: { accel: -1, brake: 'wedge' } })),
    ...closeRow(0, 6, k => ({ angle: CLOSE_VIEWS[k], phase: 0, loco: { accel: -1, brake: 'T' } })),
    ...closeRow(1, 6, k => ({ angle: CLOSE_VIEWS[k], phase: 0, loco: { accel: -2.6, sprint: true } })),
  ],
  /**
   * E-11: inclinaciones. Fila 1: de lado, aceleración 0 → 2 (arrancada). Fila 2: de espaldas,
   * giro suave sin cruces (−1,1 → 1,1 rad/s). Fila 3: a cámara, giro cerrado con cruces (−3 → 3).
   */
  lean: () => [
    ...closeRow(-1, 6, k => ({ angle: 0, phase: TAU * 0.3, loco: { speed: 0.55, accel: k * 0.4 } })),
    ...closeRow(0, 6, k => ({ angle: -Math.PI / 2, phase: TAU * 0.3, loco: { accel: 0, turn: -1.1 + k * 0.44 } })),
    ...closeRow(1, 6, k => ({ angle: Math.PI / 2, phase: TAU * 0.3, loco: { accel: 0.3, turn: [-3, -2, -1.4, 1.4, 2, 3][k] } })),
  ],
  /** E-19: autor del gol: avión en carrera, rodillazo y salto con el puño. */
  moods: () => [
    ...moodRow(-1, { kind: 'score', style: 0, ms: 900 }, true),
    ...moodRow(0, { kind: 'score', style: 1, ms: 1500, hit: 500 }),
    ...moodRow(1, { kind: 'score', style: 2, ms: 1500, hit: 400 }),
  ],
  /** E-19: señalar a la grada; piña con el brazo al hombro y con los sticks arriba. */
  moods2: () => [
    ...moodRow(-1, { kind: 'score', style: 3, ms: 1500, hit: 700 }),
    ...moodRow(0, { kind: 'mate', style: 0, ms: 1500, hit: 600 }),
    ...moodRow(1, { kind: 'mate', style: 1, ms: 1500, hit: 600 }),
  ],
  /** E-19: cabizbajos parados: manos en las rodillas, en la cadera y en el casco. */
  moods3: () => [
    ...moodRow(-1, { kind: 'down', style: 0, ms: 1500 }),
    ...moodRow(0, { kind: 'down', style: 1, ms: 1500 }),
    ...moodRow(1, { kind: 'down', style: 2, ms: 1500 }),
  ],
  /** E-19: cabizbajo arrastrando el stick, final ganador (salto en V) y choque de manos al cruzar. */
  moods4: () => [
    ...moodRow(-1, { kind: 'down', style: 0, ms: 1500 }, true),
    ...moodRow(0, { kind: 'joy', style: 0, ms: 1500, hit: 400 }),
    ...moodRow(1, { kind: 'cross', style: 0, ms: 1000, hit: 325 }, true),
  ],
  /** E-19: descanso, los tres estiramientos. */
  moods5: () => [
    ...moodRow(-1, { kind: 'rest', style: 0, ms: 1900 }),
    ...moodRow(0, { kind: 'rest', style: 1, ms: 1900 }),
    ...moodRow(1, { kind: 'rest', style: 2, ms: 1900 }),
  ],
  /** E-19: compañero llegando con el puño, avión al llegar (brazos en V) y saludo del empate. */
  moods6: () => [
    ...moodRow(-1, { kind: 'mate', style: 0, ms: 700 }, true),
    ...moodRow(0, { kind: 'score', style: 0, ms: 1500, hit: 600 }),
    ...moodRow(1, { kind: 'greet', style: 0, ms: 1500, hit: 450 }),
  ],
}
