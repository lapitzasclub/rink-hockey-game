import * as Phaser from 'phaser'
import { BALL_CONTROL_DISTANCE, BALL_FRICTION, BALL_PICKUP_DISTANCE, GAME_HEIGHT, GOAL_HEIGHT, GOALIE_RADIUS, PLAYER_RADIUS, RINK } from '../constants'
import type { Player, TeamColor, Vector } from '../types'
import { findPlayerById, getControllablePlayers } from './playerHelpers'

/**
 * Actualiza la posición del balón.
 *
 * Si existe portador, el balón queda anclado delante del jugador. Si no,
 * avanza con inercia, rebote en bandas y apertura del área de portería.
 */
export function updateBallPosition(ball: Phaser.GameObjects.Arc, ballVelocity: Vector, ballCarrierId: string | null, players: Player[], dt: number) {
  const carrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null

  if (carrier) {
    const carryOffset = carrier.role === 'goalie' ? GOALIE_RADIUS + 8 : PLAYER_RADIUS + 8
    ball.x = carrier.pos.x + carrier.facing.x * carryOffset
    ball.y = carrier.pos.y + carrier.facing.y * carryOffset
    return { x: carrier.velocity.x * 0.35, y: carrier.velocity.y * 0.35 }
  }

  const nextVelocity = {
    x: ballVelocity.x * BALL_FRICTION,
    y: ballVelocity.y * BALL_FRICTION,
  }

  ball.x += nextVelocity.x * dt
  ball.y += nextVelocity.y * dt

  const top = RINK.y + 9
  const bottom = RINK.y + RINK.height - 9
  const left = RINK.x + 9
  const right = RINK.x + RINK.width - 9
  const inGoalMouth = ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2

  if (ball.y <= top || ball.y >= bottom) {
    nextVelocity.y *= -0.88
    ball.y = Phaser.Math.Clamp(ball.y, top, bottom)
  }

  if (ball.x <= left && !inGoalMouth) {
    nextVelocity.x *= -0.88
    ball.x = left
  }

  if (ball.x >= right && !inGoalMouth) {
    nextVelocity.x *= -0.88
    ball.x = right
  }

  return nextVelocity
}

/**
 * Intenta convertir una bola libre en posesión formal de un jugador.
 *
 * También actualiza el índice del jugador controlado cuando la posesión azul
 * cambia a otro compañero de campo.
 */
export function tryClaimBall(ball: Phaser.GameObjects.Arc, player: Player, ballCarrierId: string | null, ballVelocity: Vector, controlledPlayerIndex: number, players: Player[]) {
  if (ballCarrierId) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }
  const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y)
  if (distance > BALL_PICKUP_DISTANCE) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }

  let nextControlledIndex = controlledPlayerIndex
  if (player.team === 'blue' && player.role !== 'goalie') {
    const options = getControllablePlayers(players)
    const index = options.findIndex((candidate) => candidate.id === player.id)
    if (index >= 0) nextControlledIndex = index
  }

  return {
    claimed: true,
    ballCarrierId: player.id,
    ballVelocity: { x: 0, y: 0 },
    controlledPlayerIndex: nextControlledIndex,
  }
}

/** Libera la bola desde el portador en una dirección y potencia concretas. */
export function releaseBall(ball: Phaser.GameObjects.Arc, players: Player[], ballCarrierId: string | null, direction: Vector, power: number) {
  const carrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null
  if (carrier) {
    ball.x = carrier.pos.x + direction.x * BALL_CONTROL_DISTANCE
    ball.y = carrier.pos.y + direction.y * BALL_CONTROL_DISTANCE
  }

  return {
    ballCarrierId: null,
    ballVelocity: { x: direction.x * power, y: direction.y * power },
  }
}

/** Aplica un impulso instantáneo al balón respetando una velocidad máxima. */
export function kickBall(ballVelocity: Vector, angle: number, power: number) {
  const nextVelocity = {
    x: ballVelocity.x + Math.cos(angle) * power,
    y: ballVelocity.y + Math.sin(angle) * power,
  }
  const speed = Math.hypot(nextVelocity.x, nextVelocity.y)
  const maxSpeed = 760

  if (speed > maxSpeed) {
    nextVelocity.x = (nextVelocity.x / speed) * maxSpeed
    nextVelocity.y = (nextVelocity.y / speed) * maxSpeed
  }

  return nextVelocity
}

/**
 * Elige un receptor de pase con una heurística muy simple.
 *
 * Por ahora prioriza progreso ofensivo y distancia razonable.
 */
export function getBestPassTarget(players: Player[], player: Player) {
  const teammates = players.filter((candidate) => candidate.team === player.team && candidate.id !== player.id && candidate.role !== 'goalie')
  const attackDirection = player.side === 'left' ? 1 : -1

  return teammates
    .map((candidate) => {
      const dx = candidate.pos.x - player.pos.x
      const dy = candidate.pos.y - player.pos.y
      const forwardness = dx * attackDirection
      const distance = Math.hypot(dx, dy)
      return { candidate, score: forwardness - distance * 0.25 }
    })
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null
}

/** Detecta si un rival está lo bastante cerca del portador como para forzar pérdida. */
export function checkLooseBallTackle(players: Player[], carrier: Player) {
  for (const rival of players) {
    if (rival.team === carrier.team) continue
    const tackleDistance = Phaser.Math.Distance.Between(rival.pos.x, rival.pos.y, carrier.pos.x, carrier.pos.y)
    if (tackleDistance < PLAYER_RADIUS + 10) return true
  }
  return false
}

/** Devuelve qué equipo ha marcado si la bola ha cruzado la línea de gol. */
export function checkGoal(ball: Phaser.GameObjects.Arc) {
  const inGoalY = ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2
  if (!inGoalY) return null
  if (ball.x < RINK.x - 10) return 'red' as TeamColor
  if (ball.x > RINK.x + RINK.width + 10) return 'blue' as TeamColor
  return null
}
