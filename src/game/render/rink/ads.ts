/**
 * Publicidad ficticia continua en las 4 vallas (WP-41), en perspectiva con la
 * cámara única. Lejana y laterales: cara interior; cercana: cara exterior,
 * en la franja baja para no tapar la bola (ver `NEAR_CUT`). También monta
 * puertas y redes de protección, que cuelgan de la misma capa de vallas.
 *
 * Paneles y textos siguen la inclinación de perspectiva de las vallas
 * (`projectLeaned`, WP-70): los textos se rasterizan ya cizallados, con su panel.
 */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import { BOARDS, DEPTH, NEAR_CUT, PX_PER_M, WORLD_PX_PER_M } from '../artSpec'
import { leanAt, projectLeaned } from '../viewTransform'
import { BACK_DEPTH, doorCentersX, drawBoardDoors, drawProtectionNets, shade } from './boards'
import { RINK_CORNER_R, fillQuad } from './geometry'
import { bakeResolution } from '../quality'
import { WORLD_PREFIX } from '../bake'

// Publicidad ficticia: [texto, fondo, color texto]
export const ADS: [string, number, string][] = [
  ['RINK TV', 0x0d1b2e, '#3ee8ff'],
  ['PATÍN PRO', 0xf0c43a, '#14213a'],
  ['BOLA 23', 0xd8343a, '#ffffff'],
  ['STICK & CO', 0xf2f6fb, '#14213a'],
  ['ARCADE CUP', 0xff8a1a, '#14213a'],
  ['HOCKEY+', 0x2f6fe0, '#ffffff'],
  ['RUEDA LIBRE', 0x1d2a3e, '#f0c43a'],
  ['¡GOL!', 0x3a9a5a, '#ffffff'],
]

const ADS_DEPTH_FAR = BACK_DEPTH + 0.1
const ADS_DEPTH_NEAR = DEPTH.BOARD_NEAR + 0.5

/** Publicidad, puertas y redes de las vallas. */
export function drawAds(scene: Phaser.Scene) {
  const x0 = RINK.x + RINK_CORNER_R
  const x1 = RINK.x + RINK.width - RINK_CORNER_R
  const y0 = RINK.y + RINK_CORNER_R
  const y1 = RINK.y + RINK.height - RINK_CORNER_R
  const midY = RINK.y + RINK.height / 2
  const nearZ = NEAR_CUT === 'edge' ? BOARDS.adNear : { z0: BOARDS.adFar.z0, z1: BOARDS.adFar.z1 }

  // Lejana (interior) y cercana (exterior): paneles en X con texto
  endWall(scene, x0, x1, RINK.y, BOARDS.adFar, ADS_DEPTH_FAR, 11, 0)
  endWall(scene, x0, x1, RINK.y + RINK.height + BOARDS.thickPx, nearZ, ADS_DEPTH_NEAR, 8, 1)

  // Laterales (cara interior): paneles en Y sin texto (casi de canto)
  for (const wx of [RINK.x, RINK.x + RINK.width]) {
    const n = Math.max(1, Math.round((y1 - y0) / (BOARDS.adWidthM * WORLD_PX_PER_M.y)))
    const g = scene.add.graphics()
    const gNear = scene.add.graphics().setDepth(ADS_DEPTH_NEAR)
    g.setDepth(ADS_DEPTH_FAR)
    const step = (y1 - y0) / n
    for (let i = 0; i < n; i++) {
      const ya = y0 + step * i + 3
      const yb = y0 + step * (i + 1) - 3
      const near = (ya + yb) / 2 > midY
      const z = near ? nearZ : BOARDS.adFar
      const [, bg] = ADS[(i * 3 + (wx > RINK.x ? 2 : 5)) % ADS.length]
      const gg = near ? gNear : g
      const a = projectLeaned(wx, ya, z.z0 * PX_PER_M), b = projectLeaned(wx, yb, z.z0 * PX_PER_M)
      const c = projectLeaned(wx, yb, z.z1 * PX_PER_M), d = projectLeaned(wx, ya, z.z1 * PX_PER_M)
      gg.fillStyle(shade(bg, 0.85), 1)
      fillQuad(gg, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
      // Franja de brillo paralela al panel (a media altura, sin las puntas)
      gg.fillStyle(0xffffff, 0.14)
      const sa = ya + (yb - ya) * 0.2, sb = yb - (yb - ya) * 0.2
      const za = (z.z0 * 0.5 + z.z1 * 0.5) * PX_PER_M, zb = (z.z0 * 0.3 + z.z1 * 0.7) * PX_PER_M
      const m0 = projectLeaned(wx, sa, za), m1 = projectLeaned(wx, sb, za)
      const m2 = projectLeaned(wx, sb, zb), m3 = projectLeaned(wx, sa, zb)
      fillQuad(gg, m0.x, m0.y, m1.x, m1.y, m2.x, m2.y, m3.x, m3.y)
    }
  }

  drawBoardDoors(scene)
  drawProtectionNets(scene)
}

/** Fila de paneles sobre una pared recta paralela al eje X, a mundo `wy`. */
function endWall(
  scene: Phaser.Scene, wx0: number, wx1: number, wy: number,
  z: { z0: number; z1: number }, depth: number, fontPx: number, phase: number,
) {
  const g = scene.add.graphics().setDepth(depth)
  // Huecos limpios en las puertas (solo valla lejana): los paneles se reparten en los tramos libres
  const gap = (BOARDS.doorWidthM * WORLD_PX_PER_M.x) / 2 + 4
  const spans: [number, number][] = []
  let from = wx0
  if (phase === 0) {
    for (const c of doorCentersX()) {
      spans.push([from, c - gap])
      from = c + gap
    }
  }
  spans.push([from, wx1])
  const panels: [number, number][] = []
  for (const [sa, sb] of spans) {
    const n = Math.round((sb - sa) / (BOARDS.adWidthM * WORLD_PX_PER_M.x))
    for (let i = 0; i < n; i++) panels.push([sa + ((sb - sa) * i) / n, sa + ((sb - sa) * (i + 1)) / n])
  }
  const ghost = NEAR_CUT === 'ghost' && depth === ADS_DEPTH_NEAR
  const alpha = ghost ? BOARDS.ghostAlpha + 0.1 : 1
  for (let i = 0; i < panels.length; i++) {
    const [text, bg, fg] = ADS[(i * 3 + phase) % ADS.length]
    const xa = panels[i][0] + 2
    const xb = panels[i][1] - 2
    const a = projectLeaned(xa, wy, z.z0 * PX_PER_M), b = projectLeaned(xb, wy, z.z0 * PX_PER_M)
    const c = projectLeaned(xb, wy, z.z1 * PX_PER_M), d = projectLeaned(xa, wy, z.z1 * PX_PER_M)
    g.fillStyle(bg, alpha)
    fillQuad(g, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
    // Brillo en el 30 % superior del panel, con su misma inclinación
    const sheen = Math.max(1, (a.y - c.y) * 0.3) / Math.max(1, a.y - c.y)
    g.fillStyle(0xffffff, 0.12 * alpha)
    fillQuad(g, d.x, d.y, c.x, c.y, c.x + (b.x - c.x) * sheen, c.y + (b.y - c.y) * sheen, d.x + (a.x - d.x) * sheen, d.y + (a.y - d.y) * sheen)
    const mx = (xa + xb) / 2
    const mid = projectLeaned(mx, wy, ((z.z0 + z.z1) / 2) * PX_PER_M)
    shearedLabel(scene, mid.x, mid.y, text, fontPx, fg, mid.s, leanAt(mx)).setDepth(depth + 0.01).setAlpha(alpha)
  }
}

const LABEL_FONT = '"Russo One", sans-serif'
let measureCtx: CanvasRenderingContext2D | null = null

/**
 * Rótulo de un panel inclinado. Phaser no cizalla textos (y descomponer la
 * cizalla en giros dentro de un contenedor corrompe el texto al dibujarlo), así
 * que se rasteriza una vez en un canvas con la cizalla del panel: subir 1 px
 * desplaza `lean` px en x, como `projectLeaned`. Se pinta a la resolución de
 * horneado para que siga nítido con el zoom de la cámara arcade.
 */
function shearedLabel(scene: Phaser.Scene, x: number, y: number, text: string, fontPx: number, color: string, s: number, lean: number) {
  const res = bakeResolution(true)
  const key = `${WORLD_PREFIX}ad:${text}:${fontPx}:${lean.toFixed(3)}-${Math.round(res * 100)}`
  if (!scene.textures.exists(key)) {
    const font = `${fontPx * res}px ${LABEL_FONT}`
    measureCtx ??= document.createElement('canvas').getContext('2d')
    measureCtx!.font = font
    const h = Math.ceil(fontPx * res * 1.4)
    const w = Math.ceil(measureCtx!.measureText(text).width + Math.abs(lean) * h + 4 * res)
    const tex = scene.textures.createCanvas(key, w, h)
    if (tex) {
      const ctx = tex.getContext()
      ctx.font = font
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      // Centra la tinta (no la caja de la fuente) en el centro del panel
      const m = ctx.measureText(text)
      ctx.setTransform(1, 0, -lean, 1, w / 2, h / 2)
      ctx.fillText(text, 0, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2)
      tex.refresh()
    }
  }
  return scene.add.image(x, y, key).setScale(s / res)
}
