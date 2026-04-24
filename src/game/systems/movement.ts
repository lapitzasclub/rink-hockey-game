import * as Phaser from 'phaser'
import { GOALIE_RADIUS, PLAYER_ACCEL, PLAYER_FRICTION, PLAYER_MAX_SPEED, PLAYER_RADIUS, RINK } from '../constants'
import type { Player, Vector } from '../types'

export function seek(player: Player, target: Vector, intensity: number, dt: number) {
  const dx = target.x - player.pos.x
  const dy = target.y - player.pos.y
  const len = Math.hypot(dx, dy)
  if (len < 6) return

  player.velocity.x += (dx / len) * PLAYER_ACCEL * intensity * dt
  player.velocity.y += (dy / len) * PLAYER_ACCEL * intensity * dt
}

export function applySkating(player: Player, dt: number) {
  player.velocity.x *= PLAYER_FRICTION
  player.velocity.y *= PLAYER_FRICTION

  const speed = Math.hypot(player.velocity.x, player.velocity.y)
  if (speed > PLAYER_MAX_SPEED) {
    player.velocity.x = (player.velocity.x / speed) * PLAYER_MAX_SPEED
    player.velocity.y = (player.velocity.y / speed) * PLAYER_MAX_SPEED
  }

  player.pos.x += player.velocity.x * dt
  player.pos.y += player.velocity.y * dt

  const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  player.pos.x = Phaser.Math.Clamp(player.pos.x, RINK.x + radius, RINK.x + RINK.width - radius)
  player.pos.y = Phaser.Math.Clamp(player.pos.y, RINK.y + radius, RINK.y + RINK.height - radius)

  if (player.role === 'goalie') {
    const minX = player.side === 'left' ? RINK.x + 28 : RINK.x + RINK.width - 90
    const maxX = player.side === 'left' ? RINK.x + 90 : RINK.x + RINK.width - 28
    player.pos.x = Phaser.Math.Clamp(player.pos.x, minX, maxX)
  }
}

export function resolvePlayerSpacing(players: Player[]) {
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i]
      const b = players[j]
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
