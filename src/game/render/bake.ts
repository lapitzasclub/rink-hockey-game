import * as Phaser from 'phaser'
import { bakeResolution } from './quality'

/**
 * Horneado de Graphics estáticos (workflow de rendimiento, P-02).
 *
 * En WebGL, Phaser vuelve a triangular cada Graphics en todos los fotogramas
 * (earcut + trazos): la pista, las vallas, las porterías y la mesa suman unos
 * 38 000 comandos y eran un tercio del coste del fotograma. Aquí cada Graphics
 * que ya no cambia se pinta una vez en un canvas (con el renderizador canvas de
 * Phaser, que además suaviza los bordes), a `bakeResolution()` px por px de
 * pantalla para que siga nítido con el zoom de la cámara arcade, y se sustituye
 * por una Image en la misma profundidad, posición y alfa.
 *
 * La textura se nombra por el contenido y la resolución: el menú y los dos modos
 * comparten la de la pista y no se vuelve a pintar al empezar otro partido.
 */

const C = { ARC: 0, BEGIN_PATH: 1, CLOSE_PATH: 2, FILL_RECT: 3, LINE_TO: 4, MOVE_TO: 5, LINE_STYLE: 6, FILL_STYLE: 7, FILL_PATH: 8, STROKE_PATH: 9, FILL_TRIANGLE: 10, STROKE_TRIANGLE: 11, SAVE: 14, RESTORE: 15, TRANSLATE: 16, SCALE: 17, ROTATE: 18, GRADIENT_FILL_STYLE: 21, GRADIENT_LINE_STYLE: 22 } as const
/** Lado máximo de textura que se acepta en cualquier GPU (los móviles modestos no pasan de 4096). */
const MAX_TEX = 4096

interface Bounds { minX: number; minY: number; maxX: number; maxY: number; hash: number }

/**
 * Caja de lo que dibuja el Graphics (coordenadas locales) y un hash del contenido.
 * Devuelve null si usa transformaciones o degradados (no se hornea) o si está vacío.
 */
function scan(buf: number[]): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let line = 0
  let hash = 2166136261
  const grow = (x: number, y: number, r: number) => {
    if (x - r < minX) minX = x - r
    if (y - r < minY) minY = y - r
    if (x + r > maxX) maxX = x + r
    if (y + r > maxY) maxY = y + r
  }
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]
    hash = Math.imul(hash ^ ((v * 1000) | 0), 16777619)
  }
  for (let i = 0; i < buf.length;) {
    const cmd = buf[i]
    switch (cmd) {
      case C.ARC: grow(buf[i + 1], buf[i + 2], buf[i + 3] + line / 2); i += 8; break
      case C.FILL_RECT: grow(buf[i + 1], buf[i + 2], 0); grow(buf[i + 1] + buf[i + 3], buf[i + 2] + buf[i + 4], 0); i += 5; break
      case C.LINE_TO:
      case C.MOVE_TO: grow(buf[i + 1], buf[i + 2], line / 2); i += 3; break
      case C.LINE_STYLE: line = buf[i + 1]; i += 4; break
      case C.FILL_STYLE: i += 3; break
      case C.FILL_TRIANGLE:
      case C.STROKE_TRIANGLE:
        for (let k = 0; k < 3; k++) grow(buf[i + 1 + k * 2], buf[i + 2 + k * 2], cmd === C.STROKE_TRIANGLE ? line / 2 : 0)
        i += 7
        break
      case C.BEGIN_PATH: case C.CLOSE_PATH: case C.FILL_PATH: case C.STROKE_PATH: i += 1; break
      default: return null   // SAVE/RESTORE/TRANSLATE/SCALE/ROTATE o degradados: fuera de lo que se sabe acotar
    }
  }
  if (!(maxX > minX && maxY > minY)) return null
  return { minX, minY, maxX, maxY, hash: hash >>> 0 }
}

type TargetCam = Phaser.Cameras.Scene2D.BaseCamera
type CanvasGraphics = Phaser.GameObjects.Graphics & {
  renderCanvas: (renderer: unknown, src: unknown, camera: TargetCam, parentMatrix: null, ctx: CanvasRenderingContext2D, allowClip: boolean) => void
}

// ─── Recorte de transparencia ────────────────────────────────────────────────

interface Run { x: number, y: number, w: number, h: number }
const runsCache = new Map<string, Run[]>()

/**
 * Zonas con contenido de una textura de canvas: tiras horizontales de baldosas
 * de `tile` px con algún píxel visible. Se calcula una vez por textura.
 */
function filledRuns(scene: Phaser.Scene, key: string, tile: number): Run[] {
  const cacheKey = `${key}@${tile}`
  const hit = runsCache.get(cacheKey)
  if (hit) return hit
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement
  const W = src.width
  const H = src.height
  const data = src.getContext('2d')!.getImageData(0, 0, W, H).data
  const cols = Math.ceil(W / tile)
  const rows = Math.ceil(H / tile)
  const filled = (c: number, r: number) => {
    const x1 = Math.min(W, (c + 1) * tile)
    const y1 = Math.min(H, (r + 1) * tile)
    for (let y = r * tile; y < y1; y++) {
      for (let i = (y * W + c * tile) * 4 + 3, end = (y * W + x1) * 4; i < end; i += 4) if (data[i] > 2) return true
    }
    return false
  }
  const runs: Run[] = []
  for (let r = 0; r < rows; r++) {
    let start = -1
    for (let c = 0; c <= cols; c++) {
      const on = c < cols && filled(c, r)
      if (on && start < 0) start = c
      if (!on && start >= 0) {
        runs.push({ x: start * tile, y: r * tile, w: Math.min(W, c * tile) - start * tile, h: Math.min(H, (r + 1) * tile) - r * tile })
        start = -1
      }
    }
  }
  runsCache.set(cacheKey, runs)
  return runs
}

/**
 * Coloca la textura de canvas `key` en (x, y) con escala (sx, sy), pero solo sus
 * zonas con contenido: una Image por tira de baldosas, todas de la misma textura
 * (mismo lote de dibujo). Una textura grande casi transparente cuesta en la GPU
 * lo mismo que si fuera opaca; así solo se rellenan los píxeles que se ven.
 */
export function addTrimmedImages(scene: Phaser.Scene, key: string, x: number, y: number, sx: number, sy = sx, tile = 128): Phaser.GameObjects.Image[] {
  const tex = scene.textures.get(key)
  return filledRuns(scene, key, tile).map((r) => {
    const frame = `trim:${r.x},${r.y},${r.w},${r.h}`
    if (!tex.has(frame)) tex.add(frame, 0, r.x, r.y, r.w, r.h)
    return scene.add.image(x + r.x * sx, y + r.y * sy, key, frame).setOrigin(0, 0).setScale(sx, sy)
  })
}

// ─── Horneado ────────────────────────────────────────────────────────────────

/**
 * Hornea `g` y devuelve la Image que lo sustituye (o el propio Graphics si no se
 * pudo). El Graphics se destruye. `name` solo sirve para depurar la clave; `world`
 * indica que lo ve la cámara del mundo (con zoom) y no la del HUD.
 */
export function bakeGraphics(g: Phaser.GameObjects.Graphics, name = 'g', world = false): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  return bakeToImages(g, name, world, false)?.[0] ?? g
}

/**
 * Hornea `g` en una textura y lo sustituye por Images en el mismo hueco de la
 * lista de visualización. Con `trim`, una Image por tira con contenido (para los
 * horneados grandes: vallas, líneas); sin él, una sola. null si no se pudo.
 */
function bakeToImages(g: Phaser.GameObjects.Graphics, name: string, world: boolean, trim: boolean): Phaser.GameObjects.Image[] | null {
  const scene = g.scene
  const b = scan(g.commandBuffer as number[])
  if (!b || g.rotation !== 0 || g.scaleX !== 1 || g.scaleY !== 1) return null
  const pad = 2
  let res = bakeResolution(world)
  const wPx = b.maxX - b.minX + pad * 2
  const hPx = b.maxY - b.minY + pad * 2
  res = Math.min(res, MAX_TEX / wPx, MAX_TEX / hPx)
  const w = Math.ceil(wPx * res)
  const h = Math.ceil(hPx * res)
  const key = `${world ? WORLD_PREFIX : 'bake-'}${name}-${b.hash.toString(36)}-${Math.round(res * 100)}`

  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h)
    if (!tex) return null
    const cam = (Phaser.GameObjects.Graphics as unknown as { TargetCamera: TargetCam }).TargetCamera
    cam.setScene(scene)
    cam.setViewport(0, 0, w, h)
    // Esta cámara no recalcula su matriz: el scroll no se aplicaría. La traslación y la
    // resolución las pone la transformación del propio Graphics; el alfa se pinta a 1 y lo lleva la Image
    cam.scrollX = 0
    cam.scrollY = 0
    const { x, y, alpha, scrollFactorX, scrollFactorY } = g
    g.setPosition(-(b.minX - pad) * res, -(b.minY - pad) * res).setScale(res).setAlpha(1).setScrollFactor(1)
    ;(g as CanvasGraphics).renderCanvas(scene.sys.game.renderer, g, cam, null, tex.getContext(), false)
    g.setPosition(x, y).setScale(1).setAlpha(alpha).setScrollFactor(scrollFactorX, scrollFactorY)
    tex.refresh()
  }

  const ox = g.x + b.minX - pad
  const oy = g.y + b.minY - pad
  const images = trim
    ? addTrimmedImages(scene, key, ox, oy, 1 / res)
    : [scene.add.image(ox, oy, key).setOrigin(0, 0).setScale(1 / res)]
  for (const img of images) {
    img.setDepth(g.depth).setAlpha(g.alpha).setVisible(g.visible).setScrollFactor(g.scrollFactorX, g.scrollFactorY)
    if (g.blendMode !== Phaser.BlendModes.NORMAL) img.setBlendMode(g.blendMode)
  }
  // Mismo hueco en la lista de visualización: a igual depth se conserva el orden de pintado
  const list = scene.sys.displayList
  const at = list.getIndex(g)
  g.destroy()
  if (at >= 0) images.forEach((img, i) => list.moveTo(img, Math.min(at + i, list.length - 1)))
  return images
}

/**
 * Hornea todos los Graphics que se añadieron a la escena desde `fromIndex` de la
 * lista de visualización (los que acaba de crear un constructor como drawRink).
 */
export function bakeGraphicsSince(scene: Phaser.Scene, fromIndex: number, name: string) {
  pruneWorldBakes(scene)
  const list = scene.sys.displayList.list.slice(fromIndex)
  let i = 0
  for (const obj of list) {
    if (obj instanceof Phaser.GameObjects.Graphics && obj.active) bakeToImages(obj, `${name}${i++}`, true, true)
  }
}

/** Prefijo de las texturas horneadas del mundo (pista, redes): se podan al cambiar de resolución. */
const WORLD_PREFIX = 'bake-w-'

/**
 * Borra los horneados del mundo hechos con otra resolución (otro nivel de calidad):
 * si no, cada cambio de nivel dejaría otra copia de la pista en memoria. Se llama al
 * crear una escena, cuando la anterior ya no usa sus texturas.
 */
function pruneWorldBakes(scene: Phaser.Scene) {
  const tag = `-${Math.round(bakeResolution(true) * 100)}`
  for (const key of scene.textures.getTextureKeys()) {
    if (!key.startsWith(WORLD_PREFIX) || key.endsWith(tag)) continue
    scene.textures.remove(key)
    for (const k of runsCache.keys()) if (k.startsWith(`${key}@`)) runsCache.delete(k)
  }
}
