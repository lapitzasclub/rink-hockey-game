/** Tableros 3D de la pista (paredes proyectadas en perspectiva). */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import { worldToScreen, worldToScreenExt } from '../viewTransform'
import { BOARD_FAR_H, BOARD_W, RINK_CORNER_R, fillQuad, roundedRectWorldPts } from './geometry'

// ─── Tableros ─────────────────────────────────────────────────────────────────

/**
 * Tableros como paredes 3D: el borde exterior se computa en espacio MUNDO
 * y se proyecta con worldToScreenExt (sin clamp de t).
 *
 * Para el tablero lejano la curva de potencia aplana la derivada Y en t≈0,
 * haciendo que el borde exterior proyecte al mismo Y que el interior.
 * Se compensa con un offset de pantalla proporcional a la fracción "lejana"
 * de la normal (farFrac = max(0, -nwy)).  Los tableros lateral y cercano
 * no necesitan compensación: worldToScreenExt los proyecta correctamente.
 */
export function drawPerspectiveBoards(back: Phaser.GameObjects.Graphics, front: Phaser.GameObjects.Graphics) {
  const CORNER_R = RINK_CORNER_R
  const SEGS     = 12
  const FAR_H    = BOARD_FAR_H

  const topY    = worldToScreen(RINK.x, RINK.y).y
  const bottomY = worldToScreen(RINK.x, RINK.y + RINK.height).y
  const midY    = (topY + bottomY) * 0.5

  const wpts = roundedRectWorldPts(RINK.x, RINK.y, RINK.width, RINK.height, CORNER_R, SEGS)
  const n = wpts.length

  for (let i = 0; i < n; i++) {
    const w0 = wpts[i]
    const w1 = wpts[(i + 1) % n]
    const dx = w1.x - w0.x
    const dy = w1.y - w0.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.5) continue

    // Normal exterior en espacio mundo (CW → apunta afuera del campo)
    const nwx = dy / len
    const nwy = -dx / len

    // Arista interior (borde del hielo) proyectada normalmente
    const ib0 = worldToScreen(w0.x, w0.y)
    const ib1 = worldToScreen(w1.x, w1.y)

    // Arista exterior: offset en mundo, proyectada sin clamp
    const rob0 = worldToScreenExt(w0.x + nwx * BOARD_W, w0.y + nwy * BOARD_W)
    const rob1 = worldToScreenExt(w1.x + nwx * BOARD_W, w1.y + nwy * BOARD_W)

    // Compensación para tablero lejano: cuánto de la normal apunta al borde lejano.
    // La curva Y se aplana en t≈0 → añadir offset de pantalla proporcional.
    const farFrac = Math.max(0, -nwy)
    const ob0 = { x: rob0.x, y: rob0.y - FAR_H * farFrac }
    const ob1 = { x: rob1.x, y: rob1.y - FAR_H * farFrac }

    const avgY   = (ib0.y + ib1.y) * 0.5
    const isBack = avgY < midY
    const isSide = Math.abs(nwx) > Math.abs(nwy)
    const g = isBack ? back : front
    const color = isBack ? 0x1a2a40 : (isSide ? 0x24364f : 0x1c2c44)
    g.fillStyle(color, 1)
    fillQuad(g, ib0.x, ib0.y, ib1.x, ib1.y, ob1.x, ob1.y, ob0.x, ob0.y)
  }

  // Sombra de contacto tablero lejano–hielo
  back.lineStyle(2, 0x06101b, 0.45)
  for (let i = 0; i < n; i++) {
    const ib  = worldToScreen(wpts[i].x, wpts[i].y)
    const ib1 = worldToScreen(wpts[(i + 1) % n].x, wpts[(i + 1) % n].y)
    if (ib.y < midY && ib1.y < midY) back.lineBetween(ib.x, ib.y + 1, ib1.x, ib1.y + 1)
  }

  // Remate superior del tablero lejano
  back.lineStyle(2, 0xdfe8f2, 0.9)
  for (let i = 0; i < n; i++) {
    const w0 = wpts[i]
    const w1 = wpts[(i + 1) % n]
    const li = Math.hypot(w1.x - w0.x, w1.y - w0.y)
    if (li < 0.5) continue
    const nwx = (w1.y - w0.y) / li
    const nwy = -(w1.x - w0.x) / li
    const a = worldToScreenExt(w0.x + nwx * BOARD_W, w0.y + nwy * BOARD_W)
    const b = worldToScreenExt(w1.x + nwx * BOARD_W, w1.y + nwy * BOARD_W)
    const far = Math.max(0, -nwy) * FAR_H
    if ((a.y + b.y) * 0.5 < midY) back.lineBetween(a.x, a.y - far, b.x, b.y - far)
  }

  // Canto superior del tablero cercano (cara interior visible)
  front.lineStyle(3, 0xdfe8f2, 0.95)
  for (let i = 0; i < n; i++) {
    const ib  = worldToScreen(wpts[i].x, wpts[i].y)
    const ib1 = worldToScreen(wpts[(i + 1) % n].x, wpts[(i + 1) % n].y)
    if (ib.y >= midY && ib1.y >= midY) front.lineBetween(ib.x, ib.y - 1, ib1.x, ib1.y - 1)
  }

  // Ribete inferior tablero cercano (borde exterior proyectado)
  front.lineStyle(2, 0x08192e, 0.8)
  for (let i = 0; i < n; i++) {
    const w0 = wpts[i]
    const w1 = wpts[(i + 1) % n]
    const dxi = w1.x - w0.x
    const dyi = w1.y - w0.y
    const li  = Math.sqrt(dxi * dxi + dyi * dyi)
    if (li < 0.5) continue
    const nwxi = dyi / li
    const nwyi = -dxi / li
    const ib0i = worldToScreen(w0.x, w0.y)
    const ib1i = worldToScreen(w1.x, w1.y)
    if ((ib0i.y + ib1i.y) * 0.5 < midY) continue   // solo tablero cercano
    const ob0i = worldToScreenExt(w0.x + nwxi * BOARD_W, w0.y + nwyi * BOARD_W)
    const ob1i = worldToScreenExt(w1.x + nwxi * BOARD_W, w1.y + nwyi * BOARD_W)
    front.lineBetween(ob0i.x, ob0i.y, ob1i.x, ob1i.y)
  }
}
