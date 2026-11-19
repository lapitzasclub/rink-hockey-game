/**
 * Pasos del patinaje quad (WP-31, SPEC §6). Cada función escribe el tren
 * inferior completo (pelvis, tronco, pies, polos de rodilla y manos libres) y
 * `locomotion` los mezcla por pesos. Sin estado propio: todo sale de `GaitIn`.
 */
import { RIG_FALL_KEYS, RIG_LOCO } from '../artSpec'
import type { FootPose, PuppetPose, Side } from './pose'
import { rigDims } from './skeleton'

const TAU = Math.PI * 2
const L = RIG_LOCO
const DIMS = rigDims('skater')

export interface GaitIn {
  /** Amplitud por velocidad, 0..1. */
  amp: number
  /** 0 = crucero (desliza) … 1 = empuje a tope (acelerando). */
  drive: number
  sprint: number
  phase: number
  /** Sentido del cruce: 1 = gira hacia la derecha del jugador. */
  dir: 1 | -1
  brakeT: boolean
  /** Pie que frena atravesado en la T. */
  dragSide: Side
  /** Progreso 0..1 de la caída y lado del golpe (±1). */
  fall: number
  fallDir: number
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
/** 0 en `a`, 1 en `b` (vale con a > b), suavizado. */
export const ramp = (a: number, b: number, v: number) => smooth01((v - a) / (b - a))
const frac = (v: number) => v - Math.floor(v)

/** Altura de cadera con la rodilla flexionada `flex` rad y el pie bajo la cadera. */
export function hipY(flex: number) {
  const t = DIMS.thigh
  const s = DIMS.shin
  return DIMS.ankleY + Math.sqrt(t * t + s * s + 2 * t * s * Math.cos(flex))
}

/** Fase 0..1 del pie `i`: los dos pies van en contrafase. */
const footU = (phase: number, i: number) => frac(phase / TAU + (i === 0 ? 0.5 : 0))

function setFoot(f: FootPose, x: number, y: number, z: number, yaw: number, pitch: number) {
  f.x = x; f.y = y; f.z = z; f.yaw = yaw; f.pitch = pitch
}

/** Postura común: cadera por flexión de rodilla, pies paralelos, rodillas adelante y manos libres a los lados. */
function base(out: PuppetPose, flex: number, pitch: number, half: number = L.feetHalf) {
  out.pelvis.x = 0
  out.pelvis.y = hipY(flex)
  out.pelvis.z = L.pelvisZ
  out.trunk.pitch = pitch
  out.trunk.roll = 0
  out.trunk.twist = 0
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    setFoot(out.feet[i], s * half, 0, 0, s * L.restYaw, 0)
    const kp = out.kneePole[i]
    kp.x = s * L.kneeOut; kp.y = 0; kp.z = 1
    const h = out.hands[i]
    h.x = s * L.hand.x; h.y = out.pelvis.y + L.hand.y; h.z = L.hand.z
  }
}

/**
 * Zancada adelante: cada pie empuja lateral-atrás con la punta abierta, aguanta
 * la pierna estirada, se recoge rozando el suelo y desliza bajo la cadera. El
 * peso va al patín que desliza; en sprint el brazo libre oscila al lado contrario del empuje.
 */
export function strideGait(out: PuppetPose, g: GaitIn) {
  const d = g.drive
  const sp = g.sprint
  base(out, lerp(lerp(L.knee.glide, L.knee.drive, d), L.knee.sprint, sp), lerp(lerp(L.pitch.glide, L.pitch.drive, d), L.pitch.sprint, sp))
  const amp = g.amp * lerp(L.cruiseAmp, 1, d) * lerp(1, L.sprintAmp, sp)
  const duty = lerp(L.cruiseDuty, 1, Math.max(d, sp))
  const P = L.push * duty
  const R = L.rec * duty
  let lean = 0
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    const u = footU(g.phase, i)
    let x = 0, y = 0, z = 0, yaw: number = L.restYaw, pitch = 0, ext = 0
    if (u < P) {
      const e = smooth01(u / (P * (1 - L.extHold)))
      ext = e
      x = L.out * e
      z = -L.back * e
      yaw = lerp(L.restYaw, L.pushYaw, e)
    } else if (u < P + R) {
      const t = (u - P) / R
      const e = smooth01(t)
      ext = 1 - e
      x = L.out * (1 - e)
      z = lerp(-L.back, L.fore, e)
      y = L.lift * Math.sin(Math.PI * t)
      yaw = lerp(L.pushYaw, L.restYaw, e)
      pitch = L.recPitch * Math.sin(Math.PI * t)
    } else {
      z = L.fore * (1 - (u - P - R) / (1 - P - R))
    }
    setFoot(out.feet[i], s * (L.feetHalf + amp * x), amp * y, amp * z, s * lerp(L.restYaw, yaw, Math.min(1, amp)), amp * pitch)
    lean -= s * ext
  }
  lean *= Math.min(1, amp)
  out.pelvis.x = lean * L.shift
  out.pelvis.y -= Math.abs(lean) * L.bob
  out.trunk.roll = lean * L.roll
  out.trunk.twist = lean * L.twist
  const swing = lean * L.hand.swing * sp
  out.hands[0].x += swing
  out.hands[1].x += swing
}

/**
 * Cruces en curva: el patín exterior pasa por delante del interior y cae
 * dentro; el interior empuja por debajo hacia fuera y vuelve. Cuerpo inclinado
 * hacia el centro del giro y patines apuntando a la curva.
 */
export function crossGait(out: PuppetPose, g: GaitIn) {
  const C = L.cross
  const ds = g.dir
  base(out, L.knee.drive, L.pitch.drive)
  const a = Math.min(1, g.amp)
  const c = (1 - Math.cos(g.phase)) / 2
  const sn = Math.sin(g.phase)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    const f = out.feet[i]
    if (s === -ds) {
      setFoot(f, s * L.feetHalf + ds * C.over * c * a, C.lift * Math.max(0, sn) * a, C.fore * c * a, ds * C.yaw, 0)
    } else {
      setFoot(f, s * L.feetHalf - ds * C.under * c * a, C.lift * Math.max(0, -sn) * a, -C.rear * c * a, ds * C.yaw, 0)
    }
  }
  out.pelvis.x = ds * C.shift * a
  out.trunk.roll = ds * C.lean * a
  out.trunk.twist = ds * C.twist * a
}

/**
 * Hacia atrás en "C": cada patín sale hacia fuera y adelante con la punta
 * cerrada, vuelve bajo la cadera y desliza mientras corta el otro. Cadera baja
 * y tronco más erguido (mirada adelante).
 */
export function backGait(out: PuppetPose, g: GaitIn) {
  const B = L.backC
  base(out, L.knee.back, L.pitch.back)
  const a = Math.min(1, g.amp)
  let lean = 0
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    const u = footU(g.phase, i)
    const f = out.feet[i]
    if (u < B.stroke) {
      const t = u / B.stroke
      const o = Math.sin(Math.PI * t)
      // El patín traza la «C»: sale con la punta cerrada y la rodilla adentro y vuelve bajo la cadera
      setFoot(f, s * (L.feetHalf + B.out * o * a), 0, B.z + B.fore * (1 - Math.cos(Math.PI * t)) * 0.5 * a, s * (L.restYaw - B.toeIn * o * a), 0)
      out.kneePole[i].x = s * (L.kneeOut - B.kneeIn * o * a)
      lean -= s * o
    } else {
      const t = (u - B.stroke) / (1 - B.stroke)
      setFoot(f, s * L.feetHalf, B.lift * Math.sin(Math.PI * t) * a, B.z + B.fore * (1 - smooth01(t)) * a, s * L.restYaw, 0)
    }
  }
  out.pelvis.x = lean * B.shift * a
  out.trunk.roll = lean * B.roll * a
}

/** Frenada: en cuña (puntas juntas, rodillas adentro) o en T (un patín atravesado detrás); torso atrás. */
export function brakeGait(out: PuppetPose, g: GaitIn) {
  const K = L.brakeK
  base(out, L.knee.brake, L.pitch.brake)
  out.pelvis.z = K.pelvisZ
  if (!g.brakeT) {
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1
      setFoot(out.feet[i], s * K.wedgeHalf, 0, K.wedgeZ, -s * K.toeIn, 0)
      out.kneePole[i].x = -s * K.kneeIn
    }
    return
  }
  const sd = g.dragSide === 1 ? 1 : -1
  setFoot(out.feet[g.dragSide === 1 ? 0 : 1], -sd * L.feetHalf * 0.5, 0, K.frontZ, -sd * L.restYaw, 0)
  setFoot(out.feet[g.dragSide], sd * L.feetHalf * 0.3, 0, K.tZ, sd * Math.PI / 2, 0)
  out.trunk.twist = sd * K.tTwist
  out.trunk.roll = -sd * K.tRoll
  out.pelvis.x = -sd * L.feetHalf * 0.3
}

/**
 * Derrape (frenada fuerte, E-11), en el marco ya girado del cuerpo (`skidTurn`): la marcha
 * va hacia el lado contrario al stick (−sd). Patines paralelos y atravesados a ella, los
 * pies por delante en la marcha y la cadera atrás, rodillas hondas, ladeo contra la marcha
 * y los hombros volviendo a medias hacia donde iba.
 */
export function skidGait(out: PuppetPose, g: GaitIn) {
  const K = L.skid
  const sd = g.dragSide === 1 ? 1 : -1
  base(out, K.knee, K.pitch)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    // El pie del lado de la marcha va un poco adelantado
    setFoot(out.feet[i], s * K.feetHalf - sd * K.feetOut, 0, s === -sd ? K.stagger : -K.stagger, s * L.restYaw * 0.5, 0)
    const kp = out.kneePole[i]
    kp.x = s * L.kneeOut - sd * K.pole; kp.y = 0; kp.z = 1
  }
  out.pelvis.x = sd * K.hip
  out.trunk.roll = sd * K.roll
  out.trunk.twist = -sd * K.twist
}

/** Espera (ready stance): pies a la anchura de hombros, respiración y leve cambio de peso. */
export function idleGait(out: PuppetPose, g: GaitIn) {
  const I = L.idleK
  const br = Math.sin(g.phase)
  const sw = Math.sin(g.phase * 0.5)
  // Al inspirar sube la cadera y se endereza el pecho: los hombros suben en toda vista
  base(out, L.knee.idle, L.pitch.idle - I.pitchBreath * br, L.feetIdle)
  out.pelvis.y += I.breath * br
  for (let i = 0; i < 2; i++) out.hands[i].y += I.breath * br
  out.pelvis.x = I.sway * sw
  out.trunk.roll = I.roll * sw
  for (let i = 0; i < 2; i++) out.feet[i].yaw = (i === 0 ? -1 : 1) * I.yaw
}

type FallKey = {
  t: number; py: number; pz: number; pitch: number; roll: number; fx: number; fz: number; fy: number; kneeY: number
  hx: number; hy: number; hz: number
}
const STANCE_KEY = (t: number): FallKey => ({
  t, py: hipY(L.knee.drive), pz: L.pelvisZ, pitch: L.pitch.drive, roll: 0, fx: L.feetHalf, fz: 0, fy: 0, kneeY: 0,
  hx: L.hand.x, hy: L.hand.y, hz: L.hand.z,
})
const FALL_KEYS: readonly FallKey[] = [STANCE_KEY(0), ...RIG_FALL_KEYS, STANCE_KEY(1)]

/** Caída por carga: golpe hacia atrás, sentado/tumbado y se levanta pasando por agachado. */
export function fallGait(out: PuppetPose, g: GaitIn) {
  let k = 1
  while (k < FALL_KEYS.length - 1 && FALL_KEYS[k].t < g.fall) k++
  const A = FALL_KEYS[k - 1]
  const B = FALL_KEYS[k]
  const e = smooth01((g.fall - A.t) / (B.t - A.t))
  base(out, L.knee.drive, lerp(A.pitch, B.pitch, e))
  out.pelvis.y = lerp(A.py, B.py, e)
  out.pelvis.z = lerp(A.pz, B.pz, e)
  out.trunk.roll = g.fallDir * lerp(A.roll, B.roll, e)
  const kneeY = lerp(A.kneeY, B.kneeY, e)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    // El pie del lado contrario al golpe es el que se levanta
    const up = s === -g.fallDir ? lerp(A.fy, B.fy, e) : 0
    setFoot(out.feet[i], s * lerp(A.fx, B.fx, e), up, lerp(A.fz, B.fz, e), s * L.restYaw, 0)
    out.kneePole[i].y = kneeY
    const h = out.hands[i]
    h.x = out.pelvis.x + s * lerp(A.hx, B.hx, e)
    h.y = Math.max(0.02, out.pelvis.y + lerp(A.hy, B.hy, e))
    h.z = out.pelvis.z + lerp(A.hz, B.hz, e)
  }
}
