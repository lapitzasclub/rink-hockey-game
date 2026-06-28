import { RINK } from '../constants'

/**
 * Perspectiva 3/4 con convergencia en X y compresión Y no-lineal.
 *
 * - X_FAR: el extremo lejano (arriba) aparece al 82% del ancho del cercano.
 *   Ej: esquina superior izquierda pasa de X=70 a X≈173 en pantalla.
 * - Y_POW: curva de potencia > 1 comprime más las filas lejanas.
 *   Con 1.4, el centro del campo ocupa el 38% del alto visible (antes 50%).
 * - SCREEN_H: alto total del campo en pantalla (≈ al previo con VIEW_Y_SCALE 0.82).
 */
const FIELD_CX  = RINK.x + RINK.width / 2   // 640
const X_FAR     = 0.82   // escala X en el extremo lejano
const Y_POW     = 1.4    // exponente curva Y
const SCREEN_H  = 490    // alto del campo en pantalla (px)

export const VIEW_ANCHOR_Y = RINK.y   // el borde superior de la pista fijo en pantalla (60)
export const VIEW_Y_SCALE  = 0.72     // aproximación lineal media — solo para sombras y anillos

export function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  const t  = Math.max(0, Math.min(1, (wy - RINK.y) / RINK.height))
  const xs = X_FAR + (1 - X_FAR) * t
  return {
    x: FIELD_CX + (wx - FIELD_CX) * xs,
    y: VIEW_ANCHOR_Y + Math.pow(t, Y_POW) * SCREEN_H,
  }
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const rawT = Math.max(0, Math.min(1, (sy - VIEW_ANCHOR_Y) / SCREEN_H))
  const t    = Math.pow(rawT, 1 / Y_POW)
  const xs   = X_FAR + (1 - X_FAR) * t
  return {
    x: FIELD_CX + (sx - FIELD_CX) / xs,
    y: RINK.y + t * RINK.height,
  }
}

/** Escala Y local en un punto del campo — para comprimir facing/dir en screen space. */
export function localYScale(wy: number): number {
  const t = Math.max(0.001, Math.min(1, (wy - RINK.y) / RINK.height))
  return Y_POW * Math.pow(t, Y_POW - 1) * SCREEN_H / RINK.height
}

/**
 * Proyección sin clamp de t — para puntos fuera del campo (borde exterior de tableros).
 * t > 1 funciona bien (tablero cercano se aleja hacia abajo en pantalla).
 * t < 0 (tablero lejano): la potencia se aplana en 0, el X sí converge
 * correctamente; el caller añade offset Y de pantalla para dar altura visible.
 */
export function worldToScreenExt(wx: number, wy: number): { x: number; y: number } {
  const t  = (wy - RINK.y) / RINK.height
  const xs = X_FAR + (1 - X_FAR) * t
  return {
    x: FIELD_CX + (wx - FIELD_CX) * xs,
    y: VIEW_ANCHOR_Y + Math.pow(Math.max(0, t), Y_POW) * SCREEN_H,
  }
}
