/**
 * Capa de tren superior (mínima de WP-30; la completa WP-32): stick a dos
 * manos, pala en el suelo hacia la bola (o sobre ella si la conduce) y mirada.
 * El stick tiene largo fijo: la pala manda y el pomo sale de ella hacia el
 * punto de agarre, así el brazo superior no tira del stick.
 */
import { RIG_STANCE } from '../artSpec'
import type { PoseContext, PuppetPose } from './pose'
import { BLADE_LEN } from './skeleton'
import { set3, v3 } from './vec'

const blade = v3()
const grip = v3()

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/**
 * Pone el stick con su largo desde el talón `heel` hacia el punto de agarre
 * `toward`. Lo usa también el portero.
 */
export function aimStick(pose: PuppetPose, toward: { x: number; y: number; z: number }, len: number, stretch = false) {
  const st = pose.stick
  const dx = toward.x - st.heel.x
  const dy = toward.y - st.heel.y
  const dz = toward.z - st.heel.z
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
  // `stretch`: si el agarre queda más lejos que el largo, el pomo va al agarre (alcance en profundidad)
  const l = stretch ? Math.max(len, d) : len
  set3(st.top, st.heel.x + (dx / d) * l, st.heel.y + (dy / d) * l, st.heel.z + (dz / d) * l)
}

/** Stick del patinador y giro de cabeza hacia la bola. */
export function upperBody(pose: PuppetPose, ctx: PoseContext) {
  const S = RIG_STANCE
  const s = ctx.stickSide === 1 ? 1 : -1
  const st = pose.stick
  st.visible = true
  st.topHand = ctx.stickSide === 1 ? 0 : 1
  st.lowerGrip = S.grip

  const ballYaw = Math.atan2(ctx.ball.x, ctx.ball.z)
  if (ctx.carrying) {
    // Centro de la pala sobre la bola. El alcance se mide en la vista con el fondo
    // comprimido: el suelo del rig está más escorzado que el de la pista, así que
    // en profundidad la pala llega más lejos para caer sobre la bola en pantalla
    const fx = Math.sin(pose.yaw)
    const fz = Math.cos(pose.yaw)
    let X = -ctx.ball.x * fz + ctx.ball.z * fx
    let Z = ctx.ball.x * fx + ctx.ball.z * fz
    const r = Math.hypot(X, Z / S.depthReach)
    if (r > S.reach) {
      X *= S.reach / r
      Z *= S.reach / r
    }
    set3(blade, -X * fz + Z * fx, 0, Math.max(0.14, X * fx + Z * fz))
  } else {
    const a = clamp(ballYaw, -1.1, 1.1) * 0.5 + s * 0.32
    set3(blade, Math.sin(a) * S.stickRest, 0, Math.cos(a) * S.stickRest)
  }
  // Pala casi transversal, con la punta hacia fuera del lado del stick
  st.bladeYaw = Math.atan2(blade.x, blade.z) + s * 1.2
  set3(st.heel, blade.x - Math.sin(st.bladeYaw) * BLADE_LEN * 0.5, 0, blade.z - Math.cos(st.bladeYaw) * BLADE_LEN * 0.5)

  // Agarre del pomo delante del vientre, del lado de la mano superior
  const p = pose.pelvis
  set3(grip, p.x - s * 0.05, p.y + 0.12, p.z + 0.1 + Math.sin(pose.trunk.pitch) * 0.12)
  aimStick(pose, grip, S.stickLen, true)

  pose.headYaw = clamp(ballYaw, -1.2, 1.2) * 0.35
}
