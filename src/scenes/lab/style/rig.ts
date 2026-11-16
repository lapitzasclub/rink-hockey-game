/**
 * Rig estático de los prototipos de estilo (WP-20). Esqueleto en unidades de
 * altura de figura (de pie = 1) en el marco del cuerpo: x = derecha del
 * jugador, y = arriba, z = hacia donde mira. Una vista (yaw) lo gira y lo
 * proyecta en ortográfica con un ligero escorzo del suelo.
 */

export interface V3 { x: number; y: number; z: number }
/** Punto en pantalla (px a escala 1, origen en los pies) y profundidad hacia cámara. */
export interface P2 { x: number; y: number; d: number }

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z })
export const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z)
export const mul = (a: V3, k: number): V3 => v3(a.x * k, a.y * k, a.z * k)
export const lerp3 = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t))
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const len = (a: V3) => Math.sqrt(dot(a, a))
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1))

/** Escorzo del suelo: lo que se acerca a cámara baja en pantalla. */
const FLOOR_FORESHORTEN = 0.3

export interface View { fx: number; fz: number; rx: number; rz: number }

/** yaw 0: mira a cámara; π/2: mira a la derecha de pantalla; π: de espaldas. */
export function makeView(yaw: number): View {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  return { fx, fz, rx: -fz, rz: fx }
}

export function toScreen(v: View, p: V3, unit: number): P2 {
  const X = p.x * v.rx + p.z * v.fx
  const Z = p.x * v.rz + p.z * v.fz
  return { x: X * unit, y: (-p.y + Z * FLOOR_FORESHORTEN) * unit, d: Z }
}

/** Componentes en pantalla (x) y hacia cámara (z) de una dirección del cuerpo. */
export function dirToScreen(v: View, d: V3): { x: number; z: number } {
  return { x: d.x * v.rx + d.z * v.fx, z: d.x * v.rz + d.z * v.fz }
}

/**
 * IK de dos huesos: articulación intermedia entre `a` y `target` doblada hacia
 * `pole`. Si el objetivo no se alcanza, el extremo se queda a tope de brazo.
 */
function twoBone(a: V3, target: V3, l1: number, l2: number, pole: V3): { joint: V3; end: V3 } {
  const toT = sub(target, a)
  const reach = (l1 + l2) * 0.999
  const d = Math.min(len(toT), reach)
  const dir = norm(toT)
  const end = add(a, mul(dir, d))
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  const perp = norm(sub(pole, mul(dir, dot(pole, dir))))
  return { joint: add(add(a, mul(dir, along)), mul(perp, h)), end }
}

/** Proporciones de un estilo: cabezas por altura, grosor de miembros y patín exagerado. */
export interface Proportions {
  heads: number
  limb: number
  skate: number
  headAspect: number
}

export type Pair = [V3, V3]
export type FigureKind = 'skater' | 'goalie' | 'ref'

export interface Skeleton {
  kind: FigureKind
  /** Escala del cuerpo sin cabeza respecto a un adulto real. */
  k: number
  headC: V3
  headR: number
  neck: V3
  shoulderC: V3
  pelvis: V3
  sh: Pair
  el: Pair
  hand: Pair
  hip: Pair
  knee: Pair
  ankle: Pair
  footDir: Pair
  stick: { top: V3; heel: V3; toe: V3 } | null
}

/** Longitudes reales en fracción de altura (adulto de 7,5 cabezas). */
const REAL = { shin: 0.245, thigh: 0.245, trunk: 0.3, neck: 0.035, upperArm: 0.19, foreArm: 0.17 } as const
const REAL_CHAIN = REAL.shin + REAL.thigh + REAL.trunk + REAL.neck

const rad = (deg: number) => (deg * Math.PI) / 180
const pair = (f: (side: number) => V3): Pair => [f(-1), f(1)]

/** Factor de cuerpo y radio de cabeza para que la figura de pie mida exactamente 1. */
function bodyScale(p: Proportions, ankleY: number) {
  const headH = 1 / p.heads
  return { k: (1 - headH - ankleY) / REAL_CHAIN, headR: headH / 2 }
}

function arms(sh: Pair, hand: Pair, k: number, poles: Pair): { el: Pair; hand: Pair } {
  const l1 = REAL.upperArm * k
  const l2 = REAL.foreArm * k
  const s0 = twoBone(sh[0], hand[0], l1, l2, poles[0])
  const s1 = twoBone(sh[1], hand[1], l1, l2, poles[1])
  return { el: [s0.joint, s1.joint], hand: [s0.end, s1.end] }
}

function mirrorX(s: Skeleton): Skeleton {
  const m = (p: V3) => v3(-p.x, p.y, p.z)
  const mp = (p: Pair): Pair => [m(p[1]), m(p[0])]
  return {
    ...s,
    headC: m(s.headC), neck: m(s.neck), shoulderC: m(s.shoulderC), pelvis: m(s.pelvis),
    sh: mp(s.sh), el: mp(s.el), hand: mp(s.hand), hip: mp(s.hip), knee: mp(s.knee),
    ankle: mp(s.ankle), footDir: mp(s.footDir),
    stick: s.stick && { top: m(s.stick.top), heel: m(s.stick.heel), toe: m(s.stick.toe) },
  }
}

/** Altura del tobillo de un patinador: rueda + placa + suela. */
export const skaterAnkleY = (p: Proportions) => p.skate + 0.04

/** Patinador en postura de avance: rodillas flexionadas, tronco a 45° y stick a dos manos. */
export function skaterSkeleton(p: Proportions, hand: 'L' | 'R'): Skeleton {
  const ay = skaterAnkleY(p)
  const { k, headR } = bodyScale(p, ay)
  const shin = REAL.shin * k
  const thigh = REAL.thigh * k
  const ankle: Pair = [v3(-0.085, ay, -0.03), v3(0.085, ay, 0.04)]
  const knee = pair(s => {
    const a = ankle[s < 0 ? 0 : 1]
    return v3(a.x + s * 0.01, a.y + shin * Math.cos(rad(28)), a.z + shin * Math.sin(rad(28)))
  })
  const hip = pair(s => {
    const kn = knee[s < 0 ? 0 : 1]
    return v3(s * 0.075 * k, kn.y + thigh * Math.cos(rad(42)), kn.z - thigh * Math.sin(rad(42)))
  })
  const pelvis = lerp3(hip[0], hip[1], 0.5)
  const shoulderC = add(pelvis, v3(0, REAL.trunk * k * Math.cos(rad(45)), REAL.trunk * k * Math.sin(rad(45))))
  const sh = pair(s => add(shoulderC, v3(s * 0.12 * k, 0, 0)))
  const neck = add(shoulderC, v3(0, REAL.neck * k, 0.02 * k))
  const headC = add(neck, v3(0, headR * 0.9, headR * 0.3))
  const top = add(pelvis, v3(-0.06 * k, 0.15 * k, 0.17 * k))
  const heel = v3(0.09, 0.012, 0.48 * k)
  const toe = add(heel, v3(-0.075, 0, 0.035))
  const a = arms(sh, [lerp3(top, heel, 0.04), lerp3(top, heel, 0.33)], k, [v3(-1, -0.3, -0.5), v3(1, -0.3, -0.6)])
  const footDir = pair(s => v3(s * Math.sin(0.18), 0, Math.cos(0.18)))
  const sk: Skeleton = {
    kind: 'skater', k, headC, headR, neck, shoulderC, pelvis, sh, el: a.el, hand: a.hand,
    hip, knee, ankle, footDir, stick: { top, heel, toe },
  }
  return hand === 'L' ? mirrorX(sk) : sk
}

/** Portero de rodillas: pads abiertos sobre el suelo, torso erguido, manopla y stick. */
export function goalieSkeleton(p: Proportions): Skeleton {
  const { k, headR } = bodyScale(p, skaterAnkleY(p))
  const knee = pair(s => v3(s * 0.12, 0.05, 0.08))
  const ankle = pair(s => v3(s * 0.36, 0.05, -0.06))
  const hip = pair(s => v3(s * 0.09 * k, 0.05 + REAL.thigh * k * 0.92, 0))
  const pelvis = lerp3(hip[0], hip[1], 0.5)
  const shoulderC = add(pelvis, v3(0, REAL.trunk * k * Math.cos(rad(12)), REAL.trunk * k * Math.sin(rad(12))))
  const sh = pair(s => add(shoulderC, v3(s * 0.15 * k, 0, 0)))
  const neck = add(shoulderC, v3(0, REAL.neck * k, 0.01))
  const headC = add(neck, v3(0, headR * 0.95, headR * 0.1))
  const handTarget: Pair = [add(sh[0], v3(-0.13, -0.1, 0.16)), add(sh[1], v3(0.1, -0.2, 0.16))]
  const a = arms(sh, handTarget, k, [v3(-1, -0.6, -0.2), v3(1, -0.4, -0.3)])
  const top = add(a.hand[1], v3(0.0, 0.05, -0.02))
  const heel = v3(0.07, 0.012, 0.3)
  const toe = v3(-0.1, 0.012, 0.31)
  const footDir = pair(s => v3(s * 0.5, 0, -0.86))
  return {
    kind: 'goalie', k, headC, headR, neck, shoulderC, pelvis, sh, el: a.el, hand: a.hand,
    hip, knee, ankle, footDir, stick: { top, heel, toe },
  }
}

/** Árbitro a pie: erguido, brazos caídos, zapatillas. */
export function refSkeleton(p: Proportions): Skeleton {
  const ay = 0.045
  const { k, headR } = bodyScale(p, ay)
  const ankle = pair(s => v3(s * 0.075, ay, 0))
  const knee = pair(s => v3(s * 0.08, ay + REAL.shin * k, 0.012))
  const hip = pair(s => v3(s * 0.075 * k, ay + (REAL.shin + REAL.thigh) * k, 0))
  const pelvis = lerp3(hip[0], hip[1], 0.5)
  const shoulderC = add(pelvis, v3(0, REAL.trunk * k, 0.015))
  const sh = pair(s => add(shoulderC, v3(s * 0.12 * k, 0, 0)))
  const neck = add(shoulderC, v3(0, REAL.neck * k, 0.005))
  const headC = add(neck, v3(0, headR * 0.95, 0.01))
  const drop = (REAL.upperArm + REAL.foreArm) * k * 0.97
  const handTarget = pair(s => add(sh[s < 0 ? 0 : 1], v3(s * 0.05, -drop, 0.03)))
  const a = arms(sh, handTarget, k, [v3(0, 0, -1), v3(0, 0, -1)])
  const footDir = pair(s => v3(s * Math.sin(0.2), 0, Math.cos(0.2)))
  return {
    kind: 'ref', k, headC, headR, neck, shoulderC, pelvis, sh, el: a.el, hand: a.hand,
    hip, knee, ankle, footDir, stick: null,
  }
}
