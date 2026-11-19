import type { TeamColor } from '../../types'
import { CROWD, HAIR_COLORS, RIG_OUTLINE, SKIN_TONES, STANDS_COLORS as SC } from '../artSpec'
import { HANDS, TOP, paintSideFan, type SidePaint } from './sideFan'

/**
 * Público de las gradas (WP-68): bustos sentados en estilo A (silueta con
 * contorno fino, sombra propia a la derecha), de cara, de tres cuartos
 * (`sideFan.ts`) o de espaldas según desde dónde los ve la cámara. Todo se pinta en canvas una vez; aquí no
 * hay nada por fotograma. Unidades: metros de figura × `k` (px por metro).
 */

/** Ropa del público neutro (se apaga con `desat` y la luz de la fila). */
const SHIRTS = [
  0x2d3848, 0x3b4252, 0x5b6270, 0x8d939c, 0xb9bcc0, 0x2a2d33, 0x6b4a3a, 0x4a5a3a,
  0x7a3b3b, 0x3a5a7a, 0xa08850, 0x4a6e8a, 0x6a4a6a, 0x1f4f8f, 0x9a2f33, 0x2f3d2f,
]
const TROUSERS = [0x23272e, 0x2c3440, 0x3a4656, 0x4a4238, 0x1c1f24]
const EXTRA_HAIR = [0x8a8a8a, 0x5a4636]
const BEANIES = [0x2a2d33, 0x7a3b3b, 0x3a5a7a, 0x8d939c, 0xa08850]
/** Lo que asoma bajo la chaqueta o los cordones de la sudadera. */
const INNERS = [0xd8d8d0, 0xb9bcc0, 0x2a2d33, 0x8d939c, 0x6b7a8a]

export interface FanLook {
  shirt: number
  trousers: number
  skin: number
  hair: number
  /** 0 corto, 1 largo, 2 calvo, 3 coleta. */
  hairStyle: number
  beanie: number | null
  scarf: number | null
  scarf2: number
  bulk: number
  tall: number
  /** En el gol: 0 salta con los brazos en V, 1 sostiene la bufanda en alto, 2 puños arriba. */
  cheer: number
  /** Prenda de arriba (`TOP`), color de lo que asoma (camiseta de debajo, cordones, ribete) y manos (`HANDS`). */
  top: number
  inner: number
  hands: number
}

const pick = <T>(list: readonly T[], r: () => number) => list[Math.floor(r() * list.length)]

/** Atuendo de un espectador. `team` = color de la peña (o null) y `kit` su camiseta. */
export function makeLook(r: () => number, team: TeamColor | null, kit: number, kit2: number): FanLook {
  const pena = team !== null
  const shirt = pena && r() < CROWD.penaShirt ? kit : pick(SHIRTS, r)
  const scarfRate = pena ? CROWD.penaScarf : CROWD.scarfRate
  const scarf = r() < scarfRate ? (pena ? kit : pick(BEANIES, r)) : null
  const beanie = r() < CROWD.beanieRate * (pena ? 1.6 : 1) ? (pena && r() < 0.6 ? kit : pick(BEANIES, r)) : null
  const h = r()
  const t = r()
  const top = t < CROWD.jacketRate ? TOP.jacket : t < CROWD.jacketRate + CROWD.hoodieRate ? TOP.hoodie
    : t < CROWD.jacketRate + CROWD.hoodieRate + CROWD.sportRate || shirt === kit ? TOP.sport : TOP.tee
  const hd = r()
  const hands = hd < CROWD.phoneRate ? HANDS.phone : hd < 0.45 ? HANDS.knees : hd < 0.72 ? HANDS.crossed : HANDS.lap
  return {
    shirt,
    trousers: pick(TROUSERS, r),
    skin: pick(SKIN_TONES, r),
    hair: r() < 0.15 ? pick(EXTRA_HAIR, r) : pick(HAIR_COLORS, r),
    hairStyle: h < CROWD.baldRate ? 2 : h < CROWD.baldRate + CROWD.longHairRate ? 1 : h > 0.93 ? 3 : 0,
    beanie,
    scarf,
    scarf2: pena ? kit2 : 0xd8d8d0,
    bulk: 0.9 + r() * 0.22,
    tall: 0.94 + r() * 0.12,
    cheer: scarf !== null && r() < 0.5 ? 1 : r() < 0.7 ? 0 : 2,
    top,
    inner: top === TOP.sport ? (pena ? kit2 : pick(BEANIES, r)) : pick(INNERS, r),
    hands,
  }
}

// ─── Color ───────────────────────────────────────────────────────────────────

/** Apaga un color: mezcla con su gris (`SC.desat`) y lo multiplica por `light`. */
export function shade(color: number, light: number, desat: number = SC.desat, alpha = 1) {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  const y = r * 0.3 + g * 0.59 + b * 0.11
  const f = (c: number) => Math.max(0, Math.min(255, Math.round((c + (y - c) * desat) * light)))
  return alpha >= 1 ? `rgb(${f(r)},${f(g)},${f(b)})` : `rgba(${f(r)},${f(g)},${f(b)},${alpha})`
}

const OUTLINE = (() => {
  const c = RIG_OUTLINE.color
  return `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${CROWD.outlineAlpha})`
})()
/** Sombra propia: fracción del tono iluminado. */
const SHADOW = 0.68

// ─── Pintado ─────────────────────────────────────────────────────────────────

export interface FanPose {
  /** −1..1: hacia dónde gira la cara en pantalla. */
  turn: number
  back: boolean
  /** Celebración: de pie y con los brazos arriba. */
  cheer: boolean
  /** Solo los brazos levantados (capa de la grada cercana). */
  armsOnly?: boolean
}

/** Altura de la cadera al ponerse de pie (m). */
export const STAND_UP_M = 0.42

/** Caja del busto respecto a la cadera, en metros de figura: [izq, arriba, der, abajo]. */
export function fanExtent(pose: FanPose): [number, number, number, number] {
  if (pose.cheer) return [-0.62, -1.62 - STAND_UP_M, 0.62, 0.2]
  if (Math.abs(pose.turn) > 0.45 && !pose.back) return [-0.62, -1.02, 0.62, 0.32]
  if (pose.armsOnly) return [-0.62, -1.62, 0.62, -0.3]
  return [-0.42, -0.98, 0.42, 0.2]
}

/**
 * Pinta un espectador con la cadera en (x, y). `k` = px por metro de figura,
 * `light` = luz de su fila.
 */
export function paintFan(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, look: FanLook, light: number, pose: FanPose) {
  const { turn, back } = pose
  const at = Math.abs(turn)
  const side = turn >= 0 ? 1 : -1
  const lit = (c: number) => shade(c, light)
  const dim = (c: number) => shade(c, light * SHADOW)
  ctx.lineWidth = CROWD.outline
  ctx.strokeStyle = OUTLINE
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const hy = pose.cheer ? y - STAND_UP_M * k : y
  const tall = look.tall
  const sw = 0.24 * look.bulk * (1 - 0.4 * at)
  const hw = 0.19 * look.bulk * (1 - 0.3 * at)
  const shoulderY = hy - 0.44 * tall * k
  const topY = hy - 0.585 * tall * k
  const headX = x + turn * 0.035 * k
  const headY = hy - 0.75 * tall * k
  const hr = 0.165 * k

  if (pose.armsOnly) {
    paintArms(ctx, x, shoulderY, hy, k, sw, look, light, turn, back)
    return
  }
  if (!back && at > 0.45) {
    paintSideFan(ctx, x, y, k, look, side, pose.cheer, sidePaint(ctx, x, k, look, light))
    return
  }

  // Regazo (de cara, sentado) o cintura (de pie): pantalón en sombra
  if (!back) {
    ctx.fillStyle = dim(look.trousers)
    ctx.beginPath()
    if (pose.cheer) ctx.rect(x - hw * k, hy - 0.02 * k, hw * 2 * k, 0.24 * k)
    else ctx.ellipse(x + turn * 0.14 * k, y + 0.05 * k, (0.2 + 0.08 * at) * k, 0.085 * k, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Brazos en V por detrás del cuerpo (los de la bufanda van por delante)
  if (pose.cheer && look.cheer !== 1) paintArms(ctx, x, shoulderY, hy, k, sw, look, light, turn, back)

  // Torso: sombra entera y luz recortada hacia la izquierda; contorno
  const bottom = hy + (pose.cheer ? 0.04 : 0.02) * k
  ctx.fillStyle = dim(look.shirt)
  torsoPath(ctx, x, k, -sw, sw, -hw, hw, topY, shoulderY, bottom)
  ctx.fill()
  ctx.fillStyle = lit(look.shirt)
  torsoPath(ctx, x, k, -sw, sw * 0.5, -hw, hw * 0.45, topY, shoulderY, bottom)
  ctx.fill()
  torsoPath(ctx, x, k, -sw, sw, -hw, hw, topY, shoulderY, bottom)
  ctx.stroke()

  // Bufanda al cuello (de cara: con la punta colgando)
  if (look.scarf !== null && !(pose.cheer && look.cheer === 1)) {
    ctx.fillStyle = lit(look.scarf)
    ctx.beginPath()
    ctx.rect(x - sw * 0.66 * k, topY + 0.02 * k, sw * 1.32 * k, 0.09 * k)
    if (!back) ctx.rect(x + (0.04 - turn * 0.08) * k, topY + 0.06 * k, 0.085 * k, 0.24 * k)
    ctx.fill()
    ctx.fillStyle = lit(look.scarf2)
    ctx.fillRect(x - sw * 0.66 * k, topY + 0.055 * k, sw * 1.32 * k, 0.02 * k)
  }

  // Cuello
  ctx.fillStyle = dim(look.skin)
  ctx.fillRect(headX - 0.055 * k, headY + hr * 0.6, 0.11 * k, topY - headY - hr * 0.5)

  // Cabeza: de espaldas casi todo es pelo
  const bald = look.hairStyle === 2 && look.beanie === null
  if (back) {
    ctx.fillStyle = bald ? lit(look.skin) : dim(look.hair)
    circle(ctx, headX, headY, hr)
    ctx.fill()
    if (!bald) {
      ctx.fillStyle = lit(look.hair)
      circle(ctx, headX - hr * 0.18, headY - hr * 0.16, hr * 0.7)
      ctx.fill()
      if (look.hairStyle === 1) {
        ctx.fillStyle = dim(look.hair)
        ctx.fillRect(headX - hr * 0.8, headY, hr * 1.6, hr * 1.25)
      }
    }
  } else {
    ctx.fillStyle = dim(look.skin)
    circle(ctx, headX, headY, hr)
    ctx.fill()
    ctx.fillStyle = lit(look.skin)
    circle(ctx, headX - hr * 0.12, headY - hr * 0.1, hr * 0.84)
    ctx.fill()
    if (!bald && look.beanie === null) paintHair(ctx, headX, headY, hr, look, light, turn, side, at)
    // Ojos: dos puntos de cara, uno de perfil
    ctx.fillStyle = shade(0x161210, light)
    const ex = headX + turn * hr * 0.42
    const ey = headY + hr * 0.08
    const er = Math.max(0.35, hr * 0.12)
    if (at < 0.75) {
      ctx.fillRect(ex - hr * 0.36 - er, ey - er, er * 2, er * 2)
      ctx.fillRect(ex + hr * 0.36 - er, ey - er, er * 2, er * 2)
    } else {
      ctx.fillRect(headX + side * hr * 0.55 - er, ey - er, er * 2, er * 2)
    }
  }
  circle(ctx, headX, headY, hr)
  ctx.stroke()

  if (look.beanie !== null) {
    // Gorro de lana con vuelta y pompón
    ctx.fillStyle = lit(look.beanie)
    ctx.beginPath()
    ctx.arc(headX, headY - hr * 0.05, hr * 1.04, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = dim(look.beanie)
    ctx.fillRect(headX - hr * 1.04, headY - hr * 0.22, hr * 2.08, hr * 0.3)
    ctx.fillStyle = lit(look.scarf2)
    circle(ctx, headX, headY - hr * 1.12, hr * 0.3)
    ctx.fill()
  }

  if (pose.cheer && look.cheer === 1) paintScarfUp(ctx, x, shoulderY, hy, k, sw, look, light)
}

/** Pinceles del busto de tres cuartos con la luz de la fila. */
function sidePaint(ctx: CanvasRenderingContext2D, x: number, k: number, look: FanLook, light: number): SidePaint {
  return {
    lit: c => shade(c, light),
    dim: c => shade(c, light * SHADOW),
    tone: (c, f) => shade(c, light * f),
    outline: OUTLINE,
    standUp: STAND_UP_M,
    arms: (hy, shoulderY, sw, turn) => paintArms(ctx, x, shoulderY, hy, k, sw, look, light, turn, false),
    scarfUp: (hy, shoulderY, sw) => paintScarfUp(ctx, x, shoulderY, hy, k, sw, look, light),
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

/** Silueta del torso: caderas abajo, hombros redondeados arriba (semianchos en m). */
function torsoPath(ctx: CanvasRenderingContext2D, x: number, k: number, ls: number, rs: number, lh: number, rh: number, top: number, sh: number, bottom: number) {
  ctx.beginPath()
  ctx.moveTo(x + lh * k, bottom)
  ctx.lineTo(x + ls * k, sh)
  ctx.quadraticCurveTo(x + ls * k, top, x + ls * 0.45 * k, top)
  ctx.lineTo(x + rs * 0.45 * k, top)
  ctx.quadraticCurveTo(x + rs * k, top, x + rs * k, sh)
  ctx.lineTo(x + rh * k, bottom)
  ctx.closePath()
}

/** Pelo de frente o de perfil: casquete arriba y, girado, la nuca. */
function paintHair(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, look: FanLook, light: number, turn: number, side: number, at: number) {
  ctx.fillStyle = shade(look.hair, light)
  ctx.beginPath()
  ctx.arc(hx - turn * r * 0.2, hy - r * 0.08, r * 1.02, Math.PI * 1.02, Math.PI * 1.98)
  ctx.quadraticCurveTo(hx, hy - r * 0.55, hx - turn * r * 0.2 - r * 1.02, hy - r * 0.08)
  ctx.fill()
  if (at > 0.35) {
    // Nuca hacia el lado contrario a la cara
    ctx.beginPath()
    ctx.ellipse(hx - side * r * 0.42, hy - r * 0.05, r * 0.62, r * 0.88, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (look.hairStyle === 1) {
    // Melena: mechones a los lados (o detrás, de perfil)
    ctx.fillStyle = shade(look.hair, light * SHADOW)
    if (at > 0.5) ctx.fillRect(hx - side * r * 1.0, hy - r * 0.2, r * 0.75, r * 1.35)
    else {
      ctx.fillRect(hx - r * 1.02, hy - r * 0.2, r * 0.36, r * 1.2)
      ctx.fillRect(hx + r * 0.66, hy - r * 0.2, r * 0.36, r * 1.2)
    }
  } else if (look.hairStyle === 3) {
    ctx.beginPath()
    ctx.arc(hx - side * r * (at > 0.4 ? 1.05 : 0), hy - r * (at > 0.4 ? 0.1 : 1.05), r * 0.32, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Brazos levantados en V (o puños arriba): manga y mano, con contorno. */
function paintArms(ctx: CanvasRenderingContext2D, x: number, shoulderY: number, hy: number, k: number, sw: number, look: FanLook, light: number, turn: number, back: boolean) {
  const spread = look.cheer === 2 ? 0.22 : 0.42
  const handY = hy - (look.cheer === 2 ? 1.5 : 1.38) * look.tall * k
  const w = 0.1 * k
  for (const sgn of [-1, 1]) {
    const sx = x + sgn * sw * 0.8 * k
    const hx = x + (sgn * spread + turn * 0.1) * k
    ctx.lineWidth = w + CROWD.outline * 2
    ctx.strokeStyle = OUTLINE
    ctx.beginPath(); ctx.moveTo(sx, shoulderY + 0.04 * k); ctx.lineTo(hx, handY); ctx.stroke()
    ctx.lineWidth = w
    ctx.strokeStyle = shade(look.shirt, light * (sgn > 0 ? SHADOW : 1))
    ctx.beginPath(); ctx.moveTo(sx, shoulderY + 0.04 * k); ctx.lineTo(hx, handY); ctx.stroke()
    ctx.fillStyle = shade(look.skin, light * (back ? SHADOW : 1))
    circle(ctx, hx, handY - 0.02 * k, 0.055 * k)
    ctx.fill()
  }
  ctx.lineWidth = CROWD.outline
  ctx.strokeStyle = OUTLINE
}

/** Bufanda estirada por encima de la cabeza, sujeta con las dos manos. */
function paintScarfUp(ctx: CanvasRenderingContext2D, x: number, shoulderY: number, hy: number, k: number, sw: number, look: FanLook, light: number) {
  const top = hy - 1.36 * look.tall * k
  const half = 0.4 * k
  const color = look.scarf ?? look.shirt
  for (const sgn of [-1, 1]) {
    const sx = x + sgn * sw * 0.8 * k
    const hx = x + sgn * half * 0.92
    ctx.lineWidth = 0.1 * k + CROWD.outline * 2
    ctx.strokeStyle = OUTLINE
    ctx.beginPath(); ctx.moveTo(sx, shoulderY + 0.04 * k); ctx.lineTo(hx, top + 0.05 * k); ctx.stroke()
    ctx.lineWidth = 0.1 * k
    ctx.strokeStyle = shade(look.shirt, light * (sgn > 0 ? SHADOW : 1))
    ctx.beginPath(); ctx.moveTo(sx, shoulderY + 0.04 * k); ctx.lineTo(hx, top + 0.05 * k); ctx.stroke()
  }
  ctx.lineWidth = CROWD.outline
  ctx.strokeStyle = OUTLINE
  ctx.fillStyle = shade(color, light * 1.05)
  ctx.fillRect(x - half, top - 0.05 * k, half * 2, 0.11 * k)
  ctx.strokeRect(x - half, top - 0.05 * k, half * 2, 0.11 * k)
  ctx.fillStyle = shade(look.scarf2, light)
  for (let i = -3; i <= 3; i += 2) ctx.fillRect(x + i * half * 0.25 - 0.03 * k, top - 0.05 * k, 0.06 * k, 0.11 * k)
  ctx.fillStyle = shade(look.skin, light)
  circle(ctx, x - half * 0.92, top + 0.01 * k, 0.055 * k); ctx.fill()
  circle(ctx, x + half * 0.92, top + 0.01 * k, 0.055 * k); ctx.fill()
}
