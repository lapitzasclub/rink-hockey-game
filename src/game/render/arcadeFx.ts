import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../constants'
import type { PowerupKind } from '../types'

export const ARCADE_FONT = '"Russo One", "Arial Black", Impact, sans-serif'

type EmitterKey = 'trail-white' | 'trail-turbo' | 'trail-fire' | 'trail-super' | 'trail-curve' | 'aura-fire' | 'aura-turbo' | 'aura-magnet' | 'aura-shield'
  | 'aura-frost' | 'aura-glint' | 'burst-gold' | 'burst-ice' | 'burst-fire' | 'burst-white' | 'burst-blue' | 'burst-red' | 'burst-bolt' | 'burst-crazy'
  | 'burst-shard' | 'burst-star'

/** Estela de la bola: tiro especial, súper o efecto. */
export type TrailKind = 'turbo' | 'fire' | 'super' | 'curve' | null
export type BurstKind = 'gold' | 'ice' | 'fire' | 'white' | 'blue' | 'red' | 'bolt' | 'crazy' | 'shard' | 'star'

const POWERUP_COLORS: Record<PowerupKind, number> = {
  fire: 0xff6a1a,
  turbo: 0x3ee8ff,
  freeze: 0xa8e4ff,
  magnet: 0xc86bff,
  wall: 0x7dff7a,
  bolt: 0xffe23a,
  crazy: 0xff4fd8,
  shield: 0x7ab8ff,
  mini: 0xffa04d,
}

const BOLT_VARIANTS = 3
/** Por debajo de este tiempo restante el cristal de hielo tiembla antes de romperse. */
const ICE_CRACK_MS = 600

export function getPowerupColor(kind: PowerupKind) {
  return POWERUP_COLORS[kind]
}

type Pt = { x: number, y: number }

// Phaser acepta cualquier {x, y} aunque sus tipos pidan Vector2
const fillPoly = (g: Phaser.GameObjects.Graphics, pts: Pt[], close = true) => g.fillPoints(pts as Phaser.Math.Vector2[], close)
const strokePoly = (g: Phaser.GameObjects.Graphics, pts: Pt[], close: boolean) => g.strokePoints(pts as Phaser.Math.Vector2[], close)

/** Aleatorio determinista: las texturas salen iguales en cada carga. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * Cristal de hielo: una aguja con dos caras (clara a la izquierda, sombra a la derecha),
 * arista blanca y un brillo en el filo. `tilt` inclina la punta.
 */
function drawShard(g: Phaser.GameObjects.Graphics, cx: number, base: number, w: number, h: number, tilt: number) {
  const dx = tilt * h
  const tip = { x: cx + dx, y: base - h }
  const bl = { x: cx - w / 2, y: base }
  const br = { x: cx + w / 2, y: base }
  const sl = { x: cx - w / 2 + dx * 0.62, y: base - h * 0.7 }
  const sr = { x: cx + w / 2 + dx * 0.68, y: base - h * 0.66 }
  const mid = { x: cx + w * 0.08, y: base }
  g.fillStyle(0xeaf9ff, 0.62)
  fillPoly(g, [bl, sl, tip, mid], true)
  g.fillStyle(0x7fc3ee, 0.58)
  fillPoly(g, [mid, tip, sr, br], true)
  g.lineStyle(1.5, 0xffffff, 0.9)
  strokePoly(g, [bl, sl, tip, sr, br], false)
  g.lineStyle(1, 0xffffff, 0.45)
  g.lineBetween(mid.x, mid.y, tip.x, tip.y)
  // Brillo especular en el filo izquierdo
  g.lineStyle(2, 0xffffff, 0.95)
  g.lineBetween(bl.x + (sl.x - bl.x) * 0.25 + 2, base - h * 0.2, bl.x + (sl.x - bl.x) * 0.6 + 2, base - h * 0.48)
}

/** Rayo con ramas: zigzag de arriba abajo en tres pasadas (halo, cuerpo y núcleo). */
function drawBolt(g: Phaser.GameObjects.Graphics, seed: number, w: number, h: number) {
  const rnd = lcg(seed)
  const main: Pt[] = [{ x: w / 2, y: 0 }]
  const steps = 11
  for (let i = 1; i < steps; i++) {
    main.push({ x: Phaser.Math.Clamp(w / 2 + (rnd() - 0.5) * w * 0.55, 8, w - 8), y: (h * i) / steps + (rnd() - 0.5) * 6 })
  }
  main.push({ x: w / 2, y: h })
  const branches: Pt[][] = []
  for (const from of [3, 6, 8]) {
    const start = main[from]
    const side = rnd() < 0.5 ? -1 : 1
    const branch: Pt[] = [start]
    let p = start
    for (let i = 0; i < 3; i++) {
      p = { x: Phaser.Math.Clamp(p.x + side * (6 + rnd() * 9), 2, w - 2), y: p.y + 10 + rnd() * 10 }
      branch.push(p)
    }
    branches.push(branch)
  }
  const pass = (pts: Pt[], width: number, color: number, alpha: number) => {
    g.lineStyle(width, color, alpha)
    strokePoly(g, pts, false)
  }
  for (const b of branches) pass(b, 7, 0xffe23a, 0.2)
  pass(main, 14, 0xffe23a, 0.2)
  for (const b of branches) pass(b, 3, 0xfff3a0, 0.6)
  pass(main, 6, 0xfff3a0, 0.7)
  for (const b of branches) pass(b, 1.4, 0xffffff, 0.95)
  pass(main, 2.6, 0xffffff, 1)
}

/**
 * Genera las texturas procedurales de efectos (una vez por juego): puntos suaves,
 * chispa, estrella, esquirla, cristal de hielo, orbes de powerup, rayos, anillos,
 * burbuja del escudo, cinta de banner y viñeta de evento.
 */
export function createArcadeFxTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('fx-dot')) return
  const g = scene.make.graphics({ x: 0, y: 0 }, false)

  // Punto suave: círculos concéntricos con alfa creciente hacia el centro
  for (let r = 16; r > 0; r -= 1) {
    g.fillStyle(0xffffff, 0.06 + (1 - r / 16) * 0.22)
    g.fillCircle(16, 16, r)
  }
  g.generateTexture('fx-dot', 32, 32)
  g.clear()

  // Chispa alargada
  g.fillStyle(0xffffff, 1)
  g.fillEllipse(12, 3, 24, 4)
  g.fillStyle(0xffffff, 0.5)
  g.fillEllipse(12, 3, 24, 6)
  g.generateTexture('fx-spark', 24, 6)
  g.clear()

  // Destello de cuatro puntas
  g.fillStyle(0xffffff, 0.35)
  g.fillCircle(12, 12, 4)
  g.fillStyle(0xffffff, 1)
  fillPoly(g, [{ x: 12, y: 0 }, { x: 13.6, y: 12 }, { x: 12, y: 24 }, { x: 10.4, y: 12 }], true)
  fillPoly(g, [{ x: 0, y: 12 }, { x: 12, y: 10.4 }, { x: 24, y: 12 }, { x: 12, y: 13.6 }], true)
  g.generateTexture('fx-star', 24, 24)
  g.clear()

  // Esquirla de hielo (para cuando se rompe el cristal)
  g.fillStyle(0xeaf9ff, 1)
  g.fillTriangle(0, 14, 5, 0, 5, 14)
  g.fillStyle(0x8fcdf2, 1)
  g.fillTriangle(5, 0, 10, 11, 5, 14)
  g.generateTexture('fx-shard', 10, 14)
  g.clear()

  // Cristal de hielo: racimo de agujas que envuelve al jugador, de atrás adelante
  g.fillStyle(0xbfe8ff, 0.22)
  g.fillRoundedRect(10, 18, 52, 70, 14)
  drawShard(g, 12, 88, 14, 40, -0.42)
  drawShard(g, 60, 88, 14, 44, 0.38)
  drawShard(g, 24, 88, 22, 70, -0.2)
  drawShard(g, 49, 88, 22, 74, 0.16)
  drawShard(g, 36, 88, 26, 90, 0.02)
  g.fillStyle(0xf2fbff, 0.7)
  g.fillEllipse(36, 86, 70, 10)
  g.generateTexture('fx-crystal', 72, 92)
  g.clear()

  // Orbes de powerup con icono dibujado
  const kinds: PowerupKind[] = ['fire', 'turbo', 'freeze', 'magnet', 'wall', 'bolt', 'crazy', 'shield', 'mini']
  for (const kind of kinds) {
    const color = POWERUP_COLORS[kind]
    const c = 22
    g.fillStyle(color, 0.25)
    g.fillCircle(c, c, 21)
    g.fillStyle(0x0b1420, 0.92)
    g.fillCircle(c, c, 16)
    g.lineStyle(3, color, 1)
    g.strokeCircle(c, c, 16)
    g.lineStyle(1.5, 0xffffff, 0.55)
    g.beginPath()
    g.arc(c, c, 13, Math.PI * 1.1, Math.PI * 1.5, false)
    g.strokePath()
    g.fillStyle(color, 1)
    g.lineStyle(3, color, 1)
    if (kind === 'fire') {
      g.fillTriangle(c - 7, c + 8, c + 7, c + 8, c, c - 10)
      g.fillCircle(c, c + 4, 6)
      g.fillStyle(0xffe36a, 1)
      g.fillCircle(c, c + 5, 3)
    } else if (kind === 'turbo') {
      // Rayo
      g.fillTriangle(c + 2, c - 11, c - 7, c + 2, c + 1, c + 1)
      g.fillTriangle(c - 2, c + 11, c + 7, c - 2, c - 1, c - 1)
    } else if (kind === 'freeze') {
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI
        g.lineBetween(c - Math.cos(a) * 10, c - Math.sin(a) * 10, c + Math.cos(a) * 10, c + Math.sin(a) * 10)
      }
    } else if (kind === 'magnet') {
      g.beginPath()
      g.arc(c, c, 8, 0, Math.PI, false)
      g.strokePath()
      g.lineBetween(c - 8, c, c - 8, c - 8)
      g.lineBetween(c + 8, c, c + 8, c - 8)
      g.fillStyle(0xffffff, 1)
      g.fillRect(c - 10, c - 11, 4, 3)
      g.fillRect(c + 6, c - 11, 4, 3)
    } else if (kind === 'bolt') {
      // Rayo grueso con punta
      g.fillTriangle(c + 4, c - 12, c - 8, c + 2, c + 2, c + 1)
      g.fillTriangle(c - 4, c + 12, c + 8, c - 2, c - 2, c - 1)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(c + 3, c - 10, 2)
    } else if (kind === 'crazy') {
      // Bola con trayectoria en zigzag
      g.lineBetween(c - 11, c + 7, c - 5, c - 5)
      g.lineBetween(c - 5, c - 5, c + 1, c + 6)
      g.fillCircle(c + 6, c - 3, 5)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(c + 4, c - 5, 1.6)
    } else if (kind === 'shield') {
      // Escudo
      g.fillTriangle(c - 9, c - 6, c + 9, c - 6, c, c + 11)
      g.fillRect(c - 9, c - 10, 18, 5)
      g.fillStyle(0x0b1420, 1)
      g.fillTriangle(c - 4, c - 4, c + 4, c - 4, c, c + 5)
    } else if (kind === 'mini') {
      // Portería pequeña con flechas hacia dentro
      g.strokeRect(c - 5, c - 4, 10, 8)
      g.lineBetween(c - 12, c - 10, c - 7, c - 6)
      g.lineBetween(c + 12, c - 10, c + 7, c - 6)
      g.lineBetween(c - 12, c + 10, c - 7, c + 6)
      g.lineBetween(c + 12, c + 10, c + 7, c + 6)
    } else {
      // Muro de ladrillos
      g.fillRect(c - 10, c - 8, 9, 5)
      g.fillRect(c + 1, c - 8, 9, 5)
      g.fillRect(c - 5, c - 2, 10, 5)
      g.fillRect(c - 10, c + 4, 9, 5)
      g.fillRect(c + 1, c + 4, 9, 5)
    }
    g.generateTexture(`pu-${kind}`, 44, 44)
    g.clear()
  }

  // Rayos: varias formas para que dos seguidos no salgan iguales
  for (let i = 0; i < BOLT_VARIANTS; i++) {
    drawBolt(g, 7 + i * 131, 56, 220)
    g.generateTexture(`fx-bolt-${i}`, 56, 220)
    g.clear()
  }

  // Onda expansiva: anillo grueso con halo, y otro fino y nítido para el eco
  g.lineStyle(10, 0xffffff, 0.22)
  g.strokeCircle(32, 32, 24)
  g.lineStyle(5, 0xffffff, 0.9)
  g.strokeCircle(32, 32, 28)
  g.generateTexture('fx-ring', 64, 64)
  g.clear()
  g.lineStyle(2, 0xffffff, 1)
  g.strokeCircle(32, 32, 30)
  g.generateTexture('fx-ring-thin', 64, 64)
  g.clear()

  // Burbuja del escudo: rejilla hexagonal que se nota más en el borde (efecto fresnel)
  const sw = 64
  const sh = 76
  g.fillStyle(0x7ab8ff, 0.12)
  g.fillEllipse(sw / 2, sh / 2, sw - 4, sh - 4)
  const hr = 5.5
  for (let row = 0; row * hr * 1.5 < sh; row++) {
    for (let col = 0; col * hr * 1.732 < sw + hr; col++) {
      const hx = col * hr * 1.732 + (row % 2 ? hr * 0.866 : 0)
      const hy = row * hr * 1.5
      const nx = (hx - sw / 2) / (sw / 2 - 3)
      const ny = (hy - sh / 2) / (sh / 2 - 3)
      const d = Math.hypot(nx, ny)
      if (d > 0.92) continue
      const pts: Pt[] = []
      for (let k = 0; k < 6; k++) pts.push({ x: hx + Math.cos(Math.PI / 6 + (k * Math.PI) / 3) * hr * 0.9, y: hy + Math.sin(Math.PI / 6 + (k * Math.PI) / 3) * hr * 0.9 })
      g.lineStyle(1, 0xbfe0ff, 0.08 + d * d * 0.5)
      strokePoly(g, pts, true)
    }
  }
  g.lineStyle(2, 0xd6ecff, 0.9)
  g.strokeEllipse(sw / 2, sh / 2, sw - 4, sh - 4)
  g.lineStyle(3, 0xffffff, 0.75)
  g.beginPath()
  g.arc(sw / 2, sh / 2, 24, Math.PI * 1.08, Math.PI * 1.42, false)
  g.strokePath()
  g.fillStyle(0xffffff, 0.8)
  g.fillCircle(sw / 2 - 14, sh / 2 - 20, 2.5)
  g.generateTexture('fx-shield', sw, sh)
  g.clear()

  // Cinta del banner: banda oscura con filetes blancos (se tiñe del color del banner)
  g.fillStyle(0x0b1726, 0.82)
  fillPoly(g, [{ x: 48, y: 18 }, { x: 640, y: 18 }, { x: 592, y: 110 }, { x: 0, y: 110 }], true)
  g.fillStyle(0xffffff, 0.08)
  fillPoly(g, [{ x: 44, y: 26 }, { x: 636, y: 26 }, { x: 620, y: 56 }, { x: 28, y: 56 }], true)
  g.fillStyle(0xffffff, 1)
  fillPoly(g, [{ x: 52, y: 8 }, { x: 640, y: 8 }, { x: 636, y: 14 }, { x: 49, y: 14 }], true)
  fillPoly(g, [{ x: 0, y: 114 }, { x: 588, y: 114 }, { x: 585, y: 120 }, { x: 0, y: 120 }], true)
  g.generateTexture('fx-ribbon', 640, 128)
  g.clear()

  g.destroy()

  // Viñeta: centro limpio y bordes de color (canvas para tener degradado radial real)
  const vig = scene.textures.createCanvas('fx-vignette', 320, 180)
  const ctx = vig?.getContext()
  if (vig && ctx) {
    const grad = ctx.createRadialGradient(160, 90, 50, 160, 90, 190)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.06)')
    grad.addColorStop(1, 'rgba(255,255,255,0.85)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 320, 180)
    vig.refresh()
  }
}

type FrozenFx = { img: Phaser.GameObjects.Image, on: boolean }
type ShieldFx = { img: Phaser.GameObjects.Image, on: boolean, popUntil: number }
type FloatEntry = { label: Phaser.GameObjects.Text, x: number, y: number, until: number }

/**
 * Efectos visuales del modo arcade: estelas, auras, explosiones de partículas,
 * banners de texto, hielo y escudo. Todo se emite manualmente con
 * emitParticleAt para no crear un emisor por jugador.
 */
export class ArcadeFx {
  private emitters = new Map<EmitterKey, Phaser.GameObjects.Particles.ParticleEmitter>()
  private frozen = new Map<string, FrozenFx>()
  private shields = new Map<string, ShieldFx>()
  private floats: FloatEntry[] = []
  private vignette: Phaser.GameObjects.Image | null = null
  private bannerTween: Phaser.Tweens.Tween | null = null
  private banner: Phaser.GameObjects.Container | null = null
  private boltIndex = 0

  private readonly scene: Phaser.Scene
  private readonly withUi: <T>(build: () => T) => T
  /** Fracción de partículas que se emiten (calidad gráfica: 1 alta, menos en equipos modestos; 0 apagadas). */
  private density = 1

  constructor(scene: Phaser.Scene, withUi: <T>(build: () => T) => T, density = 1) {
    this.scene = scene
    this.withUi = withUi
    this.density = density
    createArcadeFxTextures(scene)
  }

  setDensity(density: number) {
    this.density = Phaser.Math.Clamp(density, 0, 1)
  }

  private emitter(key: EmitterKey) {
    const existing = this.emitters.get(key)
    if (existing) return existing
    const config = this.configFor(key)
    const emitter = this.scene.add.particles(0, 0, config.texture, { ...config.cfg, emitting: false })
    emitter.setDepth(config.depth)
    this.emitters.set(key, emitter)
    return emitter
  }

  private configFor(key: EmitterKey): { texture: string, depth: number, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig } {
    const add = Phaser.BlendModes.ADD
    switch (key) {
      case 'trail-white':
        return { texture: 'fx-dot', depth: 2, cfg: { lifespan: 220, scale: { start: 0.42, end: 0 }, alpha: { start: 0.5, end: 0 }, blendMode: add } }
      case 'trail-turbo':
        return { texture: 'fx-dot', depth: 2, cfg: { lifespan: 340, scale: { start: 0.7, end: 0 }, alpha: { start: 0.85, end: 0 }, tint: 0x3ee8ff, blendMode: add } }
      case 'trail-fire':
        return { texture: 'fx-dot', depth: 2, cfg: { lifespan: 480, speed: { min: 10, max: 50 }, scale: { start: 1.05, end: 0.1 }, alpha: { start: 0.95, end: 0 }, tint: [0xffe36a, 0xff8a1a, 0xff3d1a], blendMode: add } }
      case 'aura-fire':
        return { texture: 'fx-dot', depth: 1, cfg: { lifespan: 520, speedY: { min: -90, max: -40 }, speedX: { min: -18, max: 18 }, scale: { start: 0.8, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [0xffe36a, 0xff8a1a, 0xff3d1a], blendMode: add } }
      case 'aura-turbo':
        return { texture: 'fx-dot', depth: 1, cfg: { lifespan: 300, scale: { start: 0.5, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0x3ee8ff, blendMode: add } }
      case 'trail-super':
        return { texture: 'fx-dot', depth: 2, cfg: { lifespan: 560, speed: { min: 20, max: 70 }, scale: { start: 1.25, end: 0.1 }, alpha: { start: 1, end: 0 }, tint: [0xffffff, 0xffe36a, 0xff4fd8, 0x3ee8ff], blendMode: add } }
      case 'trail-curve':
        return { texture: 'fx-dot', depth: 2, cfg: { lifespan: 300, scale: { start: 0.55, end: 0 }, alpha: { start: 0.75, end: 0 }, tint: 0xb6ff5a, blendMode: add } }
      case 'aura-shield':
        return { texture: 'fx-star', depth: 5, cfg: { lifespan: 520, speedY: { min: -40, max: -15 }, scale: { start: 0.45, end: 0 }, rotate: { min: 0, max: 90 }, alpha: { start: 0.9, end: 0 }, tint: [0xbfe0ff, 0xffffff], blendMode: add } }
      case 'aura-frost':
        return { texture: 'fx-dot', depth: 3, cfg: { lifespan: 1100, speedY: { min: -26, max: -8 }, speedX: { min: -14, max: 14 }, scale: { start: 0.5, end: 1.5 }, alpha: { start: 0.32, end: 0 }, tint: 0xdff4ff } }
      case 'aura-glint':
        return { texture: 'fx-star', depth: 5, cfg: { lifespan: 420, scale: { start: 0.9, end: 0 }, rotate: { start: 0, end: 90 }, alpha: { start: 1, end: 0 }, blendMode: add } }
      case 'burst-bolt':
        return { texture: 'fx-spark', depth: 24, cfg: { lifespan: 520, speed: { min: 160, max: 420 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xffffff, 0xffe23a], blendMode: add } }
      case 'burst-crazy':
        return { texture: 'fx-spark', depth: 24, cfg: { lifespan: 460, speed: { min: 120, max: 300 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xff4fd8, 0xffffff, 0x3ee8ff], blendMode: add } }
      case 'aura-magnet':
        return { texture: 'fx-spark', depth: 1, cfg: { lifespan: 380, speed: { min: 30, max: 70 }, rotate: { min: 0, max: 360 }, scale: { start: 0.6, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: 0xc86bff, blendMode: add } }
      case 'burst-gold':
        return { texture: 'fx-spark', depth: 24, cfg: { lifespan: 900, speed: { min: 180, max: 520 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, gravityY: 380, scale: { start: 1.2, end: 0.2 }, alpha: { start: 1, end: 0 }, tint: [0xffe36a, 0xffffff, 0xffb23a], blendMode: add } }
      case 'burst-ice':
        return { texture: 'fx-spark', depth: 24, cfg: { lifespan: 650, speed: { min: 90, max: 260 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xffffff, 0xa8e4ff], blendMode: add } }
      case 'burst-shard':
        return { texture: 'fx-shard', depth: 24, cfg: { lifespan: { min: 600, max: 900 }, speed: { min: 140, max: 340 }, angle: { min: 200, max: 340 }, rotate: { min: -540, max: 540 }, gravityY: 900, scale: { min: 0.6, max: 1.3 }, alpha: { start: 1, end: 0, ease: 'Quad.In' } } }
      case 'burst-star':
        return { texture: 'fx-star', depth: 24, cfg: { lifespan: 600, speed: { min: 40, max: 200 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, rotate: { start: 0, end: 120 }, alpha: { start: 1, end: 0 }, tint: [0xffffff, 0xfff3a0], blendMode: add } }
      case 'burst-fire':
        return { texture: 'fx-dot', depth: 24, cfg: { lifespan: 700, speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 1.3, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xffe36a, 0xff8a1a, 0xff3d1a], blendMode: add } }
      case 'burst-white':
        return { texture: 'fx-spark', depth: 24, cfg: { lifespan: 420, speed: { min: 140, max: 320 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: add } }
      case 'burst-blue':
        return { texture: 'fx-spark', depth: 24, cfg: { lifespan: 900, speed: { min: 180, max: 480 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, gravityY: 380, scale: { start: 1.1, end: 0.2 }, alpha: { start: 1, end: 0 }, tint: [0x4da3ff, 0xffffff, 0x9fd0ff], blendMode: add } }
      case 'burst-red':
        return { texture: 'fx-spark', depth: 24, cfg: { lifespan: 900, speed: { min: 180, max: 480 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, gravityY: 380, scale: { start: 1.1, end: 0.2 }, alpha: { start: 1, end: 0 }, tint: [0xff5d6c, 0xffffff, 0xffb0b8], blendMode: add } }
    }
  }

  /** Estela de la bola según el tipo de tiro activo; `speed` en px/s mundo. `n` = pasos de simulación del fotograma. */
  ballTrail(x: number, y: number, speed: number, kind: TrailKind, n = 1) {
    const k = this.density
    if (k <= 0) return
    if (kind === 'super') this.emitter('trail-super').emitParticleAt(x, y, Math.max(1, Math.round(4 * n * k)))
    else if (kind === 'curve') this.emitter('trail-curve').emitParticleAt(x, y, Math.max(1, Math.round(n * k)))
    else if (kind === 'fire') this.emitter('trail-fire').emitParticleAt(x, y, Math.max(1, Math.round(3 * n * k)))
    else if (kind === 'turbo') this.emitter('trail-turbo').emitParticleAt(x, y, Math.max(1, Math.round(2 * n * k)))
    else if (speed > 430 && Math.random() < k) this.emitter('trail-white').emitParticleAt(x, y, n)
  }

  /** Aura de un jugador; `n` = pasos de simulación del fotograma (una emisión por paso). */
  aura(kind: 'fire' | 'turbo' | 'magnet' | 'shield' | 'frost', x: number, y: number, n = 1) {
    for (let i = 0; i < n; i++) {
      if (Math.random() >= this.density) continue
      if (kind === 'fire') this.emitter('aura-fire').emitParticleAt(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 18), 1)
      else if (kind === 'turbo') this.emitter('aura-turbo').emitParticleAt(x + Phaser.Math.Between(-6, 6), y + 16, 1)
      else if (kind === 'shield') { if (Math.random() < 0.12) this.emitter('aura-shield').emitParticleAt(x + Phaser.Math.Between(-24, 24), y - Phaser.Math.Between(4, 56), 1) }
      else if (kind === 'frost') {
        // Vaho frío en la base y algún destello suelto sobre el cristal
        if (Math.random() < 0.3) this.emitter('aura-frost').emitParticleAt(x + Phaser.Math.Between(-26, 26), y + Phaser.Math.Between(4, 14), 1)
        if (Math.random() < 0.05) this.emitter('aura-glint').emitParticleAt(x + Phaser.Math.Between(-22, 22), y - Phaser.Math.Between(10, 70), 1)
      } else if (Math.random() < 0.35) this.emitter('aura-magnet').emitParticleAt(x, y, 1)
    }
  }

  burst(kind: BurstKind, x: number, y: number, count = 24) {
    if (this.density <= 0) return
    this.emitter(`burst-${kind}`).explode(Math.max(4, Math.round(count * this.density)), x, y)
  }

  /**
   * Cristal de hielo sobre un jugador congelado (una imagen por jugador, reutilizada).
   * Al congelarse crece desde los patines; en los últimos `ICE_CRACK_MS` tiembla y al
   * acabar estalla en esquirlas. `leftMs` = tiempo de congelación que queda.
   */
  setFrozen(playerId: string, frozen: boolean, x = 0, y = 0, leftMs = Infinity) {
    let fx = this.frozen.get(playerId)
    if (!frozen) {
      if (fx?.on) {
        fx.on = false
        fx.img.setVisible(false)
        this.burst('shard', fx.img.x, fx.img.y - 40, 16)
        this.burst('ice', fx.img.x, fx.img.y - 40, 10)
      }
      return
    }
    if (!fx) {
      fx = { img: this.scene.add.image(x, y, 'fx-crystal').setOrigin(0.5, 0.95).setDepth(4), on: false }
      this.frozen.set(playerId, fx)
    }
    const feetY = y + 18
    if (!fx.on) {
      fx.on = true
      fx.img.setVisible(true).setAlpha(1).setScale(0.55, 0.05)
      this.scene.tweens.add({ targets: fx.img, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' })
      this.scene.tweens.add({ targets: fx.img, alpha: 0.88, delay: 260, duration: 300 })
      this.burst('star', x, feetY - 40, 8)
    }
    const shake = leftMs < ICE_CRACK_MS ? Math.sin(this.scene.time.now * 0.09) * 1.8 * (1 - leftMs / ICE_CRACK_MS) : 0
    fx.img.setPosition(x + shake, feetY)
  }

  /** Burbuja del escudo sobre un jugador: entra con rebote, late y estalla al acabarse. */
  setShielded(playerId: string, on: boolean, x = 0, y = 0, timeNow = 0) {
    let fx = this.shields.get(playerId)
    if (!on) {
      if (fx?.on) {
        fx.on = false
        fx.img.setVisible(false)
        this.shockwave(fx.img.x, fx.img.y, 0x9fd0ff, 1.1)
        this.burst('ice', fx.img.x, fx.img.y, 10)
      }
      return
    }
    if (!fx) {
      fx = { img: this.scene.add.image(x, y, 'fx-shield').setDepth(4).setBlendMode(Phaser.BlendModes.ADD), on: false, popUntil: 0 }
      this.shields.set(playerId, fx)
    }
    if (!fx.on) {
      fx.on = true
      fx.popUntil = timeNow + 320
      fx.img.setVisible(true).setScale(0.3)
      this.scene.tweens.add({ targets: fx.img, scale: 1, duration: 320, ease: 'Back.Out' })
      this.shockwave(x, y - 26, 0x9fd0ff, 1)
    }
    // Late suave; el estiramiento vertical alterno le da sensación de burbuja blanda
    const wobble = timeNow > fx.popUntil ? Math.sin(timeNow * 0.009) * 0.03 : 0
    if (timeNow > fx.popUntil) fx.img.setScale(1 + wobble, 1 - wobble)
    fx.img.setPosition(x, y - 26).setAlpha(0.7 + Math.sin(timeNow * 0.012) * 0.18)
  }

  /**
   * Viñeta de color en los bordes de la pantalla (capa UI) mientras dura un evento de
   * partido; null la quita. Se crea una vez y solo cambia al empezar o acabar el evento.
   */
  setScreenTint(color: number | null) {
    if (this.vignette) this.scene.tweens.killTweensOf(this.vignette)
    if (color === null) {
      if (this.vignette?.visible) this.scene.tweens.add({ targets: this.vignette, alpha: 0, duration: 500, onComplete: () => this.vignette?.setVisible(false) })
      return
    }
    if (!this.vignette) {
      this.vignette = this.withUi(() => this.scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'fx-vignette').setDepth(1))
    }
    // Cubre lo que se vea del lienzo (con Scale.EXPAND puede ser más que 16:9)
    const { width, height } = this.scene.scale.gameSize
    this.vignette.setDisplaySize(Math.max(width, GAME_WIDTH) + 8, Math.max(height, GAME_HEIGHT) + 8)
    this.vignette.setTint(color).setVisible(true).setAlpha(0)
    this.scene.tweens.add({ targets: this.vignette, alpha: 0.6, duration: 600, ease: 'Sine.Out' })
  }

  /**
   * Rayo que cae del techo sobre un punto del mundo: parpadea dos veces, deja un
   * fogonazo en el suelo y una segunda descarga más fina, con chispas y destellos.
   */
  lightning(x: number, y: number) {
    const strike = (dx: number, delay: number, sx: number) => {
      const key = `fx-bolt-${this.boltIndex++ % BOLT_VARIANTS}`
      const bolt = this.scene.add.image(x + dx, y, key).setOrigin(0.5, 1).setDepth(25).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(sx * (Math.random() < 0.5 ? -1 : 1), 1.7).setAlpha(0)
      this.scene.tweens.chain({
        targets: bolt,
        tweens: [
          { alpha: 1, duration: 30, delay },
          { alpha: 0.2, duration: 45 },
          { alpha: 1, duration: 35 },
          { alpha: 0, duration: 220, ease: 'Quad.In' },
        ],
        onComplete: () => bolt.destroy(),
      })
    }
    strike(0, 0, 1.15)
    strike(Phaser.Math.Between(-10, 10), 70, 0.7)
    const flash = this.scene.add.image(x, y, 'fx-dot').setDepth(23).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff6b0).setScale(3.4, 1.7)
    this.scene.tweens.add({ targets: flash, alpha: { from: 1, to: 0 }, scaleX: 5, scaleY: 2.4, duration: 320, ease: 'Cubic.Out', onComplete: () => flash.destroy() })
    this.burst('bolt', x, y - 4, 16)
    this.burst('star', x, y - 20, 6)
  }

  /** Onda expansiva desde un punto del mundo: fogonazo, anillo de color y un eco fino detrás. */
  shockwave(x: number, y: number, color: number, scale = 2.4) {
    const add = Phaser.BlendModes.ADD
    const flash = this.scene.add.image(x, y, 'fx-dot').setDepth(23).setBlendMode(add).setTint(color).setScale(scale * 0.9, scale * 0.55)
    this.scene.tweens.add({ targets: flash, alpha: { from: 0.9, to: 0 }, duration: 220, ease: 'Quad.Out', onComplete: () => flash.destroy() })
    const ring = this.scene.add.image(x, y, 'fx-ring').setDepth(23).setTint(color).setBlendMode(add).setScale(0.3, 0.18)
    this.scene.tweens.add({ targets: ring, scaleX: scale, scaleY: scale * 0.6, alpha: { from: 1, to: 0 }, duration: 440, ease: 'Cubic.Out', onComplete: () => ring.destroy() })
    const echo = this.scene.add.image(x, y, 'fx-ring-thin').setDepth(23).setBlendMode(add).setScale(0.2, 0.12).setAlpha(0)
    this.scene.tweens.add({ targets: echo, scaleX: scale * 1.3, scaleY: scale * 0.78, alpha: { from: 0.85, to: 0 }, delay: 70, duration: 520, ease: 'Cubic.Out', onComplete: () => echo.destroy() })
  }

  /**
   * Texto flotante en el mundo (p. ej. "¡PUM!" sobre una carga): salta con rebote, se
   * queda un instante y sube desvaneciéndose. Si coincide con otro cerca, se apila
   * encima en vez de taparlo; con demasiados a la vez se quita el más viejo.
   */
  floatText(x: number, y: number, text: string, color: string, size = 22) {
    const now = this.scene.time.now
    this.floats = this.floats.filter(f => f.until > now && f.label.active)
    let ty = y
    for (const f of this.floats) {
      if (Math.abs(f.x - x) < 110 && Math.abs(f.y - ty) < size + 8) ty = f.y - (size + 10)
    }
    if (this.floats.length >= 6) this.floats.shift()?.label.destroy()
    const label = this.scene.add.text(x, ty, text, {
      fontFamily: ARCADE_FONT,
      fontSize: `${size}px`,
      color,
      stroke: '#08111b',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 0, fill: true, stroke: true },
    }).setOrigin(0.5).setDepth(26).setScale(0.2).setAngle(Phaser.Math.FloatBetween(-7, 7))
    const entry = { label, x, y: ty, until: now + 1000 }
    this.floats.push(entry)
    this.scene.tweens.chain({
      targets: label,
      tweens: [
        { scale: 1.2, angle: label.angle * 0.4, duration: 150, ease: 'Back.Out' },
        { scale: 1, duration: 90, ease: 'Sine.Out' },
        { y: ty - 40, alpha: 0, duration: 520, delay: 320, ease: 'Cubic.In' },
      ],
      onComplete: () => label.destroy(),
    })
  }

  /**
   * Banner grande a pantalla (capa UI): la cinta se despliega desde el centro, el
   * título cae con golpe y destello blanco, y el subtítulo entra un poco después.
   * Un banner nuevo sustituye al anterior.
   */
  showBanner(text: string, color: string, sub?: string, durationMs = 1500) {
    this.bannerTween?.stop()
    this.banner?.destroy()
    const tint = Phaser.Display.Color.HexStringToColor(color).color
    const parts = this.withUi(() => {
      const container = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT * 0.42).setDepth(60)
      const ribbon = this.scene.add.image(0, sub ? 22 : 4, 'fx-ribbon').setTint(tint).setScale(0, sub ? 1.25 : 1)
      const style = {
        fontFamily: ARCADE_FONT,
        fontSize: '76px',
        color,
        stroke: '#08111b',
        strokeThickness: 12,
        shadow: { offsetX: 0, offsetY: 6, color: '#000000', blur: 0, fill: true, stroke: true },
      }
      const main = this.scene.add.text(0, 0, text, style).setOrigin(0.5)
      // Copia blanca encima: destello al caer que se apaga enseguida
      const flash = this.scene.add.text(0, 0, text, { ...style, color: '#ffffff', shadow: undefined }).setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD)
      container.add([ribbon, main, flash])
      let subText: Phaser.GameObjects.Text | null = null
      if (sub) {
        subText = this.scene.add.text(0, 62, sub, {
          fontFamily: ARCADE_FONT,
          fontSize: '28px',
          color: '#ffffff',
          stroke: '#08111b',
          strokeThickness: 7,
        }).setOrigin(0.5).setAlpha(0)
        container.add(subText)
      }
      return { container, ribbon, main, flash, subText }
    })
    const { container, ribbon, main, flash, subText } = parts
    this.banner = container
    container.setAngle(-3)
    this.scene.tweens.add({ targets: ribbon, scaleX: 1.15, duration: 260, ease: 'Cubic.Out' })
    for (const t of [main, flash]) t.setScale(2.4).setAlpha(0)
    this.scene.tweens.add({ targets: [main, flash], scale: 1, alpha: 1, duration: 220, delay: 60, ease: 'Back.Out' })
    this.scene.tweens.add({ targets: flash, alpha: 0, delay: 280, duration: 260, ease: 'Quad.Out' })
    // Golpe al caer: el bloque se balancea un poco y vuelve
    this.scene.tweens.add({ targets: container, angle: { from: -6, to: -3 }, delay: 280, duration: 420, ease: 'Elastic.Out' })
    if (subText) {
      subText.y = 84
      this.scene.tweens.add({ targets: subText, y: 62, alpha: 1, delay: 220, duration: 260, ease: 'Back.Out' })
    }
    this.bannerTween = this.scene.tweens.add({
      targets: container,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 0.7,
      delay: durationMs,
      duration: 240,
      ease: 'Cubic.In',
      onComplete: () => {
        if (this.banner === container) this.banner = null
        container.destroy()
      },
    })
  }

  destroy() {
    this.emitters.clear()
    this.frozen.clear()
    this.shields.clear()
    this.floats = []
    this.vignette = null
    this.banner = null
    this.bannerTween = null
  }
}
