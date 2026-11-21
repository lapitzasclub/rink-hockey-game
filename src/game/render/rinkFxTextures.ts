/**
 * E-16: texturas de las partículas de pista (render/rinkFx.ts), generadas una vez por código
 * en lienzos pequeños con degradados reales. Blancas: el color sale del tinte al emitir.
 */
import * as Phaser from 'phaser'

/** Claves y lado (px) de cada textura; el tamaño de pantalla se calcula con él. */
export const RFX_TEX = {
  speck: { key: 'rfx-speck', w: 8, h: 8 },
  puff: { key: 'rfx-puff', w: 48, h: 48 },
  spark: { key: 'rfx-spark', w: 24, h: 6 },
  flash: { key: 'rfx-flash', w: 64, h: 64 },
  mark: { key: 'rfx-mark', w: 64, h: 8 },
} as const

/** Aleatorio determinista: la nube sale igual en cada carga. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function canvas(scene: Phaser.Scene, key: string, w: number, h: number) {
  if (scene.textures.exists(key)) return null
  const tex = scene.textures.createCanvas(key, w, h)
  return tex ? { tex, ctx: tex.getContext() } : null
}

/** Mota: punto blando con núcleo opaco (virutas y polvo fino). */
function speck(scene: Phaser.Scene) {
  const { key, w } = RFX_TEX.speck
  const c = canvas(scene, key, w, w)
  if (!c) return
  const g = c.ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.ctx.fillStyle = g
  c.ctx.fillRect(0, 0, w, w)
  c.tex.refresh()
}

/** Nube de polvo: varios lóbulos radiales desplazados para que no sea un disco perfecto. */
function puff(scene: Phaser.Scene) {
  const { key, w } = RFX_TEX.puff
  const c = canvas(scene, key, w, w)
  if (!c) return
  const rnd = lcg(1607)
  const ctx = c.ctx
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2
    const d = i === 0 ? 0 : w * (0.08 + rnd() * 0.12)
    const x = w / 2 + Math.cos(a) * d
    const y = w / 2 + Math.sin(a) * d
    const r = w * (i === 0 ? 0.42 : 0.2 + rnd() * 0.12)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${i === 0 ? 0.55 : 0.32})`)
    g.addColorStop(0.6, `rgba(255,255,255,${i === 0 ? 0.22 : 0.12})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, w)
  }
  c.tex.refresh()
}

/** Chispa: trazo alargado con núcleo blanco (se orienta con la velocidad). */
function spark(scene: Phaser.Scene) {
  const { key, w, h } = RFX_TEX.spark
  const c = canvas(scene, key, w, h)
  if (!c) return
  const ctx = c.ctx
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(w / 2, h / 2, w / 2, h / 2 - 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  c.tex.refresh()
}

/** Destello: halo aditivo con núcleo concentrado. */
function flash(scene: Phaser.Scene) {
  const { key, w } = RFX_TEX.flash
  const c = canvas(scene, key, w, w)
  if (!c) return
  const g = c.ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.26)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.ctx.fillStyle = g
  c.ctx.fillRect(0, 0, w, w)
  c.tex.refresh()
}

/** Tramo de goma: banda con bordes blandos y extremos que se funden para que los tramos empalmen. */
function mark(scene: Phaser.Scene) {
  const { key, w, h } = RFX_TEX.mark
  const c = canvas(scene, key, w, h)
  if (!c) return
  const ctx = c.ctx
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const v = 1 - Math.abs((y + 0.5) / h * 2 - 1)
    const across = Math.min(1, v * 1.6)
    for (let x = 0; x < w; x++) {
      const u = Math.min((x + 0.5) / (w * 0.18), (w - x - 0.5) / (w * 0.18), 1)
      const a = across * across * (3 - 2 * across) * u
      const o = (y * w + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  c.tex.refresh()
}

/** Crea las texturas si no existen (sobreviven al reinicio de escena). */
export function createRinkFxTextures(scene: Phaser.Scene) {
  speck(scene)
  puff(scene)
  spark(scene)
  flash(scene)
  mark(scene)
}
