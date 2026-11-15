/** Constantes y helpers de geometría/proyección compartidos por los módulos de la pista. */
import * as Phaser from 'phaser'
import { worldToScreen } from '../viewTransform'

/** Radio de esquina de la valla (mundo). */
export const RINK_CORNER_R = 86
/** Grosor físico del tablero en unidades mundo. */
export const BOARD_W = 17
/** Alto visual del tablero lejano en px de pantalla (compensa la curva de potencia). */
export const BOARD_FAR_H = 14

export const LINE_WHITE = 0xf2f6fb
export const LINE_RED = 0xe0363c

/** Genera puntos del contorno redondeado en coordenadas MUNDO (sin proyectar, CW). */
export function roundedRectWorldPts(
  rx: number, ry: number, rw: number, rh: number, cr: number, segs: number,
): { x: number; y: number }[] {
  const corners = [
    { cx: rx + cr,      cy: ry + cr,      a0: 180, a1: 270 },
    { cx: rx + rw - cr, cy: ry + cr,      a0: 270, a1: 360 },
    { cx: rx + rw - cr, cy: ry + rh - cr, a0: 0,   a1: 90  },
    { cx: rx + cr,      cy: ry + rh - cr, a0: 90,  a1: 180 },
  ]
  const pts: { x: number; y: number }[] = []
  for (const c of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = Phaser.Math.DegToRad(c.a0 + (c.a1 - c.a0) * (i / segs))
      pts.push({ x: c.cx + Math.cos(a) * cr, y: c.cy + Math.sin(a) * cr })
    }
  }
  return pts
}

/** Genera puntos de pantalla para un rounded rect en coordenadas mundo (CW). */
export function roundedRectPts(
  rx: number, ry: number, rw: number, rh: number, cr: number, segs: number,
): { x: number; y: number }[] {
  return roundedRectWorldPts(rx, ry, rw, rh, cr, segs).map(p => worldToScreen(p.x, p.y))
}

/** Genera puntos de pantalla de un arco en coords mundo. */
export function arcPts(
  cx: number, cy: number, r: number, startDeg: number, endDeg: number, N = 20,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= N; i++) {
    const a = Phaser.Math.DegToRad(startDeg + (endDeg - startDeg) * (i / N))
    pts.push(worldToScreen(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
  }
  return pts
}

/** Rellena un polígono de puntos de pantalla. */
export function projFill(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
  if (pts.length < 3) return
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.closePath()
  g.fillPath()
}

/** Dibuja el contorno de un polígono de pantalla. */
export function projStrokePoly(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.closePath()
  g.strokePath()
}

/** Dibuja una polyline abierta de puntos de pantalla. */
export function projStrokePath(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.strokePath()
}

/** Rellena un círculo en coords mundo proyectado como polígono. */
export function projFillCircle(g: Phaser.GameObjects.Graphics, wx: number, wy: number, wr: number, N = 32) {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    pts.push(worldToScreen(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr))
  }
  projFill(g, pts)
}

/** Dibuja un círculo en coords mundo proyectado como polígono. */
export function projStrokeCircle(g: Phaser.GameObjects.Graphics, wx: number, wy: number, wr: number, N = 32) {
  g.beginPath()
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const { x, y } = worldToScreen(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr)
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  g.strokePath()
}

export function fillQuad(
  g: Phaser.GameObjects.Graphics,
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
) {
  g.beginPath()
  g.moveTo(ax, ay)
  g.lineTo(bx, by)
  g.lineTo(cx, cy)
  g.lineTo(dx, dy)
  g.closePath()
  g.fillPath()
}
