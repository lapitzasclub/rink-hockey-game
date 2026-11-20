import * as Phaser from 'phaser'
import { BOARDS, CROWD, SETPIECE_STAGE, STANDS, STANDS_COLORS as SC } from '../artSpec'
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
  const tierPx = Math.hypot(STANDS.tierDepthM, STANDS.tierRiseM) * k
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
    const t = Math.min(1, j / (STANDS.tiers - 1))
    const light = SC.lightFront + (SC.lightBack - SC.lightFront) * t
    // Huella (arriba) y contrahuella (abajo) con el cantil dorado entre ambas
    ctx.fillStyle = shade(SC.tread, light, 0)
    ctx.fillRect(0, top, w, tierPx * 0.45 + 1)
    ctx.fillStyle = shade(SC.riser, light, 0)
    ctx.fillRect(0, top + tierPx * 0.45, w, tierPx * 0.55 + 1)
    ctx.fillStyle = shade(SC.nosing, light, 0, 0.55)
    ctx.fillRect(0, top + tierPx * 0.45, w, Math.max(1, k * 0.04))
    // Pasillos
    ctx.fillStyle = shade(SC.tread, light * 1.18, 0)
    for (let c = 1; c < centers.length - 1; c++) ctx.fillRect((centers[c] - half) * k, top, STANDS.aisleM * k, tierPx + 1)

    const penaRow = pena !== null && j < CROWD.penaTiers
    const empty = penaRow ? CROWD.penaEmpty : CROWD.emptyFront + (CROWD.emptyBack - CROWD.emptyFront) * t
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
        paintFan(ctx, x, hipY, k, look, light, { turn: (r() - 0.5) * 0.3, back: false, cheer: false })
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

/** Celdas de una grada sobre una pared: peto vertical, `tiers` escalones y una fila vacía arriba para las cabezas. */
function standCells(f: WallFrame, geo: StandGeo, weight: number): Cells {
  const cells = new Cells()
  const T = G.tiers
  // Fronteras de arriba abajo: (distancia a la valla, altura, y de textura)
  const bounds: Array<[number, number, number]> = []
  for (let b = 0; b <= T + 1; b++) {
    const j = T + 1 - b
    bounds.push([G.firstM + j * STANDS.tierDepthM, 1 + j * STANDS.tierRiseM, b * geo.tierPx])
  }
  bounds.push([G.setbackM, 0, (T + 1) * geo.tierPx + geo.parPx])
  const picks: number[] = []
  for (let b = 0; b <= T + 1; b += 2) picks.push(b)
  if (picks[picks.length - 1] !== T + 1) picks.push(T + 1)
  picks.push(T + 2)

  for (let s = 0; s < f.len - 1e-6; s += geo.W) {
    const span = Math.min(geo.W, f.len - s)
    const cols = Math.ceil(span / G.colM)
    for (let c = 0; c < cols; c++) {
      const ua = s + (span * c) / cols, ub = s + (span * (c + 1)) / cols
      for (let i = 0; i + 1 < picks.length; i++) {
        const A = bounds[picks[i]], B = bounds[picks[i + 1]]
        const corner = (u: number, bd: [number, number, number], bi: number) => {
          const sway = bi >= T + 1 ? 0 : weight
          return [f.ox + f.rx * u + f.nx * bd[0], f.oy + f.ry * u + f.ny * bd[0], bd[1], ((u - s) * geo.k) / geo.w, bd[2] / geo.h, u * 1.9, sway]
        }
        cells.add([corner(ua, A, picks[i]), corner(ua, B, picks[i + 1]), corner(ub, A, picks[i]), corner(ub, B, picks[i + 1])])
      }
    }
  }
  return cells
}

// ─── Conjunto ────────────────────────────────────────────────────────────────

/** Gradas y publicidad: se crean con la escena; las gradas aparecen cuando su textura está horneada. */
export class StageBackdrop {
  private readonly scene: Phaser.Scene
  private readonly frames: ReturnType<typeof wallFrames>
  private readonly ads: TexGrid[] = []
  private readonly stands: Array<{ kind: StandKind, wall: keyof ReturnType<typeof wallFrames>, grid: TexGrid | null }> = []
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
      const g = new TexGrid(scene, AD_KEY, adCells(this.frames[w], phases[w]), BACK_DEPTH + 1, 0)
      this.ads.push(g)
    }
    this.stands.push({ kind: 'side', wall: 'left', grid: null }, { kind: 'side', wall: 'right', grid: null }, { kind: 'side', wall: 'far', grid: null })
    this.stands.push({ kind: 'blue', wall: 'back', grid: null }, { kind: 'red', wall: 'back', grid: null })
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
        const weight = !this.animated ? 0 : s.wall === 'back' ? 1 : 0.6
        s.grid = new TexGrid(this.scene, key, standCells(this.frames[s.wall], geo, weight), BACK_DEPTH - 1, this.animated ? SETPIECE_STAGE.stands.swayM : 0)
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
    for (const s of this.stands) s.grid?.mesh.setVisible(on && this.shows(s.kind))
  }

  draw(view: SetPieceView, ms: number) {
    const t = ms * 0.001 * Math.PI * 2 * SETPIECE_STAGE.stands.swayHz
    for (const g of this.ads) g.draw(view, 0)
    for (const s of this.stands) if (s.grid && this.shows(s.kind)) s.grid.draw(view, t)
  }
}

