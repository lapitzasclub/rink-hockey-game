/**
 * Capa de acciones (mínima de WP-30; tiro, pase y carga llegan en WP-32):
 * el golpe de stick gira stick y hombros alrededor del cuerpo siguiendo el
 * mismo arco que `stickWorldAngle` (facing + sin(tπ)·1,1 en mundo).
 */
import type { PoseContext, PuppetPose } from './pose'
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

export function actions(pose: PuppetPose, ctx: PoseContext) {
  if (ctx.swing < 0 || !pose.stick.visible) return
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
