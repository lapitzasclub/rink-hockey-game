/**
 * Reacciones en juego (E-20): lee `player.reaction` (lo pone `systems/reactions.ts` en la
 * simulación) y mezcla el gesto sobre tronco, cabeza y brazos; las piernas siguen con la
 * locomoción. El sancionado que sale (`penPhase` 'out'/'exit') patina cabizbajo.
 * Patinadores en `skaterReaction` (capa de acciones) y porteros en `goalieReaction`.
 * Sin asignaciones: vectores de trabajo del módulo; con dt = 0 (lab) la pose es determinista.
 */
import { REACTION } from '../../constants'
import type { PlayerReaction } from '../../types'
import { REACTION_POSE as P, RIG_STANCE } from '../artSpec'
import { moodWeight } from './celebrationClips'
import { fallProgress, keepReach } from './locomotion'
import type { PoseContext, PuppetPose } from './pose'
import { rigDims } from './skeleton'
import { lerp3, set3, v3, type V3 } from './vec'

const TRUNK = rigDims('skater').trunk
const TAU = Math.PI * 2
const LEN = RIG_STANCE.stickLen
const sh = v3()
const top = v3()
const heel = v3()

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const pulse = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t))
const wave = (ms: number, hz: number) => Math.sin(ms * 0.001 * TAU * hz)

/** Peso del gesto: entra y sale en `REACTION.fadeMs`; 0 fuera de [at, until). */
export function reactionWeight(r: PlayerReaction, now: number) {
  if (now < r.at || now >= r.until) return 0
  return Math.min(smooth01((now - r.at) / REACTION.fadeMs), smooth01((r.until - now) / REACTION.fadeMs))
}

function to(v: V3, x: number, y: number, z: number, w: number) {
  v.x += (x - v.x) * w
  v.y += (y - v.y) * w
  v.z += (z - v.z) * w
}

function shoulders(pose: PuppetPose): V3 {
  const p = pose.pelvis
  const a = pose.trunk.pitch
  const r = pose.trunk.roll
  return set3(sh, p.x + TRUNK * Math.sin(r), p.y + TRUNK * Math.cos(a) * Math.cos(r), p.z + TRUNK * Math.sin(a))
}

function releaseGrip(pose: PuppetPose, fi: 0 | 1) {
  const st = pose.stick
  if (st.lowerGrip === null) return
  lerp3(pose.hands[fi], st.top, st.heel, st.lowerGrip)
  st.lowerGrip = null
}

/** Stick colgando de la mano del pomo en (x, y, z), con la pala hacia (dx, dy, dz). */
function hangStick(pose: PuppetPose, x: number, y: number, z: number, dx: number, dy: number, dz: number, w: number) {
  const st = pose.stick
  set3(top, x, y, z)
  const l = Math.hypot(dx, dy, dz) || 1
  set3(heel, x + (dx / l) * LEN, Math.max(0, y + (dy / l) * LEN), z + (dz / l) * LEN)
  lerp3(st.top, st.top, top, w)
  lerp3(st.heel, st.heel, heel, w)
}

function lean(pose: PuppetPose, pitch: number, w: number) {
  pose.trunk.pitch += (pitch - pose.trunk.pitch) * w
  pose.headYaw *= 1 - w
}

/** Sancionado camino del banquillo: tronco caído, cabeza baja y brazo libre muerto. */
function slump(pose: PuppetPose, ctx: PoseContext, s: number, fi: 0 | 1) {
  const p = ctx.player
  if (p.penPhase !== 'out' && p.penPhase !== 'exit') return
  const S = P.slump
  const w = smooth01((ctx.time - (p.penPhaseAt ?? 0)) / S.fadeMs)
  if (w <= 0) return
  pose.trunk.pitch += S.pitch * w
  pose.headLean.z += S.head * w
  releaseGrip(pose, fi)
  const c = shoulders(pose)
  to(pose.hands[fi], c.x + s * S.freeX, c.y - S.freeDrop, c.z + S.freeZ, w)
}

/** Brazos abiertos con las palmas arriba, temblando de indignación. */
function protest(pose: PuppetPose, u: number, w: number, s: number, fi: 0 | 1) {
  const Q = P.protest
  lean(pose, Q.pitch, w)
  const c = shoulders(pose)
  const k = wave(u, Q.hz) * Q.shake
  to(pose.hands[fi], c.x + s * Q.x, c.y + Q.y + k, c.z + Q.z, w)
  hangStick(pose, c.x - s * Q.x, c.y + Q.y - k, c.z + Q.z, -s * 0.45, -0.85, 0.25, w)
}

/**
 * Capa del patinador: la llama `actions` tras los gestos de parón y antes de los clips. No
 * pinta nada caído, con un gesto de parón en curso ni durante una acción.
 */
export function skaterReaction(pose: PuppetPose, ctx: PoseContext) {
  const p = ctx.player
  if (ctx.action || fallProgress(ctx) >= 0) return
  if (p.mood && moodWeight(p.mood, ctx.time) > 0) return
  const s = ctx.stickSide === 1 ? 1 : -1
  const fi = ctx.stickSide
  slump(pose, ctx, s, fi)
  const r = p.reaction
  const w = r ? reactionWeight(r, ctx.time) : 0
  if (!r || w <= 0) { if (p.penPhase) keepReach(pose); return }
  const u = ctx.time - r.at
  const t = u / (r.until - r.at)
  if (r.kind !== 'tap') releaseGrip(pose, fi)
  switch (r.kind) {
    case 'tap': {
      // Golpes de stick contra el suelo: las dos manos en el mango, la pala sube y cae
      const T = P.tap
      lean(pose, pose.trunk.pitch + T.pitch, w)
      const k = Math.max(0, Math.sin(t * TAU * T.taps)) * w
      pose.stick.top.y += k * T.hand
      pose.stick.heel.y += k * T.heel
      break
    }
    case 'rue': {
      // Parado: encorvado con las dos manos al casco y el stick colgando
      const Q = P.rue
      lean(pose, Q.pitch, w)
      const c = shoulders(pose)
      const z = Math.sin(pose.trunk.pitch) * 0.14
      to(pose.hands[fi], c.x + s * Q.x, c.y + Q.y, c.z + Q.z + z, w)
      // Stick bajo en la otra mano, la pala apoyada delante
      const p = pose.pelvis
      hangStick(pose, p.x - s * Q.stickX, p.y + Q.stickY, p.z + 0.05, s * 0.3, -0.55, 0.8, w)
      break
    }
    case 'miss': {
      // Palo o por poco: cabeza atrás y manos encima del casco
      const Q = P.miss
      const e = pulse(Math.min(1, t * 1.15))
      lean(pose, Q.pitch, w)
      pose.headLean.z += Q.head * w * e
      const c = shoulders(pose)
      to(pose.hands[fi], c.x + s * Q.x, c.y + Q.y, c.z + Q.z, w)
      hangStick(pose, c.x - s * Q.stickX, c.y + Q.stickY, c.z + Q.z, -s * 0.2, -0.95, -0.15, w)
      break
    }
    case 'protest': protest(pose, u, w, s, fi); break
    case 'card': protest(pose, u, w * (1 - smooth01((t - 0.6) / 0.4)), s, fi); break
    case 'own': {
      // El infractor levanta la mano libre: «he sido yo»
      const Q = P.own
      lean(pose, pose.trunk.pitch + Q.pitch, w)
      const c = shoulders(pose)
      to(pose.hands[fi], c.x + s * Q.x, c.y + Q.y, c.z + Q.z, w)
      break
    }
    case 'pat': {
      // Palmada al pasar: la mano libre sale hacia el lado del compañero sancionado
      const Q = P.pat
      const c = shoulders(pose)
      const x = r.side === s ? Q.x : Q.cross
      to(pose.hands[fi], c.x + r.side * x, c.y + Q.y, c.z + Q.z, w * pulse(t))
      break
    }
    default: break
  }
  keepReach(pose)
}

/**
 * Capa del portero sobre su postura: `hand` es el agarre del stick y `s` = ±1 lado del
 * stick. «¡Mía!» con la manopla arriba o resoplido con los hombros caídos.
 * Devuelve false si no hay reacción en curso.
 */
export function goalieReaction(pose: PuppetPose, ctx: PoseContext, hand: V3, s: number): boolean {
  const r = ctx.player.reaction
  if (!r) return false
  const w = reactionWeight(r, ctx.time)
  if (w <= 0) return false
  const u = ctx.time - r.at
  const t = u / (r.until - r.at)
  const mitt = pose.hands[ctx.stickSide === 1 ? 0 : 1]
  if (r.kind === 'mine') {
    const Q = P.mine
    lean(pose, pose.trunk.pitch + Q.pitch, w)
    pose.trunk.roll += s * Q.roll * w
    to(mitt, -s * Q.mittX, Q.mittY + wave(u, Q.hz) * Q.pump, Q.mittZ, w)
    return true
  }
  if (r.kind === 'phew') {
    // Resoplido: hombros que caen y vuelven, manopla y stick colgando
    const Q = P.phew
    const e = pulse(t) * w
    pose.trunk.pitch += Q.pitch * e
    pose.pelvis.y -= Q.drop * e
    mitt.y -= Q.mitt * e
    hand.y -= Q.hand * e
    return true
  }
  return false
}
