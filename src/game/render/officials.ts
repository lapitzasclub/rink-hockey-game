/**
 * Figura y pose de los árbitros (WP-50, SPEC §9): rig `official` con zapatillas,
 * locomoción a pie (`footGait`) y gestos de brazo encima. Solo dibuja: el
 * movimiento y los eventos los lleva `systems/officials.ts`. El mismo
 * `drawReferee` sirve para el lab (`?lab=officials&strip=referee`).
 *
 * Los ángulos de mundo siguen la convención del rig: `atan2(dx, dy)`, 0 = hacia
 * cámara (+y) y π/2 = hacia la derecha de pantalla (+x).
 */
import * as Phaser from 'phaser'
import {
  PUPPET_LOCAL, REFEREES, RIG_TEX_SUPERSAMPLE, WORLD_PX_PER_M, bandDepth, figureScale,
} from './artSpec'
import { refereeKit } from './puppet/kit'
import { footGait } from './puppet/footGait'
import { createPose, type PuppetPose } from './puppet/pose'
import { RIG_UNIT, PuppetRig, SHADOW_FRAME_RADIUS, createContactShadow } from './puppet/rig'
import { J, rigDims } from './puppet/skeleton'
import { project, type Projected } from './viewTransform'

const R = REFEREES
const DIMS = rigDims('official')
/** Altura de los hombros y largo del brazo estirado (unidades de figura). */
const SHOULDER_Y = DIMS.ankleY + DIMS.shin + DIMS.thigh + DIMS.trunk
const ARM_LEN = (DIMS.upperArm + DIMS.foreArm) * 0.96

export interface RefereeView {
  rig: PuppetRig
  shadow: Phaser.GameObjects.Image
  card: Phaser.GameObjects.Rectangle
  pose: PuppetPose
}

/** Gesto en curso: `env` es la intensidad 0..1 (sube, se mantiene y baja). */
export interface GestureDraw {
  kind: 'whistle' | 'point' | 'card'
  env: number
  /** Ángulo de mundo hacia donde señala o mira. */
  aim: number
  /** Bajada del brazo al señalar (rad). */
  down: number
  /** Color de la tarjeta (solo `card`). */
  cardColor: number
}

export interface RefereeDraw {
  x: number
  y: number
  yaw: number
  /** Velocidad (m/s) y fase del ciclo de zancada (rad). */
  speedMps: number
  phase: number
  gesture: GestureDraw | null
}

/** Crea la figura del árbitro `index` (variedad de piel y pelo), su sombra y su tarjeta. */
export function createReferee(scene: Phaser.Scene, index: number): RefereeView {
  const rig = new PuppetRig(scene, 'official', refereeKit(index * 2 + 1, index * 3 + 2), 1)
  const card = scene.add.rectangle(0, 0, R.cardSize[0] * RIG_UNIT, R.cardSize[1] * RIG_UNIT, R.cardBlue).setVisible(false)
  rig.container.add(card)   // al final de la lista: el rig solo reordena sus piezas
  const shadow = createContactShadow(scene, 0, 0)
  return { rig, shadow, card, pose: createPose() }
}

const pt: Projected = { x: 0, y: 0, s: 0 }
const probe: Projected = { x: 0, y: 0, s: 0 }
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Pone la mano `i` en `target` mezclando con el peso `w` (la locomoción ya la dejó en su sitio). */
function reachHand(pose: PuppetPose, i: number, w: number, x: number, y: number, z: number) {
  const h = pose.hands[i]
  h.x += (x - h.x) * w
  h.y += (y - h.y) * w
  h.z += (z - h.z) * w
}

/** Brazo del gesto sobre la pose de andar. Devuelve el lado que gesticula (-1 si ninguno). */
function applyGesture(pose: PuppetPose, g: GestureDraw): number {
  const w = smooth(g.env)
  if (g.kind === 'point') {
    // Ángulo del objetivo respecto al cuerpo: > 0 a la derecha del jugador
    const theta = pose.yaw - g.aim
    const side = Math.sin(theta) >= 0 ? 1 : 0
    const cd = Math.cos(g.down)
    const sx = (side ? 1 : -1) * DIMS.shoulderHalf
    reachHand(pose, side, w, sx + ARM_LEN * cd * Math.sin(theta), SHOULDER_Y - ARM_LEN * Math.sin(g.down), ARM_LEN * cd * Math.cos(theta))
    const ep = pose.elbowPole[side]
    ep.x = 0; ep.y = -0.5; ep.z = -0.1
    return side
  }
  // Silbato y tarjeta: brazo derecho en alto
  const high = g.kind === 'card' ? 1.12 : 1.04
  reachHand(pose, 1, w, 0.14, high, 0.05)
  pose.elbowPole[1].x = 0.6
  return 1
}

/** Coloca y posa a un árbitro: contenedor, sombra, profundidad y gesto. */
export function drawReferee(v: RefereeView, d: RefereeDraw) {
  const run = Math.min(1, Math.max(0, (d.speedMps - R.walkMps * 1.2) / (R.runMps * 0.8 - R.walkMps * 1.2)))
  const amp = Math.min(1, d.speedMps / (R.walkMps * 0.6))
  const pose = v.pose
  footGait(pose, d.phase, amp, run)
  pose.yaw = d.yaw
  const side = d.gesture ? applyGesture(pose, d.gesture) : -1
  v.rig.apply(pose)

  project(d.x, d.y, 0, pt)
  const k = figureScale(pt.s)
  const depth = bandDepth('COURT', pt.y)
  v.rig.container.setPosition(pt.x, pt.y - PUPPET_LOCAL.feetY * k).setScale(k).setDepth(depth)

  // Tarjeta pegada a la mano que gesticula, por encima de la palma
  const g = d.gesture
  const showCard = !!g && g.kind === 'card' && g.env > 0.3
  v.card.setVisible(showCard)
  if (showCard) {
    const sk = v.rig.skeleton
    v.card.setFillStyle(g.cardColor).setPosition(sk.px[J.hand0 + side], sk.py[J.hand0 + side] - R.cardSize[1] * RIG_UNIT * 0.45)
  }

  // Sombra de contacto: la elipse sale de la perspectiva local del suelo
  project(d.x + 1, d.y, 0, probe)
  const gx = probe.x - pt.x
  project(d.x, d.y + 1, 0, probe)
  const gy = probe.y - pt.y
  const sh = (R.shadowRadiusM * WORLD_PX_PER_M.x) / (2 * SHADOW_FRAME_RADIUS * RIG_TEX_SUPERSAMPLE)
  v.shadow.setPosition(pt.x, pt.y).setScale(gx * sh * 2.6, gy * sh * 0.82).setDepth(depth - 0.006)
}
