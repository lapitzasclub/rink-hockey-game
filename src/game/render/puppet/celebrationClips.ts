/**
 * Gestos de los parones (E-19): celebración del gol, cabizbajos, descanso, cruce de campo y
 * final. Lee `player.mood` (lo pone `systems/celebration.ts` en la simulación) y lo mezcla
 * sobre la pose de locomoción con su peso de entrada y salida, así que entra y sale sin saltos.
 * Patinadores en `skaterMood` (capa de acciones) y porteros en `goalieMood`/`goalieMoodKneel`.
 * Todo depende del tiempo y del estado: en el lab (dt = 0) la pose es determinista.
 */
import { CELEBRATION } from '../../constants'
import type { PlayerMood } from '../../types'
import { CEREMONY_POSE, MOOD_POSE as M, RIG_STANCE } from '../artSpec'
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
const grip = v3()

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const ramp = (a: number, b: number, v: number) => smooth01((v - a) / (b - a))
/** Campana 0 → 1 → 0 en t ∈ [0, 1]. */
const pulse = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t))
const wave = (ms: number, hz: number) => Math.sin(ms * 0.001 * TAU * hz)

/** Peso del gesto: entra en `fadeIn` desde `at` y sale en `CELEBRATION.fadeMs` antes de `until`. */
export function moodWeight(m: PlayerMood, now: number) {
  if (now < m.at || now >= m.until) return 0
  const fin = smooth01((now - m.at) / M.fadeIn)
  return m.until === Infinity ? fin : Math.min(fin, smooth01((m.until - now) / CELEBRATION.fadeMs))
}

/** Lleva `v` hacia (x, y, z) con peso `w`. */
function to(v: V3, x: number, y: number, z: number, w: number) {
  v.x += (x - v.x) * w
  v.y += (y - v.y) * w
  v.z += (z - v.z) * w
}

function lerpAngle(a: number, b: number, t: number) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
}

/** Centro de hombros de la pose actual (con el cabeceo y el ladeo del tronco). */
function shoulders(pose: PuppetPose): V3 {
  const p = pose.pelvis
  const a = pose.trunk.pitch
  const r = pose.trunk.roll
  return set3(sh, p.x + TRUNK * Math.sin(r), p.y + TRUNK * Math.cos(a) * Math.cos(r), p.z + TRUNK * Math.sin(a))
}

/** Punto relativo a los hombros girado con el ladeo `r` (plano x-y) y el giro `tw` (suelo). */
function aroundShoulders(c: V3, dx: number, dy: number, dz: number, r: number, tw: number, out: V3): V3 {
  const x = dx * Math.cos(r) + dy * Math.sin(r)
  const y = -dx * Math.sin(r) + dy * Math.cos(r)
  return set3(out, c.x + x * Math.cos(tw) + dz * Math.sin(tw), c.y + y, c.z - x * Math.sin(tw) + dz * Math.cos(tw))
}

/** La mano baja suelta el mango y queda donde agarraba: sale de ahí sin salto. */
function releaseGrip(pose: PuppetPose, fi: 0 | 1) {
  const st = pose.stick
  if (st.lowerGrip === null) return
  lerp3(pose.hands[fi], st.top, st.heel, st.lowerGrip)
  st.lowerGrip = null
}

/** Stick hacia pomo `t` y talón `h` con peso `w`; `yaw` NaN conserva la dirección de la pala. */
function stickTo(pose: PuppetPose, t: V3, h: V3, yaw: number, w: number) {
  const st = pose.stick
  lerp3(st.top, st.top, t, w)
  lerp3(st.heel, st.heel, h, w)
  if (!Number.isNaN(yaw)) st.bladeYaw = lerpAngle(st.bladeYaw, yaw, w)
}

/** Talón en el suelo a un largo de stick de la mano `t`, hacia `yaw` (marco del cuerpo). */
function floorHeel(t: V3, yaw: number, out: V3) {
  const r = Math.sqrt(Math.max(0.01, LEN * LEN - t.y * t.y))
  return set3(out, t.x + Math.sin(yaw) * r, 0, t.z + Math.cos(yaw) * r)
}

/** Talón a un largo de stick de la mano en la dirección (dx, dy, dz): stick en alto. */
function heelAlong(t: V3, dx: number, dy: number, dz: number, out: V3) {
  const l = Math.hypot(dx, dy, dz) || 1
  return set3(out, t.x + (dx / l) * LEN, t.y + (dy / l) * LEN, t.z + (dz / l) * LEN)
}

/** Sube la figura entera `h` (salto); la sombra se queda en el suelo. */
function raise(pose: PuppetPose, h: number) {
  pose.pelvis.y += h
  for (const f of pose.feet) f.y += h
  for (const hd of pose.hands) hd.y += h
  pose.stick.top.y += h
  pose.stick.heel.y += h
}

/** Salto en bucle (`t` ms, `phase` 0..1): se agacha antes de despegar. Devuelve la altura. */
function hop(pose: PuppetPose, t: number, phase: number) {
  const J = M.jump
  const c = (((t / J.period + phase) % 1) + 1) % 1
  if (c < 0.25) {
    pose.pelvis.y -= Math.sin((c / 0.25) * Math.PI) * J.crouch
    return 0
  }
  return Math.sin(((c - 0.25) / 0.75) * Math.PI) * J.h
}

/** De pie y erguido, zancada corta; `down` 0..1 agacha la cabeza. */
function relax(pose: PuppetPose, w: number, down: number) {
  const R = M.relax
  const k = 1 - (1 - R.stride) * w
  for (const f of pose.feet) { f.z *= k; f.y *= k; f.pitch *= k }
  pose.pelvis.y += (R.pelvisY - pose.pelvis.y) * w
  pose.trunk.pitch += (R.pitch + down * R.headDown - pose.trunk.pitch) * w
  pose.trunk.roll *= 1 - 0.6 * w
  pose.trunk.twist *= 1 - w
  pose.headYaw *= 1 - w
}

/** Stick a una mano, bajo: la pala delante o arrastrada detrás (`drag`); la otra mano suelta. */
function carry(pose: PuppetPose, w: number, s: number, fi: 0 | 1, drag: boolean) {
  const C = M.carry
  const p = pose.pelvis
  set3(top, p.x - s * C.handX, p.y - C.handDrop, p.z + C.handZ)
  const yaw = drag ? -s * C.dragYaw : s * C.yaw
  floorHeel(top, yaw, heel)
  stickTo(pose, top, heel, yaw + s * 1.2, w)
  to(pose.hands[fi], p.x + s * C.freeX, p.y - C.freeDrop, p.z + 0.03, w)
}

/** Puño de la mano libre que sube y baja. */
function fist(pose: PuppetPose, t: number, w: number, s: number, fi: 0 | 1) {
  const F = M.fist
  const c = shoulders(pose)
  const k = 0.5 + 0.5 * wave(t, F.hz)
  to(pose.hands[fi], c.x + s * F.x, c.y + F.low + (F.high - F.low) * k, c.z + F.z, w)
}

/** Brazos arriba en V con el stick en alto. */
function vArms(pose: PuppetPose, t: number, w: number, s: number, fi: 0 | 1) {
  const V = M.vArms
  pose.trunk.pitch += (V.pitch - pose.trunk.pitch) * w
  pose.headYaw *= 1 - w
  const c = shoulders(pose)
  const pump = wave(t, V.hz) * V.pump
  to(pose.hands[fi], c.x + s * V.x, c.y + V.y + pump, c.z + V.z, w)
  set3(top, c.x - s * V.x, c.y + V.y - pump, c.z + V.z)
  heelAlong(top, -s * 0.25, 0.95, 0.05, heel)
  stickTo(pose, top, heel, NaN, w)
}

/** Avión: brazos en cruz (el stick sigue al brazo) y alabeo de un lado a otro. */
function plane(pose: PuppetPose, t: number, w: number, s: number, fi: 0 | 1) {
  const P = M.plane
  const roll = wave(t, P.hz) * P.roll
  pose.trunk.roll += (roll - pose.trunk.roll) * w
  pose.trunk.pitch += (P.pitch - pose.trunk.pitch) * w
  pose.headYaw *= 1 - w
  const c = shoulders(pose)
  // Las alas siguen el alabeo: baja el brazo del lado al que se inclina
  to(pose.hands[fi], c.x + s * P.armX, c.y + P.armY - s * roll * P.armX, c.z - 0.02, w)
  set3(top, c.x - s * P.armX, c.y + P.armY + s * roll * P.armX, c.z - 0.02)
  heelAlong(top, -s, s * roll, 0.15, heel)
  stickTo(pose, top, heel, NaN, w)
}

/** De rodillas, deslizando: espinillas en el suelo, tronco atrás. */
function kneel(pose: PuppetPose, w: number) {
  const K = M.slide
  const p = pose.pelvis
  p.y += (K.pelvisY - p.y) * w
  p.z += (0.02 - p.z) * w
  pose.trunk.pitch += (K.pitch - pose.trunk.pitch) * w
  pose.trunk.roll *= 1 - w
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const f = pose.feet[i]
    to(f, side * 0.1, K.footY, K.footZ, w)
    f.pitch += (K.footPitch - f.pitch) * w
    f.yaw *= 1 - w
    f.roll *= 1 - w
    to(pose.kneePole[i], side * 0.1, K.poleY, 1, w)
  }
}

/** Señala a la grada con la mano libre; el stick, vertical en alto. */
function point(pose: PuppetPose, t: number, w: number, s: number, fi: 0 | 1) {
  const P = M.point
  pose.trunk.twist += (s * P.twist - pose.trunk.twist) * w
  const c = shoulders(pose)
  const jab = Math.max(0, wave(t, 1.2)) * 0.04
  to(pose.hands[fi], c.x + s * P.x, c.y + P.y, c.z + P.z + jab, w)
  set3(top, c.x - s * 0.18, c.y + P.stickY, c.z + 0.03)
  heelAlong(top, -s * 0.3, 0.92, 0.1, heel)
  stickTo(pose, top, heel, NaN, w)
}

/** Puño estirado arriba (salto) y stick en alto hacia fuera. */
function fistUp(pose: PuppetPose, w: number, s: number, fi: 0 | 1) {
  const c = shoulders(pose)
  to(pose.hands[fi], c.x + s * 0.13, c.y + 0.28, c.z + 0.05, w)
  set3(top, c.x - s * 0.22, c.y + 0.06, c.z + 0.04)
  heelAlong(top, -s * 0.35, 0.9, 0.05, heel)
  stickTo(pose, top, heel, NaN, w)
}

/** Choque de manos con la mano libre hacia el lado `side` del compañero. */
function five(pose: PuppetPose, w: number, s: number, fi: 0 | 1, side: number) {
  const F = M.five
  const c = shoulders(pose)
  to(pose.hands[fi], c.x + side * (side === s ? F.x : 0.06), c.y + F.y, c.z + F.z, w)
}

/** Autor: carrera (avión o puño) y, al llegar, su celebración. Devuelve la altura del salto. */
function score(pose: PuppetPose, ctx: PoseContext, m: PlayerMood, w: number, wa: number, u: number, s: number, fi: 0 | 1) {
  const run = w * (1 - wa)
  const fin = w * wa
  if (run > 0) {
    if (m.style === 0) plane(pose, ctx.time, run, s, fi)
    else { carry(pose, run, s, fi, false); fist(pose, ctx.time, run, s, fi) }
  }
  if (fin <= 0) return 0
  // E-21: gol con peso, salta más alto (y salta aunque su gesto sea de pie)
  const big = m.big ?? 0
  const jump = big > 0 && m.style !== 1 ? hop(pose, u, 0) * fin * big * CEREMONY_POSE.bigHop : 0
  switch (m.style) {
    case 0: relax(pose, fin, 0); vArms(pose, u, fin, s, fi); return jump
    case 1: kneel(pose, fin); vArms(pose, u, fin, s, fi); return 0
    case 2: { relax(pose, fin, 0); const h = hop(pose, u, 0); fistUp(pose, fin, s, fi); return h * fin * (1 + big * CEREMONY_POSE.bigHop) }
    case 4: relax(pose, fin, 0); three(pose, u, fin, s, fi); return jump
    default: relax(pose, fin, 0); point(pose, u, fin, s, fi); return jump
  }
}

/** Hat-trick (E-21): la mano libre en alto marca tres veces y se queda arriba; el stick, alzado. */
function three(pose: PuppetPose, t: number, w: number, s: number, fi: 0 | 1) {
  const T = CEREMONY_POSE.hat
  pose.trunk.twist += (s * T.twist - pose.trunk.twist) * w
  const c = shoulders(pose)
  const jab = t < T.ms * 3 ? pulse((t % T.ms) / T.ms) * T.jab : 0
  to(pose.hands[fi], c.x + s * T.x, c.y + T.y + jab, c.z + T.z, w)
  set3(top, c.x - s * 0.2, c.y + 0.08, c.z + 0.04)
  heelAlong(top, -s * 0.3, 0.9, 0.05, heel)
  stickTo(pose, top, heel, NaN, w)
}

/** Compañero: llega con el puño arriba y, en la piña, brazo al hombro o sticks arriba. */
function mate(pose: PuppetPose, ctx: PoseContext, m: PlayerMood, w: number, wa: number, u: number, s: number, fi: 0 | 1) {
  const run = w * (1 - wa)
  const fin = w * wa
  if (run > 0) { carry(pose, run, s, fi, false); fist(pose, ctx.time, run, s, fi) }
  if (fin <= 0) return
  const H = M.hug
  relax(pose, fin, 0)
  pose.trunk.pitch += (H.pitch - pose.trunk.pitch) * fin
  pose.pelvis.y -= Math.abs(Math.sin(u * 0.001 * Math.PI * H.hz)) * H.bounce * fin
  if (m.style === 0) {
    carry(pose, fin, s, fi, false)
    const c = shoulders(pose)
    to(pose.hands[fi], c.x + s * H.x, c.y + H.y, c.z + H.z, fin)
    return
  }
  const L = M.clash
  const c = shoulders(pose)
  const pump = wave(u, L.hz) * L.pump
  set3(top, c.x - s * 0.06, c.y + L.y + pump, c.z + L.z)
  heelAlong(top, s * 0.08, 0.75, 0.65, heel)
  stickTo(pose, top, heel, NaN, fin)
  lerp3(grip, top, heel, 0.3)
  to(pose.hands[fi], grip.x, grip.y, grip.z, fin)
}

/**
 * Cabizbajo, exagerado para leerse a escala de pista. Al encajar se hunde (tronco caído,
 * cabeza baja, stick colgando de una mano y el otro brazo muerto); pasado `settle` cambia a
 * su variante, que sigue viva: manos en las rodillas resoplando, en la cadera negando con
 * la cabeza (la simulación lo pone de espaldas al gol) o mano al casco meciéndose.
 * Patinando solo se encorva y arrastra el stick.
 */
function down(pose: PuppetPose, ctx: PoseContext, m: PlayerMood, w: number, s: number, fi: 0 | 1) {
  const D = M.down
  const S = D.slump
  relax(pose, w, 1)
  carry(pose, w, s, fi, true)
  const p = pose.pelvis
  const t = ctx.time - m.at
  // Encorvado también al deslizarse despacio; los brazos y el stick, solo ya parado
  const wl = w * (1 - ramp(D.slow0, D.slow1, ctx.speedRatio))
  if (wl <= 0) return
  p.y += (S.pelvisY - p.y) * wl
  pose.trunk.pitch += (S.pitch - pose.trunk.pitch) * wl
  pose.headYaw *= 1 - wl
  pose.headLean.z += D.headZ * wl
  const ws = w * (1 - ramp(D.still0, D.still1, ctx.speedRatio))
  if (ws <= 0) return
  set3(top, p.x - s * S.handX, p.y + S.handY, p.z + S.handZ)
  floorHeel(top, -s * S.yaw, heel)
  stickTo(pose, top, heel, -s * S.yaw + s * 1.2, ws)
  let c = shoulders(pose)
  to(pose.hands[fi], c.x + s * S.freeX, c.y - S.freeDrop, c.z + S.freeZ, ws)
  const wb = ws * ramp(D.settle, D.settle + D.settleMs, t)
  if (wb <= 0) return
  if (m.style === 0) {
    const K = M.knees
    const hv = wave(t, K.hz) * K.heave
    p.y += (K.pelvisY - p.y) * wb
    pose.trunk.pitch += (K.pitch + hv - pose.trunk.pitch) * wb
    to(pose.hands[fi], p.x + s * K.handX, K.handY, p.z + K.handZ, wb)
    set3(top, p.x - s * K.handX, K.handY, p.z + K.handZ)
    floorHeel(top, s * 0.3, heel)
    stickTo(pose, top, heel, s * 1.5, wb)
    return
  }
  if (m.style === 1) {
    const H = M.hips
    pose.trunk.pitch += (H.pitch - pose.trunk.pitch) * wb
    pose.headYaw += wave(t - D.settle, H.shakeHz) * H.shake * wb
    c = shoulders(pose)
    to(pose.hands[fi], c.x + s * H.x, c.y + H.y, c.z + H.z, wb)
    set3(top, c.x - s * H.x, c.y + H.y, c.z + H.z)
    floorHeel(top, -s * H.yaw, heel)
    stickTo(pose, top, heel, -s * H.yaw + s * 1.2, wb)
    for (let i = 0; i < 2; i++) to(pose.elbowPole[i], i === 0 ? -1 : 1, 0, -0.5, wb)
    return
  }
  const H = M.helmet
  pose.trunk.pitch += (H.pitch - pose.trunk.pitch) * wb
  pose.trunk.roll += wave(t - D.settle, H.rockHz) * H.rock * wb
  c = shoulders(pose)
  to(pose.hands[fi], c.x + s * H.x, c.y + H.y, c.z + H.z + Math.sin(pose.trunk.pitch) * 0.14, wb)
  to(pose.elbowPole[fi], s, 0.6, 0.2, wb)
}

/** Estiramientos del descanso: stick por encima de la cabeza, ladeo o giro con el stick en la nuca. */
function stretch(pose: PuppetPose, t: number, w: number, style: number, s: number, fi: 0 | 1) {
  const S = M.stretch
  const ph = wave(t, S.hz)
  if (style === 1) {
    pose.trunk.roll += (-s * S.roll * (0.75 + 0.25 * ph) - pose.trunk.roll) * w
    const c = shoulders(pose)
    aroundShoulders(c, -s * 0.05, 0.3, 0, pose.trunk.roll, 0, grip)
    to(pose.hands[fi], grip.x, grip.y, grip.z, w)
    return
  }
  const overhead = style === 0
  const r = overhead ? ph * S.roll * 0.8 : 0
  const tw = overhead ? 0 : ph * S.twist
  pose.trunk.roll += (r - pose.trunk.roll) * w
  pose.trunk.twist += (tw - pose.trunk.twist) * w
  pose.trunk.pitch += ((overhead ? 0 : 0.05) - pose.trunk.pitch) * w
  const c = shoulders(pose)
  const dy = overhead ? 0.27 : 0.04
  const dz = overhead ? 0.01 : -0.07
  aroundShoulders(c, -s * 0.24, dy, dz, r, tw, top)
  aroundShoulders(c, -s * 0.24 + s * LEN, dy, dz, r, tw, heel)
  stickTo(pose, top, heel, NaN, w)
  lerp3(grip, top, heel, overhead ? 0.7 : 0.8)
  to(pose.hands[fi], grip.x, grip.y, grip.z, w)
}

/**
 * Capa de gesto del patinador: la llama `actions` antes de los clips. Sin gesto en curso
 * (o caído) no toca la pose.
 */
export function skaterMood(pose: PuppetPose, ctx: PoseContext) {
  const m = ctx.player.mood
  if (!m) return
  const w = moodWeight(m, ctx.time)
  if (w <= 0 || fallProgress(ctx) >= 0) return
  const s = ctx.stickSide === 1 ? 1 : -1
  const fi = ctx.stickSide
  const u = m.hit === Infinity || ctx.time < m.hit ? -1 : ctx.time - m.hit
  const wa = u < 0 ? 0 : smooth01(u / M.arrive)
  releaseGrip(pose, fi)
  let lift = 0
  switch (m.kind) {
    case 'score': lift = score(pose, ctx, m, w, wa, u, s, fi); break
    case 'mate': mate(pose, ctx, m, w, wa, u, s, fi); break
    case 'joy': {
      const run = w * (1 - wa)
      if (run > 0) { carry(pose, run, s, fi, false); fist(pose, ctx.time, run, s, fi) }
      const fin = w * wa
      if (fin > 0) {
        relax(pose, fin, 0)
        lift = hop(pose, u, m.style * 0.45) * fin
        vArms(pose, u, fin, s, fi)
      }
      break
    }
    case 'down': down(pose, ctx, m, w, s, fi); break
    case 'rest': {
      relax(pose, w, 0)
      carry(pose, w, s, fi, false)
      const S = M.stretch
      const start = m.hit === Infinity ? m.at + S.delay : m.hit + M.five.ms
      const out = m.until === Infinity ? 1 : smooth01((m.until - CELEBRATION.fadeMs - ctx.time) / S.ramp)
      const ws = w * Math.min(smooth01((ctx.time - start) / S.ramp), out)
      if (ws > 0) stretch(pose, ctx.time - start, ws, m.style, s, fi)
      if (u >= 0) five(pose, w * pulse(u / M.five.ms), s, fi, s)
      break
    }
    case 'cross':
      relax(pose, w, 0)
      carry(pose, w, s, fi, false)
      if (u >= 0) five(pose, w * pulse(u / M.five.ms), s, fi, m.side)
      break
    case 'greet': {
      relax(pose, w, 0)
      carry(pose, w, s, fi, false)
      const S = M.shake
      if (u >= 0 && u < S.ms) {
        const p = pose.pelvis
        const e = ramp(0, 0.2, u / S.ms) * (1 - ramp(0.8, 1, u / S.ms))
        to(pose.hands[fi], p.x + s * 0.05, p.y + S.y + wave(u, S.hz) * S.amp, p.z + S.z, w * e)
      }
      break
    }
  }
  keepReach(pose)
  if (lift > 0) raise(pose, lift)
}

/** Peso de rodillas del portero con su gesto: de rodillas cabizbajo (variante 1) o de pie. */
export function goalieMoodKneel(ctx: PoseContext, k: number) {
  const m = ctx.player.mood
  if (!m) return k
  const w = moodWeight(m, ctx.time)
  if (w <= 0) return k
  const target = m.kind === 'keeperDown' && m.style === 1 ? 1 : 0
  return k + (target - k) * w
}

/**
 * Gesto del portero sobre su postura: `hand` es el agarre del stick (el pomo sale de la
 * pala hacia él) y `s` = ±1 lado del stick. Devuelve false si no hay gesto en curso.
 */
export function goalieMood(pose: PuppetPose, ctx: PoseContext, hand: V3, s: number): boolean {
  const m = ctx.player.mood
  if (!m) return false
  const w = moodWeight(m, ctx.time)
  if (w <= 0) return false
  const free = ctx.stickSide === 1 ? 0 : 1
  const st = pose.stick
  const p = pose.pelvis
  const mitt = pose.hands[free]
  const life = ctx.time - m.at
  if (m.kind === 'keeperDown') {
    const P = M.goalie
    if (m.style === 1) {
      // De rodillas, hundido: manopla y stick caídos sobre los pads
      pose.trunk.pitch += 0.5 * w
      pose.headYaw *= 1 - w
      to(mitt, -s * 0.2, 0.26, 0.16, w)
      to(hand, s * 0.2, 0.24, 0.18, w)
      return true
    }
    // De pie: golpes de stick al suelo y después cabeza gacha
    const tap = life < 1800 ? Math.max(0, Math.sin((life / 1800) * TAU * 3)) * w : 0
    pose.trunk.pitch += 0.36 * w
    pose.headYaw *= 1 - w
    to(mitt, -s * P.mittX, P.mittY - 0.04, 0.08, w)
    hand.y += tap * 0.18
    st.heel.y += tap * 0.13
    return true
  }
  const G = M.goalie
  p.y += (G.pelvisY - p.y) * w
  pose.trunk.pitch += (G.pitch - pose.trunk.pitch) * w
  pose.headYaw *= 1 - w
  to(mitt, -s * G.mittX, G.mittY, 0.06, w)
  to(hand, s * G.handX, G.handY, G.handZ, w)
  to(st.heel, s * 0.14, 0, 0.32, w)
  // Al cruzar patina hacia delante (su postura solo da pasos laterales)
  const mv = ctx.blend * w
  for (let i = 0; i < 2; i++) {
    const ph = ctx.phase + i * Math.PI
    pose.feet[i].z += Math.cos(ph) * G.stride * mv
    pose.feet[i].y += Math.max(0, Math.sin(ph)) * G.lift * mv
  }
  const u = m.hit === Infinity || ctx.time < m.hit ? -1 : ctx.time - m.hit
  if (m.kind === 'joy') {
    // Brazos arriba, stick en alto y saltos
    to(mitt, -s * 0.2, 1.0, 0.05, w)
    to(hand, s * 0.2, 1.0, 0.05, w)
    to(st.heel, hand.x + s * 0.1, hand.y + 0.42, hand.z + 0.02, w)
    const h = hop(pose, life, m.style * 0.45) * w
    p.y += h
    for (const f of pose.feet) f.y += h
    mitt.y += h
    hand.y += h
    st.heel.y += h
  } else if (m.kind === 'cross' && u >= 0) {
    to(mitt, -s * 0.16, 0.98, 0.12, w * pulse(u / M.five.ms))
  } else if (m.kind === 'greet' && u >= 0 && u < M.shake.ms) {
    to(mitt, -s * 0.04, 0.6 + wave(u, M.shake.hz) * M.shake.amp, 0.3, w * pulse(u / M.shake.ms))
  }
  return true
}
