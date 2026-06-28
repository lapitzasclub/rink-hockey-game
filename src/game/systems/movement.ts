import * as Phaser from 'phaser'
import { BENCH_Y_BOTTOM, BENCH_Y_TOP, FIELD_PLAYER_BOTTOM_BOARD_MARGIN, GAME_WIDTH, GOALIE_RADIUS, PLAYER_ACCEL, PLAYER_FRICTION, PLAYER_MAX_SPEED, PLAYER_RADIUS, PLAYER_SPRINT_MAX_SPEED, RINK, STAMINA_EXHAUSTED_SPEED_FACTOR, STAMINA_LOW_THRESHOLD } from '../constants'
import type { Player, Vector } from '../types'

/**
 * Aplica aceleración hacia un objetivo.
 *
 * Es la primitiva común para IA y otros comportamientos dirigidos.
 */
export function seek(player: Player, target: Vector, intensity: number, dt: number) {
  const dx = target.x - player.pos.x
  const dy = target.y - player.pos.y
  const len = Math.hypot(dx, dy)
  if (len < 6) return

  player.velocity.x += (dx / len) * PLAYER_ACCEL * intensity * dt
  player.velocity.y += (dy / len) * PLAYER_ACCEL * intensity * dt
}

/**
 * Integra el movimiento del jugador con una sensación simple de inercia.
 *
 * Aquí vive el comportamiento más cercano al "patinaje" actual, incluyendo
 * rozamiento, límite de velocidad y restricciones del portero.
 */
export function applySkating(player: Player, dt: number) {
  player.velocity.x *= PLAYER_FRICTION
  player.velocity.y *= PLAYER_FRICTION

  const speed = Math.hypot(player.velocity.x, player.velocity.y)
  const stamina = player.stamina ?? 100
  const staminaMod = stamina < STAMINA_LOW_THRESHOLD && player.role !== 'goalie' ? STAMINA_EXHAUSTED_SPEED_FACTOR : 1
  const maxSpeed = (player.sprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED) * staminaMod
  if (speed > maxSpeed) {
    player.velocity.x = (player.velocity.x / speed) * maxSpeed
    player.velocity.y = (player.velocity.y / speed) * maxSpeed
  }

  player.pos.x += player.velocity.x * dt
  player.pos.y += player.velocity.y * dt

  const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  player.pos.x = Phaser.Math.Clamp(player.pos.x, RINK.x + radius, RINK.x + RINK.width - radius)
  const bottomMargin = player.role === 'goalie' ? 0 : FIELD_PLAYER_BOTTOM_BOARD_MARGIN
  player.pos.y = Phaser.Math.Clamp(player.pos.y, RINK.y + radius, RINK.y + RINK.height - radius - bottomMargin)

  if (player.role === 'goalie') {
    const minX = player.side === 'left' ? RINK.x + 28 : RINK.x + RINK.width - 90
    const maxX = player.side === 'left' ? RINK.x + 90 : RINK.x + RINK.width - 28
    player.pos.x = Phaser.Math.Clamp(player.pos.x, minX, maxX)
  }
}

/**
 * Mueve los jugadores suspendidos (tarjeta azul) al banquillo y los devuelve
 * a su posición home cuando termina la sanción.
 */
export function updateSuspendedPlayers(players: Player[], timeNow: number, dt: number) {
  for (const player of players) {
    if (!player.suspendedUntil) continue
    if (timeNow >= player.suspendedUntil) {
      player.suspendedUntil = 0
      continue
    }
    // Mover al banquillo (fuera de la pista, a la altura central)
    const benchX = GAME_WIDTH / 2
    const benchY = player.team === 'blue' ? BENCH_Y_TOP : BENCH_Y_BOTTOM
    const dx = benchX - player.pos.x
    const dy = benchY - player.pos.y
    const dist = Math.hypot(dx, dy)
    if (dist > 2) {
      const step = Math.min(dist, PLAYER_SPRINT_MAX_SPEED * dt)
      player.pos.x += (dx / dist) * step
      player.pos.y += (dy / dist) * step
    }
    player.velocity = { x: 0, y: 0 }
  }
}

/**
 * Separa jugadores solapados para que la lectura visual y la colisión básica
 * no se degraden cuando varios convergen sobre la misma zona.
 */
export function resolvePlayerSpacing(players: Player[]) {
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i]
      const b = players[j]
      // Los jugadores en el banquillo no colisionan con los de la pista
      if ((a.suspendedUntil && a.suspendedUntil > 0) || (b.suspendedUntil && b.suspendedUntil > 0)) continue
      const ar = a.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      const br = b.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const dist = Math.hypot(dx, dy) || 1
      const minDist = ar + br + 8

      if (dist < minDist) {
        const push = (minDist - dist) / 2
        const nx = dx / dist
        const ny = dy / dist
        a.pos.x -= nx * push
        a.pos.y -= ny * push
        b.pos.x += nx * push
        b.pos.y += ny * push
        a.velocity.x -= nx * 25
        a.velocity.y -= ny * 25
        b.velocity.x += nx * 25
        b.velocity.y += ny * 25
      }
    }
  }
}
