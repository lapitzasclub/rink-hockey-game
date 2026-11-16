/**
 * Atlas de piezas del rig: páginas de canvas con empaquetado por estantes.
 * Todas las piezas de todas las figuras comparten página (un solo lote de
 * dibujo). Cada marco lleva su pivote, así `setFrame` deja el origen bien.
 */
import * as Phaser from 'phaser'
import { RIG_TEX_SUPERSAMPLE } from '../artSpec'

const PAGE_SIZE = 1024
const PAD = 2

export interface FrameRef { page: string; frame: string }

/** Pintor de un marco en px a s = 1 con el ancla en (0, 0). */
export type FramePainter = (ctx: CanvasRenderingContext2D) => void

/** Caja del marco en px a s = 1 respecto al ancla. */
export interface FrameBox { left: number; right: number; top: number; bottom: number }

interface Page { key: string; tex: Phaser.Textures.CanvasTexture; x: number; y: number; rowH: number; dirty: boolean }

class PuppetAtlas {
  private readonly pages: Page[] = []
  private readonly frames = new Map<string, FrameRef>()
  private readonly textures: Phaser.Textures.TextureManager
  constructor(textures: Phaser.Textures.TextureManager) {
    this.textures = textures
  }

  has(name: string) {
    return this.frames.has(name)
  }

  /** Devuelve el marco `name`, pintándolo la primera vez. */
  ensure(name: string, box: FrameBox, paint: FramePainter): FrameRef {
    const hit = this.frames.get(name)
    if (hit) return hit
    const ss = RIG_TEX_SUPERSAMPLE
    const w = Math.ceil((box.right - box.left) * ss)
    const h = Math.ceil((box.bottom - box.top) * ss)
    const page = this.slot(w, h)
    const x = page.x
    const y = page.y
    page.x += w + PAD
    page.rowH = Math.max(page.rowH, h)
    const ctx = page.tex.context
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.setTransform(ss, 0, 0, ss, x - box.left * ss, y - box.top * ss)
    paint(ctx)
    ctx.restore()
    // Tras un HMR la página puede conservar marcos viejos con el mismo nombre
    if (page.tex.has(name)) page.tex.remove(name)
    const frame = page.tex.add(name, 0, x, y, w, h)
    if (frame) {
      frame.customPivot = true
      frame.pivotX = -box.left * ss / w
      frame.pivotY = -box.top * ss / h
    }
    page.dirty = true
    const ref = { page: page.key, frame: name }
    this.frames.set(name, ref)
    return ref
  }

  /** Sube a GPU las páginas con marcos nuevos. */
  flush() {
    for (const p of this.pages) {
      if (!p.dirty) continue
      p.tex.refresh()
      p.dirty = false
    }
  }

  private slot(w: number, h: number): Page {
    let page = this.pages[this.pages.length - 1]
    if (page && page.x + w > PAGE_SIZE) {
      page.x = PAD
      page.y += page.rowH + PAD
      page.rowH = 0
    }
    if (!page || page.y + h > PAGE_SIZE) page = this.newPage()
    return page
  }

  private newPage(): Page {
    const key = `puppet-atlas-${this.pages.length}`
    const tex = this.textures.exists(key)
      ? this.textures.get(key) as Phaser.Textures.CanvasTexture
      : this.textures.createCanvas(key, PAGE_SIZE, PAGE_SIZE)
    if (!tex) throw new Error(`no se pudo crear ${key}`)
    tex.context.clearRect(0, 0, PAGE_SIZE, PAGE_SIZE)
    const page: Page = { key, tex, x: PAD, y: PAD, rowH: 0, dirty: true }
    this.pages.push(page)
    return page
  }
}

const atlases = new WeakMap<Phaser.Textures.TextureManager, PuppetAtlas>()

/** Atlas del juego (las texturas de Phaser son globales y sobreviven a los reinicios de escena). */
export function puppetAtlas(scene: Phaser.Scene): PuppetAtlas {
  let a = atlases.get(scene.textures)
  if (!a) {
    a = new PuppetAtlas(scene.textures)
    atlases.set(scene.textures, a)
  }
  return a
}

export type { PuppetAtlas }
