/**
 * Capa de locomoción (mínima de WP-30; la completa WP-31): postura de patinador
 * y zancada lateral alterna. Escribe pelvis, tronco, pies y polos de rodilla.
 * También lleva el estado de la zancada en los datos del contenedor
 * ('ab' amplitud, 'sp' fase en rad, 'pt' último instante), que el lab fija a mano.
 */
import * as Phaser from 'phaser'
import { RIG_STANCE } from '../artSpec'
import type { Player } from '../../types'
import type { PoseContext, PuppetPose } from './pose'
import type { RigDims } from './skeleton'

const TAU = Math.PI * 2
/** Suavizado por frame de la amplitud de zancada. */
const BLEND_RATE = 0.1
/** Tope de dt (ms) para que un parón no dispare la fase. */
const MAX_DT = 50

/** Avanza fase y amplitud de la zancada del jugador; devuelve dt (ms) en `out`. */
export function advanceStride(player: Player, timeNow: number, speedRatio: number, sprinting: boolean, out: { phase: number; blend: number; dt: number }) {
  const c = player.container
  const blend = Phaser.Math.Linear((c.getData('ab') as number | undefined) ?? 0, speedRatio, BLEND_RATE)
  const prevT = (c.getData('pt') as number | undefined) ?? timeNow
  const dt = Math.max(0, Math.min(timeNow - prevT, MAX_DT))
  const hz = sprinting ? RIG_STANCE.sprintHz : RIG_STANCE.strideHz
  const rate = TAU * Phaser.Math.Linear(hz[0], hz[1], blend)
  const phase = (((c.getData('sp') as number | undefined) ?? 0) + rate * dt / 1000) % (TAU * 10)
  c.setData('ab', blend)
  c.setData('pt', timeNow)
  c.setData('sp', phase)
  out.phase = phase
  out.blend = blend
  out.dt = dt
}

/** Postura de patinador agachado con zancada: cada pie empuja hacia fuera y atrás y vuelve levantado. */
export function locomotion(pose: PuppetPose, ctx: PoseContext) {
  const S = RIG_STANCE
  const b = ctx.blend
  const amp = b * (ctx.sprinting ? 1.3 : 1)
  const ph = ctx.phase
  pose.pelvis.x = Math.sin(ph) * 0.025 * amp
  pose.pelvis.y = S.pelvisY - S.pelvisDip * b - Math.abs(Math.sin(ph)) * 0.012 * amp
  pose.pelvis.z = 0
  pose.trunk.pitch = S.pitch + (S.pitchRun - S.pitch) * b + (ctx.sprinting ? (S.pitchSprint - S.pitchRun) * b : 0)
  pose.trunk.roll = -Math.sin(ph) * 0.06 * amp
  pose.trunk.twist = Math.sin(ph) * 0.08 * amp
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    // Fase del pie: el derecho empuja con sin(ph) > 0, el izquierdo en contrafase
    const fp = ph + (i === 0 ? Math.PI : 0)
    const push = Math.max(0, Math.sin(fp))
    const lift = Math.max(0, -Math.sin(fp))
    const f = pose.feet[i]
    f.x = s * (S.feetHalf + amp * (0.02 + S.strideOut * push))
    f.z = amp * (S.strideFore * Math.cos(fp) - 0.03)
    f.y = amp * S.strideLift * lift * lift
    f.yaw = s * (0.15 + amp * 0.4 * push)
    f.pitch = amp * 0.12 * lift
  }
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
