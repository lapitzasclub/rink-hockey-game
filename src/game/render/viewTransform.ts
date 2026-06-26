import { RINK } from '../constants'

// Perspectiva 3/4: la pista se comprime en Y para simular vista desde ~65°.
// La física sigue en coordenadas mundo; sólo el render aplica este transform.
export const VIEW_ANCHOR_Y = RINK.y  // 60 px — el tope de la pista queda fijo en pantalla
export const VIEW_Y_SCALE  = 0.82    // 600 px mundo → 492 px pantalla

export function worldToScreen(wx: number, wy: number): { x: number; y: number } {
  return {
    x: wx,
    y: VIEW_ANCHOR_Y + (wy - VIEW_ANCHOR_Y) * VIEW_Y_SCALE,
  }
}

export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: sx,
    y: VIEW_ANCHOR_Y + (sy - VIEW_ANCHOR_Y) / VIEW_Y_SCALE,
  }
}
