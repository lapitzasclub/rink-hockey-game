import { CROWD } from '../artSpec'

/**
 * Busto de tres cuartos (WP-68, 2.ª vuelta): el público de las gradas laterales
 * y de las curvas, girado hacia la pista. En esas gradas cada espectador tapa el
 * torso del de detrás, así que lo que se lee es cabeza, cuello y hombros: los
 * hombros van más anchos que la cabeza, el pelo o el gorro cubren la nuca y hacia
 * la pista asoman oreja, nariz y ojo. Debajo, la ropa (camiseta, chaqueta abierta,
 * sudadera con capucha o camiseta deportiva, bufanda) y un brazo: manos en las
 * rodillas, brazos cruzados, en el regazo o con el móvil.
 * Unidades: metros de figura × `k` (px por metro); se pinta una vez al hornear.
 */

type Ctx = CanvasRenderingContext2D

/** Lo que el busto necesita del atuendo (ver `FanLook` en fans.ts). */
export interface SideLook {
  shirt: number
  trousers: number
  skin: number
  hair: number
  hairStyle: number
  beanie: number | null
  scarf: number | null
  scarf2: number
  bulk: number
  tall: number
  cheer: number
  top: number
  inner: number
  hands: number
}

/** Prendas de arriba. */
export const TOP = { tee: 0, jacket: 1, hoodie: 2, sport: 3 } as const
/** Qué hace con las manos sentado. */
export const HANDS = { knees: 0, crossed: 1, lap: 2, phone: 3 } as const

export interface SidePaint {
  lit: (c: number) => string
  dim: (c: number) => string
  /** Tono con la luz de la fila multiplicada por `f`. */
  tone: (c: number, f: number) => string
  outline: string
  /** Lo que sube la cadera al ponerse de pie (m). */
  standUp: number
  /** Brazos en alto del gol (los de fans.ts), con el giro de tres cuartos. */
  arms: (hy: number, shoulderY: number, sw: number, turn: number) => void
  scarfUp: (hy: number, shoulderY: number, sw: number) => void
}

/** Giro con el que se dibuja: de tres cuartos aunque la cámara lo vea casi de perfil. */
export const SIDE_TURN = 0.55

/**
 * Pinta el busto con la cadera en (x, y). `side` = hacia dónde mira en pantalla
 * (+1 derecha). `cheer`: de pie con los brazos arriba.
 */
export function paintSideFan(ctx: Ctx, x: number, y: number, k: number, look: SideLook, side: number, cheer: boolean, p: SidePaint) {
  const F = (m: number) => x + side * m * k
  const tall = look.tall
  const hy = cheer ? y - p.standUp * k : y
  const shoulderY = hy - 0.44 * tall * k
  const topY = hy - 0.57 * tall * k
  const sw = 0.25 * look.bulk
  const hw = 0.19 * look.bulk
  const headX = F(0.05)
  const headY = hy - 0.76 * tall * k
  const hr = 0.155 * k
  ctx.lineWidth = CROWD.outline
  ctx.strokeStyle = p.outline

  // Piernas: sentado, el muslo hacia la pista; de pie, la cintura
  ctx.fillStyle = p.dim(look.trousers)
  ctx.beginPath()
  if (cheer) {
    ctx.rect(x - hw * k, hy - 0.02 * k, hw * 2 * k, 0.24 * k)
  } else {
    ctx.moveTo(F(-0.14), y - 0.07 * k)
    ctx.lineTo(F(0.34), y - 0.05 * k)
    ctx.quadraticCurveTo(F(0.42), y + 0.01 * k, F(0.36), y + 0.08 * k)
    ctx.lineTo(F(0.33), y + 0.27 * k)
    ctx.lineTo(F(0.2), y + 0.27 * k)
    ctx.lineTo(F(0.2), y + 0.09 * k)
    ctx.lineTo(F(-0.14), y + 0.09 * k)
    ctx.closePath()
  }
  ctx.fill()
  ctx.stroke()

  if (cheer && look.cheer !== 1) p.arms(hy, shoulderY, sw, side * SIDE_TURN)
  // Capucha recogida detrás del cuello (por detrás del torso y de la cabeza)
  if (look.top === TOP.hoodie) {
    ctx.fillStyle = p.dim(look.shirt)
    ctx.beginPath()
    ctx.ellipse(F(-0.11), topY + 0.015 * k, 0.15 * k, 0.075 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  // Melena o coleta: por detrás de la cabeza, cayendo hacia la espalda
  if (look.beanie === null && look.hairStyle === 1) {
    ctx.fillStyle = p.dim(look.hair)
    ctx.beginPath()
    ctx.ellipse(headX - side * hr * 0.5, headY + hr * 0.8, hr * 0.72, hr * 1.05, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (look.beanie === null && look.hairStyle === 3) {
    ctx.fillStyle = p.dim(look.hair)
    ctx.beginPath()
    ctx.arc(headX - side * hr * 1.05, headY + hr * 0.15, hr * 0.34, 0, Math.PI * 2)
    ctx.fill()
  }

  // Torso: el hombro de atrás algo más ancho en pantalla; luz desde la izquierda
  const l = side > 0 ? -sw : -sw * 0.86
  const r = side > 0 ? sw * 0.86 : sw
  const cx = F(-0.02)
  const bottom = hy + (cheer ? 0.04 : 0.02) * k
  torso(ctx, cx, k, l, r, l * (hw / sw), r * (hw / sw), topY, shoulderY, bottom)
  ctx.fillStyle = p.dim(look.shirt)
  ctx.fill()
  ctx.fillStyle = p.lit(look.shirt)
  torso(ctx, cx, k, l, r * 0.35, l * (hw / sw), r * 0.3 * (hw / sw), topY, shoulderY, bottom)
  ctx.fill()
  paintTop(ctx, look, F, k, topY, bottom, p)
  torso(ctx, cx, k, l, r, l * (hw / sw), r * (hw / sw), topY, shoulderY, bottom)
  ctx.stroke()

  // Cuello y bufanda
  ctx.fillStyle = p.dim(look.skin)
  ctx.fillRect(headX - side * 0.02 * k - 0.05 * k, headY + hr * 0.55, 0.1 * k, topY - headY - hr * 0.45)
  if (look.scarf !== null && !(cheer && look.cheer === 1)) {
    ctx.fillStyle = p.lit(look.scarf)
    ctx.beginPath()
    ctx.rect(Math.min(F(-0.15), F(0.13)), topY - 0.015 * k, 0.28 * k, 0.09 * k)
    ctx.rect(Math.min(F(0.05), F(0.13)), topY + 0.05 * k, 0.08 * k, 0.24 * k)
    ctx.fill()
    ctx.fillStyle = p.lit(look.scarf2)
    ctx.fillRect(Math.min(F(-0.15), F(0.13)), topY + 0.02 * k, 0.28 * k, 0.02 * k)
    ctx.fillRect(Math.min(F(0.05), F(0.13)), topY + 0.2 * k, 0.08 * k, 0.025 * k)
  }

  paintHead(ctx, headX, headY, hr, side, look, p)
  if (!cheer) paintHands(ctx, look, F, k, y, shoulderY, p)
  else if (look.cheer === 1) p.scarfUp(hy, shoulderY, sw)
}

function torso(ctx: Ctx, x: number, k: number, ls: number, rs: number, lh: number, rh: number, top: number, sh: number, bottom: number) {
  ctx.beginPath()
  ctx.moveTo(x + lh * k, bottom)
  ctx.lineTo(x + ls * k, sh)
  ctx.quadraticCurveTo(x + ls * k, top, x + ls * 0.4 * k, top)
  ctx.lineTo(x + rs * 0.4 * k, top)
  ctx.quadraticCurveTo(x + rs * k, top, x + rs * k, sh)
  ctx.lineTo(x + rh * k, bottom)
  ctx.closePath()
}

/** Detalle de la prenda sobre el pecho (antes del contorno del torso). */
function paintTop(ctx: Ctx, look: SideLook, F: (m: number) => number, k: number, topY: number, bottom: number, p: SidePaint) {
  const strip = (a: number, b: number, y0: number, y1: number) => ctx.fillRect(Math.min(F(a), F(b)), y0, Math.abs(F(b) - F(a)), y1 - y0)
  switch (look.top) {
    case TOP.jacket:
      // Chaqueta abierta: la camiseta de debajo y el cuello subido
      ctx.fillStyle = p.lit(look.inner)
      strip(0.05, 0.13, topY + 0.02 * k, bottom)
      ctx.fillStyle = p.tone(look.shirt, 0.5)
      strip(0.03, 0.05, topY + 0.02 * k, bottom)
      strip(-0.13, 0.12, topY - 0.01 * k, topY + 0.035 * k)
      break
    case TOP.hoodie:
      // Cordones de la capucha
      ctx.fillStyle = p.tone(look.inner, 1.1)
      strip(0.06, 0.075, topY + 0.02 * k, topY + 0.15 * k)
      strip(0.11, 0.125, topY + 0.02 * k, topY + 0.13 * k)
      break
    case TOP.sport:
      // Camiseta deportiva: hombros y cuello del segundo color
      ctx.fillStyle = p.lit(look.inner)
      strip(-0.25, 0.22, topY, topY + 0.03 * k)
      strip(0.02, 0.13, topY + 0.03 * k, topY + 0.06 * k)
      break
    default:
      // Cuello redondo
      ctx.fillStyle = p.tone(look.shirt, 0.55)
      strip(-0.08, 0.12, topY + 0.005 * k, topY + 0.025 * k)
  }
}

/** Contorno de la zona del pelo: flequillo a la altura de la frente, patilla delante de la oreja y nuca. */
const HAIR_LINE = [1.3, -0.4, 0.55, -0.48, 0.12, -0.34, 0.02, 0.12, -0.32, 0.95, -3, 0.95, -3, -3, 1.3, -3]
/** Calvo: solo la corona de la nuca. */
const BALD_LINE = [-0.2, -0.2, -0.6, 0.95, -3, 0.95, -3, -3, -0.2, -3]

/** Cabeza de tres cuartos: pelo o gorro hacia atrás, oreja, nariz y ojo hacia la pista. */
function paintHead(ctx: Ctx, hx: number, hy: number, hr: number, side: number, look: SideLook, p: SidePaint) {
  const circle = (cx: number, cy: number, rr: number) => { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2) }
  // Nariz: asoma del contorno hacia la pista
  ctx.fillStyle = p.lit(look.skin)
  ctx.beginPath()
  ctx.moveTo(hx + side * hr * 0.9, hy - hr * 0.12)
  ctx.lineTo(hx + side * hr * 1.2, hy + hr * 0.26)
  ctx.lineTo(hx + side * hr * 0.86, hy + hr * 0.36)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = p.dim(look.skin)
  circle(hx, hy, hr)
  ctx.fill()
  ctx.fillStyle = p.lit(look.skin)
  circle(hx - hr * 0.1, hy - hr * 0.1, hr * 0.86)
  ctx.fill()
  circle(hx, hy, hr)
  ctx.stroke()

  const bald = look.hairStyle === 2
  if (look.beanie === null) {
    // Pelo: lo que queda detrás de la línea frente–nuca, con algo de volumen hacia atrás
    ctx.save()
    ctx.beginPath()
    // Línea del pelo en coordenadas (u hacia la pista, v hacia abajo) × radio
    const line = bald ? BALD_LINE : HAIR_LINE
    for (let i = 0; i < line.length; i += 2) {
      const px = hx + side * hr * line[i], py = hy + hr * line[i + 1]
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.clip()
    if (bald) {
      // Calvo: solo la corona de pelo de la nuca
      ctx.fillStyle = p.dim(look.hair)
      circle(hx - side * hr * 0.95, hy + hr * 0.3, hr * 0.5)
      ctx.fill()
    } else {
      const ox = hx - side * hr * 0.07, oy = hy - hr * 0.05
      ctx.fillStyle = p.dim(look.hair)
      circle(ox, oy, hr * 1.05)
      ctx.fill()
      ctx.fillStyle = p.lit(look.hair)
      circle(ox - side * hr * 0.05 - hr * 0.12, oy - hr * 0.28, hr * 0.72)
      ctx.fill()
      circle(ox, oy, hr * 1.05)
      ctx.stroke()
    }
    ctx.restore()
  }
  // Oreja, en el borde del pelo, y ojo
  ctx.fillStyle = p.dim(look.skin)
  ctx.beginPath()
  ctx.ellipse(hx - side * hr * 0.1, hy + hr * 0.16, hr * 0.17, hr * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = p.tone(0x161210, 1)
  const er = Math.max(0.35, hr * 0.12)
  ctx.fillRect(hx + side * hr * 0.58 - er, hy + hr * 0.02 - er, er * 2, er * 2)

  if (look.beanie !== null) {
    // Gorro de lana ladeado hacia atrás, con vuelta y pompón
    const bx = hx - side * hr * 0.08
    ctx.fillStyle = p.lit(look.beanie)
    ctx.beginPath()
    ctx.arc(bx, hy - hr * 0.08, hr * 1.06, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = p.dim(look.beanie)
    ctx.fillRect(bx - hr * 1.06, hy - hr * 0.26, hr * 2.12, hr * 0.3)
    ctx.strokeRect(bx - hr * 1.06, hy - hr * 0.26, hr * 2.12, hr * 0.3)
    ctx.fillStyle = p.lit(look.scarf2)
    circle(bx - side * hr * 0.2, hy - hr * 1.15, hr * 0.3)
    ctx.fill()
  }
}

/** El brazo que ve la cámara, sentado. */
function paintHands(ctx: Ctx, look: SideLook, F: (m: number) => number, k: number, y: number, shoulderY: number, p: SidePaint) {
  const w = 0.095 * k
  const sleeve = p.dim(look.shirt)
  const limb = (pts: number[]) => {
    for (const [width, color] of [[w + CROWD.outline * 2, p.outline], [w, sleeve]] as const) {
      ctx.lineWidth = width
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.moveTo(pts[0], pts[1])
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
      ctx.stroke()
    }
    ctx.lineWidth = CROWD.outline
    ctx.strokeStyle = p.outline
  }
  const hand = (hx: number, hy: number) => {
    ctx.fillStyle = p.lit(look.skin)
    ctx.beginPath()
    ctx.arc(hx, hy, 0.05 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  const sy = shoulderY + 0.04 * k
  switch (look.hands) {
    case HANDS.crossed:
      limb([F(0.1), sy, F(0.1), shoulderY + 0.16 * k, F(-0.1), shoulderY + 0.2 * k])
      limb([F(-0.16), shoulderY + 0.18 * k, F(0.17), shoulderY + 0.17 * k])
      hand(F(0.19), shoulderY + 0.17 * k)
      break
    case HANDS.lap:
      limb([F(0.1), sy, F(0.1), y - 0.12 * k, F(0.26), y - 0.08 * k])
      hand(F(0.27), y - 0.08 * k)
      break
    case HANDS.phone: {
      limb([F(0.1), sy, F(0.12), y - 0.1 * k, F(0.27), shoulderY + 0.14 * k])
      // Móvil: carcasa oscura y la pantalla encendida hacia la cara
      const px = Math.min(F(0.26), F(0.33)), py = shoulderY + 0.03 * k
      ctx.fillStyle = p.tone(0x1a1c20, 1)
      ctx.fillRect(px, py, 0.07 * k, 0.12 * k)
      ctx.fillStyle = p.tone(CROWD.phoneGlow, 1.25)
      ctx.fillRect(px + 0.012 * k, py + 0.012 * k, 0.046 * k, 0.09 * k)
      hand(F(0.29), shoulderY + 0.14 * k)
      break
    }
    default:
      limb([F(0.1), sy, F(0.15), y - 0.13 * k, F(0.33), y - 0.07 * k])
      hand(F(0.34), y - 0.07 * k)
  }
}
