/**
 * Luz de pabellón (WP-61): pozos de luz cenitales sobre el suelo y viñeteado
 * suave de las gradas. Todo se hornea una vez en dos texturas pequeñas
 * (pozo y viñeta) y se coloca con imágenes estáticas: 9 objetos, ninguno por frame.
 */
import * as Phaser from 'phaser'
import { RINK } from '../constants'
import { getGoalLineX } from '../utils'
import { ARENA_BOUNDS } from './arena'
import { DEPTH, LIGHT, PX_PER_M } from './artSpec'
import { project } from './viewTransform'

const POOL_KEY = 'light-pool'
const VIGNETTE_KEY = 'light-vignette'
const TEX = 128

/** Pozo: degradado radial blanco que se suma al suelo (hornea una sola vez). */
function ensurePoolTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(POOL_KEY)) return
  const tex = scene.textures.createCanvas(POOL_KEY, TEX, TEX)
  if (!tex) return
  const ctx = tex.getContext()
  const g = ctx.createRadialGradient(TEX / 2, TEX / 2, 0, TEX / 2, TEX / 2, TEX / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(235,245,255,0.45)')
  g.addColorStop(1, 'rgba(235,245,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, TEX, TEX)
  tex.refresh()
}

/** Viñeta: centro transparente y borde oscuro; se estira a la zona del pabellón (queda elíptica). */
function ensureVignetteTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(VIGNETTE_KEY)) return
  const size = 256
  const tex = scene.textures.createCanvas(VIGNETTE_KEY, size, size)
  if (!tex) return
  const ctx = tex.getContext()
  const c = LIGHT.vignetteColor
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2 * 1.42)
  g.addColorStop(0, `rgba(${c},0)`)
  g.addColorStop(LIGHT.vignetteInner / 1.42, `rgba(${c},0)`)
  g.addColorStop(1, `rgba(${c},${LIGHT.vignetteAlpha})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
}

/** Añade un pozo de luz en (wx, wy) del mundo; el radio se da en px de pantalla. */
function addPool(scene: Phaser.Scene, wx: number, wy: number, radius: number, alpha: number) {
  const p = project(wx, wy, 0)
  scene.add.image(p.x, p.y, POOL_KEY)
    .setDisplaySize(radius * 2, radius * 2 * LIGHT.poolSquash)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(alpha)
    .setDepth(DEPTH.FLOOR + 0.5)
}

/**
 * Monta la luz del pabellón: 6 pozos cenitales (rejilla 3×2), 2 pozos junto a
 * las porterías y la viñeta. Se llama una vez desde drawRink.
 */
export function createLighting(scene: Phaser.Scene) {
  ensurePoolTexture(scene)
  ensureVignetteTexture(scene)

  for (const fy of LIGHT.poolsY) {
    for (const fx of LIGHT.poolsX) {
      addPool(scene, RINK.x + RINK.width * fx, RINK.y + RINK.height * fy, LIGHT.poolRadius, LIGHT.poolAlpha)
    }
  }
  const cy = RINK.y + RINK.height / 2
  const inset = LIGHT.goalPoolOffsetM * PX_PER_M
  addPool(scene, getGoalLineX('left') + inset, cy, LIGHT.goalPoolRadius, LIGHT.goalPoolAlpha)
  addPool(scene, getGoalLineX('right') - inset, cy, LIGHT.goalPoolRadius, LIGHT.goalPoolAlpha)

  const B = ARENA_BOUNDS
  scene.add.image(B.x, B.y, VIGNETTE_KEY).setOrigin(0, 0)
    .setDisplaySize(B.width, B.height)
    .setDepth(DEPTH.STANDS_NEAR + 4)
}
