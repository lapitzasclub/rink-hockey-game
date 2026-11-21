/**
 * Esqueleto 3D del rig (WP-30, a partir del prototipo del WP-20): medidas por
 * tipo de figura, resolución de una `PuppetPose` a articulaciones con IK de
 * dos huesos y proyección ortográfica con escorzo del suelo. Sin asignaciones
 * por frame: todo escribe en buffers preasignados.
 */
import { RIG_FLOOR_FORESHORTEN, RIG_PROPORTIONS } from '../artSpec'
import type { FigureKind, PuppetPose } from './pose'
import {
  addScaled, copy3, dot3, len3, lerp3, offset3, set3, sub3, v3, type V3,
} from './vec'

/** Longitudes reales en fracción de altura (adulto de 7,5 cabezas). */
const REAL = { shin: 0.245, thigh: 0.245, trunk: 0.3, neck: 0.035, upperArm: 0.19, foreArm: 0.17 } as const
const REAL_CHAIN = REAL.shin + REAL.thigh + REAL.trunk + REAL.neck

/** Medidas de una figura en unidades de figura. */
export interface RigDims {
  kind: FigureKind
  /** Escala del cuerpo sin cabeza respecto a un adulto real (la cabeza es mayor: estilo A). */
  k: number
  headR: number
  ankleY: number
  shin: number; thigh: number; trunk: number; neck: number; upperArm: number; foreArm: number
  shoulderHalf: number
  hipHalf: number
}

const dimsCache = new Map<FigureKind, RigDims>()

/** Medidas para que la figura de pie mida exactamente 1. */
export function rigDims(kind: FigureKind): RigDims {
  const hit = dimsCache.get(kind)
  if (hit) return hit
  const P = RIG_PROPORTIONS
  const ankleY = kind === 'official' ? 0.045 : P.skate + 0.04
  const headH = 1 / P.heads
  const k = (1 - headH - ankleY) / REAL_CHAIN
  const d: RigDims = {
    kind, k, headR: headH / 2, ankleY,
    shin: REAL.shin * k, thigh: REAL.thigh * k, trunk: REAL.trunk * k, neck: REAL.neck * k,
    upperArm: REAL.upperArm * k, foreArm: REAL.foreArm * k,
    shoulderHalf: (kind === 'goalie' ? 0.15 : 0.12) * k,
    hipHalf: (kind === 'goalie' ? 0.09 : 0.075) * k,
  }
  dimsCache.set(kind, d)
  return d
}

/** Articulaciones y puntos derivados del esqueleto. */
export const J = {
  pelvis: 0, shoulderC: 1, neck: 2, neckTop: 3, headC: 4,
  sh0: 5, sh1: 6, el0: 7, el1: 8, hand0: 9, hand1: 10,
  hip0: 11, hip1: 12, knee0: 13, knee1: 14, ankle0: 15, ankle1: 16, foot0: 17, foot1: 18,
  torsoTop: 19, torsoBase: 20, shorts0: 21, shorts1: 22,
  stickTop: 23, stickMid: 24, stickHeel: 25, stickToe: 26,
  numBack: 27, numFront: 28, padTop0: 29, padTop1: 30, cap0: 31, cap1: 32,
} as const
export const JOINT_COUNT = 33

/** Largo de la pala, en unidades de figura. */
export const BLADE_LEN = 0.083

/** Vista: ejes de pantalla del marco del cuerpo para un yaw. */
export interface View { yaw: number; fx: number; fz: number; rx: number; rz: number }

export function setView(v: View, yaw: number): View {
  v.yaw = yaw
  v.fx = Math.sin(yaw)
  v.fz = Math.cos(yaw)
  v.rx = -v.fz
  v.rz = v.fx
  return v
}

/** Índice 0..7 de la vista discreta más cercana (0 = de frente, 2 = derecha, 4 = espalda). */
export function viewIndex(yaw: number): number {
  const i = Math.round(yaw / (Math.PI / 4)) % 8
  return i < 0 ? i + 8 : i
}

/**
 * Esqueleto resuelto y proyectado. `px/py` en unidades locales del contenedor
 * (unit px por unidad de figura, pies en `feetY`) y `pd` = profundidad hacia cámara.
 */
export class Skeleton {
  readonly dims: RigDims
  readonly j: V3[] = Array.from({ length: JOINT_COUNT }, () => v3())
  readonly px = new Float32Array(JOINT_COUNT)
  readonly py = new Float32Array(JOINT_COUNT)
  readonly pd = new Float32Array(JOINT_COUNT)
  readonly view: View = setView({ yaw: 0, fx: 0, fz: 0, rx: 0, rz: 0 }, 0)
  private readonly t0 = v3()
  private readonly t1 = v3()
  private readonly t2 = v3()
  private readonly t3 = v3()

  constructor(kind: FigureKind) {
    this.dims = rigDims(kind)
  }

  /** Resuelve la pose a articulaciones en el marco del cuerpo. */
  solve(p: PuppetPose) {
    const d = this.dims
    const j = this.j
    const { pitch, roll, twist } = p.trunk
    copy3(j[J.pelvis], p.pelvis)
    const axis = set3(this.t0, Math.sin(roll), Math.cos(roll) * Math.cos(pitch), Math.cos(roll) * Math.sin(pitch))
    addScaled(j[J.shoulderC], j[J.pelvis], axis, d.trunk)
    addScaled(j[J.torsoBase], j[J.pelvis], axis, d.trunk * 0.05)
    offset3(j[J.torsoTop], j[J.shoulderC], 0, 0.01, 0)
    const lx = Math.cos(twist)
    const lz = -Math.sin(twist)
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1
      offset3(j[J.sh0 + i], j[J.shoulderC], s * lx * d.shoulderHalf, 0, s * lz * d.shoulderHalf)
      offset3(j[J.cap0 + i], j[J.sh0 + i], 0, 0, 0.04)
      offset3(j[J.hip0 + i], j[J.pelvis], s * d.hipHalf, 0, 0)
    }
    offset3(j[J.neck], j[J.shoulderC], 0, d.neck, 0.02 * d.k)
    const hl = p.headLean
    offset3(j[J.neckTop], j[J.neck], hl.x * 0.5, 0.03, hl.z * 0.5)
    offset3(j[J.headC], j[J.neck], hl.x, d.headR * 0.92, d.headR * 0.4 * Math.max(0, Math.sin(pitch)) + hl.z)
    // Dorsal entre los omóplatos, como en las camisetas reales: más abajo se leía en la lumbar
    lerp3(this.t1, j[J.pelvis], j[J.shoulderC], 0.7)
    offset3(j[J.numBack], this.t1, 0, 0, -0.09 * d.k)
    lerp3(this.t1, j[J.pelvis], j[J.shoulderC], 0.75)
    offset3(j[J.numFront], this.t1, 0.05 * d.k, 0, 0.09 * d.k)

    for (let i = 0; i < 2; i++) {
      const f = p.feet[i]
      set3(j[J.foot0 + i], f.x, f.y, f.z)
      // De canto, el tobillo cae hacia el lado del patín (su derecha es (cos yaw, 0, −sin yaw))
      const lat = Math.sin(f.roll) * d.ankleY
      offset3(this.t3, j[J.foot0 + i], lat * Math.cos(f.yaw), Math.cos(f.roll) * d.ankleY, -lat * Math.sin(f.yaw))
      this.twoBone(j[J.hip0 + i], this.t3, d.thigh, d.shin, p.kneePole[i], j[J.knee0 + i], j[J.ankle0 + i], false)
      lerp3(j[J.shorts0 + i], j[J.hip0 + i], j[J.knee0 + i], 0.55)
      lerp3(j[J.padTop0 + i], j[J.knee0 + i], j[J.ankle0 + i], -0.12)
    }

    const st = p.stick
    copy3(j[J.stickTop], st.top)
    copy3(j[J.stickHeel], st.heel)
    lerp3(j[J.stickMid], st.top, st.heel, 0.5)
    offset3(j[J.stickToe], st.heel, Math.sin(st.bladeYaw) * BLADE_LEN, 0, Math.cos(st.bladeYaw) * BLADE_LEN)
    for (let i = 0; i < 2; i++) {
      const target = this.t2
      if (st.visible && st.topHand === i) copy3(target, st.top)
      else if (st.visible && st.lowerGrip !== null) lerp3(target, st.top, st.heel, st.lowerGrip)
      else copy3(target, p.hands[i])
      // La mano siempre llega al objetivo (agarre visible); el codo se resuelve con alcance limitado
      this.twoBone(j[J.sh0 + i], target, d.upperArm, d.foreArm, p.elbowPole[i], j[J.el0 + i], j[J.hand0 + i], true)
    }
  }

  /**
   * IK de dos huesos de `a` hacia `target`, doblando hacia `pole`. `pin`: el
   * extremo se queda en el objetivo aunque no se alcance (el segundo hueso se estira).
   */
  private twoBone(a: V3, target: V3, l1: number, l2: number, pole: V3, joint: V3, end: V3, pin: boolean) {
    const dir = sub3(this.t0, target, a)
    const dist = len3(dir) || 1e-6
    const dl = Math.min(dist, (l1 + l2) * 0.999)
    dir.x /= dist; dir.y /= dist; dir.z /= dist
    if (pin) copy3(end, target)
    else addScaled(end, a, dir, dl)
    const along = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl)
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
    const pd = dot3(pole, dir)
    const perp = this.t1
    set3(perp, pole.x - dir.x * pd, pole.y - dir.y * pd, pole.z - dir.z * pd)
    const pl = len3(perp) || 1
    joint.x = a.x + dir.x * along + (perp.x / pl) * h
    joint.y = a.y + dir.y * along + (perp.y / pl) * h
    joint.z = a.z + dir.z * along + (perp.z / pl) * h
  }

  /**
   * Proyecta todas las articulaciones a coordenadas locales del contenedor.
   * `floorF`: escorzo del suelo (≈ tangente del ángulo con que la cámara ve los pies);
   * el partido usa el de siempre y la escena de lanzamientos el de su cámara.
   */
  project(yaw: number, unit: number, feetY: number, floorF = RIG_FLOOR_FORESHORTEN) {
    const v = setView(this.view, yaw)
    const F = floorF
    for (let i = 0; i < JOINT_COUNT; i++) {
      const p = this.j[i]
      const X = p.x * v.rx + p.z * v.fx
      const Z = p.x * v.rz + p.z * v.fz
      this.px[i] = X * unit
      this.py[i] = feetY + (-p.y + Z * F) * unit
      this.pd[i] = Z
    }
  }
}

/**
 * Inversa de la proyección en el suelo: un desplazamiento local del contenedor
 * respecto a los pies (`lx`, `ly` en unidades locales) a un punto del marco
 * del cuerpo con y = 0. Sirve para clavar la pala o un patín en un punto de mundo.
 */
export function groundFromLocal(yaw: number, lx: number, ly: number, unit: number, out: V3, floorF = RIG_FLOOR_FORESHORTEN): V3 {
  const X = lx / unit
  const Z = ly / (unit * floorF)
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  // La rotación de vista es su propia inversa: [[rx, fx], [rz, fz]] con rx = -fz, rz = fx
  return set3(out, X * -fz + Z * fx, 0, X * fx + Z * fz)
}

/** Dirección unitaria en el suelo para un yaw del cuerpo (0 = adelante). */
export function yawDir(out: V3, yaw: number): V3 {
  return set3(out, Math.sin(yaw), 0, Math.cos(yaw))
}
