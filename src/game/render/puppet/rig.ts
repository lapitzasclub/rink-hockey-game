/**
 * Rig 2D jerárquico de figuras (WP-30): un contenedor con una imagen por
 * pieza. `apply(pose)` resuelve el esqueleto con IK, proyecta las
 * articulaciones, coloca cada pieza (estirando los miembros entre sus
 * articulaciones) y reordena las piezas por profundidad según la vista.
 * Sirve para patinadores, porteros y figuras a pie o sentadas (`kind` + pose).
 *
 * El contenedor lo posiciona y escala el dueño con `figureScale(s)`; su
 * origen es el de `PUPPET_LOCAL` (pies en `feetY`).
 */
import * as Phaser from 'phaser'
import { PUPPET_LOCAL, RIG_GEAR, RIG_PROPORTIONS, RIG_STICK_MIN_PX, RIG_TEX_SUPERSAMPLE } from '../artSpec'
import { puppetAtlas, type FrameRef, type PuppetAtlas } from './atlas'
import type { RigKit } from './kit'
import type { FigureKind, PuppetPose, Side } from './pose'
import { BLADE_LEN, J, Skeleton, viewIndex } from './skeleton'
import {
  FIGURE_PX, VIEWS, WHITE, blobFrame, bladeFrame, blockerFrame, capsuleFrame, headFrame, mittFrame, numberFrame,
  padFrame, padLen, shadowFrame, skateFrame, torsoFrame, torsoLen,
} from './textures'

/** Unidades locales del contenedor por unidad de figura. */
export const RIG_UNIT = PUPPET_LOCAL.feetY - PUPPET_LOCAL.topY
/** Escala de imagen: unidades locales por px de textura. */
const TEX_SCALE = RIG_UNIT / (FIGURE_PX * RIG_TEX_SUPERSAMPLE)
/** Estiramiento mínimo de un miembro visto de punta (evita que la cápsula desaparezca). */
const MIN_STRETCH = 0.4
const L = RIG_PROPORTIONS.limb

type SlotKind = 'seg' | 'pt'
interface Slot {
  img: Phaser.GameObjects.Image
  kind: SlotKind
  a: number
  b: number
  /** Largo nominal en unidades locales (solo 'seg'). */
  nom: number
  bias: number
  /** Marcos por vista (8) o null si la pieza no depende de la vista. */
  views: FrameRef[] | null
  /** Qué yaw elige el marco: cuerpo, cabeza o pie 0/1. */
  viewOf: 'body' | 'head' | 'foot0' | 'foot1'
  d: number
  order: number
}

const viewNames = Array.from({ length: VIEWS }, (_, v) => v)

export class PuppetRig {
  readonly container: Phaser.GameObjects.Container
  readonly kind: FigureKind
  readonly kit: RigKit
  /** Lado del stick (1 = pala a la derecha); el portero lleva el blocker en esa mano. */
  readonly stickSide: Side
  readonly skeleton: Skeleton
  private readonly slots: Slot[] = []
  private readonly scene: Phaser.Scene
  private readonly atlas: PuppetAtlas
  private stickSlots: Slot[] = []
  private head!: Slot
  private torso!: Slot
  private number: Slot | null = null
  private numBack: FrameRef | null = null
  private numFront: FrameRef | null = null

  constructor(scene: Phaser.Scene, kind: FigureKind, kit: RigKit, stickSide: Side, x = 0, y = 0) {
    this.scene = scene
    this.kind = kind
    this.kit = kit
    this.stickSide = stickSide
    this.skeleton = new Skeleton(kind)
    this.atlas = puppetAtlas(scene)
    this.container = scene.add.container(x, y)
    this.build()
    this.atlas.flush()
    this.slots.forEach((s, i) => { s.order = i })
    this.container.add(this.slots.map(s => s.img))
  }

  private add(kind: SlotKind, frame: FrameRef | FrameRef[], a: number, b: number, nomUnits: number, bias: number, tint = WHITE, viewOf: Slot['viewOf'] = 'body'): Slot {
    const views = Array.isArray(frame) ? frame : null
    const first = views ? views[0] : frame as FrameRef
    const img = this.scene.add.image(0, 0, first.page, first.frame).setScale(TEX_SCALE)
    if (tint !== WHITE) img.setTint(tint)
    const slot: Slot = { img, kind, a, b, nom: nomUnits * RIG_UNIT, bias, views, viewOf, d: 0, order: 0 }
    this.slots.push(slot)
    return slot
  }

  private build() {
    const at = this.atlas
    const d = this.skeleton.dims
    const kit = this.kit
    const goalie = this.kind === 'goalie'
    const official = this.kind === 'official'
    const skates = viewNames.map(v => skateFrame(at, v, kit.footwear))
    const legC = official ? kit.shorts : kit.socks

    for (let i = 0; i < 2; i++) {
      this.add('pt', skates, J.foot0 + i, J.ankle0 + i, 0, 0.003, WHITE, i === 0 ? 'foot0' : 'foot1')
      if (goalie) {
        this.add('seg', viewNames.map(v => padFrame(at, d, v, kit)), J.padTop0 + i, J.ankle0 + i, padLen(d), 0.006)
        this.add('seg', capsuleFrame(at, 'g-thigh', d.thigh, 0.06, 0.052), J.hip0 + i, J.knee0 + i, d.thigh, 0.03, kit.shorts)
        continue
      }
      this.add('seg', capsuleFrame(at, 'shin', d.shin, 0.036 * L, 0.032 * L), J.knee0 + i, J.ankle0 + i, d.shin, 0, legC)
      this.add('seg', capsuleFrame(at, 'thigh', d.thigh, 0.046 * L, 0.04 * L), J.hip0 + i, J.knee0 + i, d.thigh, 0, legC)
      if (!official) this.add('pt', blobFrame(at, 'kneepad', 0.044 * L, 0.05 * L, RIG_GEAR.kneePad), J.knee0 + i, J.knee0 + i, 0, 0.004)
      this.add('seg', capsuleFrame(at, 'shorts', d.thigh * 0.55, 0.058 * L, 0.052 * L), J.hip0 + i, J.shorts0 + i, d.thigh * 0.55, 0.002, kit.shorts)
    }
    const pelvisR = goalie ? 0.075 : 0.058
    this.add('seg', capsuleFrame(at, `pelvis-${this.kind}`, d.hipHalf * 2, pelvisR, pelvisR), J.hip0, J.hip1, d.hipHalf * 2, goalie ? 0.031 : 0.001, kit.shorts)
    this.torso = this.add('seg', viewNames.map(v => torsoFrame(at, d, v, goalie ? kit : null)), J.torsoTop, J.torsoBase, torsoLen(d), goalie ? 0.05 : 0, goalie ? WHITE : kit.jersey)
    if (kit.number) {
      this.numBack = numberFrame(at, kit.number, 0.12, kit.numColor)
      this.numFront = numberFrame(at, kit.number, 0.055, kit.numColor)
      this.number = this.add('pt', this.numBack, J.numBack, J.numBack, 0, 0.2)
    }
    if (goalie) {
      for (let i = 0; i < 2; i++) this.add('pt', blobFrame(at, 'g-cap', 0.056, 0.056), J.cap0 + i, J.cap0 + i, 0, 0.06, kit.jersey)
    }
    this.add('seg', capsuleFrame(at, 'neck', 0.03, 0.028 * L, 0.028 * L), J.neck, J.neckTop, 0.03, -0.01, kit.skin)

    const upper = goalie ? [0.044, 0.04] : [0.036 * L, 0.031 * L]
    const fore = goalie ? [0.04, 0.036] : [0.031 * L, 0.027 * L]
    const upperF = capsuleFrame(at, `uarm-${this.kind}`, d.upperArm, upper[0], upper[1])
    const foreF = capsuleFrame(at, `farm-${this.kind}`, d.foreArm, fore[0], fore[1])
    const armC = official ? kit.skin : kit.jersey
    for (let i = 0; i < 2; i++) {
      this.add('seg', upperF, J.sh0 + i, J.el0 + i, d.upperArm, 0, kit.jersey)
      this.add('seg', foreF, J.el0 + i, J.hand0 + i, d.foreArm, 0.001, armC)
      if (!goalie) {
        this.add('pt', blobFrame(at, 'glove', 0.044 * L, 0.044 * L), J.hand0 + i, J.hand0 + i, 0, 0.003, official ? kit.skin : kit.gloves)
      } else if (i === this.stickSide) {
        this.add('pt', viewNames.map(v => blockerFrame(at, v, kit)), J.hand0 + i, J.hand0 + i, 0, 0.08)
      } else {
        this.add('pt', viewNames.map(v => mittFrame(at, v, kit, i === 0 ? 1 : -1)), J.hand0 + i, J.hand0 + i, 0, 0.08)
      }
    }

    if (!official) {
      const shaftR = Math.max(0.011, RIG_STICK_MIN_PX / 2 / FIGURE_PX)
      const shaft = capsuleFrame(at, 'shaft', 0.3, shaftR, shaftR, RIG_GEAR.shaft, true)
      // Pala curva, más larga que su articulación (BLADE_LEN) para leerse a 50 px
      const blade = bladeFrame(at, this.stickSide)
      this.stickSlots = [
        this.add('seg', shaft, J.stickTop, J.stickMid, 0.3, 0),
        this.add('seg', shaft, J.stickMid, J.stickHeel, 0.3, 0),
        this.add('seg', blade, J.stickHeel, J.stickToe, BLADE_LEN, 0.001),
      ]
    }
    this.head = this.add('pt', viewNames.map(v => headFrame(at, d, v, kit)), J.headC, J.headC, 0, 0.02, WHITE, 'head')
  }

  /** Coloca todas las piezas según la pose. No asigna memoria. */
  apply(pose: PuppetPose) {
    const sk = this.skeleton
    sk.solve(pose)
    sk.project(pose.yaw, RIG_UNIT, PUPPET_LOCAL.feetY)
    const { px, py, pd } = sk
    const bodyView = viewIndex(pose.yaw)
    const fz = sk.view.fz

    for (const s of this.slots) {
      if (s.views) {
        // Un giro +a en el marco del cuerpo resta a la vista de mundo
        const yaw = s.viewOf === 'body' ? pose.yaw
          : s.viewOf === 'head' ? pose.yaw - pose.headYaw
            : pose.yaw - pose.feet[s.viewOf === 'foot0' ? 0 : 1].yaw
        const f = s.views[s.viewOf === 'body' ? bodyView : viewIndex(yaw)]
        if (s.img.frame.name !== f.frame) s.img.setFrame(f.frame)
      }
      if (s.kind === 'seg') {
        const dx = px[s.b] - px[s.a]
        const dy = py[s.b] - py[s.a]
        const len = Math.sqrt(dx * dx + dy * dy)
        s.img.setPosition(px[s.a], py[s.a])
        s.img.rotation = Math.atan2(-dx, dy)
        s.img.setScale(TEX_SCALE, TEX_SCALE * Math.max(MIN_STRETCH, len / s.nom))
        s.d = (pd[s.a] + pd[s.b]) / 2 + s.bias
      } else {
        s.img.setPosition(px[s.a], py[s.a])
        s.d = pd[s.a] + s.bias
      }
    }

    for (let i = 0; i < 2; i++) {
      // El patín cabecea en pantalla según cuánto se le ve de lado
      const f = pose.feet[i]
      const slot = this.slots[this.slotOfFoot(i)]
      slot.img.rotation = f.pitch * Math.sin(pose.yaw - f.yaw)
    }

    const hs = pose.headScale
    const h = this.head
    h.img.setScale(TEX_SCALE * hs)
    // Con cabezón la cabeza sube para no tragarse el cuello
    h.img.y -= (hs - 1) * sk.dims.headR * RIG_UNIT * 0.9

    if (this.number) {
      const back = fz < -0.3
      const front = fz > 0.45
      const n = this.number
      n.img.setVisible(back || front)
      if (back || front) {
        const ref = back ? this.numBack! : this.numFront!
        if (n.img.frame.name !== ref.frame) n.img.setFrame(ref.frame)
        const j = back ? J.numBack : J.numFront
        n.img.setPosition(px[j], py[j])
        n.img.rotation = this.torso.img.rotation
        n.img.setScale(TEX_SCALE * Math.max(0.55, Math.abs(fz)), TEX_SCALE)
        n.d = pd[j] + n.bias
      }
    }
    for (const s of this.stickSlots) s.img.setVisible(pose.stick.visible)

    this.sortByDepth()
  }

  private footSlots: [number, number] = [-1, -1]
  private slotOfFoot(i: number): number {
    if (this.footSlots[i] < 0) {
      const want = i === 0 ? 'foot0' : 'foot1'
      this.footSlots[i] = this.slots.findIndex(s => s.viewOf === want)
    }
    return this.footSlots[i]
  }

  /** Ordenación por inserción (casi ordenado de un frame a otro) y volcado a la lista del contenedor. */
  private sortByDepth() {
    const a = this.sorted
    for (let i = 1; i < a.length; i++) {
      const s = a[i]
      let j = i - 1
      while (j >= 0 && (a[j].d > s.d || (a[j].d === s.d && a[j].order > s.order))) {
        a[j + 1] = a[j]
        j--
      }
      a[j + 1] = s
    }
    const list = this.container.list
    for (let i = 0; i < a.length; i++) list[i] = a[i].img
  }

  private get sorted(): Slot[] {
    if (!this.sortedCache) this.sortedCache = this.slots.slice()
    return this.sortedCache
  }
  private sortedCache: Slot[] | null = null

  setVisible(v: boolean) {
    this.container.setVisible(v)
  }
}

/** Sombra de contacto en el suelo (fuera del contenedor): el dueño la escala con los ejes del suelo. */
export function createContactShadow(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Image {
  const atlas = puppetAtlas(scene)
  const f = shadowFrame(atlas)
  atlas.flush()
  return scene.add.image(x, y, f.page, f.frame)
}

/** Radio (px de textura / supermuestreo) de la elipse de la sombra pintada. */
export const SHADOW_FRAME_RADIUS = 16
