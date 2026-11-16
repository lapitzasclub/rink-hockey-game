/**
 * Publicidad ficticia continua en las 4 vallas (WP-41), en perspectiva con la
 * cámara única. Lejana y laterales: cara interior; cercana: cara exterior,
 * en la franja baja para no tapar la bola (ver `NEAR_CUT`). También monta
 * puertas y redes de protección, que cuelgan de la misma capa de vallas.
 */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import { BOARDS, DEPTH, NEAR_CUT, PX_PER_M, WORLD_PX_PER_M } from '../artSpec'
import { project } from '../viewTransform'
import { BACK_DEPTH, doorCentersX, drawBoardDoors, drawProtectionNets, shade } from './boards'
import { RINK_CORNER_R, fillQuad } from './geometry'

// Publicidad ficticia: [texto, fondo, color texto]
const ADS: [string, number, string][] = [
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
      const a = project(wx, ya, z.z0 * PX_PER_M), b = project(wx, yb, z.z0 * PX_PER_M)
      const c = project(wx, yb, z.z1 * PX_PER_M), d = project(wx, ya, z.z1 * PX_PER_M)
      gg.fillStyle(shade(bg, 0.85), 1)
      fillQuad(gg, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
      gg.fillStyle(0xffffff, 0.14)
      const m0 = project(wx, ya + (yb - ya) * 0.2, (z.z0 * 0.4 + z.z1 * 0.6) * PX_PER_M)
      const m1 = project(wx, yb - (yb - ya) * 0.2, (z.z0 * 0.4 + z.z1 * 0.6) * PX_PER_M)
      gg.fillRect(Math.min(m0.x, m1.x) - 0.5, m0.y - 2, Math.abs(m1.x - m0.x) + 1, 4)
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
    const a = project(xa, wy, z.z0 * PX_PER_M), b = project(xb, wy, z.z0 * PX_PER_M)
    const c = project(xb, wy, z.z1 * PX_PER_M), d = project(xa, wy, z.z1 * PX_PER_M)
    g.fillStyle(bg, alpha)
    fillQuad(g, a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
    g.fillStyle(0xffffff, 0.12 * alpha)
    g.fillRect(a.x, c.y, b.x - a.x, Math.max(1, (a.y - c.y) * 0.3))
    const mid = project((xa + xb) / 2, wy, ((z.z0 + z.z1) / 2) * PX_PER_M)
    scene.add.text(mid.x, mid.y, text, {
      fontFamily: '"Russo One", sans-serif',
      fontSize: `${fontPx}px`,
      color: fg,
    }).setOrigin(0.5).setScale(mid.s).setDepth(depth + 0.01).setAlpha(alpha)
  }
}
