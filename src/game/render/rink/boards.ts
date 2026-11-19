/**
 * Vallas de la pista (WP-41): paredes de 1 m proyectadas con la cámara única,
 * con rodapié, canto superior, esquinas lisas, sombra en el suelo, puertas
 * frente a los banquillos y redes de protección tras las porterías.
 *
 * Todo lo que tiene altura se proyecta con `projectLeaned` (WP-70): la misma
 * inclinación que abre la boca de la portería, creciente hacia los fondos.
 */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import { BENCH, BOARDS, BOARD_HEIGHT_M, NEAR_CUT, PX_PER_M, WORLD_PX_PER_M, CAMERA, LIGHT } from '../artSpec'
import { project, projectLeaned } from '../viewTransform'
import { RINK_CORNER_R, fillQuad, roundedRectWorldPts } from './geometry'
import { bakeGraphics } from '../bake'
import type { TeamColor } from '../../types'

const CX = RINK.x + RINK.width / 2
const MX = WORLD_PX_PER_M.x
const MY = WORLD_PX_PER_M.y

/** Longitud máxima (px mundo) de un tramo: las rectas largas se trocean para clasificarlas en lejanas/cercanas. */
const MAX_PIECE = 48

/** Depth de la valla lejana (la fija drawRink.ts): publicidad, puertas y red van justo encima. */
export const BACK_DEPTH = -2

/** Tramo del contorno con su normal exterior (mundo). */
export interface WallPiece { w0: { x: number; y: number }; w1: { x: number; y: number }; nx: number; ny: number }

/** Contorno de la valla troceado en tramos, sentido horario. */
export function wallPieces(): WallPiece[] {
  const pts = roundedRectWorldPts(RINK.x, RINK.y, RINK.width, RINK.height, RINK_CORNER_R, BOARDS.cornerSegs)
  const out: WallPiece[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 0.5) continue
    const nx = (b.y - a.y) / len
    const ny = -(b.x - a.x) / len
    const k = Math.max(1, Math.ceil(len / MAX_PIECE))
    for (let j = 0; j < k; j++) {
      out.push({
        w0: { x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k },
        w1: { x: a.x + ((b.x - a.x) * (j + 1)) / k, y: a.y + ((b.y - a.y) * (j + 1)) / k },
        nx, ny,
      })
    }
  }
  return out
}

/** Escala un color 0xRRGGBB por `k` (k>1 aclara hacia blanco). */
export function shade(color: number, k: number): number {
  const ch = (c: number) => Math.max(0, Math.min(255, Math.round(k <= 1 ? c * k : c + (255 - c) * (k - 1))))
  return (ch((color >> 16) & 255) << 16) | (ch((color >> 8) & 255) << 8) | ch(color & 255)
}

/** Luminosidad continua según la normal de la cara (sin saltos entre tramos: sin facetas). */
function lum(fx: number, fy: number): number {
  return Math.max(0.45, Math.min(1.25, 0.72 + 0.34 * fy - 0.16 * fx))
}

/** Punto de la pared en una cara (`off` = 0 interior, BOARD_W exterior) a altura z (px). */
function facePt(w: { x: number; y: number }, nx: number, ny: number, off: number, z: number) {
  return projectLeaned(w.x + nx * off, w.y + ny * off, z)
}

/**
 * Valla: lejana en `back` (bajo los jugadores), cercana en `front` (sobre ellos,
 * recortada según `NEAR_CUT`). La sombra va en `back`.
 */
export function drawPerspectiveBoards(back: Phaser.GameObjects.Graphics, front: Phaser.GameObjects.Graphics) {
  const H = BOARD_HEIGHT_M * PX_PER_M
  const camY = RINK.y + RINK.height + CAMERA.distance
  const midY = (project(RINK.x, RINK.y).y + project(RINK.x, RINK.y + RINK.height).y) * 0.5
  const pieces = wallPieces()

  // Sombra primero: franjas apiladas hacia dentro de la pista
  for (const p of pieces) {
    for (const wd of LIGHT.boardShadowWidths) {
      const a = project(p.w0.x, p.w0.y, 0)
      const b = project(p.w1.x, p.w1.y, 0)
      const c = project(p.w1.x - p.nx * wd, p.w1.y - p.ny * wd, 0)
      const d = project(p.w0.x - p.nx * wd, p.w0.y - p.ny * wd, 0)
      back.fillStyle(0x040a14, LIGHT.boardShadowAlpha)
      fillQuad(back, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
    }
  }

  for (const p of pieces) {
    const mx = (p.w0.x + p.w1.x) / 2
    const my = (p.w0.y + p.w1.y) / 2
    const isBack = (project(p.w0.x, p.w0.y).y + project(p.w1.x, p.w1.y).y) / 2 < midY
    // La cámara ve la cara interior si queda del lado interior del tramo
    const inner = -(p.nx * (CX - mx) + p.ny * (camY - my)) > 0
    const off = inner ? 0 : BOARDS.thickPx
    const fx = inner ? -p.nx : p.nx
    const fy = inner ? -p.ny : p.ny
    const k = lum(fx, fy)
    const g = isBack ? back : front
    const base = shade(BOARDS.wallColor, k)
    const near = !isBack

    // Franjas de la cara: [z0, z1 (m), color, alpha]
    const kick = BOARDS.kickM * PX_PER_M
    const cap = BOARDS.capM * PX_PER_M
    type Band = [number, number, number, number]
    let bands: Band[]
    if (!near) {
      bands = [[0, kick, shade(base, 0.7), 1], [kick, H, base, 1]]
    } else if (NEAR_CUT === 'edge') {
      const ad = BOARDS.adNear
      bands = [
        [0, kick, shade(base, 0.7), 1],
        [kick, ad.z1 * PX_PER_M, base, 1],
        [ad.z1 * PX_PER_M, H - cap, base, BOARDS.glassAlpha],
        [H - cap, H, shade(base, 1.35), 1],
      ]
    } else {
      bands = [[0, H, base, BOARDS.ghostAlpha]]
    }
    // Caras casi de canto (esquina cercana): se omiten, solo producirían rayas
    const edgeOn = near && Math.abs(facePt(p.w0, p.nx, p.ny, off, 0).x - facePt(p.w1, p.nx, p.ny, off, 0).x) < 1.2
    for (const [z0, z1, color, alpha] of edgeOn ? [] : bands) {
      const a = facePt(p.w0, p.nx, p.ny, off, z0)
      const b = facePt(p.w1, p.nx, p.ny, off, z0)
      const c = facePt(p.w1, p.nx, p.ny, off, z1)
      const d = facePt(p.w0, p.nx, p.ny, off, z1)
      g.fillStyle(color, alpha)
      fillQuad(g, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
      if (alpha === 1 && !near) {
        // Trazo del mismo color: tapa las costuras entre tramos
        g.lineStyle(1, color, 1)
        strokeQuad(g, a, b, c, d)
      }
    }

    // Canto superior (losa de espesor BOARD_W)
    const i0 = facePt(p.w0, p.nx, p.ny, 0, H)
    const i1 = facePt(p.w1, p.nx, p.ny, 0, H)
    const o1 = facePt(p.w1, p.nx, p.ny, BOARDS.thickPx, H)
    const o0 = facePt(p.w0, p.nx, p.ny, BOARDS.thickPx, H)
    const topAlpha = near && NEAR_CUT === 'edge' ? BOARDS.nearTopAlpha : 1
    g.fillStyle(shade(BOARDS.topColor, 0.8 + 0.2 * k), topAlpha)
    fillQuad(g, i0.x, i0.y, i1.x, i1.y, o1.x, o1.y, o0.x, o0.y)
    if (topAlpha === 1 && !near) {
      g.lineStyle(1, shade(BOARDS.topColor, 0.8 + 0.2 * k), 1)
      strokeQuad(g, i0, i1, o1, o0)
    }
    // Filos del canto: el más cercano a cámara (borde de la cara visible) es el claro
    const edgeA = inner ? i0 : o0
    const edgeB = inner ? i1 : o1
    g.lineStyle(2, 0xf4f8fc, near ? 0.95 : 0.9)
    g.lineBetween(edgeA.x, edgeA.y, edgeB.x, edgeB.y)
    const farEdgeA = inner ? o0 : i0
    const farEdgeB = inner ? o1 : i1
    if (!near) {
      g.lineStyle(1, 0x9fb2c9, 0.6)
      g.lineBetween(farEdgeA.x, farEdgeA.y, farEdgeB.x, farEdgeB.y)
    }
  }
}

// ─── Puertas frente a los banquillos ─────────────────────────────────────────

/** Centros en X (mundo) de las puertas, uno por banquillo (el lejano). */
export function doorCentersX(): number[] {
  const blue = (RINK.x + BENCH.cornerGapM * MX + CX - BENCH.centerGapM * MX) / 2
  return [blue, 2 * CX - blue]
}

/** Puertas en la cara interior de la valla lejana, por encima de la publicidad. */
export function drawBoardDoors(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(BACK_DEPTH + 0.2)
  const halfW = (BOARDS.doorWidthM * MX) / 2
  const dh = BOARDS.doorHeightM * PX_PER_M
  for (const x of doorCentersX()) {
    const q = (xx: number, z: number) => projectLeaned(xx, RINK.y, z)
    const a = q(x - halfW, 0), b = q(x + halfW, 0), c = q(x + halfW, dh), d = q(x - halfW, dh)
    g.fillStyle(0x16263d, 1)
    fillQuad(g, a.x - 2, a.y + 1, b.x + 2, b.y + 1, c.x + 2, c.y - 2, d.x - 2, d.y - 2)
    g.fillStyle(0x7e98b8, 1)
    fillQuad(g, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
    // Rodapié y panel de la hoja
    const kz = BOARDS.kickM * PX_PER_M
    const ka = q(x - halfW, kz), kb = q(x + halfW, kz)
    const k = q(x, kz)
    g.fillStyle(0x5a7396, 1)
    fillQuad(g, a.x, a.y, b.x, b.y, kb.x, kb.y, ka.x, ka.y)
    // Rendija central, pomo y bisagra
    const t = q(x, dh)
    g.lineStyle(1, 0x16263d, 0.9)
    g.lineBetween(t.x, t.y, k.x, k.y)
    const hz = q(x + 4, dh * 0.55)
    g.fillStyle(0xf0c43a, 1)
    g.fillRect(hz.x - 1, hz.y - 2, 3, 4)
    g.lineStyle(1, 0xf4f8fc, 0.9)
    g.lineBetween(d.x, d.y, c.x, c.y)
  }
}


/** Hojas de cada puerta entornada y abierta, horneadas; la cerrada es la de `drawBoardDoors`. */
type DoorLeaves = {
  half: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  open: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  amount: number
  shown: number
}
const doorLeaves: Partial<Record<TeamColor, DoorLeaves>> = {}
let doorClock = -1

/** Hueco de la puerta con las dos hojas giradas `theta` hacia el pasillo (se abren hacia fuera de la pista). */
function drawOpenDoor(g: Phaser.GameObjects.Graphics, x: number, theta: number) {
  const halfW = (BOARDS.doorWidthM * MX) / 2
  const dh = BOARDS.doorHeightM * PX_PER_M
  const kz = BOARDS.kickM * PX_PER_M
  const q = (xx: number, yy: number, z: number) => projectLeaned(xx, yy, z)
  const a = q(x - halfW, RINK.y, 0), b = q(x + halfW, RINK.y, 0), c = q(x + halfW, RINK.y, dh), d = q(x - halfW, RINK.y, dh)
  // Lo que se ve por el hueco: el pasillo en penumbra y su suelo
  g.fillStyle(0x0e1726, 1)
  fillQuad(g, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
  const fa = q(x - halfW, RINK.y, dh * 0.22), fb = q(x + halfW, RINK.y, dh * 0.22)
  g.fillStyle(0x223247, 1)
  fillQuad(g, a.x, a.y, b.x, b.y, fb.x, fb.y, fa.x, fa.y)

  const leafX = (BOARDS.doorWidthM / 2) * MX * Math.cos(theta)
  const leafY = (BOARDS.doorWidthM / 2) * WORLD_PX_PER_M.y * Math.sin(theta)
  const face = shade(0x7e98b8, 0.95 - 0.25 * Math.sin(theta))
  for (const s of [-1, 1]) {
    const hx = x + s * halfW
    const ex = hx - s * leafX
    const ey = RINK.y - leafY
    const h0 = q(hx, RINK.y, 0), h1 = q(hx, RINK.y, dh), e0 = q(ex, ey, 0), e1 = q(ex, ey, dh)
    g.fillStyle(face, 1)
    fillQuad(g, h0.x, h0.y, e0.x, e0.y, e1.x, e1.y, h1.x, h1.y)
    const hk = q(hx, RINK.y, kz), ek = q(ex, ey, kz)
    g.fillStyle(0x5a7396, 1)
    fillQuad(g, h0.x, h0.y, e0.x, e0.y, ek.x, ek.y, hk.x, hk.y)
    g.lineStyle(1, 0xf4f8fc, 0.9)
    g.lineBetween(h1.x, h1.y, e1.x, e1.y)
    g.lineStyle(1, 0x16263d, 0.9)
    g.lineBetween(e0.x, e0.y, e1.x, e1.y)
  }
}

/** Crea las puertas entornada y abierta de cada banquillo, ocultas hasta que pase alguien. */
export function createBoardDoorLeaves(scene: Phaser.Scene) {
  const xs = doorCentersX()
  doorClock = -1
  for (const [i, team] of (['blue', 'red'] as const).entries()) {
    const make = (theta: number, name: string) => {
      const g = scene.add.graphics().setDepth(BACK_DEPTH + 0.25)
      drawOpenDoor(g, xs[i], theta)
      return bakeGraphics(g, `door-${team}-${name}`, true).setVisible(false)
    }
    doorLeaves[team] = { half: make(0.85, 'half'), open: make(1.5, 'open'), amount: 0, shown: 0 }
  }
}

/** Abre la puerta del equipo con alguien cerca y la cierra al quedar libre; solo cambia la visibilidad. */
export function updateBoardDoors(busy: Record<TeamColor, boolean>, timeNow: number) {
  const dtMs = doorClock < 0 ? 0 : Math.min(100, Math.max(0, timeNow - doorClock))
  doorClock = timeNow
  for (const team of ['blue', 'red'] as const) {
    const d = doorLeaves[team]
    if (!d || !d.open.active) continue
    const step = dtMs / BOARDS.doorSwingMs
    d.amount = Math.min(1, Math.max(0, d.amount + (busy[team] ? step : -step)))
    const shown = d.amount > 0.65 ? 2 : d.amount > 0.15 ? 1 : 0
    if (shown === d.shown) continue
    d.shown = shown
    d.half.setVisible(shown === 1)
    d.open.setVisible(shown === 2)
  }
}

// ─── Redes de protección tras las porterías ──────────────────────────────────

/**
 * Red alta y semitransparente sobre la valla de fondo, centrada en cada
 * portería. Va por debajo de los jugadores: siempre queda detrás de la pista.
 */
export function drawProtectionNets(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(BACK_DEPTH + 0.3)
  const midWorldY = RINK.y + RINK.height / 2
  const halfW = BOARDS.netHalfWidthM * MY
  const zBase = BOARD_HEIGHT_M * PX_PER_M
  const zTop = BOARDS.netTopM * PX_PER_M
  for (const wx of [RINK.x, RINK.x + RINK.width]) {
    const y0 = midWorldY - halfW
    const y1 = midWorldY + halfW
    const a = projectLeaned(wx, y0, zBase), b = projectLeaned(wx, y1, zBase)
    const c = projectLeaned(wx, y1, zTop), d = projectLeaned(wx, y0, zTop)
    g.fillStyle(0xdbe6f2, BOARDS.netAlpha * 0.5)
    fillQuad(g, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
    g.lineStyle(1, 0xdbe6f2, BOARDS.netAlpha * 1.6)
    const cols = Math.round((2 * BOARDS.netHalfWidthM) / BOARDS.netMeshM)
    for (let i = 0; i <= cols; i++) {
      const y = y0 + ((y1 - y0) * i) / cols
      const p = projectLeaned(wx, y, zBase), q = projectLeaned(wx, y, zTop)
      g.lineBetween(p.x, p.y, q.x, q.y)
    }
    const rows = Math.round((BOARDS.netTopM - BOARD_HEIGHT_M) / BOARDS.netMeshM)
    for (let j = 1; j < rows; j++) {
      const z = zBase + ((zTop - zBase) * j) / rows
      const p = projectLeaned(wx, y0, z), q = projectLeaned(wx, y1, z)
      g.lineBetween(p.x, p.y, q.x, q.y)
    }
    // Postes y cable superior
    g.lineStyle(2, 0x9fb2c9, 0.85)
    g.lineBetween(a.x, a.y, d.x, d.y)
    g.lineBetween(b.x, b.y, c.x, c.y)
    g.lineBetween(d.x, d.y, c.x, c.y)
  }
}

/** Contorno de un cuadrilátero de pantalla con el trazo vigente. */
function strokeQuad(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  g.beginPath()
  g.moveTo(a.x, a.y)
  g.lineTo(b.x, b.y)
  g.lineTo(c.x, c.y)
  g.lineTo(d.x, d.y)
  g.closePath()
  g.strokePath()
}
