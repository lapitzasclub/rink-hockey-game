/**
 * Piezas de movimiento del director de los parones (`celebration.ts`): patinar a un punto,
 * frenar y girar la mirada sin asignar objetos, y el gesto (`player.mood`) reutilizado.
 */
import { PLAYER_ACCEL, PLAYER_RADIUS, RESTART_SKATE_DECEL, RINK } from '../constants'
import type { MoodKind, Player } from '../types'

export const MID_X = RINK.x + RINK.width / 2
export const MID_Y = RINK.y + RINK.height / 2

/** Variante fija por id (0..n-1): siempre la misma celebración para el mismo jugador. */
export function moodStyle(id: string, n: number) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) | 0
  return ((h >>> 2) % n + n) % n
}

export const suspended = (p: Player, time: number) => !!p.suspendedUntil && p.suspendedUntil > time

/** Pone (o reutiliza) el gesto del jugador. */
export function setMood(p: Player, kind: MoodKind, style: number, at: number, until: number) {
  const m = p.mood
  if (!m) { p.mood = { kind, style, at, until, hit: Infinity, side: 1 }; return }
  m.kind = kind; m.style = style; m.at = at; m.until = until; m.hit = Infinity; m.side = 1
}

/** Gira la mirada hacia (dx, dy) con la fracción `k` del camino (sin asignar). */
export function turnFacing(p: Player, dx: number, dy: number, k: number) {
  const l = Math.hypot(dx, dy)
  if (l < 1e-6) return
  const fx = p.facing.x + (dx / l - p.facing.x) * k
  const fy = p.facing.y + (dy / l - p.facing.y) * k
  const fl = Math.hypot(fx, fy) || 1
  p.facing.x = fx / fl
  p.facing.y = fy / fl
}

/** Avanza la posición, la deja dentro de la pista y orienta al jugador hacia donde va. */
export function integrate(p: Player, dt: number) {
  p.pos.x = Math.min(RINK.x + RINK.width - PLAYER_RADIUS, Math.max(RINK.x + PLAYER_RADIUS, p.pos.x + p.velocity.x * dt))
  p.pos.y = Math.min(RINK.y + RINK.height - PLAYER_RADIUS, Math.max(RINK.y + PLAYER_RADIUS, p.pos.y + p.velocity.y * dt))
  if (Math.hypot(p.velocity.x, p.velocity.y) > 60) turnFacing(p, p.velocity.x, p.velocity.y, Math.min(1, dt * 10))
}

/**
 * Patina hacia (tx, ty) acelerando como un jugador; con `brake` frena para llegar parado.
 * Como `skateToward` del saque pero sin asignar objetos. Devuelve la distancia que falta.
 */
export function glide(p: Player, tx: number, ty: number, speed: number, dt: number, brake: boolean) {
  const dx = tx - p.pos.x
  const dy = ty - p.pos.y
  const dist = Math.hypot(dx, dy)
  const v = p.velocity
  const desired = dist < 2 ? 0 : brake ? Math.min(speed, Math.sqrt(2 * RESTART_SKATE_DECEL * dist)) : speed
  const ux = dist > 0 ? dx / dist : 0
  const uy = dist > 0 ? dy / dist : 0
  const ddx = ux * desired - v.x
  const ddy = uy * desired - v.y
  const dl = Math.hypot(ddx, ddy)
  const maxDv = Math.max(PLAYER_ACCEL, RESTART_SKATE_DECEL) * 1.25 * dt
  const k = dl > maxDv ? maxDv / dl : 1
  v.x += ddx * k
  v.y += ddy * k
  integrate(p, dt)
  return dist
}

/** Frena exponencialmente (constante `tau` en s) sin cambiar de rumbo. */
export function coast(p: Player, tau: number, dt: number) {
  const k = Math.exp(-dt / tau)
  p.velocity.x *= k
  p.velocity.y *= k
  if (Math.hypot(p.velocity.x, p.velocity.y) < 4) { p.velocity.x = 0; p.velocity.y = 0 }
  integrate(p, dt)
}
