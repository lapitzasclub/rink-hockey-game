import * as Phaser from 'phaser'
import { GAME_HEIGHT, GOALIE_SAVE_RADIUS, RINK } from '../constants'
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
export function updateGoalieAI(player: Player, ballX: number, ballY: number, dt: number) {
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
  const nearest = getClosestPlayerToBall(players, player.team, ballX, ballY)
  const hasBall = ballCarrierId === player.id
  const sameTeamHasBall = ballCarrierId !== null && findPlayerById(players, ballCarrierId)?.team === player.team

  let target = { ...player.home }

  if (hasBall) {
    const advance = player.side === 'left' ? 1 : -1
    target = {
      x: player.pos.x + 70 * advance,
      y: GAME_HEIGHT / 2 + Phaser.Math.Clamp(ballY - GAME_HEIGHT / 2, -140, 140),
    }
  } else if (ballCarrierId === null && nearest?.id === player.id) {
    target = { x: ballX, y: ballY }
  } else if (sameTeamHasBall) {
    const attackShift = player.side === 'left' ? 80 : -80
    target = {
      x: player.home.x + attackShift,
      y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -90, 90),
    }
  } else {
    target = {
      x: player.home.x + Phaser.Math.Clamp(ballX - player.home.x, -140, 140),
      y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -110, 110),
    }
  }

  seek(player, target, 1, dt)
  player.facing = normalizedVector(target.x - player.pos.x, target.y - player.pos.y, player.facing)
}

/** Heurística rápida para saber si un atacante IA está en zona razonable de tiro. */
export function shouldAIShoot(player: Player) {
  return player.side === 'right' ? player.pos.x < RINK.x + 380 : player.pos.x > RINK.x + RINK.width - 380
}
