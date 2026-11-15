/** Tableros 3D de la pista: paredes de ~1 m proyectadas con la cámara única. */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import { BOARD_HEIGHT_M, CAMERA, PX_PER_M } from '../artSpec'
import { project } from '../viewTransform'
import { BOARD_W, RINK_CORNER_R, fillQuad, roundedRectWorldPts } from './geometry'

/** Opacidad de las caras de la valla de la mitad cercana: no debe tapar jugadores (SPEC §3; el corte definitivo es de WP-41). */
const NEAR_FACE_ALPHA = 0.35

/**
 * Tableros como paredes con altura real (`BOARD_HEIGHT_M`): cada tramo del
 * contorno tiene cara interior, cara exterior y remate superior de espesor
 * `BOARD_W`. Solo se pintan las caras que miran a la cámara.
 *
 * Los tramos de la mitad lejana van en `back` (por debajo de los jugadores);
 * los de la mitad cercana en `front` (por encima, con caras semitransparentes).
 */
export function drawPerspectiveBoards(back: Phaser.GameObjects.Graphics, front: Phaser.GameObjects.Graphics) {
  const H = BOARD_HEIGHT_M * PX_PER_M
  const camX = RINK.x + RINK.width / 2
  const camY = RINK.y + RINK.height + CAMERA.distance

  const midY = (project(RINK.x, RINK.y).y + project(RINK.x, RINK.y + RINK.height).y) * 0.5
  const wpts = roundedRectWorldPts(RINK.x, RINK.y, RINK.width, RINK.height, RINK_CORNER_R, 12)
  const n = wpts.length

  for (let i = 0; i < n; i++) {
    const w0 = wpts[i]
    const w1 = wpts[(i + 1) % n]
    const dx = w1.x - w0.x
    const dy = w1.y - w0.y
    const len = Math.hypot(dx, dy)
    if (len < 0.5) continue

    // Normal exterior en espacio mundo (CW → apunta fuera de la pista)
    const nx = dy / len
    const ny = -dx / len
    const o0x = w0.x + nx * BOARD_W
    const o0y = w0.y + ny * BOARD_W
    const o1x = w1.x + nx * BOARD_W
    const o1y = w1.y + ny * BOARD_W

    const ib0 = project(w0.x, w0.y, 0)
    const ib1 = project(w1.x, w1.y, 0)
    const it0 = project(w0.x, w0.y, H)
    const it1 = project(w1.x, w1.y, H)
    const ot0 = project(o0x, o0y, H)
    const ot1 = project(o1x, o1y, H)
    const ob0 = project(o0x, o0y, 0)
    const ob1 = project(o1x, o1y, 0)

    const isBack = (ib0.y + ib1.y) * 0.5 < midY
    const isSide = Math.abs(nx) > Math.abs(ny)
    const g = isBack ? back : front
    const faceAlpha = isBack ? 1 : NEAR_FACE_ALPHA

    // La cámara ve la cara interior si queda del lado interior del tramo
    const mx = (w0.x + w1.x) * 0.5
    const my = (w0.y + w1.y) * 0.5
    const innerVisible = -(nx * (camX - mx) + ny * (camY - my)) > 0

    if (innerVisible) {
      g.fillStyle(isBack ? 0x2a3d58 : 0x24364f, faceAlpha)
      fillQuad(g, ib0.x, ib0.y, ib1.x, ib1.y, it1.x, it1.y, it0.x, it0.y)
    } else {
      g.fillStyle(isSide ? 0x16253b : 0x142238, faceAlpha)
      fillQuad(g, ob0.x, ob0.y, ob1.x, ob1.y, ot1.x, ot1.y, ot0.x, ot0.y)
    }
    // Remate superior
    g.fillStyle(isBack ? 0x1a2a40 : 0x2b4160, 1)
    fillQuad(g, it0.x, it0.y, it1.x, it1.y, ot1.x, ot1.y, ot0.x, ot0.y)
    // Canto del remate
    g.lineStyle(2, 0xdfe8f2, isBack ? 0.9 : 0.95)
    g.lineBetween(it0.x, it0.y, it1.x, it1.y)

    // Sombra de contacto de la valla lejana con el suelo
    if (isBack && innerVisible) {
      g.lineStyle(2, 0x06101b, 0.45)
      g.lineBetween(ib0.x, ib0.y + 1, ib1.x, ib1.y + 1)
    }
  }
}
