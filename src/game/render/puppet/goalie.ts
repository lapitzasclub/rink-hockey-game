/**
 * Pose del portero (WP-33, SPEC §8): dos posturas mezcladas por `k`: de pie
 * atento (semiagachado, pads juntos, manopla delante y pala cruzada tapando el
 * hueco entre pads) y de rodillas (pads abiertos a los lados, torso erguido).
 * Se arrodilla cuando la bola está cerca o llega rápida hacia él, con
 * histéresis y tiempo mínimo para que no parpadee. Se desplaza con pasos cortos
 * (de pie) o deslizándose (de rodillas) a partir de `velRight`. Encima van las
 * paradas y la reacción al gol (`goalieClips`).
 */
import * as Phaser from 'phaser'
import type { Player } from '../../types'
import { GOALIE_BREATH, GOALIE_MOVE, GOALIE_POSTURE, GOALIE_VIEW } from '../artSpec'
import { goalieMoodKneel } from './celebrationClips'
import { goalieClip } from './goalieClips'
import type { PoseContext, PuppetPose } from './pose'
import { aimStick } from './upperBody'
import { set3, v3 } from './vec'
import { spinWheels } from './wheels'

/** Largo del stick del portero (lo lleva corto, a una mano). */
const GOALIE_STICK_LEN = 0.46
const hand = v3()
const A = GOALIE_POSTURE.stand
const B = GOALIE_POSTURE.kneel

interface GoalieState { kneel: boolean; k: number; since: number; prevD: number }
const states = new WeakMap<Player, GoalieState>()
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Decide la postura: de rodillas con la bola cerca, o más lejos si cierra rápido
 * y de frente. `kneel` del contenedor la fuerza (lab). Devuelve el peso 0..1.
 */
function posture(ctx: PoseContext): number {
  const c = ctx.player.container
  const forced = c.getData('kneel') as boolean | undefined
  let s = states.get(ctx.player)
  if (!s) states.set(ctx.player, s = { kneel: false, k: 0, since: -1e9, prevD: 0 })
  const V = GOALIE_VIEW
  if (forced !== undefined) {
    s.kneel = forced
    s.k = forced ? 1 : 0
    return s.k
  }
  const d = Math.hypot(ctx.ball.x, ctx.ball.z)
  const closing = ctx.dt > 0 && s.prevD > 0 ? ((s.prevD - d) / ctx.dt) * 1000 : 0
  s.prevD = d
  const incoming = ctx.ball.z > 0 && closing > V.fastClose && d < V.fastDist
  const want = s.kneel ? !(d > V.kneelOff && closing <= 0) : d < V.kneelOn || incoming
  if (want !== s.kneel && ctx.time - s.since > V.hold) {
    s.kneel = want
    s.since = ctx.time
  }
  const target = s.kneel ? 1 : 0
  s.k = ctx.dt > 0 ? s.k + (target - s.k) * (1 - Math.exp(-ctx.dt / V.tau)) : target
  return s.k
}

export function goaliePose(pose: PuppetPose, ctx: PoseContext) {
  const k = goalieMoodKneel(ctx, posture(ctx))
  const s = ctx.stickSide === 1 ? 1 : -1
  const M = GOALIE_MOVE
  // Desplazamiento lateral: pasos cortos de pie, deslizamiento de rodillas
  const lat = clamp01(Math.abs(ctx.velRight) / M.speedRef)
  const dir = Math.sign(ctx.velRight)
  const w = lat * Math.max(ctx.blend, 0.5)
  set3(pose.pelvis, dir * w * mix(0.03, 0.05, k), mix(A.pelvisY, B.pelvisY, k), mix(A.pelvisZ, B.pelvisZ, k))
  // Respiración en espera: sube la cadera y endereza el pecho al inspirar; se apaga al moverse
  const br = Math.sin(ctx.phase) * (1 - w)
  pose.pelvis.y += br * GOALIE_BREATH.pelvis
  pose.trunk.pitch = mix(A.pitch, B.pitch, k) - br * GOALIE_BREATH.pitch
  pose.trunk.roll = dir * w * mix(M.lean, M.slideLean, k)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const f = pose.feet[i]
    const ph = ctx.phase + i * Math.PI
    const step = (1 - k) * w
    f.x = side * mix(A.footX, B.footX, k) + dir * Math.cos(ph) * M.stepAmp * step
    f.y = mix(A.footY, B.footY, k) + Math.max(0, Math.sin(ph)) * M.stepLift * step
    f.z = mix(A.footZ, B.footZ, k)
    f.yaw = side * mix(A.footYaw, B.footYaw, k)
    set3(pose.kneePole[i], side * mix(A.poleX, B.poleX, k), mix(A.poleY, B.poleY, k), mix(A.poleZ, B.poleZ, k))
    set3(pose.elbowPole[i], side, -0.6, 0.1)
  }
  const free = ctx.stickSide === 1 ? 0 : 1
  set3(pose.hands[free], -s * mix(A.mittX, B.mittX, k), mix(A.mittY, B.mittY, k), mix(A.mittZ, B.mittZ, k))

  const st = pose.stick
  st.visible = true
  st.topHand = ctx.stickSide
  st.lowerGrip = null
  st.bladeYaw = -s * Math.PI * 0.5
  set3(st.heel, s * mix(A.heelX, B.heelX, k), 0, mix(A.heelZ, B.heelZ, k))
  set3(hand, s * mix(A.handX, B.handX, k), mix(A.handY, B.handY, k), mix(A.handZ, B.handZ, k))
  const ballYaw = Math.atan2(ctx.ball.x, ctx.ball.z)
  pose.headYaw = Phaser.Math.Clamp(ballYaw, -1.2, 1.2) * 0.3
  goalieClip(pose, ctx, hand, s)
  aimStick(pose, hand, GOALIE_STICK_LEN)
  spinWheels(pose, ctx)
}
