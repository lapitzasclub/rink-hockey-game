/**
 * Capa de locomoción (WP-31, SPEC §6): patinaje quad por pasos que se mezclan
 * por pesos (zancada/sprint, cruces, hacia atrás, espera, frenada y caída).
 *
 * `advanceStride` lee la velocidad del jugador una vez por frame y deriva lo que
 * la física no da: aceleración (cadencia y deslizamiento), giro de la
 * trayectoria (cruces) y frenada. Ese estado vive en un WeakMap por jugador; la
 * fase y la amplitud siguen en los datos del contenedor ('sp', 'ab', 'pt'), que
 * el lab fija a mano. Con dt = 0 (lab) los pesos van directos al objetivo: pose determinista.
 * El peso y la inercia (muelles del tronco, cadera y brazos, choques, canto) los pone
 * `secondary.ts` sobre la mezcla de pasos (E-17).
 */
import * as Phaser from 'phaser'
import { ARCADE_CHECK_STUN_MS, PLAYER_ACCEL } from '../../constants'
import { RIG_LOCO, RIG_MOTION } from '../artSpec'
import type { Player } from '../../types'
import { backGait, brakeGait, crossGait, fallGait, hipY, idleGait, lerp, ramp, skidGait, strideGait, type GaitIn } from './locomotionGaits'
import { applyMotion, forgetMotion, snapMotion, type MotionTargets } from './secondary'
import { createPose, type PoseContext, type PuppetPose } from './pose'
import { rigDims, type RigDims } from './skeleton'
import { spinWheels } from './wheels'

const TAU = Math.PI * 2
const L = RIG_LOCO
/** Tope de dt (ms) para que un parón no dispare la fase. */
const MAX_DT = 50
/** Peso por debajo del cual un paso no se calcula. */
const EPS = 0.01
const DIMS = rigDims('skater')

interface LocoState {
  speed: number
  heading: number
  /** Variación de rapidez filtrada, en fracciones de PLAYER_ACCEL/s (< 0 = frena). */
  acc: number
  /** Giro de la trayectoria filtrado (rad/s, > 0 hacia la derecha del jugador). */
  turn: number
  sprint: number
  back: number
  cross: number
  /** −1..1: sentido suavizado del cruce. */
  crossDir: number
  brake: number
  brakeT: boolean
  /** Derrape: enganchado mientras dura la frenada y su peso suavizado. */
  skidOn: boolean
  skid: number
  /** Fase inicial propia: los ciclos de espera no van al unísono en los saques. */
  phase0: number
  /** Posición del último fotograma (detecta teleportes); NaN = sin fotograma previo. */
  px: number
  py: number
}

const states = new WeakMap<Player, LocoState>()

function stateOf(p: Player): LocoState {
  let st = states.get(p)
  if (!st) {
    // Estilo de frenada fijo por jugador (cuña o T) para que no parpadee
    let h = 0
    for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) | 0
    st = {
      speed: 0, heading: 0, acc: L.initAccel, turn: 0, sprint: 0, back: 0, cross: 0, crossDir: 0, brake: 0,
      brakeT: (h & 1) === 1, skidOn: false, skid: 0, phase0: ((h >>> 1) % 64) / 64 * TAU, px: NaN, py: NaN,
    }
    states.set(p, st)
  }
  return st
}

/** Lab: fija las entradas derivadas (aceleración normalizada, giro en rad/s, estilo de frenada). */
export function setLocoState(p: Player, accel: number, turn: number, brakeT?: boolean) {
  const st = stateOf(p)
  st.acc = accel
  st.turn = turn
  if (brakeT !== undefined) st.brakeT = brakeT
}

/** Lab: olvida el estado derivado y los muelles (las tiras dinámicas simulan desde cero). */
export function resetLoco(p: Player) {
  states.delete(p)
  forgetMotion(p)
  const c = p.container
  c.setData('ab', undefined)
  c.setData('sp', undefined)
  c.setData('pt', undefined)
}

const follow = (v: number, target: number, k: number) => v + (target - v) * k
const driveOf = (st: LocoState) => ramp(L.acc[0], L.acc[1], st.acc)

/**
 * Avanza fase y amplitud de la zancada, deriva aceleración y giro y suaviza los
 * pesos de los pasos. La cadencia sube con la aceleración y con el sprint.
 */
export function advanceStride(player: Player, timeNow: number, speedRatio: number, sprinting: boolean, out: { phase: number; blend: number; dt: number }) {
  const c = player.container
  const st = stateOf(player)
  const prevT = (c.getData('pt') as number | undefined) ?? timeNow
  const dt = Math.max(0, Math.min(timeNow - prevT, MAX_DT))
  const kOf = (tau: number) => (dt > 0 ? 1 - Math.exp(-dt / tau) : 1)
  const blend = follow((c.getData('ab') as number | undefined) ?? 0, speedRatio, kOf(L.tau.blend))

  const vx = player.velocity.x
  const vy = player.velocity.y
  const speed = Math.hypot(vx, vy)
  const heading = Math.atan2(vy, vx)
  // Teleporte (saque, recolocación): sin derivadas este fotograma y muelles al objetivo
  const jumped = Math.abs(player.pos.x - st.px) + Math.abs(player.pos.y - st.py) > L.snapPx
  st.px = player.pos.x
  st.py = player.pos.y
  if (jumped) snapMotion(player)
  else if (dt > 0) {
    const sec = dt / 1000
    // Cada muestra va acotada: el salto de velocidad de un choque no es una frenada
    const a = Math.max(-L.accClamp, Math.min(L.accClamp, (speed - st.speed) / sec / PLAYER_ACCEL))
    st.acc = follow(st.acc, a, kOf(L.tau.acc))
    const turning = speed > L.turnMinSpeed && st.speed > L.turnMinSpeed
    const w = turning ? Math.max(-L.turnClamp, Math.min(L.turnClamp, Phaser.Math.Angle.Wrap(heading - st.heading) / sec)) : 0
    st.turn = follow(st.turn, w, kOf(L.tau.turn))
  }
  st.speed = speed
  if (speed > 1e-3) st.heading = heading

  // Objetivos de los pasos según la velocidad en el marco del cuerpo
  const f = player.facing
  const fwd = speed > 1e-3 ? (vx * f.x + vy * f.y) / speed : 1
  const right = speed > 1e-3 ? (-vx * f.y + vy * f.x) / speed : 0
  const back = ramp(L.backFwd[0], L.backFwd[1], fwd) * ramp(0, L.idleBlend, blend)
  const byTurn = ramp(L.turn[0], L.turn[1], Math.abs(st.turn)) * ramp(L.turnSpeed[0], L.turnSpeed[1], blend)
  const byLateral = ramp(L.lateral[0], L.lateral[1], Math.abs(right)) * ramp(0, L.idleBlend, blend)
  const cross = Math.max(byTurn, byLateral) * (1 - back)
  const dir = byTurn >= byLateral ? Math.sign(st.turn) : Math.sign(right)
  const kw = kOf(L.tau.weight)
  st.back = follow(st.back, back, kw)
  st.cross = follow(st.cross, cross, kw)
  st.crossDir = follow(st.crossDir, cross > EPS ? dir : st.crossDir, kw)
  st.brake = follow(st.brake, ramp(L.brake[0], L.brake[1], -st.acc) * (1 - back) * (speed > L.turnMinSpeed ? 1 : 0), kw)
  // Frenada fuerte a velocidad: derrape hasta que acaba la frenada
  if (st.brake < EPS) st.skidOn = false
  else if (st.acc < L.skid.acc && speed > L.skid.speed) st.skidOn = true
  st.skid = follow(st.skid, st.skidOn ? 1 : 0, kw)
  st.sprint = follow(st.sprint, sprinting ? 1 : 0, kw)

  const drive = driveOf(st)
  const H = L.hz
  const hzMove = lerp(lerp(H.cruise, H.drive, drive), lerp(H.sprintCruise, H.sprint, drive), st.sprint)
  const hz = lerp(H.idle, hzMove, ramp(0, L.idleBlend, blend))
  const phase = (((c.getData('sp') as number | undefined) ?? st.phase0) + TAU * hz * dt / 1000) % (TAU * 10)
  c.setData('ab', blend)
  c.setData('pt', timeNow)
  c.setData('sp', phase)
  out.phase = phase
  out.blend = blend
  out.dt = dt
}

const tmp = createPose()
const tmpSkid = createPose()
const gait: GaitIn = { amp: 0, drive: 0, push: 0, sprint: 0, phase: 0, dir: 1, brakeT: false, dragSide: 1, fall: -1, fallDir: 1 }

/** Mezcla en `dst` los campos de locomoción de `src` con peso `w`. */
function mixInto(dst: PuppetPose, src: PuppetPose, w: number) {
  const m = (a: number, b: number) => a + (b - a) * w
  dst.pelvis.x = m(dst.pelvis.x, src.pelvis.x)
  dst.pelvis.y = m(dst.pelvis.y, src.pelvis.y)
  dst.pelvis.z = m(dst.pelvis.z, src.pelvis.z)
  dst.trunk.pitch = m(dst.trunk.pitch, src.trunk.pitch)
  dst.trunk.roll = m(dst.trunk.roll, src.trunk.roll)
  dst.trunk.twist = m(dst.trunk.twist, src.trunk.twist)
  for (let i = 0; i < 2; i++) {
    const a = dst.feet[i]
    const b = src.feet[i]
    a.x = m(a.x, b.x); a.y = m(a.y, b.y); a.z = m(a.z, b.z); a.yaw = m(a.yaw, b.yaw); a.pitch = m(a.pitch, b.pitch)
    const ka = dst.kneePole[i]
    const kb = src.kneePole[i]
    ka.x = m(ka.x, kb.x); ka.y = m(ka.y, kb.y); ka.z = m(ka.z, kb.z)
    const ha = dst.hands[i]
    const hb = src.hands[i]
    ha.x = m(ha.x, hb.x); ha.y = m(ha.y, hb.y); ha.z = m(ha.z, hb.z)
  }
}

/** Baja la cadera lo justo para que cada pierna llegue a su patín (la de empuje queda estirada). */
function keepReach(p: PuppetPose) {
  const reach = (DIMS.thigh + DIMS.shin) * L.reach
  for (let i = 0; i < 2; i++) {
    const f = p.feet[i]
    const dx = f.x - (p.pelvis.x + (i === 0 ? -1 : 1) * DIMS.hipHalf)
    const dz = f.z - p.pelvis.z
    const maxY = f.y + DIMS.ankleY + Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz))
    if (p.pelvis.y > maxY) p.pelvis.y = maxY
  }
}

/**
 * Giro del cuerpo entero (rad, convenio de los giros locales) durante el derrape: el
 * orquestador lo resta de la vista antes de llevar la bola al marco del cuerpo, así que
 * pala y bola siguen cuadrando. Lee el estado que acaba de dejar `advanceStride`.
 */
export function skidTurn(player: Player): number {
  const st = states.get(player)
  if (!st || st.skid <= EPS) return 0
  return st.skid * st.brake * L.skid.turn * (player.rig.stickSide === 1 ? 1 : -1)
}

/** Progreso 0..1 de la caída por carga; < 0 si no está caído. */
export function fallProgress(ctx: PoseContext) {
  const p = ctx.player
  if (p.stunKind !== 'check' || !p.stunUntil) return -1
  const left = p.stunUntil - ctx.time
  return left > 0 ? Math.min(1, Math.max(0, 1 - left / ARCADE_CHECK_STUN_MS)) : -1
}

/**
 * Tren inferior del patinador: zancada (o sprint) como base y, encima, cruces,
 * hacia atrás, espera, frenada y caída según sus pesos. Escribe pelvis, tronco,
 * pies, polos de rodilla y manos libres (upperBody puede sobrescribir los brazos).
 */
export function locomotion(pose: PuppetPose, ctx: PoseContext) {
  const st = stateOf(ctx.player)
  const g = gait
  g.amp = ctx.blend
  g.drive = Math.max(driveOf(st), 1 - ramp(0, L.idleBlend * 2, ctx.blend))
  g.push = driveOf(st)
  g.sprint = st.sprint
  g.phase = ctx.phase
  g.dir = st.crossDir >= 0 ? 1 : -1
  g.brakeT = st.brakeT
  g.dragSide = ctx.stickSide
  g.fall = fallProgress(ctx)
  g.fallDir = ((ctx.player.container.getData('tumbleDir') as number | undefined) ?? 1) >= 0 ? 1 : -1

  const S = L.knee
  strideGait(pose, g)
  // Altura base de la cadera de la mezcla (sin el vaivén de cada empuje): la lleva el muelle
  let hip = hipY(lerp(lerp(S.glide, S.drive, g.drive), S.sprint, g.sprint))
  const wCross = st.cross * Math.abs(st.crossDir)
  if (wCross > EPS) { crossGait(tmp, g); mixInto(pose, tmp, wCross); hip = lerp(hip, hipY(S.drive), wCross) }
  if (st.back > EPS) { backGait(tmp, g); mixInto(pose, tmp, st.back); hip = lerp(hip, hipY(S.back), st.back) }
  const wIdle = 1 - ramp(0, L.idleBlend, ctx.blend)
  if (wIdle > EPS) { idleGait(tmp, g); mixInto(pose, tmp, wIdle); hip = lerp(hip, hipY(S.idle), wIdle) }
  if (st.brake > EPS) {
    brakeGait(tmp, g)
    let hb = hipY(S.brake)
    if (st.skid > EPS) { skidGait(tmpSkid, g); mixInto(tmp, tmpSkid, st.skid); hb = lerp(hb, hipY(L.skid.knee), st.skid) }
    mixInto(pose, tmp, st.brake)
    hip = lerp(hip, hb, st.brake)
  }
  const t = targets
  t.pitch = pose.trunk.pitch + leanPitch(st)
  t.roll = leanRoll(st, wCross)
  t.hip = hip
  t.edge = edgeTarget(ctx, st)
  applyMotion(pose, ctx, t, L.lean.turnShift / L.lean.turn, g.fall >= 0)
  if (g.fall >= 0) fallGait(pose, g)
  keepReach(pose)
  spinWheels(pose, ctx)
}

const targets: MotionTargets = { pitch: 0, roll: 0, hip: 0, edge: 0 }

/**
 * Inclinación del tronco por aceleración (E-11, objetivo del muelle desde E-17): adelante al
 * acelerar (la aceleración ya va filtrada) y atrás de más al frenar, además de la postura
 * de frenada.
 */
function leanPitch(st: LocoState) {
  const K = L.lean
  const fwd = (1 - st.back) * (1 - st.brake)
  const brake = Math.min(1, Math.max(0, -st.acc) / RIG_MOTION.brakeRef) * (1 - st.back)
  return K.acc * Math.min(1, Math.max(0, st.acc) / K.accMax) * fwd - RIG_MOTION.brakeLean * brake
}

/**
 * Ladeo hacia dentro del giro por la aceleración lateral v·ω (E-11; objetivo del muelle):
 * la cadera va hacia el centro con él. Los cruces traen su ladeo y este se aparta con su peso.
 */
function leanRoll(st: LocoState, wCross: number) {
  const K = L.lean
  const lat = Math.max(-1, Math.min(1, (st.turn * st.speed) / PLAYER_ACCEL / K.turnRef))
  return K.turn * lat * (1 - wCross) * (1 - st.brake)
}

/**
 * Canto de los patines (E-17): con la velocidad de lado respecto al cuerpo pintado (deriva en
 * curva o derrape, que gira el cuerpo `skidTurn`) los patines muerden de canto contra la marcha.
 */
function edgeTarget(ctx: PoseContext, st: LocoState) {
  if (st.speed < 1) return 0
  const a = skidTurn(ctx.player)
  const lat = (ctx.velRight * Math.cos(a) - ctx.velForward * Math.sin(a)) / st.speed
  const E = RIG_MOTION.edge
  return -E.max * Math.max(-1, Math.min(1, lat / E.ref)) * ramp(E.speed[0], E.speed[1], st.speed)
}
/** Figura de pie y quieta (sancionados, banquillos, árbitros a pie). */
export function standingPose(pose: PuppetPose, dims: RigDims, kneeBend = 0) {
  pose.pelvis.x = 0
  pose.pelvis.y = dims.ankleY + dims.shin + dims.thigh - 0.008 - kneeBend
  pose.pelvis.z = -0.01
  pose.trunk.pitch = 0.06 + kneeBend * 1.5
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    const f = pose.feet[i]
    f.x = s * 0.075
    f.z = 0.01
    pose.hands[i].x = s * 0.15
    pose.hands[i].y = 0.3
    pose.hands[i].z = 0.03
  }
}

/** Figura sentada (banquillo): pelvis en la altura del asiento y pies adelantados. */
export function seatedPose(pose: PuppetPose, seatY = 0.3) {
  pose.pelvis.x = 0
  pose.pelvis.y = seatY
  pose.pelvis.z = -0.05
  pose.trunk.pitch = 0.12
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    const f = pose.feet[i]
    f.x = s * 0.1
    f.z = 0.18
    f.yaw = s * 0.1
    pose.kneePole[i].x = s * 0.1
    pose.kneePole[i].y = 1
    pose.kneePole[i].z = 1
    pose.hands[i].x = s * 0.12
    pose.hands[i].y = seatY + 0.04
    pose.hands[i].z = 0.14
  }
}
