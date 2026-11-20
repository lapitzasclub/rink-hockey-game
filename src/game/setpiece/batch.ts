import * as Phaser from 'phaser'
import { PX_PER_M } from '../render/artSpec'
import type { SetPieceView } from './view'

/**
 * Lotes del decorado de los lanzamientos (L-00, L-05b): primitivas en metros (polígonos, rayas
 * y tubos) que cada fotograma se reproyectan con la cámara cercana sobre un Mesh2D de topología
 * fija, con el color sacado de una paleta horneada (y su versión fundida para el reflejo).
 */

/** Plano cercano de recorte (m sobre el eje óptico). */
const NEAR_CLIP = 0.12

// ─── Paleta horneada ─────────────────────────────────────────────────────────

const PALETTE_KEY = 'sp-palette'
const SWATCH = 4
const PALETTE: Array<[number, number]> = []
export const pal = (color: number, alpha: number) => PALETTE.push([color, alpha]) - 1

/** Paleta del reflejo: cada color en una columna que se funde de arriba (suelo) abajo (`fadeM` bajo el suelo). */
const REFL_KEY = 'sp-palette-refl'
const FADE_H = 16

/** Hornea las paletas (una vez por juego): un cuadradito de SWATCH px por color y su columna fundida. */
function ensurePalette(scene: Phaser.Scene) {
  if (scene.textures.exists(PALETTE_KEY)) return
  const rgba = ([color, alpha]: [number, number], k: number) =>
    `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha * k})`
  const tex = scene.textures.createCanvas(PALETTE_KEY, PALETTE.length * SWATCH, SWATCH)!
  const ctx = tex.getContext()
  PALETTE.forEach((c, i) => {
    ctx.fillStyle = rgba(c, 1)
    ctx.fillRect(i * SWATCH, 0, SWATCH, SWATCH)
  })
  tex.refresh()
  const refl = scene.textures.createCanvas(REFL_KEY, PALETTE.length * SWATCH, FADE_H)!
  const rc = refl.getContext()
  PALETTE.forEach((c, i) => {
    const g = rc.createLinearGradient(0, 0.5, 0, FADE_H - 0.5)
    g.addColorStop(0, rgba(c, 1))
    g.addColorStop(1, rgba(c, 0))
    rc.fillStyle = g
    rc.fillRect(i * SWATCH, 0, SWATCH, FADE_H)
  })
  refl.refresh()
}

// ─── Primitivas ──────────────────────────────────────────────────────────────

const OP_POLY = 0
const OP_LINE = 1
const OP_TUBE = 2

/** Lista de primitivas en metros: polígono convexo, raya de ancho fijo en pantalla y tubo. */
export class Ops {
  readonly list: number[] = []
  quads = 0
  poly(color: number, pts: number[][]) {
    this.list.push(OP_POLY, color, pts.length)
    for (const [x, y, z] of pts) this.list.push(x, y, z ?? 0)
    this.quads += Math.ceil((pts.length - 1) / 2)
  }
  line(color: number, widthPx: number, a: V3, b: V3) {
    this.list.push(OP_LINE, color, widthPx, a.x, a.y, a.z, b.x, b.y, b.z)
    this.quads += 1
  }
  tube(diam: number, body: number, edge: number, shine: number, a: V3, b: V3) {
    this.list.push(OP_TUBE, diam, body, edge, shine, a.x, a.y, a.z, b.x, b.y, b.z)
    this.quads += 3
  }
  /** Copia espejada bajo el suelo (z → −z) para el reflejo, sin lo que ya está en el suelo. */
  mirrored(): Ops {
    const out = new Ops()
    const o = this.list
    let i = 0
    while (i < o.length) {
      if (o[i] === OP_POLY) {
        const n = o[i + 2]
        const pts: number[][] = []
        for (let k = 0; k < n; k++) pts.push([o[i + 3 + k * 3], o[i + 4 + k * 3], -o[i + 5 + k * 3]])
        if (pts.some(p => p[2] !== 0)) out.poly(o[i + 1], pts)
        i += 3 + n * 3
      } else if (o[i] === OP_LINE) {
        out.line(o[i + 1], o[i + 2], v3(o[i + 3], o[i + 4], -o[i + 5]), v3(o[i + 6], o[i + 7], -o[i + 8]))
        i += 9
      } else {
        out.tube(o[i + 1], o[i + 2], o[i + 3], o[i + 4], v3(o[i + 5], o[i + 6], -o[i + 7]), v3(o[i + 8], o[i + 9], -o[i + 10]))
        i += 11
      }
    }
    return out
  }
}

export interface V3 { x: number; y: number; z: number }
export const v3 = (x: number, y: number, z = 0): V3 => ({ x, y, z })

// Búferes de trabajo (sin asignar por fotograma)
const clipIn = new Float64Array(3 * 64)
const clipOut = new Float64Array(3 * 64)
const scrX = new Float64Array(64)
const scrY = new Float64Array(64)
const scrV = new Float64Array(64)
const pj = { x: 0, y: 0, s: 0 }
const pk = { x: 0, y: 0, s: 0 }

/**
 * Lote de cuadriláteros sobre un Mesh2D: ranuras fijas, las que sobran quedan degeneradas.
 * Con `fadeM` > 0 es el del reflejo: cada vértice toma de la paleta fundida el alfa de su
 * profundidad bajo el suelo.
 */
export class StageBatch {
  readonly mesh: Phaser.GameObjects.Mesh2D
  private readonly verts: number[]
  private readonly cap: number
  private readonly ops: number[]
  private readonly fadeM: number
  private n = 0
  private za = 0
  private zb = 0

  constructor(scene: Phaser.Scene, ops: Ops, fadeM = 0) {
    ensurePalette(scene)
    this.ops = ops.list
    this.fadeM = fadeM
    this.cap = ops.quads
    this.verts = new Array<number>(this.cap * 16).fill(0)
    const indices: number[] = []
    const ordered: number[] = []
    for (let i = 0; i < this.cap; i++) {
      const b = i * 4
      indices.push(b, b + 1, b + 2, 0, b + 1, b + 3, b + 2, 0)
      ordered.push(b, b + 1, b + 2, 0, b + 1, b + 2, b + 3, 0)
    }
    this.mesh = scene.add.mesh2d(0, 0, fadeM > 0 ? REFL_KEY : PALETTE_KEY, this.verts, indices)
    if (fadeM > 0) {
      // Textura no uniforme por ranura: triángulos sueltos (la ruta ordenada pierde uno)
      this.mesh.setRenderAsTriangles(true)
    } else {
      this.mesh.indicesOrdered = ordered
      this.mesh.useOrderedIndices = true
    }
  }

  /** v de la paleta para un vértice a altura `z` (la del reflejo se funde hacia abajo). */
  private vOf(z: number): number {
    if (this.fadeM <= 0) return 0.5
    const f = Math.min(1, Math.max(0, -z / this.fadeM))
    return 1 - (0.5 + f * (FADE_H - 1)) / FADE_H
  }

  /** Reproyecta todas las primitivas con `view`. */
  draw(view: SetPieceView) {
    this.n = 0
    const o = this.ops
    let i = 0
    while (i < o.length) {
      const op = o[i]
      if (op === OP_POLY) {
        const color = o[i + 1], n = o[i + 2]
        for (let k = 0; k < n * 3; k++) clipIn[k] = o[i + 3 + k]
        this.polygon(view, n, color)
        i += 3 + n * 3
      } else if (op === OP_LINE) {
        if (this.segment(view, o[i + 3], o[i + 4], o[i + 5], o[i + 6], o[i + 7], o[i + 8])) {
          this.band(pj.x, pj.y, pk.x, pk.y, o[i + 2], 0, o[i + 1], this.vOf(this.za), this.vOf(this.zb))
        }
        i += 9
      } else {
        const d = o[i + 1]
        if (this.segment(view, o[i + 5], o[i + 6], o[i + 7], o[i + 8], o[i + 9], o[i + 10])) {
          const w = Math.max(1, d * ((pj.s + pk.s) / 2) * PX_PER_M)
          const va = this.vOf(this.za), vb = this.vOf(this.zb)
          this.band(pj.x, pj.y, pk.x, pk.y, w + 2, (w + 2) / 2, o[i + 3], va, vb)
          this.band(pj.x, pj.y, pk.x, pk.y, w, w / 2, o[i + 2], va, vb)
          const off = w * 0.22
          this.band(pj.x - off, pj.y - off, pk.x - off, pk.y - off, Math.max(1, w * 0.28), 0, o[i + 4], va, vb)
        }
        i += 11
      }
    }
    // Ranuras sobrantes: degeneradas en un punto fuera de pantalla
    const v = this.verts
    for (let q = this.n * 16; q < this.cap * 16; q += 4) { v[q] = -9999; v[q + 1] = -9999 }
  }

  /** Recorta el polígono de `clipIn` contra el plano cercano, lo proyecta y lo emite en abanico. */
  private polygon(view: SetPieceView, n: number, color: number) {
    let m = 0
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n
      const ax = clipIn[k * 3], ay = clipIn[k * 3 + 1], az = clipIn[k * 3 + 2]
      const bx = clipIn[j * 3], by = clipIn[j * 3 + 1], bz = clipIn[j * 3 + 2]
      const da = view.depth(ax, ay, az) - NEAR_CLIP
      const db = view.depth(bx, by, bz) - NEAR_CLIP
      if (da >= 0) { clipOut[m * 3] = ax; clipOut[m * 3 + 1] = ay; clipOut[m * 3 + 2] = az; m++ }
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db)
        clipOut[m * 3] = ax + (bx - ax) * t; clipOut[m * 3 + 1] = ay + (by - ay) * t; clipOut[m * 3 + 2] = az + (bz - az) * t
        m++
      }
    }
    if (m < 3) return
    for (let k = 0; k < m; k++) {
      view.project(clipOut[k * 3], clipOut[k * 3 + 1], clipOut[k * 3 + 2], pj)
      scrX[k] = pj.x; scrY[k] = pj.y; scrV[k] = this.vOf(clipOut[k * 3 + 2])
    }
    for (let k = 1; k + 1 < m; k += 2) {
      const c = Math.min(k + 2, m - 1)
      // Cuadrilátero (0, k, k+1, k+2) en orden de tira: 0, k, k+2, k+1
      this.quad(scrX[0], scrY[0], scrX[k], scrY[k], scrX[c], scrY[c], scrX[k + 1], scrY[k + 1], color, scrV[0], scrV[k], scrV[c], scrV[k + 1])
    }
  }

  /** Recorta un segmento contra el plano cercano y deja sus extremos proyectados en pj/pk. */
  private segment(view: SetPieceView, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const da = view.depth(ax, ay, az) - NEAR_CLIP
    const db = view.depth(bx, by, bz) - NEAR_CLIP
    if (da < 0 && db < 0) return false
    if (da < 0) { const t = da / (da - db); ax += (bx - ax) * t; ay += (by - ay) * t; az += (bz - az) * t }
    else if (db < 0) { const t = db / (db - da); bx += (ax - bx) * t; by += (ay - by) * t; bz += (az - bz) * t }
    view.project(ax, ay, az, pj)
    view.project(bx, by, bz, pk)
    this.za = az
    this.zb = bz
    return true
  }

  /** Banda de `w` px entre dos puntos de pantalla, alargada `ext` px por cada extremo. */
  private band(ax: number, ay: number, bx: number, by: number, w: number, ext: number, color: number, va: number, vb: number) {
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    const nx = -uy * w * 0.5, ny = ux * w * 0.5
    ax -= ux * ext; ay -= uy * ext; bx += ux * ext; by += uy * ext
    this.quad(ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny, bx - nx, by - ny, color, va, va, vb, vb)
  }

  /** Escribe una ranura en orden de tira (TL, BL, TR, BR). */
  private quad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number, v0: number, v1: number, v2: number, v3: number) {
    if (this.n >= this.cap) return
    const v = this.verts
    const q = this.n++ * 16
    const u = (color * SWATCH + SWATCH / 2) / (PALETTE.length * SWATCH)
    v[q] = x0; v[q + 1] = y0; v[q + 2] = u; v[q + 3] = v0
    v[q + 4] = x1; v[q + 5] = y1; v[q + 6] = u; v[q + 7] = v1
    v[q + 8] = x2; v[q + 9] = y2; v[q + 10] = u; v[q + 11] = v2
    v[q + 12] = x3; v[q + 13] = y3; v[q + 14] = u; v[q + 15] = v3
  }
}
