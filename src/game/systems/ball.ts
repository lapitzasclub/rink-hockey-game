import * as Phaser from 'phaser'
import { BALL_CONTROL_DISTANCE, BALL_FRICTION, BALL_PICKUP_DISTANCE, GAME_HEIGHT, GOAL_HEIGHT, GOALIE_RADIUS, PLAYER_RADIUS, RINK } from '../constants'
import type { Player, TeamColor, Vector } from '../types'
import { findPlayerById, getControllablePlayers } from './playerHelpers'

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

export function checkLooseBallTackle(players: Player[], carrier: Player) {
  for (const rival of players) {
    if (rival.team === carrier.team) continue
    const tackleDistance = Phaser.Math.Distance.Between(rival.pos.x, rival.pos.y, carrier.pos.x, carrier.pos.y)
    if (tackleDistance < PLAYER_RADIUS + 10) return true
  }
  return false
}

export function checkGoal(ball: Phaser.GameObjects.Arc) {
  const inGoalY = ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2
  if (!inGoalY) return null
  if (ball.x < RINK.x - 10) return 'red' as TeamColor
  if (ball.x > RINK.x + RINK.width + 10) return 'blue' as TeamColor
  return null
}
