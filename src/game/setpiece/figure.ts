import * as Phaser from 'phaser'
import { RINK } from '../constants'
import {
  BALL_VISUAL_DIAMETER_M, FIGURE_EXAG, PLAYER_HEIGHT_M, PUPPET_LOCAL, PX_PER_M, RIG_FLOOR_FORESHORTEN, RIG_TEX_SUPERSAMPLE,
  SETPIECE_CAMERA, figureScale,
} from '../render/artSpec'
import { RIG_UNIT, SHADOW_FRAME_RADIUS, createContactShadow } from '../render/puppet/rig'
import { project as projectMatch } from '../render/viewTransform'
import { updateVisuals } from '../systems/visuals'
import type { Ball, Player } from '../types'
import type { SetPieceView } from './view'

/**
 * Figuras del rig del partido pintadas con la cámara cercana (L-00 → L-02).
 * Cada figura es un `Player` espejo (mismo id, así que mismo aspecto) fijo en el
 * centro del mundo del partido: se posa con `updateVisuals` en el marco alineado
 * con el rayo de cámara y luego se recoloca y escala con la proyección cercana.
 * `blend` (0 = como en el partido, 1 = cercano) interpola el escorzo del suelo del
 * rig (0,3 → h/a), la exageración de figura y el estirado lateral (D-09).
 */

const P = SETPIECE_CAMERA
/** Metros por unidad de figura (la altura del rig es 1). */
const FIG_M = PLAYER_HEIGHT_M * P.figureExag
/** Punto del mundo del partido donde viven los espejos (s ≈ 1). */
export const MIRROR_AT = { x: RINK.x + RINK.width / 2, y: RINK.y + RINK.height / 2 }
const DUMMY = { id: '__none__' } as Player
const SHADOW_TEX = 2 * SHADOW_FRAME_RADIUS * RIG_TEX_SUPERSAMPLE

const sp = { x: 0, y: 0, s: 0 }
const pa = { x: 0, y: 0, s: 0 }
const pb = { x: 0, y: 0, s: 0 }
const fp = { x: 0, y: 0, s: 0 }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Deja en `out` el punto del mundo del partido cuya proyección, vista desde `MIRROR_AT`,
 * deshace `groundFromLocal` en (X, Z) unidades de figura (pantalla: derecha, hacia cámara).
 */
export function matchPointFor(X: number, Z: number, out: { x: number; y: number }) {
  const at = MIRROR_AT
  projectMatch(at.x, at.y, 0, sp)
  const k = figureScale(sp.s)
  const tx = sp.x + X * RIG_UNIT * k
  const ty = sp.y + Z * RIG_UNIT * RIG_FLOOR_FORESHORTEN * k
  let wx = at.x + (tx - sp.x)
  let wy = at.y + (ty - sp.y)
  for (let i = 0; i < 6; i++) {
    projectMatch(wx, wy, 0, pa)
    projectMatch(wx + 1, wy, 0, pb)
    const a = pb.x - pa.x, b = pb.y - pa.y
    projectMatch(wx, wy + 1, 0, pb)
    const c = pb.x - pa.x, d = pb.y - pa.y
    const ex = tx - pa.x, ey = ty - pa.y
    const det = a * d - b * c || 1
    wx += (ex * d - ey * c) / det
    wy += (ey * a - ex * b) / det
  }
  out.x = wx
  out.y = wy
}

/** Oculta lo que el espejo no lleva en la escena cercana (anillo, etiquetas, barra). */
export function hideMirrorExtras(player: Player) {
  for (const o of [player.selectionRing, player.selectionArrow, player.label, player.nameTag, player.staminaBar]) o?.setVisible(false)
  ;(player.staminaBar?.getData('bg') as Phaser.GameObjects.Rectangle | undefined)?.setVisible(false)
}

/** Datos de una figura en el marco de la escena (m y m/s; rumbo unitario). */
export interface FigureState {
  x: number; y: number
  fx: number; fy: number
  /** Velocidad en px de mundo/s según los ejes de la escena (la escala la usa la zancada). */
  vx: number; vy: number
}

/**
 * Posa y coloca `mirror` con la cámara `view`. `proxy` es la bola de contexto de la
 * pose (su `visual` debe ser una imagen oculta); (ballX, ballY) la bola real en m.
 */
export function placeFigure(
  view: SetPieceView, mirror: Player, proxy: Ball, st: FigureState, ballX: number, ballY: number,
  carrying: boolean, t: number, blend: number,
) {
  // Marco alineado con el rayo: R = derecha en pantalla, T = hacia la cámara
  let rx = st.x - view.eyeX, ry = st.y - view.eyeY
  const rl = Math.hypot(rx, ry) || 1
  rx /= rl; ry /= rl
  const Rx = -ry, Ry = rx, Tx = -rx, Ty = -ry
  mirror.facing.x = st.fx * Rx + st.fy * Ry
  mirror.facing.y = st.fx * Tx + st.fy * Ty
  mirror.velocity.x = st.vx * Rx + st.vy * Ry
  mirror.velocity.y = st.vx * Tx + st.vy * Ty
  mirror.pos.x = MIRROR_AT.x
  mirror.pos.y = MIRROR_AT.y
  const ox = ballX - st.x, oy = ballY - st.y
  matchPointFor((ox * Rx + oy * Ry) / FIG_M, (ox * Tx + oy * Ty) / FIG_M, proxy)

  mirror.rig.floorForeshorten = lerp(RIG_FLOOR_FORESHORTEN, view.floorForeshorten(st.x, st.y), blend)
  updateVisuals([mirror], DUMMY, proxy, carrying ? mirror.id : null, t)

  view.project(st.x, st.y, 0, fp)
  const exag = lerp(FIGURE_EXAG, P.figureExag, blend)
  const k = (figureScale(fp.s) * exag) / FIGURE_EXAG
  const depth = view.depthAt(st.x, st.y)
  mirror.container.setPosition(fp.x, fp.y - PUPPET_LOCAL.feetY * k)
    .setScale(k * lerp(1, view.lateralStretch(st.x, st.y), blend), k)
    .setDepth(depth)
    .setVisible(true)
  hideMirrorExtras(mirror)
  const w = (0.62 * fp.s * PX_PER_M * exag) / SHADOW_TEX
  mirror.shadow.setVisible(true).setPosition(fp.x, fp.y)
    .setScale(w, w * view.floorForeshorten(st.x, st.y)).setDepth(depth - 0.05)
}

/** ¿Cae (x, y) dentro del encuadre con margen? Las figuras fuera no se posan. */
export function inFrame(view: SetPieceView, x: number, y: number, w = 1280, hScreen = 720): boolean {
  if (view.depth(x, y, 0.9) < 0.3) return false
  view.project(x, y, 0, fp)
  const h = PLAYER_HEIGHT_M * fp.s * PX_PER_M * FIGURE_EXAG
  return fp.x > -h && fp.x < w + h && fp.y > -h * 0.2 && fp.y < hScreen + h * 1.2
}

/** Bola de la escena cercana con su sombra (más pequeña y tenue cuanto más alta). */
export class SetPieceBallView {
  readonly image: Phaser.GameObjects.Image
  readonly shadow: Phaser.GameObjects.Image

  constructor(scene: Phaser.Scene) {
    this.shadow = createContactShadow(scene, 0, 0)
    this.image = scene.add.image(0, 0, 'puck-pixel')
  }

  /** `blend` lleva el diámetro del visual del partido (exagerado) al real. */
  place(view: SetPieceView, x: number, y: number, z: number, blend: number) {
    const diamM = Math.exp(lerp(Math.log(BALL_VISUAL_DIAMETER_M * FIGURE_EXAG), Math.log(P.ballDiameterM), blend))
    const r = diamM / 2
    const zc = Math.max(r, z)
    view.project(x, y, 0, fp)
    const fade = Math.max(0.15, 1 - zc / 1.5)
    const sw = (diamM * 1.3 * fp.s * PX_PER_M) / SHADOW_TEX
    const depth = view.depthAt(x, y)
    this.shadow.setPosition(fp.x, fp.y).setScale(sw * (0.7 + 0.3 * fade), sw * view.floorForeshorten(x, y))
      .setAlpha(0.9 * fade).setDepth(depth - 0.04).setVisible(view.depth(x, y, 0) > 0.2)
    view.project(x, y, zc, fp)
    const diam = diamM * fp.s * PX_PER_M * view.lateralStretch(x, y)
    this.image.setPosition(fp.x, fp.y).setDisplaySize(diam, diam).setDepth(depth + 0.01).setVisible(view.depth(x, y, zc) > 0.2)
  }

  setVisible(on: boolean) {
    this.image.setVisible(on)
    this.shadow.setVisible(on)
  }
}
