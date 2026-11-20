import * as Phaser from 'phaser'
import { BOARDS, CROWD, LIGHT, PX_PER_M, SETPIECE_STAGE, STANDS, STANDS_COLORS as SC } from '../artSpec'
import { ADS } from '../rink/ads'
import { makeLook, paintFan, shade } from '../stands/fans'
import { mulberry32 } from '../stands/layout'
import { teamKit } from '../puppet/kit'
import { crowdAnimated, qualityTier } from '../quality'
import type { TeamColor } from '../../types'
import type { SetPieceView } from '../../setpiece/view'

/**
 * Fondo del escenario cercano de los lanzamientos (L-05): publicidad de la valla y gradas con
 * público, con los mismos colores, figuras (`stands/fans.ts`) y textos que el partido, vistos
 * con la cámara baja. Las gradas son planos inclinados anclados en 3D detrás de la valla
 * (peto, escalones y fondo vacío); su textura se hornea una vez, por calidad y en trozos
 * de pocos ms para no dar un tirón al entrar; el filtro lineal de una textura a esa resolución
 * deja suave lo lejano. Cada fotograma solo se reproyectan las esquinas de las celdas
 * (Mesh2D de topología fija). En calidad media y alta la peña se balancea un poco.
 */

const G = SETPIECE_STAGE.stands
const NEAR_CLIP = 0.8
/** Una celda con una esquina más allá de este valor (px) se descarta. */
const MAX_COORD = 1500
const BACK_DEPTH = -1e6

/** Marco de una pared en el suelo: origen, derecha del espectador que mira a la pared, normal exterior y longitud (m). */
export interface WallFrame { ox: number; oy: number; rx: number; ry: number; nx: number; ny: number; len: number }

/** Marcos de las cuatro paredes con el espectador (interior de la pista) mirando hacia fuera. */
export function wallFrames(halfW: number, backY: number, farY: number): Record<'back' | 'left' | 'right' | 'far', WallFrame> {
  const w = halfW * 2, l = farY - backY
  return {
    back: { ox: -halfW, oy: backY, rx: 1, ry: 0, nx: 0, ny: -1, len: w },
    left: { ox: -halfW, oy: farY, rx: 0, ry: -1, nx: -1, ny: 0, len: l },
    right: { ox: halfW, oy: backY, rx: 0, ry: 1, nx: 1, ny: 0, len: l },
    far: { ox: halfW, oy: farY, rx: -1, ry: 0, nx: 0, ny: 1, len: w },
  }
}

// ─── Celdas proyectadas ──────────────────────────────────────────────────────

/** Lista de celdas (cuadriláteros TL, BL, TR, BR) en metros con sus UV y el peso del balanceo de cada esquina. */
class Cells {
  pos: number[] = []
  uv: number[] = []
  sway: number[] = []
  get count() { return this.pos.length / 12 }
  /** `c` = cuatro esquinas [x, y, z, u, v, fase, peso]. */
  add(c: number[][]) {
    for (const [x, y, z, u, v, ph, w] of c) {
      this.pos.push(x, y, z)
      this.uv.push(u, v)
      this.sway.push(ph, w)
    }
  }
}

const pj = { x: 0, y: 0, s: 0 }

/** Mesh2D de celdas con textura: se reproyecta entera en cada fotograma. */
class TexGrid {
  readonly mesh: Phaser.GameObjects.Mesh2D
  private readonly verts: number[]
  private readonly cells: Cells
  private readonly amp: number

  constructor(scene: Phaser.Scene, key: string, cells: Cells, depth: number, amp: number) {
    this.cells = cells
    this.amp = amp
    const n = cells.count
    this.verts = new Array<number>(n * 16).fill(0)
    for (let i = 0; i < n * 4; i++) { this.verts[i * 4 + 2] = cells.uv[i * 2]; this.verts[i * 4 + 3] = 1 - cells.uv[i * 2 + 1] }
    const indices: number[] = []
    for (let i = 0; i < n; i++) {
      const b = i * 4
      indices.push(b, b + 1, b + 2, 0, b + 1, b + 3, b + 2, 0)
    }
    this.mesh = scene.add.mesh2d(0, 0, key, this.verts, indices)
    // Triángulos sueltos: la ruta de cuadriláteros ordenados de Phaser 4.2 pierde un triángulo de las celdas no rectangulares
    this.mesh.setRenderAsTriangles(true)
    this.mesh.setDepth(depth)
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR)
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
        if (view.depth(pos[i * 3], pos[i * 3 + 1], z) < NEAR_CLIP) { ok = false; break }
        view.project(pos[i * 3], pos[i * 3 + 1], z, pj)
        v[i * 4] = pj.x
        v[i * 4 + 1] = pj.y
        // Celdas casi pegadas a la cámara (esquinas a miles de px): la deformación afín las rompe; fuera
        if (Math.abs(pj.x) > MAX_COORD || Math.abs(pj.y) > MAX_COORD) { ok = false; break }
      }
      if (ok) {
        // De espaldas (cruz TL→BL × TL→TR ≥ 0 en pantalla): celdas de otra pared vistas del revés, fuera
        const a = c * 16
        if ((v[a + 4] - v[a]) * (v[a + 9] - v[a + 1]) - (v[a + 5] - v[a + 1]) * (v[a + 8] - v[a]) >= 0) ok = false
      }
      if (!ok) for (let k = 0; k < 4; k++) { v[(c * 4 + k) * 4] = -9999; v[(c * 4 + k) * 4 + 1] = -9999 }
    }
  }
}

// ─── Publicidad ──────────────────────────────────────────────────────────────

const AD_KEY = 'sp-ads'
const AD_W = 320
const AD_H = 72
const AD_COLS = 2

/** Atlas de paneles (los `ADS` del partido: mismo fondo, texto y brillo superior), una vez por juego. */
function ensureAdAtlas(scene: Phaser.Scene) {
  if (scene.textures.exists(AD_KEY)) return
  const rows = Math.ceil(ADS.length / AD_COLS)
  const tex = scene.textures.createCanvas(AD_KEY, AD_W * AD_COLS, AD_H * rows)!
  const ctx = tex.getContext()
  ctx.font = `${Math.round(AD_H * 0.5)}px "Russo One", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ADS.forEach(([text, bg, fg], i) => {
    const x = (i % AD_COLS) * AD_W, y = Math.floor(i / AD_COLS) * AD_H
    ctx.fillStyle = `#${bg.toString(16).padStart(6, '0')}`
    ctx.fillRect(x, y, AD_W, AD_H)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(x, y, AD_W, AD_H * 0.3)
    ctx.fillStyle = fg
    ctx.fillText(text, x + AD_W / 2, y + AD_H * 0.54)
  })
  tex.refresh()
}

/** Paneles de publicidad de una pared (franja `adFar`, paneles de `adWidthM`), girando por la lista `ADS`. */
function adCells(f: WallFrame, phase: number): Cells {
  const cells = new Cells()
  const rows = Math.ceil(ADS.length / AD_COLS)
  const W = AD_W * AD_COLS, H = AD_H * rows
  const z0 = BOARDS.adFar.z0, z1 = BOARDS.adFar.z1
  const n = Math.max(1, Math.round(f.len / BOARDS.adWidthM))
  const cols = SETPIECE_STAGE.adCols
  const gap = SETPIECE_STAGE.adGapM / 2
  const at = (u: number, z: number, uu: number, vv: number) =>
    [f.ox + f.rx * u + f.nx * -0.012, f.oy + f.ry * u + f.ny * -0.012, z, uu, vv, 0, 0]
  for (let i = 0; i < n; i++) {
    const idx = (i * 3 + phase) % ADS.length
    const cx = (idx % AD_COLS) * AD_W, cy = Math.floor(idx / AD_COLS) * AD_H
    const a = (f.len * i) / n + gap, b = (f.len * (i + 1)) / n - gap
    for (let c = 0; c < cols; c++) {
      const ua = a + ((b - a) * c) / cols, ub = a + ((b - a) * (c + 1)) / cols
      const ta = (cx + 0.5 + (AD_W - 1) * (c / cols)) / W, tb = (cx + 0.5 + (AD_W - 1) * ((c + 1) / cols)) / W
      const t0 = (cy + 0.5) / H, t1 = (cy + AD_H - 0.5) / H
      cells.add([at(ua, z1, ta, t0), at(ua, z0, ta, t1), at(ub, z1, tb, t0), at(ub, z0, tb, t1)])
    }
  }
  return cells
}

// ─── Gradas ──────────────────────────────────────────────────────────────────

type StandKind = 'side' | TeamColor

interface StandGeo { tierPx: number; parPx: number; w: number; h: number; k: number; W: number }

function standGeo(W: number, k: number): StandGeo {
  const tierPx = Math.hypot(STANDS.tierDepthM, G.riseM) * k
  const parPx = Math.hypot(G.firstM - G.setbackM, 1) * k
  return { tierPx, parPx, w: Math.ceil(W * k), h: Math.ceil((G.tiers + 1) * tierPx + parPx), k, W }
}

/** Pinta una grada de frente (de arriba abajo, fila a fila): estructura, asientos y público. */
function* paintStand(ctx: CanvasRenderingContext2D, geo: StandGeo, kind: StandKind) {
  const { k, W, tierPx, parPx, w } = geo
  const pena: TeamColor | null = kind === 'side' ? null : kind
  const kitT = pena ? teamKit(pena) : null
  const kit: [number, number] = kitT ? [kitT.jersey, kitT.shorts] : [0, 0]
  const r = mulberry32(pena === 'blue' ? 11 : pena === 'red' ? 13 : 17)
  const T = G.tiers
  const centers = STANDS.aislesLong.map(a => a * W).concat([W])
  const half = STANDS.aisleM / 2
  const step = STANDS.seatSpacingM

  for (let j = T - 1; j >= 0; j--) {
    const top = (T - j) * tierPx
    const t = Math.min(1, j / (T - 1))
    const light = SC.lightFront + (SC.lightBack - SC.lightFront) * t
    // Huella (arriba) y contrahuella (abajo) con el cantil dorado entre ambas
    const lightS = light * G.structK
    ctx.fillStyle = shade(SC.tread, lightS, 0)
    ctx.fillRect(0, top, w, tierPx * 0.45 + 1)
    ctx.fillStyle = shade(SC.riser, lightS, 0)
    ctx.fillRect(0, top + tierPx * 0.45, w, tierPx * 0.55 + 1)
    ctx.fillStyle = shade(SC.nosing, lightS, 0, 0.55)
    ctx.fillRect(0, top + tierPx * 0.45, w, Math.max(1, k * 0.04))
    // Pasillos
    ctx.fillStyle = shade(SC.tread, lightS * 1.18, 0)
    for (let c = 1; c < centers.length - 1; c++) ctx.fillRect((centers[c] - half) * k, top, STANDS.aisleM * k, tierPx + 1)

    const penaRow = pena !== null && j < CROWD.penaTiers
    const empty = (penaRow ? CROWD.penaEmpty : CROWD.emptyFront + (CROWD.emptyBack - CROWD.emptyFront) * t) * G.emptyK
    const hipY = top + tierPx * 0.5
    const seatCol = penaRow ? shade(kit[0], light * CROWD.penaSeatK, 0) : shade(SC.seats[(j >> 1) % SC.seats.length], light, 0)
    for (let b = 0; b < centers.length - 1; b++) {
      const u0 = centers[b] + (b === 0 ? 0 : half), u1 = centers[b + 1] - (b === centers.length - 2 ? 0 : half)
      const n = Math.floor((u1 - u0) / step)
      const pad = (u1 - u0 - (n - 1) * step) / 2
      for (let s = 0; s < n; s++) {
        const x = (u0 + pad + s * step) * k
        ctx.fillStyle = seatCol
        ctx.fillRect(x - G.seatWidthM * 0.5 * k, hipY - 0.5 * k, G.seatWidthM * k, 0.5 * k)
        ctx.fillRect(x - G.seatWidthM * 0.55 * k, hipY - 0.04 * k, G.seatWidthM * 1.1 * k, 0.14 * k)
        if (r() < empty) continue
        const look = makeLook(r, penaRow ? pena : null, kit[0], kit[1])
        paintFan(ctx, x, hipY, k * G.fanK, look, light, { turn: (r() - 0.5) * 0.3, back: false, cheer: false })
      }
    }
    yield
  }

  // Peto: cuerpo, cristal, pasamanos y, en la peña, banda con el color del club
  const y0 = (T + 1) * tierPx
  ctx.fillStyle = shade(SC.parapet, SC.lightFront, 0)
  ctx.fillRect(0, y0, w, parPx + 1)
  if (pena) {
    ctx.fillStyle = shade(kit[0], 0.7, 0)
    ctx.fillRect(0, y0 + parPx * 0.4, w, parPx * 0.24)
  }
  ctx.fillStyle = SC.glass
  ctx.fillRect(0, y0, w, parPx * 0.34)
  ctx.fillStyle = shade(SC.coping, SC.lightFront, 0)
  ctx.fillRect(0, y0, w, Math.max(2, k * 0.08))
  ctx.fillStyle = shade(SC.rail, SC.lightFront, 0)
  ctx.fillRect(0, y0 + parPx * 0.34, w, Math.max(1, k * 0.03))
  yield
}

/** Cola de horneado: un trozo de `sliceMs` y cede el hilo; una textura detrás de otra. */
const queue: Array<() => void> = []
let running = false
function enqueue(job: Generator, done: () => void) {
  queue.push(() => {
    const step = () => {
      const t0 = performance.now()
      while (performance.now() - t0 < G.sliceMs) {
        if (job.next().done) { done(); running = false; next(); return }
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

// ─── Tramos del anillo (rectas y esquinas) ──────────────────────────────────

/**
 * Tramo del anillo de gradas: `n` columnas y `at(c, d)` = (x, y, u) del borde `c` (0..n) a la
 * distancia `d` (m) de la valla; `u` son los metros de textura a lo largo del tramo.
 */
interface Strip { n: number; at: (c: number, d: number) => [number, number, number] }

/** Recta de una pared en trozos del ancho de la textura (`W`), con columnas de `colM`. */
function straightStrips(f: WallFrame, W: number): Strip[] {
  const out: Strip[] = []
  for (let s = 0; s < f.len - 1e-6; s += W) {
    const span = Math.min(W, f.len - s)
    const n = Math.ceil(span / G.colM)
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
function cornerStrip(px: number, py: number, a: WallFrame, b: WallFrame): Strip {
  const a0 = Math.atan2(a.ny, a.nx)
  const delta = Math.atan2(a.nx * b.ny - a.ny * b.nx, a.nx * b.nx + a.ny * b.ny)
  const n = G.cornerCols
  return {
    n,
    at: (c, d) => {
      const phi = (c / n) * delta
      return [px + Math.cos(a0 + phi) * d, py + Math.sin(a0 + phi) * d, Math.abs(phi) * d]
    },
  }
}

/** Rectas laterales y de fondo contrario, y las cuatro esquinas (en el sentido del anillo: fondo, derecha, contrario, izquierda). */
function ringStrips(frames: ReturnType<typeof wallFrames>, W: number) {
  const order = [frames.back, frames.right, frames.far, frames.left]
  const corners = order.map((f, i) => cornerStrip(f.ox + f.rx * f.len, f.oy + f.ry * f.len, f, order[(i + 1) % 4]))
  return {
    back: straightStrips(frames.back, W),
    side: [frames.right, frames.far, frames.left].flatMap(f => straightStrips(f, W)).concat(corners),
    all: order.flatMap(f => straightStrips(f, W)).concat(corners),
  }
}

/** Celdas de gradas: peto vertical, `tiers` escalones y una fila vacía arriba para las cabezas. */
function standCells(strips: Strip[], geo: StandGeo, weight: number): Cells {
  const cells = new Cells()
  const T = G.tiers
  // Fronteras de arriba abajo: (distancia a la valla, altura, y de textura)
  const bounds: Array<[number, number, number]> = []
  for (let b = 0; b <= T + 1; b++) {
    const j = T + 1 - b
    bounds.push([G.firstM + j * STANDS.tierDepthM, 1 + j * G.riseM, b * geo.tierPx])
  }
  bounds.push([G.setbackM, 0, (T + 1) * geo.tierPx + geo.parPx])
  const picks: number[] = []
  for (let b = 0; b <= T + 1; b += 2) picks.push(b)
  if (picks[picks.length - 1] !== T + 1) picks.push(T + 1)
  picks.push(T + 2)

  for (const st of strips) {
    for (let c = 0; c < st.n; c++) {
      for (let i = 0; i + 1 < picks.length; i++) {
        const A = bounds[picks[i]], B = bounds[picks[i + 1]]
        const corner = (cc: number, bd: [number, number, number], bi: number) => {
          const [x, y, u] = st.at(cc, bd[0])
          return [x, y, bd[1], (u * geo.k) / geo.w, bd[2] / geo.h, x * 1.3 + y * 0.7, bi >= T + 1 ? 0 : weight]
        }
        cells.add([corner(c, A, picks[i]), corner(c, B, picks[i + 1]), corner(c + 1, A, picks[i]), corner(c + 1, B, picks[i + 1])])
      }
    }
  }
  return cells
}

// ─── Cierre del pabellón ─────────────────────────────────────────────────────

const HALL_KEY = 'sp-hall'
const HALL = SETPIECE_STAGE.hall
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** Textura vertical del muro sobre la grada: degradado oscuro con la tira LED del muro alto del partido. */
function ensureHallTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(HALL_KEY)) return
  const { texW: w, texH: h } = HALL
  const tex = scene.textures.createCanvas(HALL_KEY, w, h)!
  const ctx = tex.getContext()
  const g = ctx.createLinearGradient(0, h, 0, 0)
  g.addColorStop(0, hex(HALL.bottom))
  g.addColorStop(0.4, shade(HALL.bottom, 0.6, 0))
  g.addColorStop(1, hex(HALL.top))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // Tira LED: panel, halo y línea, a `ledAtM` sobre la base
  const pxM = h / HALL.heightM
  const y = h - HALL.ledAtM * pxM
  const [z0, z1] = STANDS.ledStripZ
  ctx.fillStyle = hex(SC.ledPanel)
  ctx.fillRect(0, y - z1 * pxM * 0.5, w, (z1 - z0) * pxM)
  ctx.fillStyle = SC.ledGlow
  ctx.fillRect(0, y - STANDS.ledGlowM * pxM * 2, w, STANDS.ledGlowM * pxM * 4)
  ctx.fillStyle = SC.ledLine
  ctx.fillRect(0, y - Math.max(1, pxM * 0.04), w, Math.max(1, pxM * 0.08))
  tex.refresh()
}

/** Muro vertical por encima de la última fila: sin hueco con la grada. */
function hallCells(strips: Strip[]): Cells {
  const cells = new Cells()
  const T = G.tiers
  const d = G.firstM + T * STANDS.tierDepthM
  const z0 = 1 + T * G.riseM
  const zs = [z0, z0 + 2, z0 + 5, z0 + 10, z0 + HALL.heightM]
  const v = (z: number) => 1 - (z - z0) / HALL.heightM
  for (const st of strips) {
    for (let c = 0; c < st.n; c++) {
      for (let i = 0; i + 1 < zs.length; i++) {
        const pt = (cc: number, z: number) => {
          const [x, y] = st.at(cc, d)
          return [x, y, z, 0.5, v(z), 0, 0]
        }
        cells.add([pt(c, zs[i + 1]), pt(c, zs[i]), pt(c + 1, zs[i + 1]), pt(c + 1, zs[i])])
      }
    }
  }
  return cells
}

// ─── Pozos de luz del suelo ──────────────────────────────────────────────────

const POOL_KEY = 'sp-pool'

/** Disco radial blanco azulado que se desvanece hasta el borde (una vez por juego). */
function ensurePoolTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(POOL_KEY)) return
  const n = SETPIECE_STAGE.pool.texPx
  const tex = scene.textures.createCanvas(POOL_KEY, n, n)!
  const ctx = tex.getContext()
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
  g.addColorStop(0, 'rgba(207,227,255,1)')
  g.addColorStop(0.5, 'rgba(207,227,255,0.5)')
  g.addColorStop(1, 'rgba(207,227,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, n, n)
  tex.refresh()
}

/** Pozos de un radio dado (m) en el suelo, recortados a la pista: cuadrículas con la textura radial. */
function poolCells(centers: Array<[number, number]>, r: number, halfW: number, backY: number, farY: number): Cells {
  const cells = new Cells()
  const N = SETPIECE_STAGE.pool.cells
  for (const [cx, cy] of centers) {
    // El pozo se encoge hasta caber entero en la pista: se funde a 0 antes del borde, sin recortes
    const rr = Math.max(0.5, Math.min(r, halfW - Math.abs(cx), cy - backY, farY - cy))
    const at = (i: number, j: number) => {
      const x = cx + rr * ((2 * i) / N - 1)
      const y = cy + rr * ((2 * j) / N - 1)
      return [x, y, 0, i / N, j / N, 0, 0]
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) cells.add([at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1)])
    }
  }
  return cells
}

// ─── Conjunto ────────────────────────────────────────────────────────────────

/** Gradas, publicidad, cierre y luz: se crean con la escena; las gradas aparecen cuando su textura está horneada. */
export class StageBackdrop {
  private readonly scene: Phaser.Scene
  private readonly frames: ReturnType<typeof wallFrames>
  private readonly ads: TexGrid[] = []
  private readonly fixed: TexGrid[] = []
  private readonly stands: Array<{ kind: StandKind, strips: Strip[], grid: TexGrid | null }> = []
  private pena: TeamColor | null = 'blue'
  private visible = true
  private readonly animated = crowdAnimated()
  /** Se llama al terminar de hornear cada grada (para repintar si el decorado no se mueve). */
  onReady: () => void = () => {}

  constructor(scene: Phaser.Scene, halfW: number, backY: number, farY: number) {
    this.scene = scene
    this.frames = wallFrames(halfW, backY, farY)
    ensureAdAtlas(scene)
    const phases: Record<keyof ReturnType<typeof wallFrames>, number> = { back: 2, left: 0, right: 5, far: 1 }
    for (const w of ['back', 'left', 'right', 'far'] as const) {
      this.ads.push(new TexGrid(scene, AD_KEY, adCells(this.frames[w], phases[w]), BACK_DEPTH + 1, 0))
    }
    const ring = ringStrips(this.frames, this.frames.back.len)

    // Cierre del pabellón (por debajo de las gradas) y pozos de luz (justo sobre el suelo)
    ensureHallTexture(scene)
    this.fixed.push(new TexGrid(scene, HALL_KEY, hallCells(ring.all), BACK_DEPTH - 2, 0))
    ensurePoolTexture(scene)
    // Solo el pozo de la portería atacada: los del centro quedaban cortados por el plano cercano de la cámara
    const P = SETPIECE_STAGE.pool
    const goal = new TexGrid(scene, POOL_KEY, poolCells([[0, backY + LIGHT.goalPoolOffsetM]], LIGHT.goalPoolRadius / PX_PER_M, halfW, backY, farY), BACK_DEPTH + 0.3, 0)
    goal.mesh.setAlpha(Math.min(1, LIGHT.goalPoolAlpha * P.k))
    this.fixed.push(goal)

    this.stands.push({ kind: 'side', strips: ring.side, grid: null })
    this.stands.push({ kind: 'blue', strips: ring.back, grid: null }, { kind: 'red', strips: ring.back, grid: null })
    this.bake('side')
    this.bake('blue')
    this.bake('red')
  }

  /** Hornea la textura de un tipo de grada (una vez por calidad) y monta las mallas que la usan. */
  private bake(kind: StandKind) {
    const tier = qualityTier()
    const W = this.frames.back.len
    const k = G.pxPerM[tier]
    const key = `sp-stand-${kind}-${tier}`
    const geo = standGeo(W, k)
    const build = () => {
      for (const s of this.stands) {
        if (s.kind !== kind || s.grid) continue
        const weight = !this.animated ? 0 : kind === 'side' ? 0.6 : 1
        s.grid = new TexGrid(this.scene, key, standCells(s.strips, geo, weight), BACK_DEPTH - 1, this.animated ? G.swayM : 0)
        s.grid.mesh.setVisible(this.visible && this.shows(s.kind))
      }
      this.onReady()
    }
    if (this.scene.textures.exists(key)) { build(); return }
    const tex = this.scene.textures.createCanvas(key, geo.w, geo.h)
    if (!tex) return
    enqueue(paintStand(tex.getContext(), geo, kind), () => { tex.refresh(); build() })
  }

  private shows(kind: StandKind) {
    return kind === 'side' || kind === this.pena
  }

  /** Peña que ocupa la grada del fondo: la del equipo que defiende la portería. */
  setPena(team: TeamColor | null) {
    this.pena = team
    for (const s of this.stands) s.grid?.mesh.setVisible(this.visible && this.shows(s.kind))
  }

  setVisible(on: boolean) {
    this.visible = on
    for (const g of this.ads) g.mesh.setVisible(on)
    for (const g of this.fixed) g.mesh.setVisible(on)
    for (const s of this.stands) s.grid?.mesh.setVisible(on && this.shows(s.kind))
  }

  draw(view: SetPieceView, ms: number) {
    const t = ms * 0.001 * Math.PI * 2 * G.swayHz
    for (const g of this.ads) g.draw(view, 0)
    for (const g of this.fixed) g.draw(view, 0)
    for (const s of this.stands) if (s.grid && this.shows(s.kind)) s.grid.draw(view, t)
  }
}
