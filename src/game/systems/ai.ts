import * as Phaser from 'phaser'
import { GAME_HEIGHT, GOALIE_DISTRIBUTION_DELAY_MS, GOALIE_SAVE_RADIUS, RINK } from '../constants'
import { seek } from './movement'
import { findPlayerById, getClosestPlayerToBall } from './playerHelpers'
import type { Player } from '../types'
import { normalizedVector } from '../utils'

/**
 * IA base del portero.
 *
 * No sale realmente a jugar el balón todavía, pero sí acompaña la jugada
 * lateralmente dentro de su zona para cubrir mejor el arco y cerrarse más
 * cuando la bola entra en radio claro de intervención.
 */
export function updateGoalieAI(player: Player, ballX: number, ballY: number, dt: number, now = 0) {
  if ((player.goalieRecoverUntil ?? 0) > now) {
    const resetFacing = { x: player.side === 'left' ? 1 : -1, y: 0 }
    seek(player, player.home, 0.55, dt)
    player.facing = normalizedVector(resetFacing.x, resetFacing.y, resetFacing)
    return
  }

  const targetY = Phaser.Math.Clamp(ballY, GAME_HEIGHT / 2 - 120, GAME_HEIGHT / 2 + 120)
  const ballDistance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ballX, ballY)
  const stepOut = ballDistance < GOALIE_SAVE_RADIUS + 18 ? 26 : 12
  const targetX = player.home.x + (player.side === 'left' ? stepOut : -stepOut)
  seek(player, { x: targetX, y: targetY }, 0.75, dt)
  player.facing = normalizedVector(ballX - player.pos.x, ballY - player.pos.y, player.facing)
}

/**
 * IA base de jugadores de campo.
 *
 * Mantiene una lógica táctica ligera: perseguir, abrirse cuando hay posesión
 * propia y replegar/ajustar forma cuando la bola está libre o rival.
 */
export function updateFieldPlayerAI(players: Player[], player: Player, ballX: number, ballY: number, ballCarrierId: string | null, dt: number) {
  const teammates = players.filter((candidate) => candidate.team === player.team && candidate.role !== 'goalie')
  const rivals = players.filter((candidate) => candidate.team !== player.team && candidate.role !== 'goalie')
  const nearest = getClosestPlayerToBall(players, player.team, ballX, ballY)
  const hasBall = ballCarrierId === player.id
  const carrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null
  const sameTeamHasBall = carrier?.team === player.team
  const teamChaserOrder = [...teammates]
    .sort((a, b) => Phaser.Math.Distance.Between(a.pos.x, a.pos.y, ballX, ballY) - Phaser.Math.Distance.Between(b.pos.x, b.pos.y, ballX, ballY))
  const pressureIndex = teamChaserOrder.findIndex((candidate) => candidate.id === player.id)

  let target = { ...player.home }

  if (hasBall) {
    const advance = player.side === 'left' ? 1 : -1
    target = {
      x: player.pos.x + 70 * advance,
      y: GAME_HEIGHT / 2 + Phaser.Math.Clamp(ballY - GAME_HEIGHT / 2, -140, 140),
    }
  } else if (ballCarrierId === null) {
    if (nearest?.id === player.id) {
      target = { x: ballX, y: ballY }
    } else if (pressureIndex === 1) {
      target = {
        x: ballX + (player.side === 'left' ? -42 : 42),
        y: ballY + (player.home.y < GAME_HEIGHT / 2 ? -28 : 28),
      }
    } else {
      target = {
        x: player.home.x + Phaser.Math.Clamp(ballX - player.home.x, -110, 110),
        y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -90, 90),
      }
    }
  } else if (sameTeamHasBall) {
    const attackShift = player.side === 'left' ? 90 : -90
    const laneSpread = player.role === 'wing' ? -36 : player.role === 'pivot' ? 36 : 0
    target = {
      x: player.home.x + attackShift,
      y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -80, 80) + laneSpread,
    }

    if (pressureIndex === 0) {
      target.x -= attackShift * 0.35
      target.y = ballY + (player.home.y < GAME_HEIGHT / 2 ? -22 : 22)
    }
  } else {
    const rivalCarrier = carrier && carrier.team !== player.team ? carrier : null

    if (rivalCarrier && pressureIndex === 0) {
      const engageOffset = player.side === 'left' ? 10 : -10
      target = { x: rivalCarrier.pos.x + engageOffset, y: rivalCarrier.pos.y }
    } else if (rivalCarrier && pressureIndex === 1) {
      const protectX = rivalCarrier.pos.x + (player.side === 'left' ? -54 : 54)
      const protectY = rivalCarrier.pos.y + (player.home.y < GAME_HEIGHT / 2 ? -34 : 34)
      target = { x: protectX, y: protectY }
    } else {
      const fallbackBias = rivals.length > 0 ? Phaser.Math.Clamp(ballX - player.home.x, -90, 90) : 0
      target = {
        x: player.home.x + fallbackBias,
        y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -80, 80),
      }
    }
  }

  seek(player, target, 1, dt)
  player.facing = normalizedVector(target.x - player.pos.x, target.y - player.pos.y, player.facing)
}

/** Heurística rápida para saber si un atacante IA está en zona razonable de tiro. */
export function shouldAIShoot(player: Player) {
  return player.side === 'right' ? player.pos.x < RINK.x + 380 : player.pos.x > RINK.x + RINK.width - 380
}

export function getAimingDirection(player: Player) {
  return player.facing.x === 0 && player.facing.y === 0
    ? { x: player.side === 'left' ? 1 : -1, y: 0 }
    : player.facing
}

/**
 * El portero debe distribuir tras asegurar la bola.
 *
 * En vez de depender de una heurística tímida, se le da una ventana corta de
 * control y después se fuerza un pase si sigue teniendo la posesión.
 */
export function shouldGoaliePass(player: Player, now: number) {
  const catchTime = player.goalieCatchTime ?? 0
  return catchTime > 0 && now - catchTime >= GOALIE_DISTRIBUTION_DELAY_MS
}

export function markGoalieCaughtBall(player: Player, now: number) {
  player.goalieCatchTime = now
}

export function clearGoalieCatch(player: Player) {
  player.goalieCatchTime = 0
}
