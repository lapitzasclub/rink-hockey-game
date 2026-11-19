/**
 * Poses de banquillo y mesa (WP-69). Cada figura tiene un repertorio corto de
 * poses fijas que benchPlayers.ts hornea una vez: cinco miradas (de la
 * izquierda a la derecha de pantalla) y las reacciones de su papel.
 *
 * Marco de pose (pose.ts): mirando a cámara, x > 0 es la derecha del jugador,
 * que en pantalla queda a la izquierda. `screen` (+1 = derecha de pantalla) se
 * traduce aquí para no repetir ese cambio de signo en cada pose.
 */
import { seatedPose, standingPose } from './puppet/locomotion'
import { resetPose, type PuppetPose, type Side } from './puppet/pose'
import type { RigDims } from './puppet/skeleton'

/** Identificadores de pose; 0..4 son las miradas de izquierda a derecha de pantalla. */
export const POSE = {
  L2: 0, L1: 1, C: 2, R1: 3, R2: 4,
  CHEER_A: 5, CHEER_B: 6, SAD: 7, POINT: 8, PROTEST_A: 9, PROTEST_B: 10, DESPAIR: 11,
  POINT_L: 12, POINT_R: 13, WORK: 14,
} as const
export const LOOK_CENTER = POSE.C

export type BenchRole = 'sub' | 'delegate' | 'coach' | 'aux' | 'timer' | 'scorer'

/** Poses que se hornean para cada papel. */
export const ROLE_POSES: Record<BenchRole, readonly number[]> = {
  sub: [0, 1, 2, 3, 4, POSE.CHEER_A, POSE.CHEER_B, POSE.SAD],
  delegate: [0, 1, 2, 3, 4, POSE.CHEER_A, POSE.SAD],
  coach: [0, 1, 2, 3, 4, POSE.POINT, POSE.PROTEST_A, POSE.PROTEST_B, POSE.CHEER_A, POSE.CHEER_B, POSE.DESPAIR],
  aux: [0, 1, 2, 3, 4, POSE.POINT_L, POSE.POINT_R],
  timer: [0, 1, 2, 3, 4, POSE.WORK],
  scorer: [0, 1, 2, 3, 4, POSE.WORK],
}

/** Postura de reposo de cada figura (variedad entre suplentes). */
export interface BenchStyle {
  rest: 'knees' | 'thighs' | 'back' | 'stick' | 'cross' | 'hips'
  /** Separación de pies (unidades de figura) y avance de los pies sentados. */
  spread: number
  feetZ: number
  /** Inclinación del tronco en reposo (rad). */
  lean: number
  /** Lado de pantalla hacia el centro de la pista (+1 = derecha): hacia ahí señala el entrenador. */
  inward: number
  /** Altura de la pelvis sentada. */
  seatY: number
}

/** Mano del jugador que queda al lado de pantalla `screen` (+1 = derecha). */
const handFor = (screen: number): Side => (screen > 0 ? 0 : 1)

/** Lleva la mano i hacia (x, y, z) sin pasar del alcance del brazo, para que el IK no estire de más. */
function reach(p: PuppetPose, d: RigDims, i: Side, x: number, y: number, z: number, frac = 0.92) {
  const s = i === 0 ? -1 : 1
  const cp = Math.cos(p.trunk.pitch), sp = Math.sin(p.trunk.pitch)
  const sx = p.pelvis.x + s * d.shoulderHalf
  const sy = p.pelvis.y + d.trunk * cp
  const sz = p.pelvis.z + d.trunk * sp
  let dx = x - sx, dy = y - sy, dz = z - sz
  const len = Math.hypot(dx, dy, dz)
  const max = (d.upperArm + d.foreArm) * frac
  if (len > max) { const k = max / len; dx *= k; dy *= k; dz *= k }
  const h = p.hands[i]
  h.x = sx + dx; h.y = sy + dy; h.z = sz + dz
}

/** Centro aproximado de la cabeza para llevar las manos a ella. */
function headAt(p: PuppetPose, d: RigDims) {
  const r = d.trunk + d.neck + d.headR
  return { y: p.pelvis.y + r * Math.cos(p.trunk.pitch), z: p.pelvis.z + r * Math.sin(p.trunk.pitch) }
}

/** Mirada: la cabeza gira a la vista pedida y el tronco la acompaña un poco. */
function look(p: PuppetPose, id: number) {
  p.headYaw = (LOOK_CENTER - id) * (Math.PI / 4)
  p.trunk.twist = p.headYaw * 0.2
}

/** De pie un paso por delante del asiento (el ancla es la del sentado). */
function standUp(p: PuppetPose, d: RigDims, ahead: number) {
  standingPose(p, d, 0.015)
  p.pelvis.z += ahead
  for (const f of p.feet) f.z += ahead
}

/** Sentado en reposo según el estilo; el stick, si lo lleva, entre las rodillas. */
function seatedRest(p: PuppetPose, d: RigDims, st: BenchStyle) {
  seatedPose(p, st.seatY)
  p.trunk.pitch = st.lean
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    p.feet[i].x = s * st.spread
    p.feet[i].z = st.feetZ
  }
  const y = st.seatY
  for (const i of [0, 1] as const) {
    const s = i === 0 ? -1 : 1
    if (st.rest === 'knees') reach(p, d, i, s * 0.1, y + 0.05, 0.16)
    else if (st.rest === 'thighs') reach(p, d, i, s * 0.085, y + 0.045, 0.04)
    else if (st.rest === 'back') reach(p, d, i, s * 0.2, y - 0.01, -0.08)
    else if (st.rest === 'cross') reach(p, d, i, -s * 0.05, y + d.trunk * 0.62, 0.1)
    else reach(p, d, i, s * 0.12, y + 0.05, 0.13)
  }
  if (st.rest === 'cross') for (const ep of p.elbowPole) { ep.y = -0.6; ep.z = 0.6 }
  if (st.rest === 'stick') {
    const k = p.stick
    k.visible = true
    k.topHand = 1
    k.lowerGrip = 0.32
    k.top.x = 0.05; k.top.y = y + 0.27; k.top.z = 0.2
    k.heel.x = 0.08; k.heel.y = 0; k.heel.z = 0.3
    k.bladeYaw = 0.4
  }
}

/** Escribe en `p` la pose `id` del papel `role` (siempre mirando a cámara: `yaw` = 0). */
export function benchPose(p: PuppetPose, d: RigDims, role: BenchRole, id: number, st: BenchStyle) {
  p.yaw = 0
  resetPose(p)
  const seated = role !== 'coach'
  if (id <= POSE.R2) {
    if (seated) seatedRest(p, d, st)
    else coachRest(p, d, st)
    look(p, id)
    return
  }
  if (role === 'coach') return coachReact(p, d, id, st)
  if (role === 'aux' || role === 'timer' || role === 'scorer') return tableReact(p, d, role, id, st)

  // Suplentes y delegado: celebrar de pie, lamentar sentado
  if (id === POSE.SAD) {
    seatedRest(p, d, { ...st, rest: 'knees', lean: 0.55 })
    const h = headAt(p, d)
    p.stick.visible = false
    reach(p, d, 0, -0.05, h.y - 0.02, h.z + 0.07)
    reach(p, d, 1, 0.05, h.y - 0.02, h.z + 0.07)
    for (const ep of p.elbowPole) { ep.y = -1; ep.z = 0.4 }
    return
  }
  standUp(p, d, 0.16)
  const h = headAt(p, d)
  if (role === 'delegate') {
    // Aplaude: manos juntas delante del pecho
    reach(p, d, 0, -0.015, h.y - 0.2, p.pelvis.z + 0.2)
    reach(p, d, 1, 0.015, h.y - 0.2, p.pelvis.z + 0.2)
    return
  }
  if (id === POSE.CHEER_A) {
    reach(p, d, 0, -0.17, h.y + 0.3, p.pelvis.z + 0.02, 0.97)
    reach(p, d, 1, 0.17, h.y + 0.3, p.pelvis.z + 0.02, 0.97)
  } else {
    // Puño arriba y el otro brazo recogido, con medio giro
    p.trunk.twist = 0.25
    reach(p, d, 1, 0.12, h.y + 0.32, p.pelvis.z + 0.04, 0.97)
    reach(p, d, 0, -0.16, h.y - 0.12, p.pelvis.z + 0.14)
    p.elbowPole[0].y = -1
  }
}

/** Entrenador de pie junto a la puerta: manos en la cintura o brazos cruzados. */
function coachRest(p: PuppetPose, d: RigDims, st: BenchStyle) {
  standUp(p, d, 0)
  const h = headAt(p, d)
  for (const i of [0, 1] as const) {
    const s = i === 0 ? -1 : 1
    if (st.rest === 'cross') reach(p, d, i, -s * 0.06, h.y - 0.27, p.pelvis.z + 0.1)
    else reach(p, d, i, s * 0.15, p.pelvis.y + 0.04, p.pelvis.z - 0.01)
  }
  if (st.rest === 'cross') for (const ep of p.elbowPole) { ep.y = -0.6; ep.z = 0.6 }
  else for (let i = 0; i < 2; i++) { p.elbowPole[i].x = i === 0 ? -1 : 1; p.elbowPole[i].z = -0.6 }
}

/** Reacciones del entrenador: señalar, protestar, celebrar y lamentar. */
function coachReact(p: PuppetPose, d: RigDims, id: number, st: BenchStyle) {
  standUp(p, d, 0)
  const h = headAt(p, d)
  const z = p.pelvis.z
  if (id === POSE.POINT) {
    const i = handFor(st.inward)
    const px = -st.inward
    p.headYaw = px * 0.6
    p.trunk.twist = px * 0.25
    reach(p, d, i, px * 0.32, h.y - 0.1, z + 0.22, 0.98)
    reach(p, d, (1 - i) as Side, -px * 0.14, p.pelvis.y + 0.04, z)
  } else if (id === POSE.PROTEST_A) {
    // Brazos abiertos, palmas arriba: «¿qué pitas?»
    p.trunk.pitch = 0.12
    reach(p, d, 0, -0.32, h.y - 0.3, z + 0.18, 0.98)
    reach(p, d, 1, 0.32, h.y - 0.3, z + 0.18, 0.98)
    for (const ep of p.elbowPole) { ep.y = -1; ep.z = 0 }
  } else if (id === POSE.PROTEST_B) {
    p.trunk.pitch = -0.05
    reach(p, d, 0, -0.27, h.y + 0.12, z + 0.1, 0.98)
    reach(p, d, 1, 0.27, h.y + 0.12, z + 0.1, 0.98)
  } else if (id === POSE.CHEER_A) {
    reach(p, d, 0, -0.16, h.y + 0.3, z + 0.02, 0.97)
    reach(p, d, 1, 0.16, h.y + 0.3, z + 0.02, 0.97)
  } else if (id === POSE.CHEER_B) {
    p.trunk.pitch = 0.18
    p.trunk.twist = -0.2
    reach(p, d, 0, -0.1, h.y + 0.05, z + 0.25, 0.97)
    reach(p, d, 1, 0.16, h.y - 0.32, z + 0.1)
  } else {
    // Manos a la cabeza
    p.trunk.pitch = -0.08
    reach(p, d, 0, -0.07, h.y + 0.02, h.z - 0.01, 0.98)
    reach(p, d, 1, 0.07, h.y + 0.02, h.z - 0.01, 0.98)
    for (const ep of p.elbowPole) { ep.y = 0.6; ep.z = 0.1 }
  }
}

/** Mesa: el auxiliar señala hacia un lado; cronometrador y anotador trabajan sobre la mesa. */
function tableReact(p: PuppetPose, d: RigDims, role: BenchRole, id: number, st: BenchStyle) {
  seatedRest(p, d, st)
  if (role === 'aux') {
    const screen = id === POSE.POINT_L ? -1 : 1
    const i = handFor(screen)
    const h = headAt(p, d)
    p.headYaw = -screen * (Math.PI / 4)
    p.trunk.twist = -screen * 0.2
    reach(p, d, i, -screen * 0.34, h.y - 0.08, 0.16, 0.98)
    return
  }
  p.trunk.pitch = role === 'scorer' ? 0.42 : 0.28
  const y = st.seatY + 0.11
  if (role === 'scorer') {
    reach(p, d, 1, 0.02, y, 0.26)
    reach(p, d, 0, -0.14, y, 0.2)
  } else {
    reach(p, d, 0, -0.07, y + 0.01, 0.27)
    reach(p, d, 1, 0.09, y, 0.24)
  }
}
