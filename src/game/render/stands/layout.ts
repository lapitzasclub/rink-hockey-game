import { GAME_HEIGHT, GAME_WIDTH, RINK } from '../../constants'
import type { TeamColor } from '../../types'
import { BOARD_W, RINK_CORNER_R } from '../rink/geometry'
import { CAMERA, CROWD, FIGURE_EXAG, PX_PER_M, STANDS as S } from '../artSpec'
import { leanAt, projectLeaned, type Projected } from '../viewTransform'

/**
 * Geometría de las gradas (WP-68): un anillo de escalones alrededor de la valla
 * partido en 8 tramos (4 rectas y 4 curvas). Cada tramo sabe colocar un punto
 * por (u, o): u ∈ [0, 1] a lo largo del tramo y o = metros desde la cara
 * exterior de la valla. De aquí salen los asientos, pasillos y vomitorios que
 * pintan `structure.ts` y `fans.ts`.
 */

/**
 * Zona de pantalla que cubre el pabellón. Excede 1280×720 porque el canvas se
 * expande a la ventana (Scale.EXPAND) y la cámara ve más allá en pantallas anchas.
 */
export const ARENA_BOUNDS = { x: -340, y: -260, width: GAME_WIDTH + 680, height: GAME_HEIGHT + 520 }

export const M = PX_PER_M
const R = RINK_CORNER_R
const CX = RINK.x + RINK.width / 2
const CAM_Y = RINK.y + RINK.height + CAMERA.distance
/** Posición de la cámara sobre el suelo del mundo (para saber qué caras ve). */
export const CAMERA_FLOOR = { x: CX, y: CAM_Y } as const

/** Frente del escalón i del anillo (m desde la valla) y altura de su huella (m). */
export const tierO = (i: number) => S.firstM + i * S.tierDepthM
export const tierZ = (i: number) => S.baseM + i * S.tierRiseM

export type SectionId = 'far' | 'fr' | 'right' | 'nr' | 'near' | 'nl' | 'left' | 'fl'

export interface Section {
  id: SectionId
  /** Grada cercana: se ve de espaldas y se pinta por delante de la pista. */
  near: boolean
  corner: boolean
  /** Primer escalón del anillo que tiene este tramo (el fondo deja sitio a banquillos y mesa). */
  first: number
  aisles: readonly number[]
  vomitories: readonly number[]
  vomTiers: readonly [number, number]
  pena: TeamColor | null
  /** Recta: arranque en la valla, dirección y normal hacia fuera; curva: centro y ángulos. */
  ox: number; oy: number; dx: number; dy: number; nx: number; ny: number; len: number
  a0: number; a1: number
}

export type StandPt = { x: number, y: number, nx: number, ny: number }

function straight(id: SectionId, ox: number, oy: number, dx: number, dy: number, len: number, extra: Partial<Section>): Section {
  return {
    id, near: false, corner: false, first: 0, aisles: S.aislesLong, vomitories: [], vomTiers: [0, -1], pena: null,
    ox, oy, dx, dy, nx: dy, ny: -dx, len, a0: 0, a1: 0, ...extra,
  }
}

function corner(id: SectionId, cx: number, cy: number, a0: number, a1: number, near: boolean): Section {
  return {
    id, near, corner: true, first: 0, aisles: S.aislesCorner, vomitories: [], vomTiers: [0, -1], pena: null,
    ox: cx, oy: cy, dx: 0, dy: 0, nx: 0, ny: 0, len: 0, a0, a1,
  }
}

const W = RINK.width
const H = RINK.height
const PI = Math.PI

/** Los 8 tramos en orden horario de pantalla, empezando por el fondo (de izquierda a derecha). */
export const SECTIONS: readonly Section[] = [
  straight('far', RINK.x + R, RINK.y, 1, 0, W - 2 * R, { first: S.farCutTiers, vomitories: [0.2, 0.8], vomTiers: S.vomitoryFarTiers }),
  corner('fr', RINK.x + W - R, RINK.y + R, -PI / 2, 0, false),
  straight('right', RINK.x + W, RINK.y + R, 0, 1, H - 2 * R, { aisles: S.aislesEnd, vomitories: [0.5], vomTiers: S.vomitoryTiers, pena: CROWD.penaRight }),
  corner('nr', RINK.x + W - R, RINK.y + H - R, 0, PI / 2, true),
  straight('near', RINK.x + W - R, RINK.y + H, -1, 0, W - 2 * R, { near: true }),
  corner('nl', RINK.x + R, RINK.y + H - R, PI / 2, PI, true),
  straight('left', RINK.x, RINK.y + H - R, 0, -1, H - 2 * R, { aisles: S.aislesEnd, vomitories: [0.5], vomTiers: S.vomitoryTiers, pena: CROWD.penaLeft }),
  corner('fl', RINK.x + R, RINK.y + R, PI, PI * 1.5, false),
]

/** Punto del tramo en el suelo del mundo y su normal hacia fuera. Sin asignaciones si se pasa `out`. */
export function sectionAt(sec: Section, u: number, oM: number, out: StandPt = { x: 0, y: 0, nx: 0, ny: 0 }): StandPt {
  const off = BOARD_W + oM * M
  if (sec.corner) {
    const a = sec.a0 + (sec.a1 - sec.a0) * u
    const c = Math.cos(a)
    const s = Math.sin(a)
    out.x = sec.ox + c * (R + off)
    out.y = sec.oy + s * (R + off)
    out.nx = c
    out.ny = s
  } else {
    out.x = sec.ox + sec.dx * sec.len * u + sec.nx * off
    out.y = sec.oy + sec.dy * sec.len * u + sec.ny * off
    out.nx = sec.nx
    out.ny = sec.ny
  }
  return out
}

/** Largo del tramo (px de mundo) a `oM` metros de la valla. */
export function rowLength(sec: Section, oM: number) {
  return sec.corner ? Math.abs(sec.a1 - sec.a0) * (R + BOARD_W + oM * M) : sec.len
}

const tmp: StandPt = { x: 0, y: 0, nx: 0, ny: 0 }

/**
 * Proyecta (u, o, z) de un tramo a pantalla. `zM` en metros. Con la misma
 * inclinación de perspectiva que vallas y redes (`projectLeaned`, WP-70): lo
 * alto se abre hacia fuera según su x de mundo, así que las gradas de los
 * fondos acompañan a la red y las del centro apenas cambian.
 */
export function standPoint(sec: Section, u: number, oM: number, zM: number, out?: Projected): Projected {
  sectionAt(sec, u, oM, tmp)
  return projectLeaned(tmp.x, tmp.y, zM * M, out)
}

/**
 * Cómo ve la cámara a alguien sentado en (wx, wy) mirando a la pista:
 * `turn` −1..1 (hacia dónde gira la cara en pantalla) y `front` −1..1 (1 = de cara, −1 = de espaldas).
 */
export function viewOf(wx: number, wy: number, nx: number, ny: number) {
  let cx = CX - wx
  let cy = CAM_Y - wy
  const l = Math.hypot(cx, cy)
  cx /= l
  cy /= l
  const fx = -nx
  const fy = -ny
  return { turn: fx * cy - fy * cx, front: fx * cx + fy * cy }
}

/** Pasillos del tramo para una fila: centros en u y medio ancho en u (incluye el del final, u = 1). */
export function aislesFor(sec: Section, oM: number) {
  const L = rowLength(sec, oM)
  return { centers: [...sec.aisles, 1], half: (S.aisleM * M) / 2 / L, L }
}

/** ¿Está el escalón `tier` de este tramo dentro del vomitorio de centro `uv`? */
export function inVomitory(sec: Section, tier: number, u: number, L: number) {
  if (tier < sec.vomTiers[0] || tier > sec.vomTiers[1]) return -1
  for (let k = 0; k < sec.vomitories.length; k++) {
    if (Math.abs(u - sec.vomitories[k]) * L < (S.vomitoryM * M) / 2) return k
  }
  return -1
}

// ─── Asientos ────────────────────────────────────────────────────────────────

export interface Seat {
  sec: Section
  secIndex: number
  tier: number
  /** Bloque entre pasillos y banda de escalones (unidad animada del público). */
  block: number
  band: number
  /** Trozo del bloque a lo largo de la fila (`STANDS.chunkSeats` asientos). */
  chunk: number
  u: number
  /** Cadera del espectador en pantalla (zoom 1) y px por metro de figura (con FIGURE_EXAG). */
  x: number
  y: number
  k: number
  /** Inclinación de perspectiva del sitio (`leanAt`): la figura se cizalla sobre la cadera. */
  lean: number
  turn: number
  front: number
  light: number
  pena: TeamColor | null
}

/** Luz de una fila (más oscura hacia el fondo). */
export function tierLight(sec: Section, tier: number, front: number, back: number, near: number) {
  const t = Math.min(1, tier / (S.tiers - 1))
  const l = front + (back - front) * t
  return sec.near ? l * near : l
}

/**
 * Todos los asientos visibles (dentro de ARENA_BOUNDS) con su proyección.
 * Los bloques reparten los asientos entre pasillos con el mismo paso en cada
 * fila: en las rectas quedan columnas alineadas, en las curvas abren hacia atrás.
 */
export function layoutSeats(lightFront: number, lightBack: number, lightNear: number): Seat[] {
  const seats: Seat[] = []
  const B = ARENA_BOUNDS
  const pt: StandPt = { x: 0, y: 0, nx: 0, ny: 0 }
  const p: Projected = { x: 0, y: 0, s: 0 }
  const step = S.seatSpacingM * M
  SECTIONS.forEach((sec, secIndex) => {
    for (let tier = sec.first; tier < S.tiers; tier++) {
      const oM = tierO(tier) + S.seatAtM
      const { centers, half, L } = aislesFor(sec, oM)
      const band = Math.floor((tier - sec.first) / S.bandTiers)
      const light = tierLight(sec, tier, lightFront, lightBack, lightNear)
      for (let b = 0; b < centers.length - 1; b++) {
        const u0 = centers[b] + half
        const u1 = centers[b + 1] - half
        const span = (u1 - u0) * L
        const n = Math.floor(span / step)
        if (n <= 0) continue
        const pad = (span - (n - 1) * step) / 2
        for (let j = 0; j < n; j++) {
          const u = u0 + (pad + j * step) / L
          if (inVomitory(sec, tier, u, L) >= 0) continue
          sectionAt(sec, u, oM, pt)
          projectLeaned(pt.x, pt.y, (tierZ(tier) + S.seatPanM) * M, p)
          if (p.x < B.x - 24 || p.x > B.x + B.width + 24 || p.y < B.y - 8 || p.y > B.y + B.height + 48) continue
          const v = viewOf(pt.x, pt.y, pt.nx, pt.ny)
          seats.push({
            sec, secIndex, tier, block: b, band, chunk: Math.floor(j / S.chunkSeats), u,
            x: p.x, y: p.y, k: M * p.s * FIGURE_EXAG, lean: leanAt(pt.x),
            turn: v.turn, front: v.front, light,
            pena: sec.pena && tier < CROWD.penaTiers ? sec.pena : null,
          })
        }
      }
    }
  })
  return seats
}

/** RNG determinista: el pabellón sale igual en cada partido. */
export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
