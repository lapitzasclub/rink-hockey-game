/**
 * Empaquetado de las texturas de las gradas (WP-68): pocos marcos grandes (obra)
 * o muchos pequeños (público) en una sola textura, para que todo lo del pabellón
 * vaya en el mismo lote de dibujo. Línea de horizonte abajo-izquierda: los marcos
 * bajos rellenan el hueco que dejan al lado los altos (las curvas de la grada
 * cercana miden varias veces lo que un bloque de público).
 */

export const MAX_TEX = 4096
/** Hueco entre marcos (px de textura) para que el filtrado no mezcle vecinos. */
export const GUTTER = 2

/** Marco a colocar: tamaño en px de textura y, al volver, su esquina en el atlas. */
export interface Slot { w: number, h: number, ax: number, ay: number }

interface Seg { x: number, y: number, w: number }

const byHeight = <T extends Slot>(slots: T[]) => [...slots].sort((a, b) => b.h - a.h || b.w - a.w)

/**
 * Coloca `order` en un ancho `W` y alto máximo `maxH`, cada marco donde su base
 * quede más arriba (y, a igualdad, más a la izquierda). Esquinas desplazadas
 * por (ox, oy); devuelve el tamaño ocupado y los que no cupieron.
 */
function skyline<T extends Slot>(order: T[], W: number, maxH: number, ox: number, oy: number) {
  let sky: Seg[] = [{ x: 0, y: 0, w: W }]
  const rest: T[] = []
  let usedW = 0, usedH = 0
  for (const s of order) {
    const w = s.w + GUTTER, h = s.h + GUTTER
    let bx = -1, by = Infinity
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x
      if (x + w > W) break
      let y = 0
      for (let j = i; j < sky.length && sky[j].x < x + w; j++) y = Math.max(y, sky[j].y)
      if (y + h <= maxH && y < by) { by = y; bx = x }
    }
    if (bx < 0) { rest.push(s); continue }
    s.ax = ox + bx
    s.ay = oy + by
    usedW = Math.max(usedW, bx + w)
    usedH = Math.max(usedH, by + h)
    const top: Seg = { x: bx, y: by + h, w }
    const next: Seg[] = []
    let added = false
    for (const g of sky) {
      const end = g.x + g.w
      if (end <= bx || g.x >= bx + w) {
        if (g.x >= bx + w && !added) { next.push(top); added = true }
        next.push(g)
        continue
      }
      if (g.x < bx) next.push({ x: g.x, y: g.y, w: bx - g.x })
      if (!added) { next.push(top); added = true }
      if (end > bx + w) next.push({ x: bx + w, y: g.y, w: end - bx - w })
    }
    if (!added) next.push(top)
    // Tramos vecinos a la misma altura se funden
    sky = []
    for (const g of next) {
      const last = sky[sky.length - 1]
      if (last && last.y === g.y) last.w += g.w
      else sky.push(g)
    }
  }
  return { W: usedW, H: usedH, rest }
}

/**
 * Prueba varios anchos y se queda con el de menos área. Devuelve el tamaño del
 * atlas (con las esquinas ya puestas) o null si no cabe en `MAX_TEX`.
 */
export function shelfPack(slots: Slot[]): { W: number, H: number } | null {
  if (!slots.length) return null
  const order = byHeight(slots)
  const widest = Math.max(...slots.map(s => s.w)) + GUTTER
  if (widest > MAX_TEX) return null
  let best: { W: number, H: number, at: number } | null = null
  const steps = 32
  for (let k = 0; k <= steps; k++) {
    const at = Math.round(widest + ((MAX_TEX - widest) * k) / steps)
    const size = skyline(order, at, MAX_TEX, 0, 0)
    if (size.rest.length) continue
    if (!best || size.W * size.H < best.W * best.H) best = { W: size.W, H: size.H, at }
  }
  if (!best) return null
  const { W, H } = skyline(order, best.at, MAX_TEX, 0, 0)
  return { W, H }
}

/**
 * Coloca, dentro de un hueco fijo (x, y, w, h), los marcos que quepan, de los
 * más altos a los más bajos. Devuelve los que no cupieron.
 */
export function packInto<T extends Slot>(slots: T[], x: number, y: number, w: number, h: number): T[] {
  return skyline(byHeight(slots), w - GUTTER, h - GUTTER, x + GUTTER, y + GUTTER).rest
}
