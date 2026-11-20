import * as Phaser from 'phaser'
import { CROWD, SETPIECE_STAGE, STANDS, STANDS_COLORS as SC } from '../artSpec'
import { STAND_UP_M, makeLook, paintFan, shade, type FanLook, type FanPose } from '../stands/fans'
import { mulberry32 } from '../stands/layout'
import { teamKit } from '../puppet/kit'
import { qualityTier } from '../quality'
import type { TeamColor } from '../../types'
import type { SetPieceView } from '../../setpiece/view'
import { Cells, TexGrid, enqueue, hex, type Strip } from './grid'

/**
 * Público del escenario cercano en relieve (L-05b): cada fila de la grada es una tarjeta vertical
 * de pie sobre su escalón, a su profundidad, así que las filas se desplazan unas respecto a otras
 * cuando la cámara sigue al lanzador. Las figuras son las del partido (`stands/fans.ts`), con
 * asiento, torso y camiseta; algunas de pie con los brazos arriba o la bufanda en alto. Las filas
 * bajas van iluminadas por la pista; las altas, más oscuras, con bruma del cierre y a menos
 * resolución (el filtro lineal las desenfoca). Cada fila es una banda del atlas de su grada, que
 * se hornea una vez por calidad en tandas. En media y alta la grada se mece en oleaje desfasado
 * por fila (solo suben las esquinas de arriba de cada tarjeta) y la peña lleva banderas que ondean.
 */

const G = SETPIECE_STAGE.stands
const CR = SETPIECE_STAGE.crowd
const FL = SETPIECE_STAGE.flags
const PAD = 2

export type StandKind = 'side' | TeamColor

interface Fan { x: number; look: FanLook | null; pose: FanPose }
/** Banda de una fila en el atlas: px por m, y de arriba y alto (px), alto de la tarjeta (m), luz y bruma. */
interface Band { k: number; y: number; h: number; topM: number; light: number; haze: number; fans: Fan[] }
interface Plan { w: number; h: number; bands: Band[] }

/** Distancia a la valla y altura del pie de la tarjeta de la fila `j` (sobre el plano de la grada). */
export function cardBase(j: number): [number, number] {
  const d = G.firstM + j * STANDS.tierDepthM + CR.atM
  return [d, 1 + (j + CR.atM / STANDS.tierDepthM) * G.riseM]
}

/** Reparto de una grada (de qué asiento sale quién y cómo) y tamaño de cada banda. */
function planCrowd(kind: StandKind, W: number, k0: number): Plan {
  const pena: TeamColor | null = kind === 'side' ? null : kind
  const kitT = pena ? teamKit(pena) : null
  const kit: [number, number] = kitT ? [kitT.jersey, kitT.shorts] : [0, 0]
  const r = mulberry32(pena === 'blue' ? 11 : pena === 'red' ? 13 : 17)
  const T = G.tiers
  const centers = STANDS.aislesLong.map(a => a * W).concat([W])
  const half = STANDS.aisleM / 2
  const step = STANDS.seatSpacingM
  const bands: Band[] = []
  let y = 0
  for (let j = 0; j < T; j++) {
    const t = j / (T - 1)
    const penaRow = pena !== null && j < CROWD.penaTiers
    const empty = (penaRow ? CROWD.penaEmpty : CROWD.emptyFront + (CROWD.emptyBack - CROWD.emptyFront) * t) * G.emptyK
    const stand = penaRow ? CR.standPena : CR.standSide
    const fans: Fan[] = []
    let up = false
    for (let b = 0; b < centers.length - 1; b++) {
      const u0 = centers[b] + (b === 0 ? 0 : half), u1 = centers[b + 1] - (b === centers.length - 2 ? 0 : half)
      const n = Math.floor((u1 - u0) / step)
      const pad = (u1 - u0 - (n - 1) * step) / 2
      for (let s = 0; s < n; s++) {
        const x = u0 + pad + s * step
        if (r() < empty) { fans.push({ x, look: null, pose: { turn: 0, back: false, cheer: false } }); continue }
        const look = makeLook(r, penaRow ? pena : null, kit[0], kit[1])
        const cheer = r() < stand
        up ||= cheer
        fans.push({ x, look, pose: { turn: (r() - 0.5) * 0.3, back: false, cheer } })
      }
    }
    const k = Math.max(8, Math.round(k0 * (1 - (1 - CR.resBack) * t)))
    const topM = CR.hipM + CR.fanK * (up ? 1.62 + STAND_UP_M : 1.02) + 0.04
    const h = Math.ceil(topM * k)
    bands.push({ k, y, h, topM, light: CR.lightFront + (CR.lightBack - CR.lightFront) * t, haze: CR.hazeBack * t, fans })
    y += h + PAD
  }
  return { w: Math.ceil(W * k0), h: y, bands }
}

/** Pinta una banda por tanda: asientos, figuras y bruma solo sobre lo pintado. */
function* paintCrowd(ctx: CanvasRenderingContext2D, plan: Plan, kind: StandKind) {
  const pena = kind === 'side' ? null : teamKit(kind).jersey
  const haze = shade(SETPIECE_STAGE.hall.bottom, 1, 0)
  for (let j = 0; j < plan.bands.length; j++) {
    const b = plan.bands[j]
    const penaRow = pena !== null && j < CROWD.penaTiers
    const seatCol = penaRow ? shade(pena, b.light * CROWD.penaSeatK, 0) : shade(SC.seats[(j >> 1) % SC.seats.length], b.light, 0)
    const hipY = b.y + (b.topM - CR.hipM) * b.k
    const k = b.k
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, b.y, plan.w, b.h)
    ctx.clip()
    ctx.fillStyle = seatCol
    for (const f of b.fans) {
      const x = f.x * k
      ctx.fillRect(x - G.seatWidthM * 0.5 * k, hipY - 0.5 * k, G.seatWidthM * k, 0.5 * k)
      ctx.fillRect(x - G.seatWidthM * 0.55 * k, hipY - 0.04 * k, G.seatWidthM * 1.1 * k, 0.14 * k)
    }
    for (const f of b.fans) if (f.look) paintFan(ctx, f.x * k, hipY, k * CR.fanK, f.look, b.light, f.pose)
    if (b.haze > 0) {
      ctx.globalCompositeOperation = 'source-atop'
      ctx.globalAlpha = b.haze
      ctx.fillStyle = haze
      ctx.fillRect(0, b.y, plan.w, b.h)
    }
    ctx.restore()
    yield
  }
}

/**
 * Tarjetas de las filas sobre los tramos, de la última fila a la primera (las de delante tapan).
 * Las esquinas de arriba llevan el peso del oleaje; su fase avanza a lo largo del anillo.
 */
function crowdCells(strips: Strip[], plan: Plan, weight: number): Cells {
  const cells = new Cells()
  for (let j = plan.bands.length - 1; j >= 0; j--) {
    const b = plan.bands[j]
    const [d, z0] = cardBase(j)
    const z1 = z0 + b.topM
    const v0 = b.y / plan.h, v1 = (b.y + b.topM * b.k) / plan.h
    for (const st of strips) {
      for (let c = 0; c < st.n; c++) {
        const pt = (cc: number, top: boolean) => {
          const [x, y, u] = st.at(cc, d)
          const ph = (x * 0.9 + y * 0.7) * CR.waveK + j * CR.rowPhase
          return [x, y, top ? z1 : z0, (u * b.k) / plan.w, top ? v0 : v1, ph, top ? weight : 0]
        }
        cells.add([pt(c, true), pt(c, false), pt(c + 1, true), pt(c + 1, false)])
      }
    }
  }
  return cells
}

// ─── Banderas de la peña ─────────────────────────────────────────────────────

const FLAG_W = 96
const FLAG_H = 64

/** Bandera de la peña (franjas de camiseta y pantalón con contorno) y, a la derecha, el mástil. */
function ensureFlagTexture(scene: Phaser.Scene, team: TeamColor) {
  const key = `sp-flag-${team}`
  if (scene.textures.exists(key)) return key
  const tex = scene.textures.createCanvas(key, FLAG_W + 8, FLAG_H)!
  const ctx = tex.getContext()
  const kit = teamKit(team)
  const lit = SETPIECE_STAGE.crowd.lightFront * 0.9
  ctx.fillStyle = shade(kit.jersey, lit, 0.2)
  ctx.fillRect(0, 0, FLAG_W, FLAG_H)
  ctx.fillStyle = shade(kit.shorts, lit, 0.2)
  ctx.fillRect(0, FLAG_H * 0.36, FLAG_W, FLAG_H * 0.28)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fillRect(0, 0, FLAG_W, FLAG_H * 0.12)
  ctx.strokeStyle = 'rgba(8,12,20,0.75)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, FLAG_W - 2, FLAG_H - 2)
  ctx.fillStyle = hex(0x9aa3ad)
  ctx.fillRect(FLAG_W + 3, 0, 2, FLAG_H)
  tex.refresh()
  return key
}

/** Banderas sobre la grada del fondo: mástil fijo y tela que ondea (en baja, quieta con su pliegue). */
class Flags {
  readonly grid: TexGrid
  private readonly base: number[]
  private readonly nx: number
  private readonly ny: number

  constructor(scene: Phaser.Scene, team: TeamColor, back: Strip, depth: number) {
    const key = ensureFlagTexture(scene, team)
    const cells = new Cells()
    const tw = FLAG_W + 8
    const poleU = (FLAG_W + 4) / tw
    const [ox, oy] = back.at(0, 0)
    const [ex, ey] = back.at(back.n, 0)
    const len = Math.hypot(ex - ox, ey - oy) || 1
    const rx = (ex - ox) / len, ry = (ey - oy) / len
    // Normal hacia la pista (la tela ondea hacia delante y hacia atrás)
    const [dx, dy] = back.at(0, 1)
    this.nx = ox - dx
    this.ny = oy - dy
    for (const [u, j] of FL.at) {
      const [d, z0] = cardBase(j)
      const x0 = ox + rx * u - this.nx * d, y0 = oy + ry * u - this.ny * d
      const hands = z0 + CR.hipM + 0.6
      const top = hands + FL.poleM
      cells.add([[x0, y0, top, poleU, 0], [x0, y0, hands, poleU, 1], [x0 + rx * 0.05, y0 + ry * 0.05, top, poleU, 0], [x0 + rx * 0.05, y0 + ry * 0.05, hands, poleU, 1]])
      for (let c = 0; c < FL.cols; c++) {
        const a = c / FL.cols, b = (c + 1) / FL.cols
        const at = (s: number, up: boolean) => [x0 + rx * FL.wM * s, y0 + ry * FL.wM * s, up ? top : top - FL.hM, (s * FLAG_W) / tw, up ? 0 : 1, s]
        cells.add([at(a, true), at(a, false), at(b, true), at(b, false)])
      }
    }
    this.base = cells.pos.slice()
    this.grid = new TexGrid(scene, key, cells, depth, 0, 0)
  }

  /** Ondeo: cada vértice de la tela se aparta de la grada según su distancia al mástil. */
  draw(view: SetPieceView, t: number) {
    const { pos, sway } = this.grid.cells
    const n = pos.length / 3
    for (let i = 0; i < n; i++) {
      const s = sway[i * 2]
      const flag = Math.floor(i / ((FL.cols + 1) * 4))
      const w = FL.ampM * s * Math.sin(t - 2.4 * s + flag * 1.7)
      pos[i * 3] = this.base[i * 3] + this.nx * w
      pos[i * 3 + 1] = this.base[i * 3 + 1] + this.ny * w
      pos[i * 3 + 2] = this.base[i * 3 + 2] - 0.06 * s * s
    }
    this.grid.draw(view, 0)
  }
}

// ─── Conjunto ────────────────────────────────────────────────────────────────

/** Público de las gradas cercanas: una malla para la grada del resto y otra por peña, y sus banderas. */
export class StageCrowd {
  private readonly scene: Phaser.Scene
  private readonly W: number
  private readonly depth: number
  private readonly animated: boolean
  private readonly stands: Array<{ kind: StandKind, strips: Strip[], grid: TexGrid | null, flags: Flags | null }> = []
  private pena: TeamColor | null = 'blue'
  private visible = true
  /** Se llama al terminar de hornear cada grada (para repintar si el decorado no se mueve). */
  onReady: () => void = () => {}

  constructor(scene: Phaser.Scene, W: number, side: Strip[], back: Strip[], depth: number, animated: boolean) {
    this.scene = scene
    this.W = W
    this.depth = depth
    this.animated = animated
    this.stands.push({ kind: 'side', strips: side, grid: null, flags: null })
    this.stands.push({ kind: 'blue', strips: back, grid: null, flags: null }, { kind: 'red', strips: back, grid: null, flags: null })
  }

  /** Planifica y encola los atlas, uno por fase (lo lanza la cola de horneado del decorado). */
  *build(): Generator {
    for (const s of this.stands) {
      this.bake(s.kind)
      yield
    }
  }

  /** Hornea el atlas de un tipo de grada (una vez por calidad) y monta las mallas que lo usan. */
  private bake(kind: StandKind) {
    const tier = qualityTier()
    const key = `sp-crowd-${kind}-${tier}`
    const plan = planCrowd(kind, this.W, G.pxPerM[tier])
    const build = () => {
      for (const s of this.stands) {
        if (s.kind !== kind || s.grid) continue
        const weight = !this.animated ? 0 : kind === 'side' ? CR.sideK : 1
        s.grid = new TexGrid(this.scene, key, crowdCells(s.strips, plan, weight), this.depth, this.animated ? CR.waveM : 0)
        if (kind !== 'side' && s.strips[0]) s.flags = new Flags(this.scene, kind, s.strips[0], this.depth + 0.01)
        this.show(s)
      }
      this.onReady()
    }
    if (this.scene.textures.exists(key)) { build(); return }
    const tex = this.scene.textures.createCanvas(key, plan.w, plan.h)
    if (!tex) return
    enqueue(paintCrowd(tex.getContext(), plan, kind), () => { tex.refresh(); build() })
  }

  private shows(kind: StandKind) {
    return kind === 'side' || kind === this.pena
  }

  private show(s: StageCrowd['stands'][number]) {
    const on = this.visible && this.shows(s.kind)
    s.grid?.mesh.setVisible(on)
    s.flags?.grid.mesh.setVisible(on)
  }

  /** Peña que ocupa la grada del fondo: la del equipo que defiende la portería. */
  setPena(team: TeamColor | null) {
    this.pena = team
    for (const s of this.stands) this.show(s)
  }

  setVisible(on: boolean) {
    this.visible = on
    for (const s of this.stands) this.show(s)
  }

  /** Puntos (m) al alto de las cabezas repartidos por las gradas visibles: dónde saltan los flashes. */
  headPoints(n: number): Float64Array {
    const out = new Float64Array(n * 3)
    const r = mulberry32(29)
    const lists = [this.stands[0].strips, this.stands[1].strips]
    for (let i = 0; i < n; i++) {
      const strips = lists[i % 3 === 0 ? 1 : 0]
      const st = strips[Math.floor(r() * strips.length)]
      const j = Math.floor(r() * G.tiers)
      const [d, z0] = cardBase(j)
      const [x, y] = st.at(r() * st.n, d)
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z0 + CR.hipM + CR.fanK * 0.78
    }
    return out
  }

  draw(view: SetPieceView, ms: number) {
    const t = ms * 0.001 * Math.PI * 2 * CR.waveHz
    const tf = ms * 0.001 * Math.PI * 2 * FL.hz
    for (const s of this.stands) {
      if (!s.grid || !this.shows(s.kind)) continue
      s.grid.draw(view, t)
      s.flags?.draw(view, this.animated ? tf : 0)
    }
  }
}
