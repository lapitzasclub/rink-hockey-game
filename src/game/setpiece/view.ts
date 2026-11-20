import { GAME_HEIGHT, GAME_WIDTH } from '../constants'
import { PX_PER_M, SETPIECE_CAMERA } from '../render/artSpec'
import type { Projected } from '../render/viewTransform'

/**
 * Cámara de los lanzamientos en tercera persona (D-01): estenopeica, con la
 * misma forma que `render/viewTransform.ts` pero en metros y con su propia cámara.
 *
 * Mundo de la escena: x lateral (derecha mirando a la portería), y = distancia
 * desde la línea de gol hacia el campo (portería en y = 0), z altura. La cámara
 * (ojo y objetivo) se mueve libremente con `setCamera` —seguirá al lanzador
 * mientras patina—; sin balanceo. Con `a` la profundidad horizontal según el
 * rumbo de la cámara, `l` la lateral, `h = ojo.z − z` y θ el picado:
 *
 *   D = a·cos θ + h·sin θ,  V = a·sin θ − h·cos θ
 *   x = cx + f·l/D,  y = y0 − f·V/D,  s = f·a/D² / PX_PER_M
 *
 * `s` es la escala vertical (px de pantalla por px de mundo del partido), para
 * usar `figureScale` tal cual; la lateral es `s · D/a` (`lateralStretch`).
 */

/** Profundidad mínima: lo que queda casi pegado a la cámara no explota. */
const NEAR = 0.05

export class SetPieceView {
  /** Ojo de la cámara (m). */
  eyeX = 0
  eyeY = 0
  eyeZ: number = SETPIECE_CAMERA.height
  /** Rumbo horizontal (unitario, hacia donde mira) y picado. */
  private hx = 0
  private hy = -1
  private cos = 1
  private sin = 0
  private readonly f = SETPIECE_CAMERA.focal
  private readonly cx = GAME_WIDTH / 2
  private readonly y0 = GAME_HEIGHT * SETPIECE_CAMERA.aimY

  /** Coloca el ojo y el punto de mira (m); el objetivo cae en (cx, `aimY`) de pantalla. */
  setCamera(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): this {
    this.eyeX = ex
    this.eyeY = ey
    this.eyeZ = ez
    const dx = tx - ex
    const dy = ty - ey
    const dh = Math.hypot(dx, dy) || 1
    this.hx = dx / dh
    this.hy = dy / dh
    const theta = Math.atan2(ez - tz, dh)
    this.cos = Math.cos(theta)
    this.sin = Math.sin(theta)
    return this
  }

  /**
   * Cámara de seguimiento: `back` m detrás de (bx, by) en la recta que viene del
   * centro de la portería, a `height` m, mirando al centro de la boca.
   */
  follow(bx: number, by: number, back: number = SETPIECE_CAMERA.back, height: number = SETPIECE_CAMERA.height): this {
    const C = SETPIECE_CAMERA
    const dx = bx - C.targetX
    const dy = by - C.targetY
    const d = Math.hypot(dx, dy) || 1
    return this.setCamera(bx + (dx / d) * back, by + (dy / d) * back, height, C.targetX, C.targetY, C.targetZ)
  }

  /** Profundidad horizontal de un punto del suelo según el rumbo de la cámara. */
  private ahead(wx: number, wy: number): number {
    return Math.max(NEAR, (wx - this.eyeX) * this.hx + (wy - this.eyeY) * this.hy)
  }

  /** Proyecta un punto (m) a pantalla. Sin asignaciones si se pasa `out`. */
  project(wx: number, wy: number, wz = 0, out?: Projected): Projected {
    const rx = wx - this.eyeX
    const ry = wy - this.eyeY
    const a = rx * this.hx + ry * this.hy
    const l = rx * -this.hy + ry * this.hx
    const h = this.eyeZ - wz
    const inv = 1 / Math.max(NEAR, a * this.cos + h * this.sin)
    const o = out ?? { x: 0, y: 0, s: 0 }
    o.x = this.cx + this.f * l * inv
    o.y = this.y0 - this.f * (a * this.sin - h * this.cos) * inv
    o.s = (this.f * Math.max(NEAR, a) * inv * inv) / PX_PER_M
    return o
  }

  /**
   * Escorzo del suelo de una figura con los pies en (wx, wy): lo que avanza 1 hacia
   * la cámara baja en pantalla esta fracción de lo que mide 1 en vertical
   * (∂y/∂a ÷ ∂y/∂z = h/a). Es el `floorForeshorten` del rig (0,3 en el partido).
   */
  floorForeshorten(wx: number, wy: number): number {
    return this.eyeZ / this.ahead(wx, wy)
  }

  /** Ancho relativo al alto en el suelo de (wx, wy) (D/a): escala X extra del contenedor. */
  lateralStretch(wx: number, wy: number): number {
    const a = this.ahead(wx, wy)
    return (a * this.cos + this.eyeZ * this.sin) / a
  }

  /** Rumbo del rayo de cámara a (wx, wy) en el suelo (rad, convenio de `atan2(x, y)`). */
  rayAngle(wx: number, wy: number): number {
    return Math.atan2(wx - this.eyeX, wy - this.eyeY)
  }

  /** Profundidad de pintado: lo cercano encima. */
  depthAt(wx: number, wy: number): number {
    return 1000 - Math.hypot(wx - this.eyeX, wy - this.eyeY) * 10
  }
}
