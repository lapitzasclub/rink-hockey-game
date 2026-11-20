import * as Phaser from 'phaser'
import { SETPIECE_STAGE } from '../artSpec'
import { mulberry32 } from '../stands/layout'
import type { SetPieceView } from '../../setpiece/view'
import { Cells, TexGrid, type Strip } from './grid'

/**
 * Luz del escenario cercano (L-05b, solo media y alta): haces cenitales aditivos sobre el área,
 * halo de la tira LED y de los focos del pabellón, flashes de cámara en las gradas y viñeta.
 * Todas las texturas se hornean una vez (degradados pequeños); cada fotograma solo se reproyectan
 * las esquinas y se mueven las imágenes. `fx` (0..1) es la intensidad: la transición la sube con
 * la órbita para que la vista del partido no cambie mientras se funde.
 */

const B = SETPIECE_STAGE.beams
const BL = SETPIECE_STAGE.bloom
const FX = SETPIECE_STAGE.flashes
const V = SETPIECE_STAGE.vignette

/** Textura de `w × h` pintada una vez con `paint`. */
function baked(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return key
  const tex = scene.textures.createCanvas(key, w, h)!
  paint(tex.getContext())
  tex.refresh()
  return key
}

/** Columna de luz: perfil suave a lo ancho y más intensa cerca del suelo. */
function beamTexture(scene: Phaser.Scene) {
  return baked(scene, 'sp-beam', 64, 128, ctx => {
    const img = ctx.createImageData(64, 128)
    for (let y = 0; y < 128; y++) {
      const t = y / 127
      const vert = (0.25 + 0.75 * t) * Math.min(1, (1 - t) * 6 + 0.35)
      for (let x = 0; x < 64; x++) {
        const s = (x - 31.5) / 32
        const a = Math.exp(-s * s * 4.5) * (1 - s * s) * vert
        const i = (y * 64 + x) * 4
        img.data[i] = 225; img.data[i + 1] = 236; img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255)
      }
    }
    ctx.putImageData(img, 0, 0)
  })
}

/** Halo vertical (gaussiano) del color de la tira LED. */
function glowTexture(scene: Phaser.Scene) {
  return baked(scene, 'sp-glow', 4, 64, ctx => {
    const g = ctx.createLinearGradient(0, 0, 0, 64)
    for (let i = 0; i <= 8; i++) {
      const s = (i / 8) * 2 - 1
      g.addColorStop(i / 8, `rgba(110,175,230,${(Math.exp(-s * s * 5) * (1 - s * s)).toFixed(3)})`)
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 64)
  })
}

/** Foco del pabellón: cuerpo claro con halo radial. */
function lampTexture(scene: Phaser.Scene) {
  return baked(scene, 'sp-lamp', 96, 48, ctx => {
    const g = ctx.createRadialGradient(48, 24, 0, 48, 24, 46)
    g.addColorStop(0, 'rgba(255,250,235,1)')
    g.addColorStop(0.12, 'rgba(255,245,225,0.75)')
    g.addColorStop(0.4, 'rgba(200,220,255,0.18)')
    g.addColorStop(1, 'rgba(200,220,255,0)')
    ctx.save()
    ctx.translate(48, 24)
    ctx.scale(1, 0.5)
    ctx.translate(-48, -24)
    ctx.fillStyle = g
    ctx.fillRect(0, -24, 96, 96)
    ctx.restore()
    ctx.fillStyle = 'rgba(255,252,240,1)'
    ctx.fillRect(40, 21, 16, 6)
  })
}

function flashTexture(scene: Phaser.Scene) {
  return baked(scene, 'sp-flash', 32, 32, ctx => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.2, 'rgba(240,246,255,0.7)')
    g.addColorStop(1, 'rgba(220,235,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 32)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillRect(15, 2, 2, 28)
    ctx.fillRect(2, 15, 28, 2)
  })
}

function vignetteTexture(scene: Phaser.Scene) {
  return baked(scene, 'sp-vignette', 256, 144, ctx => {
    const g = ctx.createRadialGradient(128, 72, 0, 128, 72, 147)
    g.addColorStop(0, 'rgba(2,4,10,0)')
    g.addColorStop(V.inner, 'rgba(2,4,10,0)')
    g.addColorStop(1, `rgba(2,4,10,${V.alpha})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 144)
  })
}

/** Banda del halo LED sobre el cierre (`d`, `z` de su base) y focos repartidos por las rectas. */
function hallCells(strips: Strip[], d: number, z0: number): [Cells, Cells] {
  const glow = new Cells(), lamps = new Cells()
  const zl = z0 + SETPIECE_STAGE.hall.ledAtM
  const a = zl - BL.ledHM / 2, b = zl + BL.ledHM / 2
  const dd = d - 0.03
  for (const st of strips) {
    for (let c = 0; c < st.n; c++) {
      const [x0, y0] = st.at(c, dd), [x1, y1] = st.at(c + 1, dd)
      glow.add([[x0, y0, b, 0.5, 0], [x0, y0, a, 0.5, 1], [x1, y1, b, 0.5, 0], [x1, y1, a, 0.5, 1]])
    }
    const [sx, sy] = st.at(0, dd), [ex, ey] = st.at(st.n, dd)
    const len = Math.hypot(ex - sx, ey - sy)
    // Solo en las rectas (en las esquinas la cuerda no sigue al muro)
    if (st.n < 3 || len < BL.lampEveryM) continue
    const ux = (ex - sx) / len, uy = (ey - sy) / len
    const zc = z0 + BL.lampZ, hw = BL.haloM / 2, hh = (BL.haloM * 0.5) / 2
    for (let u = BL.lampEveryM / 2; u < len; u += BL.lampEveryM) {
      const cx = sx + ux * u, cy = sy + uy * u
      lamps.add([
        [cx - ux * hw, cy - uy * hw, zc + hh, 0, 0], [cx - ux * hw, cy - uy * hw, zc - hh, 0, 1],
        [cx + ux * hw, cy + uy * hw, zc + hh, 1, 0], [cx + ux * hw, cy + uy * hw, zc - hh, 1, 1],
      ])
    }
  }
  return [glow, lamps]
}

/** Columnas de luz: `rows` celdas por haz, encaradas a la cámara cada fotograma. */
function beamCells(): Cells {
  const cells = new Cells()
  for (let i = 0; i < B.at.length; i++) {
    for (let r = 0; r < B.rows; r++) {
      const v0 = r / B.rows, v1 = (r + 1) / B.rows
      cells.add([[0, 0, 0, 0, v0], [0, 0, 0, 0, v1], [0, 0, 0, 1, v0], [0, 0, 0, 1, v1]])
    }
  }
  return cells
}

export interface FxDepths { glow: number; flashes: number; beams: number; vignette: number }

export class StageFx {
  private readonly beams: TexGrid
  private readonly glow: TexGrid
  private readonly lamps: TexGrid
  private readonly flashes: Phaser.GameObjects.Image[] = []
  private readonly vignette: Phaser.GameObjects.Image
  private readonly heads: Float64Array
  private readonly period: Float64Array
  private readonly offset: Float64Array
  private visible = true
  private readonly pj = { x: 0, y: 0, s: 0 }

  /** `hall`: tramos del cierre y su base; `heads`: puntos (m) donde saltan los flashes. */
  constructor(scene: Phaser.Scene, hall: Strip[], hallD: number, hallZ: number, heads: Float64Array, depths: FxDepths) {
    this.beams = new TexGrid(scene, beamTexture(scene), beamCells(), depths.beams, 0, 0)
    this.beams.mesh.setBlendMode(Phaser.BlendModes.ADD)
    const [glow, lamps] = hallCells(hall, hallD, hallZ)
    this.glow = new TexGrid(scene, glowTexture(scene), glow, depths.glow, 0)
    this.glow.mesh.setBlendMode(Phaser.BlendModes.ADD).setAlpha(BL.ledAlpha)
    this.lamps = new TexGrid(scene, lampTexture(scene), lamps, depths.glow, 0)
    this.lamps.mesh.setBlendMode(Phaser.BlendModes.ADD).setAlpha(BL.lampAlpha)
    this.heads = heads
    const r = mulberry32(41)
    this.period = new Float64Array(FX.count)
    this.offset = new Float64Array(FX.count)
    const tex = flashTexture(scene)
    for (let i = 0; i < FX.count; i++) {
      this.period[i] = FX.periodMs[0] + r() * (FX.periodMs[1] - FX.periodMs[0])
      this.offset[i] = r() * this.period[i]
      this.flashes.push(scene.add.image(0, 0, tex).setBlendMode(Phaser.BlendModes.ADD).setDepth(depths.flashes).setVisible(false))
    }
    this.vignette = scene.add.image(0, 0, vignetteTexture(scene)).setOrigin(0, 0).setScrollFactor(0).setDepth(depths.vignette)
  }

  setVisible(on: boolean) {
    this.visible = on
    this.beams.mesh.setVisible(on)
    this.glow.mesh.setVisible(on)
    this.lamps.mesh.setVisible(on)
    this.vignette.setVisible(on)
    if (!on) for (const f of this.flashes) f.setVisible(false)
  }

  draw(view: SetPieceView, ms: number, fx: number, w: number, h: number) {
    if (!this.visible) return
    this.glow.draw(view, 0)
    this.lamps.draw(view, 0)
    this.drawBeams(view)
    this.beams.mesh.setAlpha(B.alpha * fx)
    this.vignette.setDisplaySize(w, h).setAlpha(fx)
    // Flashes: cada uno salta en su periodo en un punto distinto de la grada
    const n = this.heads.length / 3
    for (let i = 0; i < this.flashes.length; i++) {
      const img = this.flashes[i]
      const t = ms + this.offset[i]
      const cycle = Math.floor(t / this.period[i])
      const local = t - cycle * this.period[i]
      const p = ((cycle * 7 + i * 13) % n) * 3
      const on = fx > 0.05 && local < FX.ms && view.depth(this.heads[p], this.heads[p + 1], this.heads[p + 2]) > 1
      if (!on) { img.setVisible(false); continue }
      view.project(this.heads[p], this.heads[p + 1], this.heads[p + 2], this.pj)
      const k = 1 - local / FX.ms
      img.setVisible(true).setPosition(this.pj.x, this.pj.y).setAlpha(FX.alpha * k * fx).setScale((FX.sizePx / 32) * (0.6 + 0.4 * k))
    }
  }

  /** Coloca las esquinas de cada haz de cara a la cámara (ancho perpendicular al rayo horizontal). */
  private drawBeams(view: SetPieceView) {
    const pos = this.beams.cells.pos
    let q = 0
    for (const [bx, by] of B.at) {
      const dx = bx - view.eyeX, dy = by - view.eyeY
      const d = Math.hypot(dx, dy) || 1
      const lx = -dy / d, ly = dx / d
      for (let r = 0; r < B.rows; r++) {
        for (let k = 0; k < 4; k++) {
          const t = (r + (k === 1 || k === 3 ? 1 : 0)) / B.rows
          const side = k >= 2 ? 1 : -1
          const hw = (B.topW + (B.botW - B.topW) * t) / 2
          pos[q] = bx + lx * hw * side
          pos[q + 1] = by + ly * hw * side
          pos[q + 2] = B.topZ * (1 - t)
          q += 3
        }
      }
    }
    this.beams.draw(view, 0)
  }
}
