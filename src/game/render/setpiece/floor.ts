import * as Phaser from 'phaser'
import { DIRECT_FREE_HIT_SPOT_OFFSET, PENALTY_SPOT_OFFSET } from '../../constants'
import { FLOOR_STYLE, LIGHT, PX_PER_M, SETPIECE_STAGE } from '../artSpec'
import { mulberry32 } from '../stands/layout'
import { qualityTier } from '../quality'
import type { SetPieceView } from '../../setpiece/view'
import { Cells, ClipBatch, enqueue } from './grid'

/**
 * Suelo del escenario cercano (L-05b): la pintura del partido (`arena.ts`, `FLOOR_STYLE`) en
 * metros —degradado, grano, marcas de ruedas más densas en el área y el punto de penalti,
 * reflejos del barniz y la sombra junto a la valla— horneada una vez por calidad en tandas
 * sobre la mitad atacada; la otra mitad la repite en espejo (la pista es simétrica). Va en una
 * malla recortada contra el plano cercano (sin cuñas aunque la cámara pase rozando), encima del
 * suelo liso de `stage.ts`, que queda debajo hasta que la textura está lista. También los pozos
 * de luz: el de la portería y, en media y alta, los que dejan los haces cenitales.
 */

const F = SETPIECE_STAGE.floor
const PL = SETPIECE_STAGE.pool
const POOL_KEY = 'sp-pool'

/** Marco del suelo: mitad atacada de `backY` a `midY` (m) y ancho ±`halfW`. */
interface Frame { halfW: number; backY: number; midY: number; farY: number; k: number; w: number; h: number }

/** Pinta la mitad atacada por tandas (lienzo: x a lo ancho, y desde la valla del fondo). */
function* paintFloor(ctx: CanvasRenderingContext2D, fr: Frame) {
  const { k, w, h, halfW, backY } = fr
  const r = mulberry32(31)
  const X = (x: number) => (x + halfW) * k
  const Y = (y: number) => (y - backY) * k

  // Degradado a lo ancho: el centro, bajo los focos, algo más claro
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, FLOOR_STYLE.colorFar)
  g.addColorStop(0.3, FLOOR_STYLE.colorMid)
  g.addColorStop(0.5, FLOOR_STYLE.colorNear)
  g.addColorStop(0.7, FLOOR_STYLE.colorMid)
  g.addColorStop(1, FLOOR_STYLE.colorFar)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  yield

  // Grano fino de la pintura: tesela de ruido a dos texels (no titila de lejos)
  const n = F.noisePx
  const tile = document.createElement('canvas')
  tile.width = tile.height = n
  const tc = tile.getContext('2d')!
  const img = tc.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const light = r() < 0.5
    const a = r() * F.noiseAlpha * 255
    img.data[i * 4] = light ? 255 : 0
    img.data[i * 4 + 1] = light ? 255 : 10
    img.data[i * 4 + 2] = light ? 255 : 30
    img.data[i * 4 + 3] = a
  }
  tc.putImageData(img, 0, 0)
  const pat = ctx.createPattern(tile, 'repeat')
  if (pat) {
    ctx.save()
    ctx.scale(2, 2)
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, w / 2, h / 2)
    ctx.restore()
  }
  yield

  // Motas del 2D a su tamaño físico (de 3,5 a 9 cm)
  const dots = Math.round(F.dotsPerM2 * (w / k) * (h / k))
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = r() < 0.5 ? FLOOR_STYLE.grainLight : FLOOR_STYLE.grainDark
    ctx.fillRect(r() * w, r() * h, (0.035 + r() * 0.055) * k, 0.035 * k)
    if (i % 1500 === 1499) yield
  }

  // Marcas de ruedas: arcos de 1 a 4 m (los del 2D), claros y algunos de goma oscura
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const spotY = PENALTY_SPOT_OFFSET / PX_PER_M
  const freeY = DIRECT_FREE_HIT_SPOT_OFFSET / PX_PER_M
  ctx.lineWidth = Math.max(1, 0.042 * k)
  ctx.lineCap = 'round'
  const arc = (cx: number, cy: number, rad: number, len: number, dark: boolean) => {
    const a = F.markAlpha[0] + r() * (F.markAlpha[1] - F.markAlpha[0])
    ctx.strokeStyle = dark ? `rgba(8,16,36,${a * 1.3})` : `rgba(190,215,255,${a})`
    const a0 = r() * Math.PI * 2
    ctx.beginPath()
    ctx.arc(X(cx), Y(cy), rad * k, a0, a0 + len)
    ctx.stroke()
  }
  const M = F.marks
  for (let i = 0; i < M.spread; i++) arc((r() * 2 - 1) * halfW, backY + r() * (fr.midY - backY), 1 + r() * 3, 0.6 + r() * 1.2, false)
  yield
  for (let i = 0; i < M.spot; i++) {
    const cy = (r() < 0.65 ? spotY : freeY) + gauss() * 1.6
    arc(gauss() * 2.2, cy, 0.8 + r() * 2.6, 0.5 + r() * 1.4, false)
  }
  yield
  for (let i = 0; i < M.area; i++) arc((r() * 2 - 1) * 4.8, r() * 5.8, 1 + r() * 2.5, 0.5 + r() * 1.2, false)
  for (let i = 0; i < M.crease; i++) arc(gauss() * 0.5, 0.35 + r() * 0.6, 0.5 + r() * 1.1, 0.4 + r() * 0.9, false)
  for (let i = 0; i < M.dark; i++) arc(gauss() * 2, spotY + gauss() * 1.8, 0.6 + r() * 1.6, 0.3 + r() * 0.6, true)
  yield

  // Reflejos de los focos en el barniz (las posiciones de `FLOOR_STYLE` en la pista de 40 × 20 m)
  const L = 2 * (fr.midY - backY)
  for (const fy of FLOOR_STYLE.spotsY) {
    for (const fx of FLOOR_STYLE.spotsX) {
      const cy = backY + L * fx
      if (cy > fr.midY + F.spotR) continue
      const cx = -halfW + 2 * halfW * fy
      const rg = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), F.spotR * k)
      rg.addColorStop(0, `rgba(255,255,255,${FLOOR_STYLE.spotAlpha})`)
      rg.addColorStop(0.35, 'rgba(200,225,255,0.05)')
      rg.addColorStop(1, 'rgba(200,225,255,0)')
      ctx.fillStyle = rg
      ctx.fillRect(X(cx) - F.spotR * k, Y(cy) - F.spotR * k, F.spotR * 2 * k, F.spotR * 2 * k)
    }
  }
  yield

  // Sombra interior junto a la valla: laterales y fondo (en espejo, también el fondo contrario)
  const s = F.shadowM * k
  const band = (x0: number, y0: number, x1: number, y1: number) => {
    const sg = ctx.createLinearGradient(x0, y0, x1, y1)
    sg.addColorStop(0, `rgba(0,8,26,${F.shadowAlpha})`)
    sg.addColorStop(0.45, `rgba(0,8,26,${F.shadowAlpha * 0.32})`)
    sg.addColorStop(1, 'rgba(0,8,26,0)')
    ctx.fillStyle = sg
  }
  band(0, 0, s, 0); ctx.fillRect(0, 0, s, h)
  band(w, 0, w - s, 0); ctx.fillRect(w - s, 0, s, h)
  band(0, 0, 0, s); ctx.fillRect(0, 0, w, s)
  yield
}

/** Celdas del suelo: la mitad atacada de `cellM` m y la otra de `farCellM`, con la v en espejo. */
function floorCells(fr: Frame): Cells {
  const cells = new Cells()
  const L = fr.midY - fr.backY
  const half = (y0: number, y1: number, step: number, mirror: boolean) => {
    const nx = Math.round((fr.halfW * 2) / step), ny = Math.round((y1 - y0) / step)
    const at = (i: number, j: number) => {
      const x = -fr.halfW + (fr.halfW * 2 * i) / nx
      const y = y0 + ((y1 - y0) * j) / ny
      const v = mirror ? (2 * fr.midY - y - fr.backY) / L : (y - fr.backY) / L
      return [x, y, 0, i / nx, v]
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) cells.add([at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1)])
  }
  half(fr.backY, fr.midY, F.cellM, false)
  half(fr.midY, fr.farY, F.farCellM, true)
  return cells
}

/** Disco radial blanco azulado que se desvanece hasta el borde (una vez por juego). */
function ensurePoolTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(POOL_KEY)) return
  const n = PL.texPx
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

/** Pozos de radio `r` (m), encogidos hasta caber enteros en la pista (se funden antes del borde). */
function poolCells(centers: ReadonlyArray<readonly [number, number]>, r: number, fr: Frame): Cells {
  const cells = new Cells()
  const N = PL.cells
  for (const [cx, cy] of centers) {
    const rr = Math.max(0.5, Math.min(r, fr.halfW - Math.abs(cx), cy - fr.backY, fr.farY - cy))
    const at = (i: number, j: number) => [cx + rr * ((2 * i) / N - 1), cy + rr * ((2 * j) / N - 1), 0, i / N, j / N]
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cells.add([at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1)])
  }
  return cells
}

/** Suelo pintado y pozos de luz; el suelo aparece cuando su textura está horneada. */
export class StageFloor {
  private readonly fr: Frame
  private readonly depth: number
  private floor: ClipBatch | null = null
  private readonly pools: ClipBatch[] = []
  private readonly beamPools: ClipBatch | null = null
  private visible = true
  onReady: () => void = () => {}

  /** `depth` del suelo; los pozos van `poolDepth`. `beams`: pozos bajo los haces (media y alta). */
  constructor(scene: Phaser.Scene, halfW: number, backY: number, farY: number, depth: number, poolDepth: number, beams: boolean) {
    this.depth = depth
    const tier = qualityTier()
    const k = F.pxPerM[tier]
    const midY = (backY + farY) / 2
    this.fr = { halfW, backY, midY, farY, k, w: Math.ceil(halfW * 2 * k), h: Math.ceil((midY - backY) * k) }

    ensurePoolTexture(scene)
    const near = SETPIECE_STAGE.clipNearM
    const goal = new ClipBatch(scene, POOL_KEY, poolCells([[0, backY + LIGHT.goalPoolOffsetM]], LIGHT.goalPoolRadius / PX_PER_M, this.fr), poolDepth, near)
    goal.mesh.setAlpha(Math.min(1, LIGHT.goalPoolAlpha * PL.k))
    this.pools.push(goal)
    if (beams) {
      this.beamPools = new ClipBatch(scene, POOL_KEY, poolCells(SETPIECE_STAGE.beams.at, PL.beamR, this.fr), poolDepth, near, F.subM, 24)
      this.beamPools.mesh.setBlendMode(Phaser.BlendModes.ADD)
      this.pools.push(this.beamPools)
    }

    const key = `sp-floor-${tier}`
    const build = () => {
      this.floor = new ClipBatch(scene, key, floorCells(this.fr), this.depth, near, F.subM, F.maxSub)
      this.floor.mesh.setVisible(this.visible)
      this.onReady()
    }
    if (scene.textures.exists(key)) { build(); return }
    const tex = scene.textures.createCanvas(key, this.fr.w, this.fr.h)
    if (!tex) return
    enqueue(paintFloor(tex.getContext(), this.fr), () => { tex.refresh(); build() })
  }

  setVisible(on: boolean) {
    this.visible = on
    this.floor?.mesh.setVisible(on)
    for (const p of this.pools) p.mesh.setVisible(on)
  }

  /** `fx` (0..1): intensidad de la luz de los haces (la transición la sube con la órbita). */
  draw(view: SetPieceView, fx: number) {
    this.floor?.draw(view)
    for (const p of this.pools) p.draw(view)
    this.beamPools?.mesh.setAlpha(PL.beamAlpha * fx)
  }
}
