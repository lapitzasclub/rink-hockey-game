/**
 * Capa de acciones (WP-32): lee `player.anim` (lo marcan pase, tiro, robo,
 * recepción y el gol) y aplica el clip del patinador sobre la pose base. La
 * carga arcade se deduce de `checkCooldownUntil`, que solo pone la carga.
 * Sin clip (portero, o golpe sin `anim`), el golpe genérico gira stick y
 * hombros con el mismo arco que `stickWorldAngle` (facing + sin(tπ)·1,1).
 */
import { ARCADE_CHECK_COOLDOWN_MS } from '../../constants'
import type { Player } from '../../types'
import { ACTION_CLIP_MS } from '../artSpec'
import { playClip } from './actionClips'
import { skaterMood } from './celebrationClips'
import type { ActionType, PoseContext, PuppetPose } from './pose'
import type { V3 } from './vec'

/** Amplitud del arco del golpe (rad), la misma que usa el contacto en mundo. */
const SWING_ARC = 1.1
const SWING_LIFT = 0.08

/** Gira `p` en el suelo alrededor de (cx, cz) con el convenio de yaw (+ lleva +z hacia +x). */
function turnAround(p: V3, cx: number, cz: number, c: number, s: number) {
  const x = p.x - cx
  const z = p.z - cz
  p.x = cx + x * c + z * s
  p.z = cz - x * s + z * c
}

/**
 * Rellena `ctx.action` y, si hay clip en curso, pone su progreso en `ctx.swing`.
 * Solo patinadores: el portero lo resuelve su capa (WP-33).
 */
export function resolveAction(ctx: PoseContext, now: number) {
  ctx.action = null
  if (ctx.kind !== 'skater') return
  const p = ctx.player
  const anim = p.anim
  if (anim && anim.type in ACTION_CLIP_MS) {
    const t = (now - anim.at) / ACTION_CLIP_MS[anim.type as keyof typeof ACTION_CLIP_MS]
    if (t >= 0 && t < 1) {
      ctx.action = anim.type
      ctx.swing = t
      return
    }
  }
  if (p.checkCooldownUntil) {
    const t = (now - p.checkCooldownUntil + ARCADE_CHECK_COOLDOWN_MS) / ACTION_CLIP_MS.check
    if (t >= 0 && t < 1) {
      ctx.action = 'check'
      ctx.swing = t
    }
  }
}

/**
 * Marca una acción visual en `player.anim`. Repetir la misma acción mientras su
 * clip sigue en curso no la reinicia (la IA reintenta el robo casi cada frame).
 */
export function startAnim(player: Player, type: ActionType, at: number) {
  const anim = player.anim
  if (!anim) {
    player.anim = { type, at }
    return
  }
  const ms = type in ACTION_CLIP_MS ? ACTION_CLIP_MS[type as keyof typeof ACTION_CLIP_MS] : 0
  if (anim.type === type && at - anim.at < ms) return
  anim.type = type
  anim.at = at
}

export function actions(pose: PuppetPose, ctx: PoseContext) {
  if (!pose.stick.visible) return
  // Gestos de los parones (gol, descanso, final): sustituyen a los clips mientras duran
  if (ctx.kind === 'skater' && ctx.player.mood) skaterMood(pose, ctx)
  if (ctx.action) {
    playClip(pose, ctx, ctx.action, ctx.swing)
    return
  }
  if (ctx.swing < 0) return
  const e = Math.sin(ctx.swing * Math.PI)
  // El ángulo de mundo crece hacia la derecha del jugador, igual que los giros del marco del cuerpo
  const a = e * SWING_ARC
  const st = pose.stick
  const c = Math.cos(a)
  const s = Math.sin(a)
  turnAround(st.heel, pose.pelvis.x, pose.pelvis.z, c, s)
  turnAround(st.top, pose.pelvis.x, pose.pelvis.z, c, s)
  st.bladeYaw += a
  st.heel.y += e * SWING_LIFT
  pose.trunk.twist += a * 0.35
}
