import * as Phaser from 'phaser'
import { SETPIECE_STAGE } from '../artSpec'
import type { SetPieceView } from '../../setpiece/view'

/**
 * Mallas proyectadas del escenario cercano (L-05/L-05b): celdas planas en metros con su
 * textura, de topología fija, que cada fotograma solo se reproyectan con la cámara cercana.
 * `TexGrid` descarta las celdas que se acercan a la cámara (decorado lejano: vallas, gradas);
 * `ClipBatch` las recorta contra el plano cercano y subdivide las próximas (suelo, luz), así
 * que no deja cuñas ni huecos aunque la cámara pase por encima. También la cola de horneado
 * por tandas que comparten las texturas grandes.
 */

/** Una celda con una esquina más allá de este valor (px) se descarta (solo `TexGrid`). */
const MAX_COORD = 1500
const OFF = -9999

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** Lista de celdas (cuadriláteros TL, BL, TR, BR) en metros con sus UV y el peso del balanceo de cada esquina. */
export class Cells {
  pos: number[] = []
  uv: number[] = []
  sway: number[] = []
  get count() { return this.pos.length / 12 }
  /** `c` = cuatro esquinas [x, y, z, u, v, fase, peso]. */
  add(c: number[][]) {
    for (const [x, y, z, u, v, ph, w] of c) {
      this.pos.push(x, y, z)
      this.uv.push(u, v)
      this.sway.push(ph ?? 0, w ?? 0)
    }
  }
}

const pj = { x: 0, y: 0, s: 0 }

/** Índices de triángulos sueltos: la ruta de cuadriláteros ordenados de Phaser 4.2 pierde un triángulo de las celdas no rectangulares. */
function triIndices(n: number) {
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const b = i * 4
    indices.push(b, b + 1, b + 2, 0, b + 1, b + 3, b + 2, 0)
  }
  return indices
}

/**
 * Mesh2D de celdas con textura: se reproyecta entera en cada fotograma. `cull` = 1 descarta las
 * celdas vistas de espaldas; −1, las de frente (geometría espejada del reflejo); 0, ninguna.
 * `amp` mueve en z las esquinas con peso (balanceo de la peña).
 */
export class TexGrid {
  readonly mesh: Phaser.GameObjects.Mesh2D
  readonly verts: number[]
  readonly cells: Cells
  private readonly amp: number
  private readonly cull: number
  private readonly near: number

  constructor(scene: Phaser.Scene, key: string, cells: Cells, depth: number, amp: number, cull = 1, near = SETPIECE_STAGE.nearClipM) {
    this.cells = cells
    this.amp = amp
    this.cull = cull
    this.near = near
    const n = cells.count
    this.verts = new Array<number>(n * 16).fill(0)
    this.setUV(0, n, cells.uv)
    this.mesh = scene.add.mesh2d(0, 0, key, this.verts, triIndices(n))
    this.mesh.setRenderAsTriangles(true)
    this.mesh.setDepth(depth)
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR)
  }

  /** Escribe las UV de las celdas [from, from + n) (cambio de peña sin rehacer la malla). */
  setUV(from: number, n: number, uv: readonly number[], at = from) {
    for (let i = 0; i < n * 4; i++) {
      this.verts[(at * 4 + i) * 4 + 2] = uv[(from * 4 + i) * 2]
      this.verts[(at * 4 + i) * 4 + 3] = 1 - uv[(from * 4 + i) * 2 + 1]
    }
  }

  draw(view: SetPieceView, t: number) {
    const { pos, sway } = this.cells
    const v = this.verts
    const n = this.cells.count
    const amp = this.amp
    for (let c = 0; c < n; c++) {
      let ok = true
      for (let k = 0; k < 4; k++) {
        const i = c * 4 + k
        const w = sway[i * 2 + 1]
        const z = pos[i * 3 + 2] + (amp > 0 && w > 0 ? amp * w * Math.sin(t + sway[i * 2]) : 0)
        if (view.depth(pos[i * 3], pos[i * 3 + 1], z) < this.near) { ok = false; break }
        view.project(pos[i * 3], pos[i * 3 + 1], z, pj)
        v[i * 4] = pj.x
        v[i * 4 + 1] = pj.y
        // Celdas casi pegadas a la cámara (esquinas a miles de px): la deformación afín las rompe; fuera
        if (Math.abs(pj.x) > MAX_COORD || Math.abs(pj.y) > MAX_COORD) { ok = false; break }
      }
      if (ok && this.cull !== 0) {
        // Orientación en pantalla (cruz TL→BL × TL→TR): de espaldas, fuera
        const a = c * 16
        const cross = (v[a + 4] - v[a]) * (v[a + 9] - v[a + 1]) - (v[a + 5] - v[a + 1]) * (v[a + 8] - v[a])
        if (cross * this.cull >= 0) ok = false
      }
      if (!ok) for (let k = 0; k < 4; k++) { v[(c * 4 + k) * 4] = OFF; v[(c * 4 + k) * 4 + 1] = OFF }
    }
  }
}

// ─── Celdas recortadas ───────────────────────────────────────────────────────

/** Vértices de trabajo [x, y, z, u, v] (sin asignar por fotograma). */
const ring = new Float64Array(5 * 8)
const clip = new Float64Array(5 * 8)
const sub = new Float64Array(5 * 9)
const dep = new Float64Array(9)

/**
 * Celdas planas con textura recortadas contra el plano cercano (`near`, m) y, si alguna esquina
 * queda a menos de `subD` m, partidas en 2 × 2 para que la textura no se tuerza de cerca (mapeo
 * afín por triángulo). Las UV son afines en cada celda (rectángulos y paralelogramos), así que
 * recortar y subdividir interpolando es exacto. Ranuras fijas: dos por celda y seis más por cada
 * una de hasta `maxSub` celdas subdivididas.
 */
export class ClipBatch {
  readonly mesh: Phaser.GameObjects.Mesh2D
  private readonly src: Float64Array
  private readonly verts: number[]
  private readonly cap: number
  private readonly count: number
  private readonly near: number
  private readonly subD: number
  private readonly maxSub: number
  private n = 0
  private subs = 0

  constructor(scene: Phaser.Scene, key: string, cells: Cells, depth: number, near: number, subD = 0, maxSub = 0) {
    this.count = cells.count
    this.near = near
    this.subD = subD
    this.maxSub = subD > 0 ? maxSub : 0
    // Esquinas en orden de contorno (TL, BL, BR, TR)
    this.src = new Float64Array(this.count * 20)
    const order = [0, 1, 3, 2]
    for (let c = 0; c < this.count; c++) {
      for (let k = 0; k < 4; k++) {
        const i = c * 4 + order[k], o = c * 20 + k * 5
        this.src[o] = cells.pos[i * 3]; this.src[o + 1] = cells.pos[i * 3 + 1]; this.src[o + 2] = cells.pos[i * 3 + 2]
        this.src[o + 3] = cells.uv[i * 2]; this.src[o + 4] = 1 - cells.uv[i * 2 + 1]
      }
    }
    this.cap = this.count * 2 + this.maxSub * 6
    this.verts = new Array<number>(this.cap * 16).fill(0)
    this.mesh = scene.add.mesh2d(0, 0, key, this.verts, triIndices(this.cap))
    this.mesh.setRenderAsTriangles(true)
    this.mesh.setDepth(depth)
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR)
  }

  draw(view: SetPieceView) {
    this.n = 0
    this.subs = 0
    const s = this.src
    for (let c = 0; c < this.count; c++) {
      const o = c * 20
      let min = Infinity, max = -Infinity
      for (let k = 0; k < 4; k++) {
        const d = view.depth(s[o + k * 5], s[o + k * 5 + 1], s[o + k * 5 + 2])
        dep[k] = d
        if (d < min) min = d
        if (d > max) max = d
      }
      if (max < this.near) continue
      if (min < this.subD && this.subs < this.maxSub) { this.subs++; this.split(view, o); continue }
      for (let k = 0; k < 20; k++) ring[k] = s[o + k]
      this.leaf(view, min)
    }
    const v = this.verts
    for (let q = this.n * 16; q < this.cap * 16; q += 4) { v[q] = OFF; v[q + 1] = OFF }
  }

  /** Parte la celda en 2 × 2 (bilineal entre sus esquinas) y emite cada trozo. */
  private split(view: SetPieceView, o: number) {
    const s = this.src
    // Rejilla 3 × 3: (i, j) con i a lo largo de TL→TR y j de TL→BL
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const a = i / 2, b = j / 2, g = (j * 3 + i) * 5
        for (let f = 0; f < 5; f++) {
          const tl = s[o + f], bl = s[o + 5 + f], br = s[o + 10 + f], tr = s[o + 15 + f]
          sub[g + f] = (tl * (1 - a) + tr * a) * (1 - b) + (bl * (1 - a) + br * a) * b
        }
        dep[j * 3 + i] = view.depth(sub[g], sub[g + 1], sub[g + 2])
      }
    }
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        let min = Infinity, max = -Infinity
        for (let k = 0; k < 4; k++) {
          // Contorno TL, BL, BR, TR del trozo
          const id = (j + (k === 1 || k === 2 ? 1 : 0)) * 3 + i + (k >= 2 ? 1 : 0)
          const d = dep[id]
          if (d < min) min = d
          if (d > max) max = d
          for (let f = 0; f < 5; f++) ring[k * 5 + f] = sub[id * 5 + f]
        }
        if (max >= this.near) this.leaf(view, min)
      }
    }
  }

  /** Recorta el cuadrilátero de `ring` contra el plano cercano, lo proyecta y lo emite. */
  private leaf(view: SetPieceView, min: number) {
    let m = 4
    let poly = ring
    if (min < this.near) {
      m = 0
      for (let k = 0; k < 4; k++) {
        const a = k * 5, b = ((k + 1) % 4) * 5
        const da = view.depth(ring[a], ring[a + 1], ring[a + 2]) - this.near
        const db = view.depth(ring[b], ring[b + 1], ring[b + 2]) - this.near
        if (da >= 0) { for (let f = 0; f < 5; f++) clip[m * 5 + f] = ring[a + f]; m++ }
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db)
          for (let f = 0; f < 5; f++) clip[m * 5 + f] = ring[a + f] + (ring[b + f] - ring[a + f]) * t
          m++
        }
      }
      if (m < 3) return
      poly = clip
    }
    // Abanico de cuadriláteros (0, k, k+1, k+2); el último puede ser un triángulo
    for (let k = 1; k + 1 < m; k += 2) {
      const c = Math.min(k + 2, m - 1)
      this.quad(view, poly, 0, k, c, k + 1)
    }
  }

  /** Ranura en orden de tira con los vértices del contorno `a` (TL), `b` (BL), `c` (TR) y `d` (BR). */
  private quad(view: SetPieceView, p: Float64Array, a: number, b: number, c: number, d: number) {
    if (this.n >= this.cap) return
    const q = this.n++ * 16
    this.put(view, q, p, a)
    this.put(view, q + 4, p, b)
    this.put(view, q + 8, p, c)
    this.put(view, q + 12, p, d)
  }

  private put(view: SetPieceView, q: number, p: Float64Array, i: number) {
    const o = i * 5, v = this.verts
    view.project(p[o], p[o + 1], p[o + 2], pj)
    v[q] = pj.x
    v[q + 1] = pj.y
    v[q + 2] = p[o + 3]
    v[q + 3] = p[o + 4]
  }
}

// ─── Horneado por tandas ─────────────────────────────────────────────────────

/** Cola de horneado: un trozo de `sliceMs` y cede el hilo; un trabajo detrás de otro. */
const queue: Array<() => void> = []
let running = false

export function enqueue(job: Generator, done: () => void) {
  queue.push(() => {
    const step = () => {
      const t0 = performance.now()
      while (performance.now() - t0 < SETPIECE_STAGE.stands.sliceMs) {
        if (job.next().done) {
          // El cierre (subir la textura) va en su propio turno
          setTimeout(() => { done(); running = false; next() }, 16)
          return
        }
      }
      setTimeout(step, 16)
    }
    step()
  })
  next()
}

function next() {
  if (running) return
  const job = queue.shift()
  if (!job) return
  running = true
  setTimeout(job, 16)
}

// ─── Anillo de paredes y gradas ──────────────────────────────────────────────

/** Marco de una pared en el suelo: origen, derecha del espectador que mira a la pared, normal exterior y longitud (m). */
export interface WallFrame { ox: number; oy: number; rx: number; ry: number; nx: number; ny: number; len: number }
export type WallFrames = Record<'back' | 'left' | 'right' | 'far', WallFrame>

/** Marcos de las cuatro paredes con el espectador (interior de la pista) mirando hacia fuera. */
export function wallFrames(halfW: number, backY: number, farY: number): WallFrames {
  const w = halfW * 2, l = farY - backY
  return {
    back: { ox: -halfW, oy: backY, rx: 1, ry: 0, nx: 0, ny: -1, len: w },
    left: { ox: -halfW, oy: farY, rx: 0, ry: -1, nx: -1, ny: 0, len: l },
    right: { ox: halfW, oy: backY, rx: 0, ry: 1, nx: 1, ny: 0, len: l },
    far: { ox: halfW, oy: farY, rx: -1, ry: 0, nx: 0, ny: 1, len: w },
  }
}

/**
 * Tramo del anillo de gradas: `n` columnas y `at(c, d)` = (x, y, u) del borde `c` (0..n) a la
 * distancia `d` (m) de la valla; `u` son los metros de textura a lo largo del tramo.
 */
export interface Strip { n: number; at: (c: number, d: number) => [number, number, number] }

/** Recta de una pared en trozos del ancho de la textura (`W`), con columnas de `colM`. */
function straightStrips(f: WallFrame, W: number, colM: number): Strip[] {
  const out: Strip[] = []
  for (let s = 0; s < f.len - 1e-6; s += W) {
    const span = Math.min(W, f.len - s)
    const n = Math.ceil(span / colM)
    out.push({
      n,
      at: (c, d) => {
        const u = s + (span * c) / n
        return [f.ox + f.rx * u + f.nx * d, f.oy + f.ry * u + f.ny * d, u - s]
      },
    })
  }
  return out
}

/** Esquina entre dos paredes consecutivas: cuarto de círculo alrededor del vértice de la valla. */
function cornerStrip(px: number, py: number, a: WallFrame, b: WallFrame, n: number): Strip {
  const a0 = Math.atan2(a.ny, a.nx)
  const delta = Math.atan2(a.nx * b.ny - a.ny * b.nx, a.nx * b.nx + a.ny * b.ny)
  return {
    n,
    at: (c, d) => {
      const phi = (c / n) * delta
      return [px + Math.cos(a0 + phi) * d, py + Math.sin(a0 + phi) * d, Math.abs(phi) * d]
    },
  }
}

/** Rectas y esquinas del anillo (sentido: fondo, derecha, contrario, izquierda): `back` (la peña), `side` (el resto) y `all`. */
export function ringStrips(frames: WallFrames, W: number, colM: number, cornerCols: number) {
  const order = [frames.back, frames.right, frames.far, frames.left]
  const corners = order.map((f, i) => cornerStrip(f.ox + f.rx * f.len, f.oy + f.ry * f.len, f, order[(i + 1) % 4], cornerCols))
  return {
    back: straightStrips(frames.back, W, colM),
    side: [frames.right, frames.far, frames.left].flatMap(f => straightStrips(f, W, colM)).concat(corners),
    all: order.flatMap(f => straightStrips(f, W, colM)).concat(corners),
  }
}
