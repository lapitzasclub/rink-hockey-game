import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, RINK } from '../constants'
import { BOARD_W, RINK_CORNER_R, roundedRectWorldPts } from './drawRink'
import { DEPTH, FIGURE_EXAG, PX_PER_M, STANDS } from './artSpec'
import { project } from './viewTransform'

type Pt = { x: number, y: number }

/** Pabellón alrededor de la pista: suelo pintado, gradas y público animado. */
export type Arena = {
  /** excitement 0..1: amplitud y ritmo del vaivén del público. */
  update(time: number, excitement: number): void
  /** El público salta unos segundos (goles, final). */
  cheer(time: number, durationMs?: number): void
}

const FLOOR_KEY = 'arena-floor'

/**
 * Zona de pantalla que cubre el pabellón. Excede 1280×720 porque el canvas se
 * expande a la ventana (Scale.EXPAND) y la cámara ve más allá en pantallas anchas.
 */
export const ARENA_BOUNDS = { x: -340, y: -260, width: GAME_WIDTH + 680, height: GAME_HEIGHT + 520 }

const STAND_TIERS = 22
const STAND_FIRST_OFFSET = 22   // pasillo entre valla y primera fila (mundo)
const STAND_TIER_DEPTH = 26     // fondo de cada escalón (mundo)
const STAND_FIRST_HEIGHT = STANDS.firstHeightM * PX_PER_M   // altura de la primera fila (px de mundo)
const STAND_TIER_RISE = STANDS.tierRiseM * PX_PER_M          // subida por escalón (px de mundo)
const FAN_SPACING = 20          // separación entre asientos (mundo)
/** Alto del dibujo de un espectador en sus unidades locales (drawFan). */
const FAN_LOCAL_H = 16.5

const SHIRTS = [
  0x2f6fe0, 0x2f6fe0, 0x4a8cf0, 0xd8343a, 0xd8343a, 0xe85a50,
  0xe8eef5, 0xf0c43a, 0x2a3242, 0x6b7686, 0x3a9a5a, 0xe07a2a, 0x8a4fd0,
]
const SKINS = [0xf1c8a5, 0xe2b08a, 0xc68b62, 0x9a6744, 0x6e4a32, 0xf5d6bd]
const HAIR = [0x2a1a10, 0x4a2e18, 0x111111, 0x8a5a2a, 0xd8b060, 0x5a5a5a]

/** RNG determinista: el pabellón sale igual en cada partido. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function css(color: number, k = 1, alpha = 1) {
  const r = Math.round(((color >> 16) & 0xff) * k)
  const g = Math.round(((color >> 8) & 0xff) * k)
  const b = Math.round((color & 0xff) * k)
  return `rgba(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)},${alpha})`
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

function rinkScreenOutline() {
  return roundedRectWorldPts(RINK.x, RINK.y, RINK.width, RINK.height, RINK_CORNER_R, 14)
    .map(p => project(p.x, p.y, 0))
}

export function createArena(scene: Phaser.Scene): Arena {
  paintFloor(scene)
  const layers = buildStands(scene)
  let cheerUntil = 0

  return {
    update(time, excitement) {
      const cheering = time < cheerUntil
      for (const layer of layers) {
        if (!layer.ampScale) continue
        const amp = cheering ? 5 : 0.4 + excitement * 1.8
        const freq = cheering ? 0.016 : 0.004 + excitement * 0.007
        const bob = Math.abs(Math.sin(time * freq + layer.phase))
        layer.image.y = ARENA_BOUNDS.y - bob * amp * layer.ampScale
      }
    },
    cheer(time, durationMs = 2600) {
      cheerUntil = time + durationMs
    },
  }
}

// ─── Gradas ───────────────────────────────────────────────────────────────────

/**
 * Proyecta un punto de grada con la cámara única: (wx, wy) en el plano del
 * suelo fuera de la pista y wz = altura del escalón (px de mundo). `s` es la
 * escala de figura en ese punto.
 */
function standToScreen(wx: number, wy: number, wz: number): Pt & { s: number } {
  return project(wx, wy, wz)
}

/** Anillo de grada: contorno de la valla desplazado `offset` hacia fuera, a altura z. */
function standRing(offset: number, z: number, segs = 10): (Pt & { t: number })[] {
  const o = offset + BOARD_W
  return roundedRectWorldPts(RINK.x - o, RINK.y - o, RINK.width + o * 2, RINK.height + o * 2, RINK_CORNER_R + o, segs)
    .map(p => ({ ...standToScreen(p.x, p.y, z), t: (p.y - RINK.y) / RINK.height }))
}

type StandLayer = { image: Phaser.GameObjects.Image, phase: number, ampScale: number }

/**
 * Gradas en anfiteatro: escalones concéntricos alrededor de la valla que
 * suben y se alejan con la perspectiva de la pista. Se pintan de fuera hacia
 * dentro (de atrás hacia delante) en canvas: estructura fija + dos capas de
 * público que se mecen. Las filas detrás del tablero cercano van en un canvas
 * aparte por delante del juego (espaldas del público).
 */
function buildStands(scene: Phaser.Scene): StandLayer[] {
  const B = ARENA_BOUNDS
  const keys = ['arena-stands', 'arena-fans-a', 'arena-fans-b', 'arena-near']
  if (!scene.textures.exists(keys[0])) {
    const canvases = keys.map(k => scene.textures.createCanvas(k, B.width, B.height)!)
    const [structure, fansA, fansB, near] = canvases.map(c => {
      const ctx = c.getContext()
      ctx.translate(-B.x, -B.y)
      return ctx
    })
    paintStandStructure(structure)
    paintFans([fansA, fansB], near)
    for (const c of canvases) c.refresh()
  }
  const add = (key: string, depth: number) =>
    scene.add.image(B.x, B.y, key).setOrigin(0, 0).setDepth(depth)
  return [
    { image: add(keys[0], DEPTH.STANDS_FAR), phase: 0, ampScale: 0 },
    { image: add(keys[1], DEPTH.STANDS_FAR + 1), phase: 0, ampScale: 1 },
    { image: add(keys[2], DEPTH.STANDS_FAR + 1), phase: 2.2, ampScale: 1 },
    { image: add(keys[3], DEPTH.STANDS_NEAR), phase: 1.1, ampScale: 1.4 },
  ]
}

function paintStandStructure(ctx: CanvasRenderingContext2D) {
  const B = ARENA_BOUNDS
  ctx.fillStyle = '#070c15'
  ctx.fillRect(B.x, B.y, B.width, B.height)

  for (let i = STAND_TIERS - 1; i >= 0; i--) {
    const o = STAND_FIRST_OFFSET + i * STAND_TIER_DEPTH
    const z = STAND_FIRST_HEIGHT + i * STAND_TIER_RISE
    const zPrev = i === 0 ? 0 : z - STAND_TIER_RISE
    const front = standRing(o, z)
    const back = standRing(o + STAND_TIER_DEPTH, z)
    const foot = standRing(o, zPrev)
    const shade = 1 - i / (STAND_TIERS * 1.5)

    // Huella del escalón (donde van los asientos)
    ctx.fillStyle = css(0x1c2a42, shade)
    ctx.beginPath()
    front.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
    for (let k = back.length - 1; k >= 0; k--) ctx.lineTo(back[k].x, back[k].y)
    ctx.closePath()
    ctx.fill('evenodd')

    // Contrahuella: cara vertical que mira a la pista
    ctx.fillStyle = css(0x0d1524, shade)
    ctx.beginPath()
    front.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
    for (let k = foot.length - 1; k >= 0; k--) ctx.lineTo(foot[k].x, foot[k].y)
    ctx.closePath()
    ctx.fill('evenodd')

    // Borde del escalón
    ctx.strokeStyle = css(0x50709a, shade * 0.5)
    ctx.lineWidth = 1
    ctx.beginPath()
    front.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
    ctx.closePath()
    ctx.stroke()
  }

  // Pasillos de acceso: escaleras radiales en los laterales y el fondo
  ctx.strokeStyle = 'rgba(150,170,200,0.10)'
  ctx.lineWidth = 3
  for (const [wx, wy, nx, ny] of AISLES) {
    const a = standToScreen(wx + nx * (BOARD_W + STAND_FIRST_OFFSET), wy + ny * (BOARD_W + STAND_FIRST_OFFSET), STAND_FIRST_HEIGHT)
    const far = BOARD_W + STAND_FIRST_OFFSET + STAND_TIERS * STAND_TIER_DEPTH
    const b = standToScreen(wx + nx * far, wy + ny * far, STAND_FIRST_HEIGHT + STAND_TIERS * STAND_TIER_RISE)
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  }
}

// Pasillos: punto del borde de pista y normal hacia fuera
const AISLES: [number, number, number, number][] = [
  [RINK.x + RINK.width * 0.08, RINK.y, 0, -1],
  [RINK.x + RINK.width * 0.92, RINK.y, 0, -1],
  [RINK.x, RINK.y + RINK.height * 0.33, -1, 0],
  [RINK.x, RINK.y + RINK.height * 0.72, -1, 0],
  [RINK.x + RINK.width, RINK.y + RINK.height * 0.33, 1, 0],
  [RINK.x + RINK.width, RINK.y + RINK.height * 0.72, 1, 0],
]

function paintFans(far: CanvasRenderingContext2D[], near: CanvasRenderingContext2D) {
  const rand = mulberry32(7)
  const B = ARENA_BOUNDS
  for (let i = STAND_TIERS - 1; i >= 0; i--) {
    const o = STAND_FIRST_OFFSET + i * STAND_TIER_DEPTH + STAND_TIER_DEPTH * 0.45
    const z = STAND_FIRST_HEIGHT + i * STAND_TIER_RISE
    const ow = o + BOARD_W
    const ring = roundedRectWorldPts(RINK.x - ow, RINK.y - ow, RINK.width + ow * 2, RINK.height + ow * 2, RINK_CORNER_R + ow, 10)
    const shade = 0.62 - i * 0.022
    // Recorre el anillo a paso constante en mundo: asientos equiespaciados
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]
      const b = ring[(k + 1) % ring.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      for (let d = rand() * FAN_SPACING; d < len; d += FAN_SPACING * (0.9 + rand() * 0.2)) {
        if (rand() < 0.08) continue
        const wx = a.x + ((b.x - a.x) * d) / len
        const wy = a.y + ((b.y - a.y) * d) / len
        const p = standToScreen(wx, wy, z)
        if (p.x < B.x - 10 || p.x > B.x + B.width + 10 || p.y < B.y - 10 || p.y > B.y + B.height + 30) continue
        const t = (wy - RINK.y) / RINK.height
        const s = ((STANDS.fanHeightM * PX_PER_M) / FAN_LOCAL_H) * p.s * FIGURE_EXAG
        if (t > 1) drawFanBack(near, p.x, p.y, s, rand)
        else drawFan(far[rand() < 0.5 ? 0 : 1], p.x, p.y, s, shade, rand)
      }
    }
  }
}

function pick<T>(list: T[], rand: () => number) {
  return list[Math.floor(rand() * list.length)]
}

/** Espectador sentado de frente; (x, y) es el asiento. */
function drawFan(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, light: number, rand: () => number) {
  const shirt = pick(SHIRTS, rand)
  if (rand() < 0.12) {
    // Brazos en alto / bufanda del equipo
    ctx.strokeStyle = css(rand() < 0.5 ? 0x2f6fe0 : 0xd8343a, light)
    ctx.lineWidth = 1.6 * s
    ctx.beginPath()
    ctx.moveTo(x - 4 * s, y - 6 * s); ctx.lineTo(x - 6 * s, y - 16 * s)
    ctx.moveTo(x + 4 * s, y - 6 * s); ctx.lineTo(x + 6 * s, y - 16 * s)
    ctx.stroke()
  }
  ctx.fillStyle = css(shirt, light)
  ctx.beginPath(); ctx.ellipse(x, y - 4 * s, 5.4 * s, 5 * s, 0, Math.PI, Math.PI * 2); ctx.fill()
  ctx.fillRect(x - 5.4 * s, y - 4 * s, 10.8 * s, 4 * s)
  ctx.fillStyle = css(pick(SKINS, rand), light)
  ctx.beginPath(); ctx.arc(x, y - 11.5 * s, 3.3 * s, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = css(pick(HAIR, rand), light)
  ctx.beginPath(); ctx.arc(x, y - 12.6 * s, 3.3 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.fill()
}

/** Espectador de las filas cercanas, de espaldas y en penumbra. */
function drawFanBack(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rand: () => number) {
  const light = 0.3
  ctx.fillStyle = css(pick(SHIRTS, rand), light)
  ctx.beginPath(); ctx.ellipse(x, y - 4 * s, 6.5 * s, 6 * s, 0, Math.PI, Math.PI * 2); ctx.fill()
  ctx.fillRect(x - 6.5 * s, y - 4 * s, 13 * s, 6 * s)
  ctx.fillStyle = css(pick(HAIR, rand), light * 1.1)
  ctx.beginPath(); ctx.arc(x, y - 12 * s, 4 * s, 0, Math.PI * 2); ctx.fill()
}

// ─── Suelo ────────────────────────────────────────────────────────────────────

/**
 * Pista de hockey patines: suelo sintético azul pintado (no hielo), con
 * degradado por profundidad, juntas de paneles en perspectiva, grano y los
 * reflejos de los focos del techo.
 */
function paintFloor(scene: Phaser.Scene) {
  if (!scene.textures.exists(FLOOR_KEY)) {
    const tex = scene.textures.createCanvas(FLOOR_KEY, GAME_WIDTH, GAME_HEIGHT)
    if (!tex) return
    const ctx = tex.getContext()
    const rand = mulberry32(23)
    const outline = rinkScreenOutline()
    const top = project(0, RINK.y).y
    const bottom = project(0, RINK.y + RINK.height).y

    ctx.save()
    tracePath(ctx, outline)
    ctx.clip()

    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    grad.addColorStop(0, '#123b72')
    grad.addColorStop(0.4, '#1a55a0')
    grad.addColorStop(1, '#2066b6')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Juntas de paneles
    ctx.strokeStyle = 'rgba(6,22,50,0.22)'
    ctx.lineWidth = 1
    for (let i = 1; i < 24; i++) {
      const wx = RINK.x + (RINK.width / 24) * i
      const a = project(wx, RINK.y)
      const b = project(wx, RINK.y + RINK.height)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
    for (let i = 1; i < 12; i++) {
      const wy = RINK.y + (RINK.height / 12) * i
      const a = project(RINK.x, wy)
      const b = project(RINK.x + RINK.width, wy)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }

    // Grano de la pintura
    for (let i = 0; i < 14000; i++) {
      const x = rand() * GAME_WIDTH
      const y = top + rand() * (bottom - top)
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,10,30,0.06)'
      ctx.fillRect(x, y, 1 + rand() * 1.5, 1)
    }

    // Marcas de ruedas: arcos suaves claros
    ctx.lineWidth = 1.2
    for (let i = 0; i < 90; i++) {
      const c = project(RINK.x + rand() * RINK.width, RINK.y + rand() * RINK.height)
      const r = 30 + rand() * 90
      const a0 = rand() * Math.PI * 2
      ctx.strokeStyle = `rgba(190,215,255,${0.025 + rand() * 0.035})`
      ctx.beginPath()
      ctx.ellipse(c.x, c.y, r, r * 0.55, 0, a0, a0 + 0.6 + rand() * 1.2)
      ctx.stroke()
    }

    // Reflejos de los focos (barniz brillante)
    for (const fy of [0.22, 0.72]) {
      for (const fx of [0.18, 0.5, 0.82]) {
        const c = project(RINK.x + RINK.width * fx, RINK.y + RINK.height * fy)
        const r = 120 + fy * 90
        ctx.save()
        ctx.translate(c.x, c.y)
        ctx.scale(1, 0.4)
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
        rg.addColorStop(0, 'rgba(255,255,255,0.20)')
        rg.addColorStop(0.35, 'rgba(200,225,255,0.08)')
        rg.addColorStop(1, 'rgba(200,225,255,0)')
        ctx.fillStyle = rg
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }

    // Sombra interior junto a los tableros
    for (let k = 0; k < 6; k++) {
      ctx.lineWidth = 6 + k * 9
      ctx.strokeStyle = 'rgba(0,8,26,0.07)'
      tracePath(ctx, outline)
      ctx.stroke()
    }
    ctx.restore()
    tex.refresh()
  }
  scene.add.image(0, 0, FLOOR_KEY).setOrigin(0, 0).setDepth(DEPTH.FLOOR)
}
