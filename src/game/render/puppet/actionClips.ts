/**
 * Clips de acción del patinador (WP-32, SPEC §7) sobre la pose base de
 * `upperBody`: golpes por claves (pase, tiro, turbo, carga), robo, recepción y
 * celebración. Solo dependen del progreso `ctx.swing` (determinista en el lab)
 * y mezclan desde la pose base con un peso, así que entran y salen sin saltos.
 */
import { ACTION_ENVELOPE, ACTION_POSE, STICK_BLADE, STICK_CLIPS, STICK_HOLD } from '../artSpec'
import type { ActionType, PoseContext, PuppetPose } from './pose'
import { gripStick, placeBlade } from './upperBody'
import { copy3, lerp3, set3, v3, type V3 } from './vec'

type Keys = readonly (readonly number[])[]

const base = v3()
const target = v3()
const grip = v3()
const free = v3()
/** Muestra de las claves del golpe (sin asignar por frame). */
const K = { w: 0, a: 0, h: 0, r: 0, tw: 0, pitch: 0 }

const smooth = (u: number) => u * u * (3 - 2 * u)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Interpola ángulos por el camino corto. */
function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

/** Peso de un clip con ataque hasta `up` y relajación desde `down`. */
function envelope(t: number, up: number, down: number) {
  if (t < up) return smooth(t / up)
  if (t > down) return smooth((1 - t) / (1 - down))
  return 1
}

/** Centro actual de la pala. */
function bladeCenter(pose: PuppetPose, out: V3): V3 {
  const st = pose.stick
  const h = STICK_BLADE.len * 0.5
  return set3(out, st.heel.x + Math.sin(st.bladeYaw) * h, st.heel.y, st.heel.z + Math.cos(st.bladeYaw) * h)
}

/** Lee las claves en `t`. Las de peso 0 toman la forma de su vecina: solo se desvanece el peso. */
function sampleKeys(keys: Keys, t: number) {
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++
  const k0 = keys[i]
  const k1 = keys[i + 1]
  const u = smooth(clamp01((t - k0[0]) / (k1[0] - k0[0] || 1)))
  const a = k0[1] === 0 ? k1 : k0
  const b = k1[1] === 0 ? k0 : k1
  K.w = k0[1] + (k1[1] - k0[1]) * u
  K.a = a[2] + (b[2] - a[2]) * u
  K.h = a[3] + (b[3] - a[3]) * u
  K.r = a[4] + (b[4] - a[4]) * u
  K.tw = a[5] + (b[5] - a[5]) * u
  K.pitch = a[6] + (b[6] - a[6]) * u
}

/**
 * Golpe de stick: la pala recorre un arco alrededor de la pelvis (armado del
 * lado del stick, impacto delante, follow-through cruzado) sin pasar de
 * `maxBladeY` (stick alto). Los hombros y las manos acompañan el giro.
 */
function strike(pose: PuppetPose, keys: Keys, t: number, s: number) {
  sampleKeys(keys, t)
  if (K.w <= 0) return
  const st = pose.stick
  const p = pose.pelvis
  const w = K.w
  const a = s * K.a
  bladeCenter(pose, base)
  set3(target, p.x + Math.sin(a) * K.r, Math.min(K.h, STICK_HOLD.maxBladeY), p.z + Math.cos(a) * K.r)
  lerp3(target, base, target, w)
  copy3(grip, st.top)
  placeBlade(pose, target, lerpAngle(st.bladeYaw, a + s * 1.2, w))
  pose.trunk.twist += s * K.tw * w
  pose.trunk.pitch += K.pitch * w
  // Las manos giran con los hombros (menos que la pala) y suben con ella
  const ga = a * 0.45 * w
  const gx = grip.x - p.x
  const gz = grip.z - p.z
  grip.x = p.x + gx * Math.cos(ga) + gz * Math.sin(ga)
  grip.z = p.z - gx * Math.sin(ga) + gz * Math.cos(ga)
  grip.y += target.y * 0.25
  gripStick(pose, grip)
}

/** Robo: estocada a una mano hasta la punta de `getStickTip`, tronco adelante. */
function steal(pose: PuppetPose, ctx: PoseContext, t: number, s: number) {
  const A = ACTION_POSE
  const w = envelope(t, ACTION_ENVELOPE.steal[0], ACTION_ENVELOPE.steal[1])
  const st = pose.stick
  const p = pose.pelvis
  const tip = ctx.stickTip
  bladeCenter(pose, base)
  set3(target, tip.x, 0, tip.z)
  lerp3(target, base, target, w)
  copy3(grip, st.top)
  placeBlade(pose, target, lerpAngle(st.bladeYaw, Math.atan2(tip.x, tip.z) + s * 1.2, w))
  pose.trunk.pitch += A.stealLean * w
  pose.trunk.twist -= s * 0.25 * w
  grip.x += (tip.x - p.x) * A.stealArms * w
  grip.z += (tip.z - p.z) * A.stealArms * w
  gripStick(pose, grip)
  if (t > A.stealOneHand[0] && t < A.stealOneHand[1]) {
    // Brazo libre atrás, de contrapeso
    st.lowerGrip = null
    set3(pose.hands[ctx.stickSide], p.x + s * 0.22, p.y + 0.12, p.z - 0.12)
  }
}

/** Recepción: la pala cede hacia el cuerpo, las rodillas amortiguan y el tronco se vence sobre la bola. */
function receive(pose: PuppetPose, t: number, s: number) {
  const A = ACTION_POSE
  const w = envelope(t, ACTION_ENVELOPE.receive[0], ACTION_ENVELOPE.receive[1])
  const st = pose.stick
  const p = pose.pelvis
  bladeCenter(pose, base)
  const dx = p.x - base.x
  const dz = p.z - base.z
  const d = Math.hypot(dx, dz) || 1
  base.x += (dx / d) * A.cushion * w
  base.z += (dz / d) * A.cushion * w
  copy3(grip, st.top)
  grip.x += (dx / d) * A.cushion * w
  grip.z += (dz / d) * A.cushion * w
  placeBlade(pose, base, st.bladeYaw - s * 0.25 * w)
  gripStick(pose, grip)
  p.y -= A.cushionDip * w
  pose.trunk.pitch += A.cushionLean * w
}

/** Carga: stick bajo y cruzado, hombro contrario adelante, cuerpo agachado. */
function check(pose: PuppetPose, t: number, s: number) {
  strike(pose, STICK_CLIPS.check, t, s)
  pose.pelvis.y -= ACTION_POSE.checkDip * K.w
  pose.pelvis.z += ACTION_POSE.checkLunge * K.w
  pose.trunk.roll -= s * ACTION_POSE.checkRoll * K.w
}

/** Variante de celebración fija por jugador (0 = brazos arriba, 1 = puño). */
function celebrateStyle(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) | 0
  return (h >>> 2) & 1
}

/**
 * Celebración (se permite el stick alto: no hay juego). Tronco atrás y rodillas que
 * rebotan con cada sacudida; brazos arriba con el stick en alto o, en la variante «puño»,
 * stick a una mano inclinado hacia fuera y el puño libre subiendo y bajando.
 */
function celebrate(pose: PuppetPose, ctx: PoseContext, t: number, s: number) {
  const A = ACTION_POSE
  const w = envelope(t, ACTION_ENVELOPE.celebrate[0], ACTION_ENVELOPE.celebrate[1])
  const st = pose.stick
  const p = pose.pelvis
  const wave = Math.sin(t * Math.PI * 2 * A.pumps)
  const pump = wave * A.pump * w
  // La mano libre sale de su agarre en el mango
  if (st.lowerGrip !== null) lerp3(free, st.top, st.heel, st.lowerGrip)
  else copy3(free, pose.hands[ctx.stickSide])
  st.lowerGrip = null
  if (celebrateStyle(ctx.player.id) === 0) {
    set3(target, p.x + s * A.handsSide, A.handsY - pump, p.z + 0.05)
    lerp3(pose.hands[ctx.stickSide], free, target, w)
    set3(target, p.x - s * A.handsSide, A.handsY + pump, p.z + 0.05)
    lerp3(st.top, st.top, target, w)
    set3(target, st.top.x - s * 0.1, st.top.y + A.stickUp, st.top.z + 0.04)
  } else {
    const fist = A.fistLow + (A.fistHigh - A.fistLow) * (0.5 + 0.5 * wave)
    set3(target, p.x + s * A.fistSide, fist, p.z + 0.08)
    lerp3(pose.hands[ctx.stickSide], free, target, w)
    set3(target, p.x - s * A.stickHandSide, A.stickHandY - pump * 0.5, p.z + 0.04)
    lerp3(st.top, st.top, target, w)
    set3(target, st.top.x - s * A.stickUp * A.stickTilt * 2, st.top.y + A.stickUp, st.top.z + 0.02)
  }
  lerp3(st.heel, st.heel, target, w)
  pose.trunk.pitch += (A.celebrateBack - pose.trunk.pitch) * w
  pose.headYaw *= 1 - w
  // Cada sacudida flexiona un poco las rodillas
  p.y += (A.celebrateLift - A.bounce * Math.abs(wave)) * w
}

/** Aplica el clip de `action` con progreso `t`. */
export function playClip(pose: PuppetPose, ctx: PoseContext, action: ActionType, t: number) {
  const s = ctx.stickSide === 1 ? 1 : -1
  switch (action) {
    case 'pass':
    case 'shot':
    case 'turbo': return strike(pose, STICK_CLIPS[action], t, s)
    case 'steal': return steal(pose, ctx, t, s)
    case 'receive': return receive(pose, t, s)
    case 'check': return check(pose, t, s)
    case 'celebrate': return celebrate(pose, ctx, t, s)
    default: return
  }
}
