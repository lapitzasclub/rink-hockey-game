import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../constants'
import type { PowerupKind } from '../types'

export const ARCADE_FONT = '"Russo One", "Arial Black", Impact, sans-serif'

type EmitterKey = 'trail-white' | 'trail-turbo' | 'trail-fire' | 'trail-super' | 'trail-curve' | 'aura-fire' | 'aura-turbo' | 'aura-magnet' | 'aura-shield'
  | 'burst-gold' | 'burst-ice' | 'burst-fire' | 'burst-white' | 'burst-blue' | 'burst-red' | 'burst-bolt' | 'burst-crazy'

/** Estela de la bola: tiro especial, súper o efecto. */
export type TrailKind = 'turbo' | 'fire' | 'super' | 'curve' | null
export type BurstKind = 'gold' | 'ice' | 'fire' | 'white' | 'blue' | 'red' | 'bolt' | 'crazy'

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

export function getPowerupColor(kind: PowerupKind) {
  return POWERUP_COLORS[kind]
}

/**
 * Genera las texturas procedurales de efectos (una vez por juego).
 * Puntos suaves para partículas, chispa, bloque de hielo y orbes de powerup.
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

  // Bloque de hielo
  g.fillStyle(0xbfeaff, 0.55)
  g.fillRoundedRect(2, 2, 52, 66, 8)
  g.lineStyle(2, 0xffffff, 0.9)
  g.strokeRoundedRect(2, 2, 52, 66, 8)
  g.lineStyle(2, 0xffffff, 0.6)
  g.lineBetween(12, 12, 22, 30)
  g.lineBetween(36, 10, 44, 22)
  g.lineBetween(10, 48, 18, 58)
  g.generateTexture('fx-ice', 56, 70)
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

  // Rayo del powerup: zigzag vertical (se estira desde arriba hasta el objetivo)
  g.lineStyle(7, 0xffe23a, 0.45)
  const zig = [[12, 0], [5, 26], [17, 42], [7, 68], [16, 82], [11, 96]]
  for (let i = 1; i < zig.length; i++) g.lineBetween(zig[i - 1][0], zig[i - 1][1], zig[i][0], zig[i][1])
  g.lineStyle(3, 0xffffff, 1)
  for (let i = 1; i < zig.length; i++) g.lineBetween(zig[i - 1][0], zig[i - 1][1], zig[i][0], zig[i][1])
  g.generateTexture('fx-bolt', 24, 96)
  g.clear()

  // Onda expansiva (súper tiro, rayo)
  g.lineStyle(5, 0xffffff, 0.9)
  g.strokeCircle(32, 32, 28)
  g.lineStyle(10, 0xffffff, 0.25)
  g.strokeCircle(32, 32, 24)
  g.generateTexture('fx-ring', 64, 64)
  g.clear()

  // Burbuja del escudo
  g.fillStyle(0x7ab8ff, 0.16)
  g.fillEllipse(30, 36, 56, 68)
  g.lineStyle(2, 0xbfe0ff, 0.85)
  g.strokeEllipse(30, 36, 56, 68)
  g.lineStyle(3, 0xffffff, 0.7)
  g.beginPath()
  g.arc(30, 36, 22, Math.PI * 1.1, Math.PI * 1.45, false)
  g.strokePath()
  g.generateTexture('fx-shield', 60, 72)
  g.clear()

  g.destroy()
}

/**
 * Efectos visuales del modo arcade: estelas, auras, explosiones de partículas,
 * banners de texto y bloques de hielo. Todo se emite manualmente con
 * emitParticleAt para no crear un emisor por jugador.
 */
export class ArcadeFx {
  private emitters = new Map<EmitterKey, Phaser.GameObjects.Particles.ParticleEmitter>()
  private iceBlocks = new Map<string, Phaser.GameObjects.Image>()
  private shields = new Map<string, Phaser.GameObjects.Image>()
  private tint: Phaser.GameObjects.Rectangle | null = null
  private bannerTween: Phaser.Tweens.Tween | null = null
  private banner: Phaser.GameObjects.Container | null = null

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
        return { texture: 'fx-spark', depth: 1, cfg: { lifespan: 420, speed: { min: 20, max: 50 }, rotate: { min: 0, max: 360 }, scale: { start: 0.5, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: [0x7ab8ff, 0xffffff], blendMode: add } }
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
  aura(kind: 'fire' | 'turbo' | 'magnet' | 'shield', x: number, y: number, n = 1) {
    for (let i = 0; i < n; i++) {
      if (Math.random() >= this.density) continue
      if (kind === 'fire') this.emitter('aura-fire').emitParticleAt(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 18), 1)
      else if (kind === 'turbo') this.emitter('aura-turbo').emitParticleAt(x + Phaser.Math.Between(-6, 6), y + 16, 1)
      else if (kind === 'shield') { if (Math.random() < 0.3) this.emitter('aura-shield').emitParticleAt(x + Phaser.Math.Between(-20, 20), y - Phaser.Math.Between(0, 50), 1) }
      else if (Math.random() < 0.35) this.emitter('aura-magnet').emitParticleAt(x, y, 1)
    }
  }

  burst(kind: BurstKind, x: number, y: number, count = 24) {
    if (this.density <= 0) return
    this.emitter(`burst-${kind}`).explode(Math.max(4, Math.round(count * this.density)), x, y)
  }

  /** Muestra u oculta el bloque de hielo sobre un jugador congelado. */
  setFrozen(playerId: string, frozen: boolean, x = 0, y = 0) {
    let block = this.iceBlocks.get(playerId)
    if (!frozen) {
      block?.setVisible(false)
      return
    }
    if (!block) {
      block = this.scene.add.image(x, y, 'fx-ice').setDepth(4).setAlpha(0.8)
      this.iceBlocks.set(playerId, block)
    }
    block.setVisible(true).setPosition(x, y - 18)
  }

  /** Burbuja del escudo sobre un jugador (igual que el bloque de hielo: una imagen por jugador, reutilizada). */
  setShielded(playerId: string, on: boolean, x = 0, y = 0, timeNow = 0) {
    let bubble = this.shields.get(playerId)
    if (!on) {
      bubble?.setVisible(false)
      return
    }
    if (!bubble) {
      bubble = this.scene.add.image(x, y, 'fx-shield').setDepth(4).setBlendMode(Phaser.BlendModes.ADD)
      this.shields.set(playerId, bubble)
    }
    bubble.setVisible(true).setPosition(x, y - 26).setAlpha(0.65 + Math.sin(timeNow * 0.012) * 0.2)
  }

  /**
   * Velo de color a pantalla (capa UI) mientras dura un evento de partido; null lo quita.
   * Se crea una vez y solo cambia al empezar o acabar el evento.
   */
  setScreenTint(color: number | null) {
    if (color === null) {
      this.tint?.setVisible(false)
      return
    }
    if (!this.tint) {
      this.tint = this.withUi(() => this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1).setDepth(1))
    }
    this.tint.setFillStyle(color, 0.08).setVisible(true)
  }

  /** Rayo que cae del techo sobre un punto de pantalla mundo, con chispas. */
  lightning(x: number, y: number) {
    const bolt = this.scene.add.image(x, y, 'fx-bolt').setOrigin(0.5, 1).setDepth(25).setBlendMode(Phaser.BlendModes.ADD)
    bolt.setScale(Phaser.Math.FloatBetween(1.1, 1.5), 3.2).setFlipX(Math.random() < 0.5)
    this.scene.tweens.add({ targets: bolt, alpha: { from: 1, to: 0 }, duration: 260, ease: 'Quad.In', onComplete: () => bolt.destroy() })
    this.burst('bolt', x, y - 4, 12)
  }

  /** Onda expansiva desde un punto del mundo. */
  shockwave(x: number, y: number, color: number, scale = 2.4) {
    const ring = this.scene.add.image(x, y, 'fx-ring').setDepth(23).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3, 0.18)
    this.scene.tweens.add({ targets: ring, scaleX: scale, scaleY: scale * 0.6, alpha: { from: 1, to: 0 }, duration: 420, ease: 'Cubic.Out', onComplete: () => ring.destroy() })
  }

  /** Texto flotante en el mundo (p. ej. "¡PUM!" sobre una carga). */
  floatText(x: number, y: number, text: string, color: string, size = 22) {
    const label = this.scene.add.text(x, y, text, {
      fontFamily: ARCADE_FONT,
      fontSize: `${size}px`,
      color,
      stroke: '#08111b',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(26)
    this.scene.tweens.add({
      targets: label,
      y: y - 46,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.6, to: 1.15 },
      duration: 900,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    })
  }

  /**
   * Banner grande a pantalla (capa UI) con entrada elástica.
   * Un banner nuevo sustituye al anterior.
   */
  showBanner(text: string, color: string, sub?: string, durationMs = 1500) {
    this.bannerTween?.stop()
    this.banner?.destroy()
    const banner = this.withUi(() => {
      const container = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT * 0.42).setDepth(60)
      const main = this.scene.add.text(0, 0, text, {
        fontFamily: ARCADE_FONT,
        fontSize: '76px',
        color,
        stroke: '#08111b',
        strokeThickness: 12,
        shadow: { offsetX: 0, offsetY: 6, color: '#000000', blur: 0, fill: true, stroke: true },
      }).setOrigin(0.5)
      container.add(main)
      if (sub) {
        container.add(this.scene.add.text(0, 62, sub, {
          fontFamily: ARCADE_FONT,
          fontSize: '28px',
          color: '#ffffff',
          stroke: '#08111b',
          strokeThickness: 7,
        }).setOrigin(0.5))
      }
      return container
    })
    this.banner = banner
    banner.setScale(0.2).setAngle(-8)
    this.scene.tweens.add({ targets: banner, scale: 1, angle: -3, duration: 380, ease: 'Back.Out' })
    this.bannerTween = this.scene.tweens.add({
      targets: banner,
      alpha: 0,
      scale: 1.25,
      delay: durationMs,
      duration: 260,
      ease: 'Cubic.In',
      onComplete: () => {
        if (this.banner === banner) this.banner = null
        banner.destroy()
      },
    })
  }

  destroy() {
    this.emitters.clear()
    this.iceBlocks.clear()
    this.shields.clear()
    this.tint = null
    this.banner = null
    this.bannerTween = null
  }
}
