/**
 * Vectores 3D mutables para el rig. Todas las operaciones escriben en `out`
 * para no asignar memoria por frame.
 */

export interface V3 { x: number; y: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })

export function set3(out: V3, x: number, y: number, z: number): V3 {
  out.x = x; out.y = y; out.z = z
  return out
}

export function copy3(out: V3, a: V3): V3 {
  out.x = a.x; out.y = a.y; out.z = a.z
  return out
}

/** out = a + b·k */
export function addScaled(out: V3, a: V3, b: V3, k: number): V3 {
  out.x = a.x + b.x * k; out.y = a.y + b.y * k; out.z = a.z + b.z * k
  return out
}

/** out = a + (x, y, z) */
export function offset3(out: V3, a: V3, x: number, y: number, z: number): V3 {
  out.x = a.x + x; out.y = a.y + y; out.z = a.z + z
  return out
}

export function sub3(out: V3, a: V3, b: V3): V3 {
  out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z
  return out
}

export function lerp3(out: V3, a: V3, b: V3, t: number): V3 {
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t
  return out
}

export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
export const len3 = (a: V3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)

/** Gira `a` alrededor del eje vertical (y) un ángulo `ang`: +ang lleva +z hacia +x. */
export function rotY(out: V3, a: V3, ang: number): V3 {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const x = a.x * c + a.z * s
  const z = -a.x * s + a.z * c
  out.x = x; out.y = a.y; out.z = z
  return out
}
