/**
 * E-16: pools preasignados de las partículas de pista. Cada partícula vive en el mundo
 * (x, y sobre el suelo y z de altura, en px) y se proyecta cada fotograma con la cámara
 * única (viewTransform): así respeta la perspectiva y su profundidad sale de la y de su
 * base, por delante o por detrás de los jugadores. Estado en arrays tipados y una imagen
 * por hueco creada una vez; al llenarse se reutiliza el hueco más antiguo.
 * P-14: un hueco muerto sale de la lista de pintado (no solo se oculta): así los cientos de
 * huecos libres no cuestan en el filtrado por cámara ni en el orden por profundidad de cada
 * fotograma, y la escena solo paga por las partículas y marcas vivas.
 */
import * as Phaser from 'phaser'
import { bandDepth, DEPTH, RINK_FX } from './artSpec'
import { RFX_TEX } from './rinkFxTextures'
import { project, type Projected } from './viewTransform'

export const PKind = { Speck: 0, Puff: 1, Spark: 2, Flash: 3 } as const
export type PKind = typeof PKind[keyof typeof PKind]

const TEX_BY_KIND = [RFX_TEX.speck, RFX_TEX.puff, RFX_TEX.spark, RFX_TEX.flash] as const

/** Datos de una emisión; se rellena el objeto compartido `ParticlePool.spec` y se llama a `spawn`. */
export type ParticleSpec = {
  kind: PKind
  x: number, y: number, z: number
  vx: number, vy: number, vz: number
  /** Tamaño en px de mundo al nacer y al morir. */
  size0: number, size1: number
  alpha: number
  life: number
  gravity: number
  drag: number
  tint: number
  /** Desplazamiento (px de pantalla) de la y con que se ordena: >0 la adelanta. */
  depthBias: number
}

const P: Projected = { x: 0, y: 0, s: 0 }
const Q: Projected = { x: 0, y: 0, s: 0 }

export class ParticlePool {
  readonly spec: ParticleSpec = { kind: PKind.Speck, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size0: 1, size1: 1, alpha: 1, life: 300, gravity: 0, drag: 0, tint: 0xffffff, depthBias: 0 }
  private readonly scene: Phaser.Scene
  private readonly max: number
  private imgs: Phaser.GameObjects.Image[] = []
  private readonly x: Float32Array
  private readonly y: Float32Array
  private readonly z: Float32Array
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly vz: Float32Array
  private readonly s0: Float32Array
  private readonly s1: Float32Array
  private readonly a0: Float32Array
  private readonly grav: Float32Array
  private readonly drag: Float32Array
  private readonly bias: Float32Array
  private readonly born: Float64Array
  private readonly life: Float32Array
  private readonly kind: Uint8Array
  private readonly alive: Uint8Array
  private cap = 0
  private next = 0
  private live = 0

  constructor(scene: Phaser.Scene, max: number, cap: number) {
    this.scene = scene
    this.max = max
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.z = new Float32Array(max)
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max)
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max)
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.bias = new Float32Array(max)
    this.born = new Float64Array(max); this.life = new Float32Array(max)
    this.kind = new Uint8Array(max); this.alive = new Uint8Array(max)
    this.setCapacity(cap)
  }

  /** Huecos en uso (por calidad). Crece creando las imágenes que falten; al bajar oculta las sobrantes. */
  setCapacity(cap: number) {
    cap = Math.max(0, Math.min(this.max, Math.round(cap)))
    while (this.imgs.length < cap) {
      const img = this.scene.add.image(0, 0, RFX_TEX.speck.key).setVisible(false).setDepth(DEPTH.COURT)
      img.removeFromDisplayList()
      this.imgs.push(img)
    }
    for (let i = cap; i < this.cap; i++) this.kill(i)
    this.cap = cap
    if (this.next >= cap) this.next = 0
  }

  get capacity() { return this.cap }

  /** Emite con los datos de `spec`. Asigna textura, mezcla y tinte una vez, al nacer. */
  spawn(vt: number) {
    if (this.cap === 0) return
    const i = this.next
    this.next = (i + 1) % this.cap
    const s = this.spec
    this.x[i] = s.x; this.y[i] = s.y; this.z[i] = s.z
    this.vx[i] = s.vx; this.vy[i] = s.vy; this.vz[i] = s.vz
    this.s0[i] = s.size0; this.s1[i] = s.size1; this.a0[i] = s.alpha
    this.grav[i] = s.gravity; this.drag[i] = s.drag; this.bias[i] = s.depthBias
    this.born[i] = vt; this.life[i] = Math.max(1, s.life)
    this.kind[i] = s.kind
    if (!this.alive[i]) { this.alive[i] = 1; this.live++; this.imgs[i].addToDisplayList() }
    const additive = s.kind === PKind.Spark || s.kind === PKind.Flash
    this.imgs[i]
      .setTexture(TEX_BY_KIND[s.kind].key)
      .setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setTint(s.tint)
      .setRotation(0)
      .setVisible(true)
    this.draw(i, 0)
  }

  private kill(i: number) {
    if (!this.alive[i]) return
    this.alive[i] = 0
    this.live--
    this.imgs[i]?.setVisible(false).removeFromDisplayList()
  }

  /** Avanza y pinta las vivas con el tiempo visual (`dtMs` del fotograma). */
  update(vt: number, dtMs: number) {
    if (this.live === 0) return
    const dt = dtMs / 1000
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue
      const t = (vt - this.born[i]) / this.life[i]
      if (t >= 1) { this.kill(i); continue }
      if (dt > 0) {
        const k = 1 / (1 + this.drag[i] * dt)
        this.vx[i] *= k
        this.vy[i] *= k
        this.vz[i] = this.vz[i] * k - this.grav[i] * dt
        this.x[i] += this.vx[i] * dt
        this.y[i] += this.vy[i] * dt
        this.z[i] += this.vz[i] * dt
        // Al tocar el suelo se queda (las virutas resbalan un poco y paran)
        if (this.z[i] < 0) { this.z[i] = 0; this.vz[i] = 0; this.vx[i] *= 0.4; this.vy[i] *= 0.4 }
      }
      this.draw(i, Math.max(0, t))
    }
  }

  private draw(i: number, t: number) {
    const kind = this.kind[i]
    const tex = TEX_BY_KIND[kind]
    project(this.x[i], this.y[i], this.z[i], P)
    const size = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t))
    let alpha: number
    if (kind === PKind.Puff) alpha = Math.min(1, t * 8) * (1 - t) * (1 - t)
    else if (kind === PKind.Flash) alpha = (1 - t) * (1 - 0.4 * t)
    else alpha = 1 - t * t
    const img = this.imgs[i]
    img.setPosition(P.x, P.y).setAlpha(this.a0[i] * alpha)
      .setDepth(bandDepth('COURT', P.y + this.z[i] * P.s + this.bias[i]) + 0.002)
    if (kind === PKind.Spark) {
      // Orientada con su velocidad en pantalla (cae con la gravedad)
      project(this.x[i] + this.vx[i] * 0.02, this.y[i] + this.vy[i] * 0.02, this.z[i] + this.vz[i] * 0.02, Q)
      const len = Math.hypot(Q.x - P.x, Q.y - P.y)
      img.setRotation(Math.atan2(Q.y - P.y, Q.x - P.x))
        .setScale(size * P.s / tex.w * (0.6 + Math.min(1.6, len / 3)), size * P.s / tex.w)
    } else {
      img.setScale(size * P.s / tex.w)
    }
  }

  clear() {
    for (let i = 0; i < this.cap; i++) this.kill(i)
  }

  destroy() {
    for (const img of this.imgs) img.destroy()
    this.imgs = []
    this.cap = 0
  }
}

/**
 * Marcas de goma: tramos planos sobre el suelo (bajo las líneas y los jugadores) que se
 * colocan una vez y solo cambian de alfa al desvanecerse.
 */
export class MarkPool {
  private readonly scene: Phaser.Scene
  private imgs: Phaser.GameObjects.Image[] = []
  private born: Float64Array
  private a0: Float32Array
  private cap = 0
  private next = 0
  private live = 0
  private lifeMs = 0

  constructor(scene: Phaser.Scene, max: number) {
    this.scene = scene
    this.born = new Float64Array(max)
    this.a0 = new Float32Array(max)
  }

  setCapacity(cap: number, lifeMs: number) {
    cap = Math.max(0, Math.min(this.born.length, Math.round(cap)))
    while (this.imgs.length < cap) {
      const img = this.scene.add.image(0, 0, RFX_TEX.mark.key).setVisible(false)
        .setTint(RINK_FX.colors.rubber).setDepth(DEPTH.FLOOR + 0.6)
      img.removeFromDisplayList()
      this.imgs.push(img)
    }
    for (let i = cap; i < this.cap; i++) this.kill(i)
    this.cap = cap
    this.lifeMs = lifeMs
    if (this.next >= cap) this.next = 0
  }

  get capacity() { return this.cap }

  /** Tramo del punto 0 al 1 (mundo, suelo) de `widthPx` de ancho de mundo. */
  lay(x0: number, y0: number, x1: number, y1: number, widthPx: number, alpha: number, vt: number) {
    if (this.cap === 0 || alpha <= 0.002) return
    const i = this.next
    this.next = (i + 1) % this.cap
    project(x0, y0, 0, P)
    project(x1, y1, 0, Q)
    const dx = Q.x - P.x
    const dy = Q.y - P.y
    const s = (P.s + Q.s) / 2
    // Los extremos de la textura se funden: se alarga un poco para que los tramos empalmen
    const len = Math.hypot(dx, dy) + widthPx * s * 2.5
    // Un tramo horizontal en pantalla tiene el ancho en profundidad: el suelo inclinado lo aplana
    const ang = Math.atan2(dy, dx)
    const flat = 0.55 + 0.45 * Math.abs(Math.sin(ang))
    this.born[i] = vt
    this.a0[i] = alpha
    if (!this.alive(i)) { this.live++; this.imgs[i].addToDisplayList() }
    this.imgs[i].setPosition((P.x + Q.x) / 2, (P.y + Q.y) / 2).setRotation(ang)
      .setDisplaySize(len, Math.max(0.6, widthPx * s * flat)).setAlpha(alpha).setVisible(true)
  }

  private alive(i: number) { return this.imgs[i].visible }

  private kill(i: number) {
    const img = this.imgs[i]
    if (!img?.visible) return
    img.setVisible(false).removeFromDisplayList()
    this.live--
  }

  /** Desvanece con el tiempo visual: plenas hasta `fadeFrom` de su vida, luego a cero. */
  update(vt: number) {
    if (this.live === 0) return
    const from = RINK_FX.marks.fadeFrom
    for (let i = 0; i < this.cap; i++) {
      const img = this.imgs[i]
      if (!img.visible) continue
      const t = (vt - this.born[i]) / this.lifeMs
      if (t >= 1) { this.kill(i); continue }
      if (t > from) img.setAlpha(this.a0[i] * (1 - (t - from) / (1 - from)))
    }
  }

  clear() {
    for (let i = 0; i < this.cap; i++) this.kill(i)
  }

  destroy() {
    for (const img of this.imgs) img.destroy()
    this.imgs = []
    this.cap = 0
  }
}
