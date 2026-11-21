/**
 * Clips del portero (WP-33, SPEC §8): las cuatro paradas (pad abierto, manopla
 * arriba, stick al suelo, bloqueo con el cuerpo) y la reacción al gol encajado
 * (cabeza gacha y golpes de stick). Se aplican sobre la postura base de
 * `goaliePose` mezclando por una envolvente, así que entran y salen sin saltos.
 * `markGoalieSave` elige la parada por el lado y la distancia de la bola.
 */
import { GOALIE_SAVE_RADIUS } from '../../constants'
import type { Ball, Player } from '../../types'
import { ACTION_CLIP_MS, GOALIE_CLIP_MS, GOALIE_ENVELOPE, GOALIE_SAVE_PICK, GOALIE_SAVE_POSE } from '../artSpec'
import { startAnim } from './actions'
import { goalieMood } from './celebrationClips'
import type { PoseContext, PuppetPose } from './pose'
import { goalieReaction } from './reactionClips'
import type { V3 } from './vec'

export type SaveKind = NonNullable<NonNullable<Player['anim']>['save']>

const P = GOALIE_SAVE_POSE
const smooth = (u: number) => u * u * (3 - 2 * u)

/** Peso con ataque hasta `up` y relajación desde `down`. */
function envelope(t: number, [up, down]: readonly [number, number]) {
  if (t < up) return smooth(t / up)
  if (t > down) return smooth((1 - t) / (1 - down))
  return 1
}

/**
 * Elige y marca la parada del portero que defiende la bola. Lado = lateral de la
 * bola en el marco del portero; distancia = fracción del radio de parada: muy
 * cerca, cuerpo; muy lateral, pad abierto; algo lateral, manopla (lado libre) o
 * stick (lado del stick); centrada y lejos, stick al suelo.
 */
export function markGoalieSave(players: Player[], ball: Ball, at: number) {
  let goalie: Player | null = null
  let best = Infinity
  for (const p of players) {
    if (p.role !== 'goalie') continue
    const d = Math.hypot(p.pos.x - ball.x, p.pos.y - ball.y)
    if (d < best) { best = d; goalie = p }
  }
  if (!goalie) return
  const R = GOALIE_SAVE_RADIUS
  const lat = (-(ball.x - goalie.pos.x) * goalie.facing.y + (ball.y - goalie.pos.y) * goalie.facing.x) / R
  const r = best / R
  const A = GOALIE_SAVE_PICK
  const stickSide = goalie.rig.stickSide === 1 ? 1 : -1
  const onStickSide = Math.sign(lat || 1) === stickSide
  let kind: SaveKind = 'stick'
  if (r < A.body) kind = 'body'
  else if (Math.abs(lat) > A.wide) kind = 'split'
  else if (Math.abs(lat) > A.side) kind = onStickSide ? 'stick' : 'glove'
  startAnim(goalie, 'save', at)
  if (goalie.anim) { goalie.anim.save = kind; goalie.anim.side = lat < 0 ? -1 : 1 }
}

/** Progreso 0..1 de la acción `type` del portero, o -1 si no está en curso. */
export function goalieClipT(player: Player, type: 'save' | 'celebrate', now: number): number {
  const a = player.anim
  if (!a || a.type !== type) return -1
  const ms = type === 'save' ? GOALIE_CLIP_MS.save : ACTION_CLIP_MS.celebrate
  const t = (now - a.at) / ms
  return t >= 0 && t < 1 ? t : -1
}

/**
 * Aplica la parada o la reacción en curso. `hand` es el punto de agarre del stick
 * (el pomo sale de la pala hacia él) y `heel` el talón de la pala; `s` = ±1 lado del stick.
 */
export function goalieClip(pose: PuppetPose, ctx: PoseContext, hand: V3, s: number) {
  const p = ctx.player
  const free = ctx.stickSide === 1 ? 0 : 1
  const st = pose.stick
  const save = goalieClipT(p, 'save', ctx.time)
  if (save >= 0 && p.anim) {
    const w = envelope(save, GOALIE_ENVELOPE.save)
    const d = p.anim.side ?? 1
    switch (p.anim.save) {
      case 'split': {
        const near = d === 1 ? 1 : 0
        const f = pose.feet[near]
        f.x += (d * P.splitOut - f.x) * w
        f.yaw += (d * 1.1 - f.yaw) * w
        pose.pelvis.x += d * P.splitShift * w
        pose.pelvis.y -= P.splitDrop * w
        pose.trunk.roll += d * P.splitRoll * w
        pose.hands[free].y += 0.12 * w
        break
      }
      case 'glove': {
        const h = pose.hands[free]
        h.x += (d * P.gloveOut - h.x) * w
        h.y += (P.gloveUp - h.y) * w
        h.z += 0.06 * w
        pose.trunk.roll += d * P.gloveRoll * w
        pose.trunk.twist += d * 0.18 * w
        break
      }
      case 'stick': {
        st.heel.x += (d * P.stickOut - st.heel.x) * w
        st.heel.z = st.heel.z + (0.24 - st.heel.z) * w
        st.bladeYaw += (d * Math.PI * 0.5 - st.bladeYaw) * w
        hand.x += (d * P.stickOut * 0.55 - hand.x) * w
        hand.y -= 0.12 * w
        pose.trunk.pitch += P.stickLean * w
        pose.trunk.roll += d * 0.1 * w
        pose.pelvis.y -= 0.04 * w
        break
      }
      default: {
        // Bloqueo: pecho adelante, brazos abiertos y patines separados para tapar más portería
        pose.pelvis.y -= P.bodyDrop * w
        pose.pelvis.z += P.bodyLunge * w
        pose.trunk.pitch += 0.1 * w
        for (const f of pose.feet) f.x += Math.sign(f.x) * 0.06 * w
        const h = pose.hands[free]
        h.x += (-s * P.bodyArms - h.x) * w
        h.y += (0.5 - h.y) * w
        hand.x += (s * P.bodyArms - hand.x) * w
        hand.y += (0.5 - hand.y) * w
        st.heel.z += 0.08 * w
      }
    }
    return
  }
  // Gestos de los parones (E-19): sustituyen a la reacción antigua
  if (goalieMood(pose, ctx, hand, s)) return
  if (goalieReaction(pose, ctx, hand, s)) return
  const t = goalieClipT(p, 'celebrate', ctx.time)
  if (t < 0) return
  // Encajó: cabeza gacha, manopla caída y el stick golpea el suelo varias veces
  const w = envelope(t, GOALIE_ENVELOPE.concede)
  const tap = Math.max(0, Math.sin(t * Math.PI * 2 * P.concedeTaps)) * w
  pose.trunk.pitch += P.concedePitch * w
  pose.pelvis.y -= 0.02 * w
  pose.headYaw *= 1 - w
  pose.hands[free].y -= 0.2 * w
  hand.y += tap * 0.18
  st.heel.y += tap * P.concedeLift
}
