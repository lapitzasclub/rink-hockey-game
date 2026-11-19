import { GOAL_LINE_OFFSET, RINK } from '../constants'
import { CAMERA, LEAN } from './artSpec'

/**
 * Cámara de perspectiva única (SPEC §2) para todo lo dibujado en el mundo.
 *
 * Mundo: (wx, wy) en el plano del suelo, en px de mundo; wz = altura en px
 * (PX_PER_M por metro). La cámara está centrada en X, detrás del borde
 * cercano (wy grande) y a `CAMERA.height` sobre el suelo. Para un punto:
 *
 *   d = camY − wy,  h = height − wz
 *   D = d·cos θ + h·sin θ          (profundidad sobre el eje óptico)
 *   V = d·sin θ − h·cos θ          (altura sobre el eje óptico)
 *   x = cx + f·(wx − cx)/D,  y = y0 − f·V/D,  s = f·d/D²
 *
 * `s` es la escala vertical local (∂y/∂wz): un segmento vertical de altura h
 * mide h·s en pantalla, así que una figura con `setScale(base · s)` casa con
 * él. La compresión de las filas lejanas sale sola de 1/D.
 */

export interface Projected { x: number; y: number; s: number }

const CX = RINK.x + RINK.width / 2
const THETA = (CAMERA.tiltDeg * Math.PI) / 180
const COS = Math.cos(THETA)
const SIN = Math.sin(THETA)
const F = CAMERA.focal
const H = CAMERA.height
const CAM_Y = RINK.y + RINK.height + CAMERA.distance
/** Descentrado vertical: deja el borde lejano de la pista en `CAMERA.farEdgeY`. */
const Y0 = (() => {
  const d = CAM_Y - RINK.y
  return CAMERA.farEdgeY + (F * (d * SIN - H * COS)) / (d * COS + H * SIN)
})()

/**
 * Proyecta un punto del mundo a pantalla. Sin asignaciones si se pasa `out`.
 * `s` es la escala de figura en ese punto (con wz = 0, la del suelo).
 */
export function project(wx: number, wy: number, wz = 0, out?: Projected): Projected {
  const d = CAM_Y - wy
  const h = H - wz
  const inv = 1 / (d * COS + h * SIN)
  const o = out ?? { x: 0, y: 0, s: 0 }
  o.x = CX + F * (wx - CX) * inv
  o.y = Y0 - F * (d * SIN - h * COS) * inv
  o.s = F * d * inv * inv
  return o
}

/** Inclinación por px de distancia a CX: vale `LEAN.atGoalLine` en la línea de gol. */
const LEAN_K = LEAN.atGoalLine / (RINK.width / 2 - GOAL_LINE_OFFSET)

/**
 * Factor de inclinación en `wx` (px de pantalla en x por px de altura en
 * pantalla, con signo: hacia fuera del centro). Solo depende de `wx`, así que
 * es continuo por todo el contorno, esquinas redondeadas incluidas.
 */
export function leanAt(wx: number): number {
  return LEAN_K * (wx - CX)
}

/**
 * `project` con la inclinación de perspectiva (WP-70) para estructuras con
 * altura: x += leanAt(wx) · (y del suelo − y). Con wz = 0 coincide con `project`,
 * así que pies, bases y sombras no se mueven. Sin asignaciones si se pasa `out`.
 */
export function projectLeaned(wx: number, wy: number, wz = 0, out?: Projected): Projected {
  const d = CAM_Y - wy
  const groundY = Y0 - (F * (d * SIN - H * COS)) / (d * COS + H * SIN)
  const o = project(wx, wy, wz, out)
  o.x += LEAN_K * (wx - CX) * (groundY - o.y)
  return o
}

/** Escala de figura a nivel del suelo en (wx, wy). s ≈ 1 en el centro de la pista. */
export function depthScale(_wx: number, wy: number): number {
  const d = CAM_Y - wy
  const inv = 1 / (d * COS + H * SIN)
  return F * d * inv * inv
}

/** Inversa sobre el plano del suelo (wz = 0). */
export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const r = (Y0 - sy) / F
  const d = (H * (COS + r * SIN)) / (SIN - r * COS)
  const D = d * COS + H * SIN
  return { x: CX + ((sx - CX) * D) / F, y: CAM_Y - d }
}

// ─── Compatibilidad (se retira al migrar los consumidores en WP-11) ──────────

/** @deprecated Usar `CAMERA.farEdgeY`. */
export const VIEW_ANCHOR_Y = CAMERA.farEdgeY
/** @deprecated Aproximación lineal media para sombras y anillos; usar `project(...).s`. */
export const VIEW_Y_SCALE = 0.72

/** @deprecated Usar `project(wx, wy, 0, out)`. Mantiene la firma antigua; ya no recorta a la pista. */
export function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  return project(wx, wy, 0)
}

/** @deprecated Igual que `worldToScreen`: la cámara única ya no aplana detrás de la valla lejana. */
export function worldToScreenExt(wx: number, wy: number): { x: number; y: number } {
  return project(wx, wy, 0)
}

/**
 * @deprecated Compresión local del eje Y del suelo (∂y/∂wy) para orientar
 * facing/dir en pantalla. Se sustituye proyectando los dos extremos.
 */
export function localYScale(wy: number): number {
  const d = CAM_Y - wy
  const inv = 1 / (d * COS + H * SIN)
  return F * H * inv * inv
}
