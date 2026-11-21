/**
 * Animación secundaria del patinador (E-17): peso e inercia sobre la pose de
 * locomoción, leídos del estado del jugador al pintar (no toca la simulación).
 *
 * Por jugador, muelles masa-muelle amortiguados (RIG_MOTION):
 * - tronco: el cabeceo total sigue la postura de los pasos más la inclinación por
 *   aceleración (se carga al arrancar, se echa atrás al frenar y rebota al asentarse);
 *   el ladeo sigue la aceleración lateral (hacia dentro de la curva);
 * - cadera: su altura base (la flexión de rodilla de los pasos) baja y sube con masa;
 * - brazos y stick: siguen al tronco con retardo (acción superpuesta) y la cabeza
 *   contrarresta parte del balanceo;
 * - choque (`player.bump`): golpe a los muelles del tronco en la dirección del impulso,
 *   envolvente de equilibrio (brazos abiertos, rodillas) y paso de recuperación.
 * Además, el canto de los patines con la deriva. Con dt = 0 (lab) todo va directo al
 * objetivo y no hay choque en curso: pose determinista.
 */
import { RIG_MOTION } from '../artSpec'
import type { Player } from '../../types'
import { smooth01 } from './locomotionGaits'
import type { PoseContext, PuppetPose } from './pose'
import { rigDims } from './skeleton'

const M = RIG_MOTION
const B = M.bump
const TAU = Math.PI * 2
const TRUNK = rigDims('skater').trunk

export interface Motion {
  pitch: number; pitchV: number
  roll: number; rollV: number
  hip: number; hipV: number
  /** Copias retrasadas del cabeceo y del ladeo totales del tronco (brazos). */
  lagP: number; lagPV: number
  lagR: number; lagRV: number
  /** Envolvente de equilibrio tras un choque (≈ magnitud en el pico). */
  bal: number; balV: number
  edge: number
  /** `at` del último choque leído, instante y magnitud del último que golpeó los muelles. */
  bumpAt: number
  kickAt: number
  kickMag: number
  /** Paso de recuperación: inicio, magnitud y dirección del impulso en mundo. */
  stepAt: number
  stepMag: number
  stepX: number
  stepY: number
  /** Retardo de los brazos en el marco del cuerpo (unidades de figura); lo usa upperBody. */
  armX: number; armY: number; armZ: number
  /** true: el próximo paso va directo al objetivo (estado nuevo o teleporte). */
  fresh: boolean
}

const motions = new WeakMap<Player, Motion>()

/** Estado de la animación secundaria del jugador (se crea una vez). */
export function motionOf(p: Player): Motion {
  let m = motions.get(p)
  if (!m) {
    m = {
      pitch: 0, pitchV: 0, roll: 0, rollV: 0, hip: 0, hipV: 0, lagP: 0, lagPV: 0, lagR: 0, lagRV: 0,
      bal: 0, balV: 0, edge: 0, bumpAt: -Infinity, kickAt: -Infinity, kickMag: 0,
      stepAt: -Infinity, stepMag: 0, stepX: 0, stepY: 0, armX: 0, armY: 0, armZ: 0, fresh: true,
    }
    motions.set(p, m)
  }
  return m
}

/** Teleporte o estado reiniciado: los muelles saltan al objetivo en el próximo paso. */
export function snapMotion(p: Player) {
  const m = motions.get(p)
  if (m) m.fresh = true
}

/** Lab: olvida el estado (las tiras dinámicas simulan su historia desde cero). */
export function forgetMotion(p: Player) {
  motions.delete(p)
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/** Velocidad del muelle tras `spring`: se devuelve por aquí para no asignar. */
let springV = 0
/** Un subpaso (semiimplícito) de un muelle de frecuencia `hz` y amortiguamiento `z` hacia `t`. */
function spring(x: number, v: number, t: number, hz: number, z: number, h: number): number {
  const w = TAU * hz
  springV = v + (w * w * (t - x) - 2 * z * w * v) * h
  return x + springV * h
}

/**
 * Lee `player.bump` una sola vez por choque: golpea los muelles del tronco en la
 * dirección del impulso (en el marco del cuerpo), dispara la envolvente de equilibrio
 * y, si es fuerte, el paso de recuperación. Ignora contactos mínimos y repeticiones
 * seguidas más débiles (un contacto sostenido no hace temblar la figura).
 */
function readBump(m: Motion, p: Player, now: number) {
  const b = p.bump
  if (!b || b.at === m.bumpAt || now < b.at) return
  m.bumpAt = b.at
  if (now - b.at > B.maxAge) return
  const mag = Math.hypot(b.x, b.y)
  if (mag < B.min) return
  const k = Math.min(B.cap, mag / B.ref)
  if (now - m.kickAt < B.refractory && k < m.kickMag * B.stronger) return
  m.kickAt = now
  m.kickMag = k
  const ux = b.x / mag
  const uy = b.y / mag
  const f = p.facing
  m.pitchV += B.kick * k * (ux * f.x + uy * f.y)
  m.rollV += B.kick * k * (-ux * f.y + uy * f.x)
  // Pico de la envolvente críticamente amortiguada (b' = v0) = v0 / (w·e) a los 1/w s
  m.balV += B.bal.w * Math.E * k
  if (k >= B.step.min) {
    m.stepAt = now
    m.stepMag = Math.min(1, k)
    m.stepX = ux
    m.stepY = uy
  }
}

/** Objetivos de los muelles que calcula la locomoción en este fotograma. */
export interface MotionTargets {
  pitch: number
  roll: number
  hip: number
  edge: number
}

/**
 * Integra los muelles hacia sus objetivos con `ctx.dt` (acotado por la locomoción) en
 * subpasos fijos. El tronco y la cadera ya quedan resueltos; los brazos se integran
 * en `applyMotion`, cuando se conoce el ladeo total.
 */
function integrate(m: Motion, ctx: PoseContext, t: MotionTargets) {
  const dt = ctx.dt
  if (dt <= 0 || m.fresh) {
    m.pitch = t.pitch; m.pitchV = 0
    m.roll = t.roll; m.rollV = 0
    m.hip = t.hip; m.hipV = 0
    m.edge = t.edge
    if (dt <= 0) { m.bal = 0; m.balV = 0; m.stepAt = -Infinity }
    return
  }
  readBump(m, ctx.player, ctx.time)
  const n = Math.ceil(dt / M.subStepMs)
  const h = dt / 1000 / n
  const T = M.trunk, R = M.roll, H = M.hip
  const wb = B.bal.w
  for (let i = 0; i < n; i++) {
    m.pitch = spring(m.pitch, m.pitchV, t.pitch, T.hz, T.zeta, h); m.pitchV = springV
    m.roll = spring(m.roll, m.rollV, t.roll, R.hz, R.zeta, h); m.rollV = springV
    m.hip = spring(m.hip, m.hipV, t.hip, H.hz, H.zeta, h); m.hipV = springV
    m.balV += (-wb * wb * m.bal - 2 * wb * m.balV) * h
    m.bal += m.balV * h
  }
  const L = M.limits
  if (m.pitch < L.back || m.pitch > L.fwd) { m.pitch = clamp(m.pitch, L.back, L.fwd); m.pitchV = 0 }
  if (Math.abs(m.roll) > L.roll) { m.roll = clamp(m.roll, -L.roll, L.roll); m.rollV = 0 }
  if (m.bal < 1e-4 && Math.abs(m.balV) < 1e-3) { m.bal = 0; m.balV = 0 }
  m.edge += (t.edge - m.edge) * (1 - Math.exp(-dt / M.edge.tau))
}

/** Brazos: copias retrasadas del tronco; su diferencia con el tronco es el retardo de las manos. */
function integrateArms(m: Motion, dt: number, pitch: number, roll: number) {
  if (dt <= 0 || m.fresh) {
    m.lagP = pitch; m.lagPV = 0; m.lagR = roll; m.lagRV = 0
  } else {
    const n = Math.ceil(dt / M.subStepMs)
    const h = dt / 1000 / n
    const A = M.arm
    for (let i = 0; i < n; i++) {
      m.lagP = spring(m.lagP, m.lagPV, pitch, A.hz, A.zeta, h); m.lagPV = springV
      m.lagR = spring(m.lagR, m.lagRV, roll, A.hz, A.zeta, h); m.lagRV = springV
    }
  }
  // Los hombros están a TRUNK de la pelvis: las manos van donde estarían con el tronco retrasado
  m.armX = TRUNK * (Math.sin(m.lagR) - Math.sin(roll))
  m.armZ = TRUNK * (Math.sin(m.lagP) - Math.sin(pitch))
  m.armY = TRUNK * (Math.cos(m.lagP) - Math.cos(pitch))
}

/**
 * Aplica la animación secundaria sobre la pose de locomoción (antes de la caída, que la
 * sobrescribe): cabeceo del muelle, ladeo y cadera, cabeza, canto de patines, paso de
 * recuperación y retardo de brazos. `falling`: la caída manda; los muelles siguen
 * siguiendo su objetivo para no saltar al levantarse.
 */
export function applyMotion(pose: PuppetPose, ctx: PoseContext, t: MotionTargets, turnShift: number, falling: boolean) {
  const m = motionOf(ctx.player)
  integrate(m, ctx, t)
  pose.trunk.pitch = m.pitch
  pose.trunk.roll += m.roll
  pose.pelvis.x += turnShift * m.roll
  pose.pelvis.y += m.hip - t.hip - B.bal.dip * m.bal
  integrateArms(m, ctx.dt, pose.trunk.pitch, pose.trunk.roll)
  m.fresh = false
  if (falling) {
    m.armX = 0; m.armY = 0; m.armZ = 0
    return
  }
  const Hd = M.head
  pose.headLean.x = -Hd.roll * TRUNK * Math.sin(pose.trunk.roll)
  pose.headLean.z = -Hd.pitch * TRUNK * (Math.sin(m.pitch) - Math.sin(t.pitch))
  pose.feet[0].roll = m.edge
  pose.feet[1].roll = m.edge
  recoveryStep(pose, ctx, m)
}

/**
 * Paso de recuperación: el pie del lado hacia el que empuja el choque sale hacia él
 * levantado, apoya y vuelve deslizando bajo la cadera mientras los pasos retoman.
 */
function recoveryStep(pose: PuppetPose, ctx: PoseContext, m: Motion) {
  const S = B.step
  const u = (ctx.time - m.stepAt) / S.ms
  if (!(u >= 0 && u < 1)) return
  const f = ctx.player.facing
  const bF = m.stepX * f.x + m.stepY * f.y
  const bR = -m.stepX * f.y + m.stepY * f.x
  const side = Math.abs(bR) > 0.3 ? (bR > 0 ? 1 : 0) : (ctx.stickSide === 1 ? 0 : 1)
  const out = u < S.out ? smooth01(u / S.out) : 1 - smooth01((u - S.out) / (1 - S.out))
  const d = S.dist * m.stepMag * out
  const foot = pose.feet[side]
  foot.x += bR * d
  foot.z += bF * d
  if (u < S.out) foot.y = Math.max(foot.y, S.lift * m.stepMag * Math.sin(Math.PI * u / S.out))
}

/** Peso 0..1 de los brazos abiertos por el equilibrio (0 sin choque reciente). */
export function balanceOf(p: Player): number {
  const m = motions.get(p)
  return m ? clamp(m.bal, 0, 1) : 0
}
