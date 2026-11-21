/**
 * Hoja de contactos del portero (WP-33): `?strip=goalie`. Filas: posturas en cuatro
 * vistas, desplazamiento (de pie y de rodillas), las cuatro paradas y la reacción al gol.
 * Los porteros miran a la derecha (+x) o a cámara según la columna; la pose es determinista.
 */
import { RINK } from '../../game/constants'
import type { FigureSpec } from './labFigures'

const MID_Y = RINK.y + RINK.height / 2
const MID_X = RINK.x + RINK.width / 2
const COL_DX = 120
const ROW_DY = 100
/** Vistas: a cámara, 3/4, de lado y de espaldas. */
const VIEWS = [Math.PI / 2, Math.PI / 4, 0, -Math.PI / 2]
const TAU = Math.PI * 2

type Frame = Partial<FigureSpec>

/** Fila de figuras: `make(k)` completa cada fotograma; `n` columnas centradas. */
function row(r: number, n: number, make: (k: number) => Frame, rows = 6): FigureSpec[] {
  return Array.from({ length: n }, (_, k) => ({
    team: 'blue' as const, role: 'goalie' as const, aimAhead: true, angle: Math.PI / 2,
    x: MID_X + (k - (n - 1) / 2) * COL_DX, y: MID_Y + (r - (rows - 1) / 2) * ROW_DY, ...make(k),
  }))
}

/** Cuatro fotogramas de una parada con la bola a un lado (`side`), de frente. */
const save = (kind: 'split' | 'glove' | 'stick' | 'body', side: 1 | -1, kneel: boolean) => (k: number): Frame => ({
  action: 'save', actionT: 0.1 + k * 0.25, gk: { save: kind, side, kneel },
})

/** Vistas de la hoja de postura de cerca: de lado (a la derecha y a la izquierda) y 3/4 (a cámara y de espaldas). */
const SIDE_VIEWS = [0, Math.PI, Math.PI / 4, (-3 * Math.PI) / 4]

export const GOALIE_STRIPS: Record<string, () => FigureSpec[]> = {
  /** E-10: de pie (arriba) y de rodillas (abajo) en las vistas laterales, para `zoom` ≈ 2,4. */
  kneelside: () => [
    ...row(0, 4, k => ({ angle: SIDE_VIEWS[k], gk: { kneel: false } }), 2),
    ...row(1, 4, k => ({ angle: SIDE_VIEWS[k], gk: { kneel: true } }), 2),
  ],
  goalie: () => [
    ...row(0, 8, k => ({ angle: VIEWS[k % 4], gk: { kneel: k >= 4 } })),
    ...row(1, 8, k => ({
      angle: Math.PI / 2, phase: (k % 4) * TAU / 4, gk: { kneel: k >= 4 },
      loco: { speed: 0.6, moveAngle: Math.PI / 2 },
    })),
    ...row(2, 8, k => (k < 4 ? save('split', 1, false)(k) : save('glove', -1, false)(k - 4))),
    ...row(3, 8, k => (k < 4 ? save('stick', 1, false)(k) : save('body', 1, false)(k - 4))),
    ...row(4, 8, k => (k < 4 ? save('split', -1, true)(k) : save('body', 1, true)(k - 4))),
    ...row(5, 8, k => ({ angle: k < 4 ? Math.PI / 2 : -Math.PI / 2, action: 'celebrate', actionT: 0.1 + (k % 4) * 0.28 })),
  ],
  /**
   * E-19: gestos del portero en los parones (cuatro vistas por bloque). Filas: alegría (dos
   * instantes del salto), encaja (golpe de stick / de rodillas), cruce patinando y choque de
   * manos, saludo del final.
   */
  gkmoods: () => [
    ...row(0, 8, k => ({ angle: VIEWS[k % 4], mood: { kind: 'joy', style: 0, ms: k < 4 ? 1600 : 1820 } }), 4),
    ...row(1, 8, k => ({ angle: VIEWS[k % 4], mood: { kind: 'keeperDown', style: k < 4 ? 0 : 1, ms: 750 } }), 4),
    ...row(2, 8, k => ({
      angle: VIEWS[k % 4], phase: TAU * 0.3, loco: { speed: 0.6 },
      mood: k < 4 ? { kind: 'rest', style: 0, ms: 1500 } : { kind: 'cross', style: 0, ms: 1500, hit: 325 },
    }), 4),
    ...row(3, 8, k => ({ angle: VIEWS[k % 4], mood: { kind: 'greet', style: 0, ms: 1500, hit: 450 } }), 4),
  ],
}
