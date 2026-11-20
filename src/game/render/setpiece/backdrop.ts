import * as Phaser from 'phaser'
import { BOARDS, SETPIECE_STAGE, STANDS, STANDS_COLORS as SC } from '../artSpec'
import { ADS } from '../rink/ads'
import { shade } from '../stands/fans'
import { teamKit } from '../puppet/kit'
import { crowdAnimated, qualityTier } from '../quality'
import type { TeamColor } from '../../types'
import type { SetPieceView } from '../../setpiece/view'
import { StageCrowd, type StandKind } from './crowd'
import { Cells, TexGrid, enqueue, hex, ringStrips, wallFrames, type Strip, type WallFrame, type WallFrames } from './grid'

/**
 * Fondo del escenario cercano de los lanzamientos (L-05, L-05b): publicidad de la valla (y su
 * reflejo en el barniz), gradas y cierre del pabellón, con los mismos colores y textos que el
 * partido vistos con la cámara baja. La estructura de cada grada (peto y escalones) es un plano
 * inclinado anclado en 3D detrás de la valla; el público va de pie encima, en tarjetas por fila
 * (`crowd.ts`). Las texturas se hornean una vez, por calidad y en tandas de pocos ms; cada
 * fotograma solo se reproyectan las esquinas de las celdas (Mesh2D de topología fija).
 */

const G = SETPIECE_STAGE.stands
const R = SETPIECE_STAGE.reflect

/** Profundidades de pintado de las capas del fondo (las da `stage.ts`). */
export interface BackdropDepths { hall: number; struct: number; crowd: number; parapet: number; ads: number; adsRefl: number }

// ─── Publicidad ──────────────────────────────────────────────────────────────

const AD_KEY = 'sp-ads'
const AD_REFL_KEY = 'sp-ads-refl'
const AD_W = 320
const AD_H = 72
const AD_COLS = 2
const AD_ROWS = Math.ceil(ADS.length / AD_COLS)

/**
 * Atlas de paneles (los `ADS` del partido: mismo fondo, texto y brillo superior), una vez por juego.
 * El del reflejo es el mismo con el alfa que cae con la distancia bajo el suelo (arriba del panel, menos).
 */
function ensureAdAtlas(scene: Phaser.Scene, refl: boolean) {
  const key = refl ? AD_REFL_KEY : AD_KEY
  if (scene.textures.exists(key)) return key
  const tex = scene.textures.createCanvas(key, AD_W * AD_COLS, AD_H * AD_ROWS)!
  const ctx = tex.getContext()
  ctx.font = `${Math.round(AD_H * 0.5)}px "Russo One", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ADS.forEach(([text, bg, fg], i) => {
    const x = (i % AD_COLS) * AD_W, y = Math.floor(i / AD_COLS) * AD_H
    ctx.fillStyle = hex(bg)
    ctx.fillRect(x, y, AD_W, AD_H)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(x, y, AD_W, AD_H * 0.3)
    ctx.fillStyle = fg
    ctx.fillText(text, x + AD_W / 2, y + AD_H * 0.54)
  })
  if (refl) {
    ctx.globalCompositeOperation = 'destination-in'
    const top = Math.max(0, 1 - BOARDS.adFar.z1 / R.fadeM), bottom = Math.max(0, 1 - BOARDS.adFar.z0 / R.fadeM)
    for (let row = 0; row < AD_ROWS; row++) {
      const g = ctx.createLinearGradient(0, row * AD_H, 0, (row + 1) * AD_H)
      g.addColorStop(0, `rgba(0,0,0,${top})`)
      g.addColorStop(1, `rgba(0,0,0,${bottom})`)
      ctx.fillStyle = g
      ctx.fillRect(0, row * AD_H, AD_W * AD_COLS, AD_H)
    }
  }
  tex.refresh()
  return key
}

/** Paneles de publicidad de una pared (franja `adFar`, paneles de `adWidthM`), girando por la lista `ADS`; `mirror`: bajo el suelo. */
function adCells(f: WallFrame, phase: number, mirror: boolean): Cells {
  const cells = new Cells()
  const W = AD_W * AD_COLS, H = AD_H * AD_ROWS
  const s = mirror ? -1 : 1
  const z0 = BOARDS.adFar.z0 * s, z1 = BOARDS.adFar.z1 * s
  const n = Math.max(1, Math.round(f.len / BOARDS.adWidthM))
  const cols = SETPIECE_STAGE.adCols
  const gap = SETPIECE_STAGE.adGapM / 2
  const at = (u: number, z: number, uu: number, vv: number) =>
    [f.ox + f.rx * u + f.nx * -0.012, f.oy + f.ry * u + f.ny * -0.012, z, uu, vv]
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

// ─── Estructura de la grada ──────────────────────────────────────────────────

interface StandGeo { tierPx: number; parPx: number; w: number; h: number; k: number }

function standGeo(W: number, k: number): StandGeo {
  const tierPx = Math.hypot(STANDS.tierDepthM, G.riseM) * k
  const parPx = Math.hypot(G.firstM - G.setbackM, 1) * k
  return { tierPx, parPx, w: Math.ceil(W * k), h: Math.ceil((G.tiers + 1) * tierPx + parPx), k }
}

/** Pinta la estructura de una grada de frente (de arriba abajo): huellas, contrahuellas, pasillos y peto. */
function* paintStand(ctx: CanvasRenderingContext2D, geo: StandGeo, W: number, kind: StandKind) {
  const { k, tierPx, parPx, w } = geo
  const pena = kind === 'side' ? null : teamKit(kind).jersey
  const T = G.tiers
  const centers = STANDS.aislesLong.map(a => a * W).concat([W])
  const half = STANDS.aisleM / 2
  for (let j = T - 1; j >= 0; j--) {
    const top = (T - j) * tierPx
    const t = Math.min(1, j / (T - 1))
    const lightS = (SC.lightFront + (SC.lightBack - SC.lightFront) * t) * G.structK
    ctx.fillStyle = shade(SC.tread, lightS, 0)
    ctx.fillRect(0, top, w, tierPx * 0.45 + 1)
    ctx.fillStyle = shade(SC.riser, lightS, 0)
    ctx.fillRect(0, top + tierPx * 0.45, w, tierPx * 0.55 + 1)
    ctx.fillStyle = shade(SC.nosing, lightS, 0, 0.55)
    ctx.fillRect(0, top + tierPx * 0.45, w, Math.max(1, k * 0.04))
    ctx.fillStyle = shade(SC.tread, lightS * 1.18, 0)
    for (let c = 1; c < centers.length - 1; c++) ctx.fillRect((centers[c] - half) * k, top, STANDS.aisleM * k, tierPx + 1)
  }
  yield
  // Peto: cuerpo, cristal, pasamanos y, en la peña, banda con el color del club
  const y0 = (T + 1) * tierPx
  ctx.fillStyle = shade(SC.parapet, SC.lightFront, 0)
  ctx.fillRect(0, y0, w, parPx + 1)
  if (pena !== null) {
    ctx.fillStyle = shade(pena, 0.7, 0)
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

/** Celdas de la estructura: escalones (de dos en dos filas) y, aparte, el peto vertical, que tapa al público. */
function standCells(strips: Strip[], geo: StandGeo): [Cells, Cells] {
  const tiers = new Cells(), parapet = new Cells()
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
        const corner = (cc: number, bd: [number, number, number]) => {
          const [x, y, u] = st.at(cc, bd[0])
          return [x, y, bd[1], (u * geo.k) / geo.w, bd[2] / geo.h]
        }
        ;(i + 2 === picks.length ? parapet : tiers).add([corner(c, A), corner(c, B), corner(c + 1, A), corner(c + 1, B)])
      }
    }
  }
  return [tiers, parapet]
}

// ─── Cierre del pabellón ─────────────────────────────────────────────────────

const HALL_KEY = 'sp-hall'
const HALL = SETPIECE_STAGE.hall

/** Distancia a la valla y altura de la base del muro sobre la última fila. */
export function hallBase(): [number, number] {
  return [G.firstM + G.tiers * STANDS.tierDepthM, 1 + G.tiers * G.riseM]
}

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
  const [d, z0] = hallBase()
  const zs = [z0, z0 + 2, z0 + 5, z0 + 10, z0 + HALL.heightM]
  const v = (z: number) => 1 - (z - z0) / HALL.heightM
  for (const st of strips) {
    for (let c = 0; c < st.n; c++) {
      for (let i = 0; i + 1 < zs.length; i++) {
        const pt = (cc: number, z: number) => {
          const [x, y] = st.at(cc, d)
          return [x, y, z, 0.5, v(z)]
        }
        cells.add([pt(c, zs[i + 1]), pt(c, zs[i]), pt(c + 1, zs[i + 1]), pt(c + 1, zs[i])])
      }
    }
  }
  return cells
}

// ─── Conjunto ────────────────────────────────────────────────────────────────

/** Gradas, público, publicidad y cierre: se crean con la escena; las gradas aparecen cuando su textura está horneada. */
export class StageBackdrop {
  private readonly scene: Phaser.Scene
  readonly frames: WallFrames
  readonly ring: ReturnType<typeof ringStrips>
  readonly crowd: StageCrowd
  private readonly depths: BackdropDepths
  private readonly fixed: TexGrid[] = []
  private readonly stands: Array<{ kind: StandKind, strips: Strip[], grids: TexGrid[] }> = []
  private pena: TeamColor | null = 'blue'
  private visible = true
  /** Se llama al terminar de hornear cada textura (para repintar si el decorado no se mueve). */
  onReady: () => void = () => {}

  constructor(scene: Phaser.Scene, halfW: number, backY: number, farY: number, depths: BackdropDepths) {
    this.scene = scene
    this.depths = depths
    this.frames = wallFrames(halfW, backY, farY)
    const W = this.frames.back.len
    this.ring = ringStrips(this.frames, W, G.colM, G.cornerCols)
    this.stands.push({ kind: 'side', strips: this.ring.side, grids: [] })
    this.stands.push({ kind: 'blue', strips: this.ring.back, grids: [] }, { kind: 'red', strips: this.ring.back, grids: [] })
    const crowdStrips = ringStrips(this.frames, W, SETPIECE_STAGE.crowd.colM, G.cornerCols)
    this.crowd = new StageCrowd(scene, W, crowdStrips.side, crowdStrips.back, depths.crowd, crowdAnimated())
    this.crowd.onReady = () => this.onReady()
  }

  /** Monta la publicidad, el cierre y las gradas por fases (cada una cabe en una tanda de la cola). */
  *build(): Generator {
    const scene = this.scene, depths = this.depths
    const ads = ensureAdAtlas(scene, false)
    yield
    const adsRefl = ensureAdAtlas(scene, true)
    yield
    const phases: Record<keyof WallFrames, number> = { back: 2, left: 0, right: 5, far: 1 }
    for (const w of ['back', 'left', 'right', 'far'] as const) {
      this.addFixed(new TexGrid(scene, ads, adCells(this.frames[w], phases[w], false), depths.ads, 0))
      // Reflejo: la geometría espejada se ve con el giro al revés
      const refl = new TexGrid(scene, adsRefl, adCells(this.frames[w], phases[w], true), depths.adsRefl, 0, -1)
      refl.mesh.setAlpha(R.adsAlpha)
      this.addFixed(refl)
      yield
    }
    ensureHallTexture(scene)
    this.addFixed(new TexGrid(scene, HALL_KEY, hallCells(this.ring.all), depths.hall, 0))
    yield
    for (const s of this.stands) this.bake(s.kind)
    yield
    yield* this.crowd.build()
  }

  private addFixed(g: TexGrid) {
    g.mesh.setVisible(this.visible)
    this.fixed.push(g)
  }

  /** Hornea la estructura de un tipo de grada (una vez por calidad) y monta sus mallas. */
  private bake(kind: StandKind) {
    const tier = qualityTier()
    const W = this.frames.back.len
    const key = `sp-stand-${kind}-${tier}`
    const geo = standGeo(W, G.structPxPerM[tier])
    const build = () => {
      for (const s of this.stands) {
        if (s.kind !== kind || s.grids.length) continue
        const [tiers, parapet] = standCells(s.strips, geo)
        s.grids.push(new TexGrid(this.scene, key, tiers, this.depths.struct, 0), new TexGrid(this.scene, key, parapet, this.depths.parapet, 0))
        for (const g of s.grids) g.mesh.setVisible(this.visible && this.shows(s.kind))
      }
      this.onReady()
    }
    if (this.scene.textures.exists(key)) { build(); return }
    const tex = this.scene.textures.createCanvas(key, geo.w, geo.h)
    if (!tex) return
    enqueue(paintStand(tex.getContext(), geo, W, kind), () => { tex.refresh(); build() })
  }

  private shows(kind: StandKind) {
    return kind === 'side' || kind === this.pena
  }

  /** Peña que ocupa la grada del fondo: la del equipo que defiende la portería. */
  setPena(team: TeamColor | null) {
    this.pena = team
    for (const s of this.stands) for (const g of s.grids) g.mesh.setVisible(this.visible && this.shows(s.kind))
    this.crowd.setPena(team)
  }

  setVisible(on: boolean) {
    this.visible = on
    for (const g of this.fixed) g.mesh.setVisible(on)
    for (const s of this.stands) for (const g of s.grids) g.mesh.setVisible(on && this.shows(s.kind))
    this.crowd.setVisible(on)
  }

  draw(view: SetPieceView, ms: number) {
    for (const g of this.fixed) g.draw(view, 0)
    for (const s of this.stands) if (this.shows(s.kind)) for (const g of s.grids) g.draw(view, 0)
    this.crowd.draw(view, ms)
  }
}
