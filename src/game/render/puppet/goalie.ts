/**
 * Pose del portero (mínima de WP-30; paradas y desplazamientos en WP-33):
 * guardia agachada con las espinilleras juntas, stick a una mano (blocker) con
 * la pala atravesada delante de los patines y la manopla abierta al otro lado.
 */
import * as Phaser from 'phaser'
import { RIG_STANCE } from '../artSpec'
import type { PoseContext, PuppetPose } from './pose'
import { aimStick } from './upperBody'
import { set3, v3 } from './vec'

/** Largo del stick del portero (lo lleva corto, a una mano). */
const GOALIE_STICK_LEN = 0.46
const hand = v3()

export function goaliePose(pose: PuppetPose, ctx: PoseContext) {
  const S = RIG_STANCE
  const s = ctx.stickSide === 1 ? 1 : -1
  // Desplazamiento lateral: pasos cortos, sin zancada
  const shuffle = Math.sin(ctx.phase) * 0.03 * ctx.blend
  set3(pose.pelvis, shuffle, S.goaliePelvisY, -0.02)
  pose.trunk.pitch = S.goaliePitch
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const f = pose.feet[i]
    f.x = side * 0.11 + shuffle * (i === 0 ? 1 : -1) * 0.5
    f.z = 0.02
    f.yaw = side * 0.35
    set3(pose.kneePole[i], -side * 0.25, 0, 1)
    set3(pose.elbowPole[i], side, -0.6, 0.1)
  }
  const free = ctx.stickSide === 1 ? 0 : 1
  set3(pose.hands[free], -s * 0.24, 0.43, 0.17)

  const st = pose.stick
  st.visible = true
  st.topHand = ctx.stickSide
  st.lowerGrip = null
  st.bladeYaw = -s * Math.PI * 0.5
  set3(st.heel, s * 0.07, 0, 0.2)
  set3(hand, s * 0.2, 0.33, 0.2)
  aimStick(pose, hand, GOALIE_STICK_LEN)

  const ballYaw = Math.atan2(ctx.ball.x, ctx.ball.z)
  pose.headYaw = Phaser.Math.Clamp(ballYaw, -1.2, 1.2) * 0.3
}
