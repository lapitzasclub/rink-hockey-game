import * as Phaser from 'phaser'
import { FIELD_PLAYER_BOTTOM_BOARD_MARGIN, GOALIE_OUT_DEPTH, PEN_EXIT_MAX_MS, PEN_WALK_SPEED, GOALIE_RADIUS, GOALIE_X_MAX, GOALIE_X_MIN, PLAYER_SEPARATION_GAP, PLAYER_ACCEL, PLAYER_FRICTION, PLAYER_MAX_SPEED, PLAYER_RADIUS, PLAYER_SPRINT_MAX_SPEED, RINK, STAMINA_EXHAUSTED_SPEED_FACTOR, STAMINA_LOW_THRESHOLD } from '../constants'
import type { Player, Vector } from '../types'
import { penaltyPath } from '../render/rink/table'
import { skateToward } from './matchFlow'

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

/** Agarre del patín (1 = normal); el evento arcade «pista de hielo» lo baja. */
export const skateMods = { grip: 1 }
const lastSkateVelocity = new WeakMap<Player, Vector>()

/**
 * Integra el movimiento del jugador con una sensación simple de inercia.
 *
 * Aquí vive el comportamiento más cercano al "patinaje" actual, incluyendo
 * rozamiento, límite de velocidad y restricciones del portero.
 */
export function applySkating(player: Player, dt: number) {
  player.velocity.x *= PLAYER_FRICTION
  player.velocity.y *= PLAYER_FRICTION
  // Pista de hielo (arcade): solo una fracción del cambio de velocidad del paso «agarra»; el resto es deriva
  const last = lastSkateVelocity.get(player)
  if (skateMods.grip < 1 && player.role !== 'goalie' && last) {
    player.velocity.x = last.x + (player.velocity.x - last.x) * skateMods.grip
    player.velocity.y = last.y + (player.velocity.y - last.y) * skateMods.grip
  }

  const speed = Math.hypot(player.velocity.x, player.velocity.y)
  const stamina = player.stamina ?? 100
  const staminaMod = stamina < STAMINA_LOW_THRESHOLD && player.role !== 'goalie' ? STAMINA_EXHAUSTED_SPEED_FACTOR : 1
  const maxSpeed = (player.sprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED) * staminaMod * (player.speedMultiplier ?? 1)
  if (speed > maxSpeed) {
    player.velocity.x = (player.velocity.x / speed) * maxSpeed
    player.velocity.y = (player.velocity.y / speed) * maxSpeed
  }

  player.pos.x += player.velocity.x * dt
  player.pos.y += player.velocity.y * dt
  if (last) {
    last.x = player.velocity.x
    last.y = player.velocity.y
  } else lastSkateVelocity.set(player, { x: player.velocity.x, y: player.velocity.y })

  const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  player.pos.x = Phaser.Math.Clamp(player.pos.x, RINK.x + radius, RINK.x + RINK.width - radius)
  const bottomMargin = player.role === 'goalie' ? 0 : FIELD_PLAYER_BOTTOM_BOARD_MARGIN
  player.pos.y = Phaser.Math.Clamp(player.pos.y, RINK.y + radius, RINK.y + RINK.height - radius - bottomMargin)

  if (player.role === 'goalie') {
    // Tope de su zona; la velocidad contra el tope se anula para que no «patine» sin moverse
    const out = GOALIE_X_MAX + GOALIE_OUT_DEPTH
    const minX = player.side === 'left' ? RINK.x + GOALIE_X_MIN : RINK.x + RINK.width - out
    const maxX = player.side === 'left' ? RINK.x + out : RINK.x + RINK.width - GOALIE_X_MIN
    if (player.pos.x < minX) { player.pos.x = minX; if (player.velocity.x < 0) player.velocity.x = 0 }
    else if (player.pos.x > maxX) { player.pos.x = maxX; if (player.velocity.x > 0) player.velocity.x = 0 }
  }
}

const penPath = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]

/** Primer asiento libre de su equipo en la zona de sancionados. */
function freePenaltySeat(players: Player[], player: Player) {
  for (let i = 0; i < 3; i++) {
    if (!players.some((o) => o !== player && o.team === player.team && o.penPhase && o.penSeat === i)) return i
  }
  return 0
}

function pathLength(pts: Vector[]) {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return l
}

/** Coloca al jugador a `d` px del camino, con la velocidad y orientación de ir en `dir` (la zancada del rig sale de ahí). */
function placeOnPath(player: Player, pts: Vector[], d: number, dir: 1 | -1) {
  let rest = Math.max(0, d)
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y
    const sx = pts[i].x - ax, sy = pts[i].y - ay
    const l = Math.hypot(sx, sy)
    if (rest <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, rest / l) : 1
      player.pos.x = ax + sx * t
      player.pos.y = ay + sy * t
      if (l > 0) {
        const ux = (sx / l) * dir, uy = (sy / l) * dir
        player.velocity = { x: ux * PEN_WALK_SPEED, y: uy * PEN_WALK_SPEED }
        player.facing = { x: ux, y: uy }
      }
      return
    }
    rest -= l
  }
}

/**
 * Sancionados (tarjeta azul): patinan a la puerta de su banquillo, la cruzan,
 * van por el pasillo hasta su asiento y, cumplida la sanción, vuelven a la
 * pista por el mismo camino. La sanción cuenta tiempo efectivo: con el juego
 * parado (`paused`) no corre (art. 3).
 */
export function updateSuspendedPlayers(players: Player[], timeNow: number, dt: number, paused = false) {
  for (const player of players) {
    if (!player.suspendedUntil) continue
    if (paused && player.penPhase !== 'back' && player.suspendedUntil > timeNow) player.suspendedUntil += dt * 1000
    if (!player.penPhase) {
      player.penPhase = 'out'
      player.penPhaseAt = timeNow
    }
    if (player.penSeat === undefined) player.penSeat = freePenaltySeat(players, player)
    const path = penaltyPath(player.team, player.penSeat, PLAYER_RADIUS + 2, penPath)
    const len = pathLength(path)
    player.sprinting = false

    if (player.penPhase === 'out') {
      const arrived = skateToward(player, path[0].x, path[0].y, dt)
      if (arrived || timeNow - (player.penPhaseAt ?? timeNow) > PEN_EXIT_MAX_MS) {
        player.penPhase = 'exit'
        player.penWalk = 0
      }
    } else if (player.penPhase === 'exit') {
      player.penWalk = (player.penWalk ?? 0) + PEN_WALK_SPEED * dt
      placeOnPath(player, path, player.penWalk, 1)
      if (player.penWalk >= len) {
        player.penPhase = 'seated'
        player.penPhaseAt = timeNow
        player.velocity = { x: 0, y: 0 }
      }
    } else if (player.penPhase === 'seated') {
      player.velocity = { x: 0, y: 0 }
      if (timeNow >= player.suspendedUntil) {
        player.penPhase = 'back'
        player.penWalk = len
      }
    } else {
      // De vuelta sigue fuera del juego hasta pisar la pista
      player.suspendedUntil = timeNow + 1000
      player.penWalk = (player.penWalk ?? len) - PEN_WALK_SPEED * dt
      placeOnPath(player, path, player.penWalk, -1)
      if (player.penWalk <= 0) {
        player.suspendedUntil = 0
        player.penPhase = undefined
        player.penSeat = undefined
        player.penWalk = undefined
        player.velocity = { x: 0, y: PEN_WALK_SPEED }
        player.facing = { x: 0, y: 1 }
      }
    }
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
      const minDist = ar + br + PLAYER_SEPARATION_GAP

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
