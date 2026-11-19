/**
 * Capa de tren superior (WP-32): stick a dos manos según `hand` (SPEC §7) y
 * conducción. La mano superior va al pomo y la inferior a `gripGap` por el
 * mango; con la pala a la derecha el pomo lo lleva la izquierda (un zurdo es
 * el espejo). La pala manda: el pomo sale de ella hacia el punto de agarre.
 *
 * Con bola, la pala va SIEMPRE sobre la bola de la física, abrazándola por el
 * borde del lado del jugador (de espaldas, por el exterior). Si la bola se
 * aleja, el tronco se inclina y las manos bajan por el mango hacia ella: el
 * mango nunca pasa en pantalla de `maxScreen` veces su largo. Los toques
 * alternos mueven la pala por el borde de la bola sin soltarla.
 */
import { RIG_FLOOR_FORESHORTEN, RIG_STANCE, STICK_BLADE, STICK_HOLD } from '../artSpec'
import { fallProgress } from './locomotion'
import type { PoseContext, PuppetPose } from './pose'
import { copy3, set3, v3, type V3 } from './vec'

const blade = v3()
const grip = v3()
const fit = v3()

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const TAU = Math.PI * 2

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

/** Talón de la pala para que su centro visual (`STICK_BLADE.len`) quede en `c` con la dirección `yaw`. */
export function placeBlade(pose: PuppetPose, c: V3, yaw: number) {
  const st = pose.stick
  st.bladeYaw = yaw
  set3(st.heel, c.x - Math.sin(yaw) * STICK_BLADE.len * 0.5, c.y, c.z - Math.cos(yaw) * STICK_BLADE.len * 0.5)
}

/**
 * Pomo hacia `toward` y mano inferior a `gripGap` del pomo. Si el mango mediría
 * en pantalla más de `maxScreen` veces su largo, el agarre baja por la recta
 * talón→agarre hasta ese largo (en profundidad el rig escorza más que la pista).
 * Devuelve la fracción recortada (0 = nada), para inclinar el tronco.
 */
export function gripStick(pose: PuppetPose, toward: V3): number {
  const st = pose.stick
  const c = Math.cos(pose.yaw)
  const sn = Math.sin(pose.yaw)
  const dx = toward.x - st.heel.x
  const dy = toward.y - st.heel.y
  const dz = toward.z - st.heel.z
  const sl = Math.hypot(-dx * c + dz * sn, -dy + (dx * sn + dz * c) * RIG_FLOOR_FORESHORTEN)
  const max = RIG_STANCE.stickLen * STICK_HOLD.maxScreen
  let cut = 0
  if (sl > max) {
    cut = 1 - max / sl
    set3(fit, st.heel.x + dx * (1 - cut), st.heel.y + dy * (1 - cut), st.heel.z + dz * (1 - cut))
  } else copy3(fit, toward)
  aimStick(pose, fit, RIG_STANCE.stickLen, true)
  const len = Math.hypot(st.top.x - st.heel.x, st.top.y - st.heel.y, st.top.z - st.heel.z) || 1
  st.lowerGrip = clamp(STICK_HOLD.gripGap / len, 0.15, 0.6)
  return cut
}

/** Agarre base del pomo: delante del vientre, del lado de la mano superior. */
export function baseGrip(pose: PuppetPose, s: number, out: V3): V3 {
  const p = pose.pelvis
  return set3(out, p.x - s * 0.05, p.y + 0.12, p.z + 0.1 + Math.sin(pose.trunk.pitch) * 0.12)
}

/**
 * Centro de la pala en el borde de la bola con el vaivén de los toques. Todo se
 * calcula en pantalla (x, y abajo): el suelo del rig está más escorzado que el
 * de la pista, así que en profundidad la bola cae más lejos en el marco del
 * cuerpo (`depthReach`). Devuelve el alcance de más respecto al reposo.
 */
function dribbleBlade(pose: PuppetPose, ctx: PoseContext, s: number): number {
  const H = STICK_HOLD
  const F = RIG_FLOOR_FORESHORTEN
  const fx = Math.sin(pose.yaw)
  const fz = Math.cos(pose.yaw)
  let X = -ctx.ball.x * fz + ctx.ball.z * fx
  let Z = ctx.ball.x * fx + ctx.ball.z * fz
  const r = Math.hypot(X, Z / RIG_STANCE.depthReach)
  if (r > H.maxReach) {
    X *= H.maxReach / r
    Z *= H.maxReach / r
  }
  // Toques alternos: uno por zancada en marcha; parado, a ritmo propio
  const ph = ctx.blend > 0.2 ? ctx.phase : ctx.time * 0.001 * TAU * H.dribbleHz
  const sway = Math.sin(ph)
  // Bola en pantalla: (X, Z·F), u = del jugador a la bola. La pala la abraza por detrás
  // cuando la bola va de lado en pantalla y por el lado del stick cuando va en profundidad
  // (de frente o de espaldas la bola la taparía o quedaría tras el cuerpo)
  let sx = X
  let sy = Z * F
  const sl = Math.hypot(sx, sy)
  const ux = sl > 1e-4 ? sx / sl : 0
  const uy = sl > 1e-4 ? sy / sl : 1
  const side = -s * fz // lado del stick en pantalla (el eje x del cuerpo se ve como −fz)
  sx += -ux * ux * ux * H.ballHug + side * uy * uy * H.ballHugSide - uy * sway * H.dribbleSway
  sy += -uy * ux * ux * H.ballHug + ux * sway * H.dribbleSway
  // La bola se pinta sobre su punto de apoyo: la pala no baja de él en pantalla (va tras ella)
  sy = Math.min(sy, Z * F)
  X = sx
  Z = sy / F
  set3(blade, -X * fz + Z * fx, 0, X * fx + Z * fz)
  placeBlade(pose, blade, Math.atan2(blade.x, blade.z) + s * 1.2 + sway * H.dribbleRock)
  return Math.max(0, r - RIG_STANCE.stickRest)
}

/** Stick del patinador, mano libre al esprintar sin bola y giro de cabeza hacia la bola. */
export function upperBody(pose: PuppetPose, ctx: PoseContext) {
  const S = RIG_STANCE
  const H = STICK_HOLD
  const s = ctx.stickSide === 1 ? 1 : -1
  const st = pose.stick
  st.visible = true
  st.topHand = ctx.stickSide === 1 ? 0 : 1

  const ballYaw = Math.atan2(ctx.ball.x, ctx.ball.z)
  let extra = 0
  if (ctx.carrying) {
    extra = Math.min(1, dribbleBlade(pose, ctx, s))
    pose.trunk.pitch += extra * H.reachLean
  } else {
    const a = clamp(ballYaw, -1.1, 1.1) * 0.5 + s * 0.32
    set3(blade, Math.sin(a) * S.stickRest, 0, Math.cos(a) * S.stickRest)
    placeBlade(pose, blade, a + s * 1.2)
  }

  baseGrip(pose, s, grip)
  if (extra > 0) {
    // Las manos siguen a la pala cuando la bola va lejos
    const h = Math.hypot(st.heel.x, st.heel.z) || 1
    grip.x += (st.heel.x / h) * extra * H.reachArms
    grip.z += (st.heel.z / h) * extra * H.reachArms
    grip.y -= extra * H.reachArms * 0.3
  }
  if (ctx.carrying) {
    // De espaldas: manos bajas y abiertas al lado del stick, el mango sale de la silueta
    const away = Math.max(0, -Math.cos(pose.yaw))
    grip.x += s * H.backOut * away
    grip.y -= H.backDrop * away
    pose.trunk.roll -= s * H.backRoll * away
  }
  pose.trunk.pitch += gripStick(pose, grip) * H.fitLean

  if (ctx.sprinting && !ctx.carrying) {
    // Sprint sin bola: stick a una mano y la otra braceando con la zancada
    st.lowerGrip = null
    const p = pose.pelvis
    set3(pose.hands[ctx.stickSide], p.x + s * 0.17, p.y + 0.1, p.z + 0.06 + Math.sin(ctx.phase) * 0.16)
  }

  // Caído: la mano baja suelta el mango y hace lo que diga la caída (brazos abiertos, apoyo, rodillas)
  if (fallProgress(ctx) >= 0) st.lowerGrip = null

  pose.headYaw = clamp(ballYaw, -1.2, 1.2) * 0.35
}
