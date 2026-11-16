/**
 * Pintores vectoriales (canvas 2D) de los estilos A (cartoon limpio: plano +
 * una sombra, contorno grueso) y C (semirrealista TV: degradado suave,
 * contorno fino). Pintan a cualquier escala sin perder nitidez.
 */
import { GEAR, type HeadPart, type Part } from './parts'

export const OUTLINE = 0x08111b

export type VectorStyle = 'A' | 'C'

export const hex = (c: number, a = 1) =>
  `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`

/** Mezcla con negro (`t` < 1) o con blanco (`t` > 1). */
export function tone(c: number, t: number): number {
  const ch = (v: number) => Math.round(t <= 1 ? v * t : v + (255 - v) * (t - 1))
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255)
}

function capsulePath(ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Path2D {
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

function pathOf(part: Part): Path2D | null {
  const p = new Path2D()
  switch (part.k) {
    case 'cap': return capsulePath(part.a.x, part.a.y, part.b.x, part.b.y, part.ra, part.rb)
    case 'poly':
      part.pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)))
      p.closePath()
      return p
    case 'ell':
      p.ellipse(part.x, part.y, part.rx, part.ry, 0, 0, Math.PI * 2)
      return p
    default: return null
  }
}

/** Tamaño característico de una pieza (px a escala 1): regula contorno y sombra. */
function sizeOf(part: Part): number {
  switch (part.k) {
    case 'cap': return Math.min(part.ra, part.rb)
    case 'ell': return Math.min(part.rx, part.ry)
    case 'poly': {
      const ys = part.pts.map(p => p.y)
      const xs = part.pts.map(p => p.x)
      return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2
    }
    default: return 4
  }
}

function bounds(part: Part): { y0: number; y1: number; x0: number; x1: number } {
  switch (part.k) {
    case 'cap': {
      const r = Math.max(part.ra, part.rb)
      return { x0: Math.min(part.a.x, part.b.x) - r, x1: Math.max(part.a.x, part.b.x) + r, y0: Math.min(part.a.y, part.b.y) - r, y1: Math.max(part.a.y, part.b.y) + r }
    }
    case 'poly': {
      const xs = part.pts.map(p => p.x)
      const ys = part.pts.map(p => p.y)
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
    }
    case 'ell': return { x0: part.x - part.rx, x1: part.x + part.rx, y0: part.y - part.ry, y1: part.y + part.ry }
    default: return { x0: 0, x1: 0, y0: 0, y1: 0 }
  }
}

/** Relleno con el sombreado del estilo. A: lo iluminado es la forma desplazada hacia la luz. */
function fillShaded(ctx: CanvasRenderingContext2D, path: Path2D, c: number, size: number, b: ReturnType<typeof bounds>, style: VectorStyle) {
  if (style === 'A') {
    ctx.fillStyle = hex(tone(c, 0.68))
    ctx.fill(path)
    ctx.save()
    ctx.clip(path)
    const k = Math.min(1.5, size * 0.45)
    ctx.translate(-k * 0.35, -k)
    ctx.fillStyle = hex(c)
    ctx.fill(path)
    ctx.restore()
    return
  }
  const g = ctx.createLinearGradient(b.x0, b.y0, b.x0 + (b.x1 - b.x0) * 0.3, b.y1)
  g.addColorStop(0, hex(tone(c, 1.22)))
  g.addColorStop(0.45, hex(c))
  g.addColorStop(1, hex(tone(c, 0.58)))
  ctx.fillStyle = g
  ctx.fill(path)
}

function stroke(ctx: CanvasRenderingContext2D, path: Path2D, size: number, style: VectorStyle) {
  ctx.lineJoin = 'round'
  if (style === 'A') {
    ctx.lineWidth = Math.max(0.8, Math.min(1.6, size * 0.5))
    ctx.strokeStyle = hex(OUTLINE)
  } else {
    ctx.lineWidth = Math.max(0.5, Math.min(1.1, size * 0.3))
    ctx.strokeStyle = hex(OUTLINE, 0.7)
  }
  ctx.stroke(path)
}

function ellipsePath(x: number, y: number, rx: number, ry: number): Path2D {
  const p = new Path2D()
  p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  return p
}

/** Cabeza en capas: pelo, cara visible según la vista, ojos, oreja y casco (con o sin rejilla). */
function paintHead(ctx: CanvasRenderingContext2D, h: HeadPart, style: VectorStyle) {
  const { x, y, r } = h
  const rx = r * h.aspect
  const head = ellipsePath(x, y, rx, r)
  const box = { x0: x - rx, x1: x + rx, y0: y - r, y1: y + r }
  fillShaded(ctx, head, h.helmet !== null && h.cage ? h.skin : h.hair, r, box, style)
  ctx.save()
  ctx.clip(head)
  if (h.fz > -0.35) {
    const fr = r * (0.62 + 0.26 * Math.max(0, h.fz))
    fillShaded(ctx, ellipsePath(x + h.fx * 0.42 * rx, y + 0.2 * r, fr * h.aspect, fr), h.skin, r, box, style)
  }
  ctx.restore()
  if (h.ear) {
    const e = ellipsePath(h.ear.x, h.ear.y, r * 0.2, r * 0.26)
    fillShaded(ctx, e, h.skin, r * 0.2, box, style)
    stroke(ctx, e, r * 0.15, style)
  }
  ctx.fillStyle = hex(OUTLINE, style === 'A' ? 1 : 0.85)
  for (const e of h.eyes) {
    ctx.beginPath()
    if (style === 'A') ctx.ellipse(e.x, e.y, r * 0.11, r * 0.15, 0, 0, Math.PI * 2)
    else ctx.ellipse(e.x, e.y, r * 0.08, r * 0.06, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  stroke(ctx, head, r, style)
  if (h.helmet !== null) paintHelmet(ctx, h, style, box)
}

function paintHelmet(ctx: CanvasRenderingContext2D, h: HeadPart, style: VectorStyle, box: { x0: number; x1: number; y0: number; y1: number }) {
  const { x, y, r } = h
  const rx = r * h.aspect
  const brow = h.cage ? y + 0.55 * r : y - 0.12 * r + Math.max(0, -h.fz) * 0.45 * r
  const shell = ellipsePath(x - h.fx * 0.05 * r, y - 0.08 * r, rx * 1.12, r * 1.1)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - 2 * r, y - 2 * r, 4 * r, brow - (y - 2 * r))
  ctx.clip()
  fillShaded(ctx, shell, h.helmet as number, r, box, style)
  stroke(ctx, shell, r, style)
  if (!h.cage) {
    ctx.strokeStyle = hex(tone(h.helmet as number, 1.5), 0.9)
    ctx.lineWidth = r * 0.12
    ctx.beginPath()
    ctx.moveTo(x - h.fx * 0.05 * r, y - 1.1 * r)
    ctx.lineTo(x - h.fx * 0.05 * r + h.fx * 0.9 * r, brow)
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = hex(OUTLINE)
  ctx.lineWidth = Math.max(0.6, r * 0.1)
  ctx.beginPath()
  ctx.moveTo(x - rx * 1.05, brow)
  ctx.lineTo(x + rx * 1.05, brow)
  ctx.stroke()
  if (h.cage && h.fz > -0.2) paintCage(ctx, h, brow)
}

function paintCage(ctx: CanvasRenderingContext2D, h: HeadPart, brow: number) {
  const { x, y, r } = h
  const cx = x + h.fx * 0.35 * r
  ctx.save()
  const face = ellipsePath(cx, y + 0.1 * r, r * 0.85 * h.aspect, r * 1.0)
  ctx.fillStyle = hex(tone(h.skin, 0.8))
  ctx.fill(face)
  ctx.fillStyle = hex(OUTLINE)
  for (const e of h.eyes) {
    ctx.beginPath()
    ctx.arc(e.x, e.y, r * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.clip(face)
  ctx.strokeStyle = hex(GEAR.cage)
  ctx.lineWidth = Math.max(0.35, r * 0.08)
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(cx + i * 0.26 * r, brow - r)
    ctx.lineTo(cx + i * 0.26 * r, y + 1.2 * r)
    ctx.stroke()
  }
  for (let j = 0; j < 4; j++) {
    const yy = y - 0.6 * r + j * 0.42 * r
    ctx.beginPath()
    ctx.moveTo(cx - r, yy)
    ctx.lineTo(cx + r, yy)
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = hex(OUTLINE, 0.8)
  ctx.lineWidth = Math.max(0.5, r * 0.08)
  ctx.stroke(face)
}

/** Pinta las piezas en `ctx` con los pies en el píxel (ox, oy) y escala `scale`. */
export function paintVector(ctx: CanvasRenderingContext2D, parts: Part[], ox: number, oy: number, scale: number, style: VectorStyle) {
  ctx.setTransform(scale, 0, 0, scale, ox, oy)
  for (const part of parts) {
    if (part.k === 'shadow') {
      ctx.fillStyle = hex(0x000000, 0.22)
      ctx.beginPath()
      ctx.ellipse(part.x, part.y, part.rx, part.ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = hex(0x000000, 0.3)
      ctx.beginPath()
      ctx.ellipse(part.x, part.y, part.rx * 0.55, part.ry * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    if (part.k === 'head') {
      paintHead(ctx, part, style)
      continue
    }
    if (part.k === 'num') {
      ctx.font = `bold ${part.size}px Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(0.6, part.size * 0.14)
      ctx.strokeStyle = hex(OUTLINE, 0.8)
      ctx.strokeText(part.text, part.x, part.y)
      ctx.fillStyle = hex(part.c)
      ctx.fillText(part.text, part.x, part.y)
      continue
    }
    const path = pathOf(part)
    if (!path) continue
    const size = sizeOf(part)
    fillShaded(ctx, path, part.c, size, bounds(part), style)
    stroke(ctx, path, size, style)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
