/** Publicidad ficticia de las vallas lejana y cercana. */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import { worldToScreen, worldToScreenExt } from '../viewTransform'
import { BOARD_FAR_H, BOARD_W, RINK_CORNER_R } from './geometry'

// Publicidad ficticia de las vallas: [texto, fondo, color texto]
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

// ─── Publicidad ───────────────────────────────────────────────────────────────

/**
 * Paneles de publicidad en las caras de los tableros que miran a cámara:
 * el lejano (cara interior) y el cercano (cara exterior, por delante del juego).
 */
export function drawAds(scene: Phaser.Scene) {
  const x0 = RINK.x + RINK_CORNER_R
  const x1 = RINK.x + RINK.width - RINK_CORNER_R

  const farY = worldToScreen(0, RINK.y).y
  paintAdRow(scene, x0, x1, RINK.y, farY - BOARD_FAR_H + 2, farY - 1, -1.9, 9, 9)

  const nearIn = worldToScreen(0, RINK.y + RINK.height).y
  const nearOut = worldToScreenExt(0, RINK.y + RINK.height + BOARD_W).y
  paintAdRow(scene, x0, x1, RINK.y + RINK.height, nearIn + 3, nearOut - 1, 20.5, 8, 12)
}

function paintAdRow(
  scene: Phaser.Scene,
  wx0: number, wx1: number, wy: number,
  top: number, bottom: number,
  depth: number, count: number, fontPx: number,
) {
  const g = scene.add.graphics().setDepth(depth)
  const step = (wx1 - wx0) / count
  for (let i = 0; i < count; i++) {
    const [text, bg, fg] = ADS[(i * 3 + (fontPx > 10 ? 1 : 0)) % ADS.length]
    const a = worldToScreen(wx0 + step * i + 3, wy)
    const b = worldToScreen(wx0 + step * (i + 1) - 3, wy)
    g.fillStyle(bg, 1)
    g.fillRect(a.x, top, b.x - a.x, bottom - top)
    g.fillStyle(0xffffff, 0.12)
    g.fillRect(a.x, top, b.x - a.x, Math.max(1, (bottom - top) * 0.3))
    scene.add.text((a.x + b.x) / 2, (top + bottom) / 2, text, {
      fontFamily: '"Russo One", sans-serif',
      fontSize: `${fontPx}px`,
      color: fg,
    }).setOrigin(0.5).setDepth(depth + 0.01)
  }
}
