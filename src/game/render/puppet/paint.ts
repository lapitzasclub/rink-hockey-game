/**
 * Pintor del estilo A (SPEC §4, cartoon limpio): relleno plano con una sombra
 * y contorno OUTLINE. Trabaja en px de pantalla a s = 1; el atlas pone la
 * transformación de supermuestreo. Solo se usa al generar texturas.
 */
import { RIG_GEAR, RIG_OUTLINE } from '../artSpec'

export const hex = (c: number, a = 1) =>
  `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`

/** Mezcla con negro (`t` < 1) o con blanco (`t` > 1). */
export function tone(c: number, t: number): number {
  const ch = (v: number) => Math.round(t <= 1 ? v * t : v + (255 - v) * (t - 1))
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255)
}

/** Cápsula de radios `ra` en (ax, ay) y `rb` en (bx, by). */
export function capsulePath(ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Path2D {
  const p = new Path2D()
  const dx = bx - ax
  const dy = by - ay
  if (Math.hypot(dx, dy) < 1e-4) {
    p.arc(ax, ay, Math.max(ra, rb), 0, Math.PI * 2)
    return p
  }
  const th = Math.atan2(dy, dx)
  const h = Math.PI / 2
  p.arc(bx, by, rb, th - h, th + h)
  p.arc(ax, ay, ra, th + h, th - h + Math.PI * 2)
  p.closePath()
  return p
}

export function ellipsePath(x: number, y: number, rx: number, ry: number): Path2D {
  const p = new Path2D()
  p.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2)
  return p
}

export function polyPath(pts: readonly (readonly [number, number])[]): Path2D {
  const p = new Path2D()
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
  return p
}

/** Relleno A: la forma en sombra y, encima, la misma desplazada hacia la luz (arriba-izquierda). */
export function fillShaded(ctx: CanvasRenderingContext2D, path: Path2D, c: number, size: number) {
  ctx.fillStyle = hex(tone(c, 0.68))
  ctx.fill(path)
  ctx.save()
  ctx.clip(path)
  const k = Math.min(1.5, size * 0.45)
  ctx.translate(-k * 0.35, -k)
  ctx.fillStyle = hex(c)
  ctx.fill(path)
  ctx.restore()
}

/** Contorno según el tamaño de la pieza; `thin` para piezas pequeñas que se empastan. */
export function strokeOutline(ctx: CanvasRenderingContext2D, path: Path2D, size: number, thin = false) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = thin
    ? Math.max(RIG_OUTLINE.thinMin, Math.min(RIG_OUTLINE.thinMax, size * 0.35))
    : Math.max(RIG_OUTLINE.min, Math.min(RIG_OUTLINE.max, size * 0.5))
  ctx.strokeStyle = hex(RIG_OUTLINE.color)
  ctx.stroke(path)
}

/** Pieza completa: relleno sombreado y contorno. */
export function paintShape(ctx: CanvasRenderingContext2D, path: Path2D, c: number, size: number, thin = false) {
  fillShaded(ctx, path, c, size)
  strokeOutline(ctx, path, size, thin)
}

/** Línea de detalle (costuras, franjas) sin contorno. */
export function detailLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: number, w: number) {
  ctx.strokeStyle = hex(c)
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

/** Cabeza para pintar: centro en (0, 0), radio en px y orientación de la cara en pantalla. */
export interface HeadSpec {
  r: number
  aspect: number
  skin: number
  hair: number
  /** null = sin casco (variante D4). */
  helmet: number | null
  cage: boolean
  /** Dirección de la cara: x lateral en pantalla, z hacia cámara. */
  fx: number
  fz: number
  eyes: [number, number][]
  ear: [number, number] | null
}

/** Cabeza en capas: pelo, cara visible según la vista, ojos, oreja y casco (con o sin rejilla). */
export function paintHead(ctx: CanvasRenderingContext2D, h: HeadSpec) {
  const { r } = h
  const rx = r * h.aspect
  const head = ellipsePath(0, 0, rx, r)
  fillShaded(ctx, head, h.helmet !== null && h.cage ? h.skin : h.hair, r)
  ctx.save()
  ctx.clip(head)
  if (h.fz > -0.35) {
    const fr = r * (0.62 + 0.26 * Math.max(0, h.fz))
    fillShaded(ctx, ellipsePath(h.fx * 0.42 * rx, 0.2 * r, fr * h.aspect, fr), h.skin, r)
  }
  ctx.restore()
  if (h.ear) {
    const e = ellipsePath(h.ear[0], h.ear[1], r * 0.2, r * 0.26)
    paintShape(ctx, e, h.skin, r * 0.2, true)
  }
  ctx.fillStyle = hex(RIG_OUTLINE.color)
  for (const [ex, ey] of h.eyes) {
    ctx.beginPath()
    ctx.ellipse(ex, ey, r * 0.11, r * 0.15, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  strokeOutline(ctx, head, r)
  if (h.helmet !== null) paintHelmet(ctx, h)
}

/**
 * Casco: el de jugador es el homologado, gorro acolchado negro (franja del color del equipo
 * para distinguirlo desde arriba) y pantalla transparente de la frente a la barbilla; el del
 * portero, carcasa del color del equipo que baja hasta la barbilla con rejilla integral.
 */
function paintHelmet(ctx: CanvasRenderingContext2D, h: HeadSpec) {
  const { r } = h
  const rx = r * h.aspect
  const helmet = h.helmet as number
  const brow = h.cage ? 0.55 * r : -0.12 * r + Math.max(0, -h.fz) * 0.45 * r
  const shell = ellipsePath(-h.fx * 0.05 * r, -0.08 * r, rx * 1.12, r * 1.1)
  const shellColor = h.cage ? helmet : RIG_GEAR.softCap
  ctx.save()
  ctx.beginPath()
  ctx.rect(-2 * r, -2 * r, 4 * r, brow + 2 * r)
  ctx.clip()
  paintShape(ctx, shell, shellColor, r)
  if (!h.cage) {
    // Costuras de los paneles acolchados y franja central del equipo, que marca hacia dónde mira
    const mx = -h.fx * 0.05 * r
    for (const s of [-1, 1]) detailLine(ctx, mx + s * 0.45 * rx, -0.95 * r, mx + s * 0.55 * rx + h.fx * 0.5 * r, brow, RIG_GEAR.capSeam, r * 0.07)
    detailLine(ctx, mx, -1.1 * r, mx + h.fx * 0.9 * r, brow, helmet, r * 0.16)
  }
  ctx.restore()
  ctx.strokeStyle = hex(RIG_OUTLINE.color)
  ctx.lineWidth = Math.max(0.6, r * 0.1)
  ctx.beginPath()
  ctx.moveTo(-rx * 1.05, brow)
  ctx.lineTo(rx * 1.05, brow)
  ctx.stroke()
  if (h.cage && h.fz > -0.2) paintCage(ctx, h)
  else if (!h.cage && h.fz > -0.35) paintVisor(ctx, h, brow)
}

/** Pantalla transparente: deja ver la cara, con borde claro y un brillo en la esquina alta. */
function paintVisor(ctx: CanvasRenderingContext2D, h: HeadSpec, brow: number) {
  const { r } = h
  const rx = r * h.aspect
  const cx = h.fx * 0.38 * rx
  const vw = rx * (0.7 + 0.25 * Math.max(0, h.fz))
  const visor = ellipsePath(cx, brow + 0.62 * r, vw, 0.78 * r)
  ctx.save()
  ctx.beginPath()
  ctx.rect(-2 * r, brow, 4 * r, 3 * r)
  ctx.clip()
  ctx.fillStyle = hex(RIG_GEAR.visor, RIG_GEAR.visorAlpha)
  ctx.fill(visor)
  ctx.strokeStyle = hex(RIG_GEAR.visorEdge, 0.85)
  ctx.lineWidth = Math.max(0.5, r * 0.08)
  ctx.stroke(visor)
  ctx.strokeStyle = hex(0xffffff, 0.75)
  ctx.lineWidth = Math.max(0.5, r * 0.1)
  ctx.beginPath()
  ctx.ellipse(cx, brow + 0.62 * r, vw * 0.72, 0.6 * r, 0, Math.PI * 1.08, Math.PI * 1.4)
  ctx.stroke()
  ctx.restore()
}

function paintCage(ctx: CanvasRenderingContext2D, h: HeadSpec) {
  const { r } = h
  const brow = 0.55 * r
  const cx = h.fx * 0.35 * r
  ctx.save()
  const face = ellipsePath(cx, 0.1 * r, r * 0.85 * h.aspect, r)
  ctx.fillStyle = hex(tone(h.skin, 0.8))
  ctx.fill(face)
  ctx.fillStyle = hex(RIG_OUTLINE.color)
  for (const [ex, ey] of h.eyes) {
    ctx.beginPath()
    ctx.arc(ex, ey, r * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.clip(face)
  ctx.strokeStyle = hex(RIG_GEAR.cage)
  ctx.lineWidth = Math.max(0.35, r * 0.08)
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(cx + i * 0.26 * r, brow - r)
    ctx.lineTo(cx + i * 0.26 * r, 1.2 * r)
    ctx.stroke()
  }
  for (let j = 0; j < 4; j++) {
    const yy = -0.6 * r + j * 0.42 * r
    ctx.beginPath()
    ctx.moveTo(cx - r, yy)
    ctx.lineTo(cx + r, yy)
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = hex(RIG_OUTLINE.color, 0.8)
  ctx.lineWidth = Math.max(0.5, r * 0.08)
  ctx.stroke(face)
}

/** Dorsal centrado en (0, 0) con contorno. */
export function paintNumber(ctx: CanvasRenderingContext2D, text: string, size: number, c: number) {
  ctx.font = `bold ${size}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(0.6, size * 0.16)
  ctx.strokeStyle = hex(RIG_OUTLINE.color, 0.85)
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = hex(c)
  ctx.fillText(text, 0, 0)
}
