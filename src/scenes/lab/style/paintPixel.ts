/**
 * Pintor pixel-art del estilo B: rasteriza las piezas en la rejilla nativa
 * (1 px de arte = 1 px de pantalla a s = 1) sin antialias. Contorno exterior
 * de 1 px, dos tonos y tramado en el paso luz-sombra. Se amplía con filtro nearest.
 */
import type { HeadPart, Part } from './parts'
import { GEAR } from './parts'
import { OUTLINE, tone } from './paintVector'

type Test = (x: number, y: number) => boolean

/** Dígitos 3×5 (filas de 3 bits, de arriba abajo). */
const DIGITS: Record<string, number[]> = {
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 3, 1, 7], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7],
}

class Raster {
  readonly img: ImageData
  private readonly ox: number
  private readonly oy: number
  constructor(img: ImageData, ox: number, oy: number) {
    this.img = img
    this.ox = ox
    this.oy = oy
  }

  set(px: number, py: number, c: number, a = 255) {
    if (px < 0 || py < 0 || px >= this.img.width || py >= this.img.height) return
    const i = (py * this.img.width + px) * 4
    const d = this.img.data
    if (a < 255 && d[i + 3] > 0) {
      const t = a / 255
      d[i] = Math.round(d[i] * (1 - t) + ((c >> 16) & 255) * t)
      d[i + 1] = Math.round(d[i + 1] * (1 - t) + ((c >> 8) & 255) * t)
      d[i + 2] = Math.round(d[i + 2] * (1 - t) + (c & 255) * t)
      return
    }
    d[i] = (c >> 16) & 255
    d[i + 1] = (c >> 8) & 255
    d[i + 2] = c & 255
    d[i + 3] = a
  }

  /**
   * Rellena la forma `test` (coordenadas locales, pies en 0,0). Sombra = franja
   * inferior (el píxel 2 más abajo cae fuera); contorno = vecinos 4-conexos fuera.
   */
  shape(test: Test, c: number, box: number[], opts: { outline?: boolean; clip?: Test; shade?: boolean } = {}) {
    const { outline = true, clip, shade = true } = opts
    const dark = tone(c, 0.66)
    const [x0, y0, x1, y1] = box
    for (let py = Math.floor(y0 + this.oy) - 1; py <= Math.ceil(y1 + this.oy) + 1; py++) {
      for (let px = Math.floor(x0 + this.ox) - 1; px <= Math.ceil(x1 + this.ox) + 1; px++) {
        const x = px + 0.5 - this.ox
        const y = py + 0.5 - this.oy
        if (clip && !clip(x, y)) continue
        if (test(x, y)) {
          const low = !test(x, y + 2)
          const mid = !low && !test(x, y + 3) && (px + py) % 2 === 0
          this.set(px, py, shade && (low || mid) ? dark : c)
        } else if (outline && (test(x + 1, y) || test(x - 1, y) || test(x, y + 1) || test(x, y - 1))) {
          this.set(px, py, OUTLINE)
        }
      }
    }
  }

  dot(x: number, y: number, c: number, a = 255) {
    this.set(Math.floor(x + this.ox), Math.floor(y + this.oy), c, a)
  }
}

function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2))
  return { d: Math.hypot(x - ax - dx * t, y - ay - dy * t), t }
}

const ellTest = (cx: number, cy: number, rx: number, ry: number): Test =>
  (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

/** Forma, caja y si lleva contorno; las piezas muy finas (stick, placa) van sin contorno. */
function shapeOf(part: Part): { test: Test; box: number[]; outline: boolean } | null {
  switch (part.k) {
    case 'cap': {
      const ra = Math.max(part.ra, 0.75)
      const rb = Math.max(part.rb, 0.75)
      const { a, b } = part
      const r = Math.max(ra, rb)
      return {
        test: (x, y) => {
          const s = segDist(x, y, a.x, a.y, b.x, b.y)
          return s.d <= ra + (rb - ra) * s.t
        },
        box: [Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r],
        outline: r > 1.2,
      }
    }
    case 'ell': {
      const rx = Math.max(part.rx, 0.6)
      const ry = Math.max(part.ry, 0.6)
      return { test: ellTest(part.x, part.y, rx, ry), box: [part.x - rx, part.y - ry, part.x + rx, part.y + ry], outline: true }
    }
    case 'poly': {
      const pts = part.pts
      const xs = pts.map(p => p.x)
      const ys = pts.map(p => p.y)
      return {
        test: (x, y) => {
          let inside = false
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const pi = pts[i]
            const pj = pts[j]
            if ((pi.y > y) !== (pj.y > y) && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside
          }
          return inside
        },
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        outline: true,
      }
    }
    default: return null
  }
}

function paintHead(R: Raster, h: HeadPart) {
  const { x, y, r } = h
  const rx = r * h.aspect
  const head = ellTest(x, y, rx, r)
  const box = [x - rx * 1.2, y - r * 1.2, x + rx * 1.2, y + r * 1.2]
  R.shape(head, h.hair, box)
  if (h.fz > -0.35) {
    const fr = r * (0.62 + 0.26 * Math.max(0, h.fz))
    R.shape(ellTest(x + h.fx * 0.42 * rx, y + 0.2 * r, fr * h.aspect, fr), h.skin, box, { outline: false, clip: head, shade: false })
  }
  if (h.ear) R.shape(ellTest(h.ear.x, h.ear.y, Math.max(1, r * 0.2), Math.max(1.2, r * 0.26)), h.skin, box, { shade: false })
  for (const e of h.eyes) R.dot(e.x, e.y, OUTLINE)
  if (h.helmet === null) return
  const brow = h.cage ? y + 0.55 * r : y - 0.12 * r + Math.max(0, -h.fz) * 0.45 * r
  const shell = ellTest(x - h.fx * 0.05 * r, y - 0.08 * r, rx * 1.12, r * 1.1)
  const above: Test = (_x, yy) => yy < brow
  R.shape((a, b) => shell(a, b) && above(a, b), h.helmet, box)
  if (!h.cage || h.fz <= -0.2) return
  const cx = x + h.fx * 0.35 * r
  const face = ellTest(cx, y + 0.1 * r, r * 0.85 * h.aspect, r)
  R.shape(face, tone(h.skin, 0.8), box, { shade: false })
  for (const e of h.eyes) R.dot(e.x, e.y, OUTLINE)
  R.shape((a, b) => face(a, b) && (Math.abs(((a - cx) / (0.3 * r)) % 1) < 0.34 || Math.abs(((b - y) / (0.45 * r)) % 1) < 0.24), GEAR.cage, box, { outline: false, shade: false })
}

function paintNumber(R: Raster, x: number, y: number, text: string, c: number) {
  const w = text.length * 4 - 1
  const left = Math.round(x - w / 2)
  const top = Math.round(y - 2.5)
  for (let n = 0; n < text.length; n++) {
    const rows = DIGITS[text[n]]
    if (!rows) continue
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
      if (rows[j] & (4 >> i)) R.dot(left + n * 4 + i, top + j, c)
    }
  }
}

/** Rasteriza las piezas en `img`, con los pies en el píxel (ox, oy). */
export function paintPixel(img: ImageData, parts: Part[], ox: number, oy: number) {
  const R = new Raster(img, ox, oy)
  for (const part of parts) {
    if (part.k === 'shadow') {
      const outer = ellTest(part.x, part.y, part.rx, part.ry)
      const core = ellTest(part.x, part.y, part.rx * 0.55, part.ry * 0.6)
      for (let py = Math.floor(part.y - part.ry); py <= part.y + part.ry; py++) {
        for (let px = Math.floor(part.x - part.rx); px <= part.x + part.rx; px++) {
          if (outer(px + 0.5, py + 0.5)) R.dot(px, py, 0x000000, core(px + 0.5, py + 0.5) ? 110 : 60)
        }
      }
      continue
    }
    if (part.k === 'head') {
      paintHead(R, part)
      continue
    }
    if (part.k === 'num') {
      if (part.size >= 5) paintNumber(R, part.x, part.y, part.text, part.c)
      continue
    }
    const s = shapeOf(part)
    if (s) R.shape(s.test, part.c, s.box, { outline: s.outline, shade: s.outline })
  }
}
