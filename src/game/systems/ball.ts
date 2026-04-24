import * as Phaser from 'phaser'
import { BALL_CONTROL_DISTANCE, BALL_FRICTION, BALL_MAGNET_DISTANCE, BALL_MAGNET_MAX_SPEED, BALL_PICKUP_DISTANCE, BULLY_CLUSTER_RADIUS, BULLY_MIN_PLAYERS, GAME_HEIGHT, GOAL_HEIGHT, GOALIE_CLAIM_RADIUS, GOALIE_RADIUS, GOALIE_SAVE_RADIUS, PASS_ASSIST_BLEND, PASS_ASSIST_CONE_DOT, PLAYER_RADIUS, RINK } from '../constants'
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
export function tryClaimBall(ball: Phaser.GameObjects.Arc, player: Player, ballCarrierId: string | null, ballVelocity: Vector, controlledPlayerIndex: number, players: Player[], now: number) {
  if (ballCarrierId) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }
  if ((player.possessionCooldownUntil ?? 0) > now) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }
  if ((player.ignoreBallUntil ?? 0) > now) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }
  const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y)
  const claimRadius = player.role === 'goalie' ? GOALIE_CLAIM_RADIUS : BALL_PICKUP_DISTANCE
  if (distance > claimRadius) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }

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

/**
 * Atrae ligeramente una bola libre hacia un jugador cercano para que la captura
 * se sienta menos torpe y menos dependiente de rebotes diminutos.
 */
export function magnetBallTowardsPlayer(ball: Phaser.GameObjects.Arc, ballVelocity: Vector, player: Player) {
  const speed = Math.hypot(ballVelocity.x, ballVelocity.y)
  if (speed > BALL_MAGNET_MAX_SPEED) return ballVelocity

  const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y)
  if (distance > BALL_MAGNET_DISTANCE) return ballVelocity

  const angle = Phaser.Math.Angle.Between(ball.x, ball.y, player.pos.x, player.pos.y)
  const pullStrength = Phaser.Math.Clamp((BALL_MAGNET_DISTANCE - distance) / BALL_MAGNET_DISTANCE, 0, 1)
  const velocityBlend = 1 - Phaser.Math.Clamp(speed / BALL_MAGNET_MAX_SPEED, 0, 1)
  const pull = 28 * pullStrength * velocityBlend
  return {
    x: ballVelocity.x + Math.cos(angle) * pull,
    y: ballVelocity.y + Math.sin(angle) * pull,
  }
}

/** Libera la bola desde el portador en una dirección y potencia concretas. */
export function releaseBall(ball: Phaser.GameObjects.Arc, players: Player[], ballCarrierId: string | null, direction: Vector, power: number, now: number, cooldownMs: number, releaseDistance = BALL_CONTROL_DISTANCE) {
  const carrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null
  if (carrier) {
    ball.x = carrier.pos.x + direction.x * releaseDistance
    ball.y = carrier.pos.y + direction.y * releaseDistance
    carrier.possessionCooldownUntil = now + cooldownMs
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
  const facingLength = Math.hypot(player.facing.x, player.facing.y) || 1
  const facing = { x: player.facing.x / facingLength, y: player.facing.y / facingLength }

  return teammates
    .map((candidate) => {
      const dx = candidate.pos.x - player.pos.x
      const dy = candidate.pos.y - player.pos.y
      const distance = Math.hypot(dx, dy) || 1
      const dir = { x: dx / distance, y: dy / distance }
      const facingDot = facing.x * dir.x + facing.y * dir.y
      const score = facingDot * 180 - distance * 0.3
      return { candidate, score, facingDot, dir }
    })
    .filter((entry) => entry.facingDot >= PASS_ASSIST_CONE_DOT)
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null
}

/**
 * Devuelve una dirección de pase asistida: respeta la mirada del jugador, pero
 * se corrige parcialmente hacia un compañero válido dentro del cono frontal.
 */
export function getAssistedPassDirection(players: Player[], player: Player, fallbackDirection: Vector) {
  const target = getBestPassTarget(players, player)
  if (!target) return fallbackDirection

  const raw = {
    x: target.pos.x - player.pos.x,
    y: target.pos.y - player.pos.y,
  }
  const rawLength = Math.hypot(raw.x, raw.y) || 1
  const dirToMate = { x: raw.x / rawLength, y: raw.y / rawLength }

  const blended = {
    x: fallbackDirection.x * (1 - PASS_ASSIST_BLEND) + dirToMate.x * PASS_ASSIST_BLEND,
    y: fallbackDirection.y * (1 - PASS_ASSIST_BLEND) + dirToMate.y * PASS_ASSIST_BLEND,
  }
  const length = Math.hypot(blended.x, blended.y) || 1
  return { x: blended.x / length, y: blended.y / length }
}

/**
 * El portero no debería depender de su facing instantáneo para distribuir.
 * Busca directamente un compañero de campo y, si no hay una línea clara,
 * al menos despeja hacia delante con una ligera componente vertical.
 */
export function getGoalieDistributionTarget(players: Player[], player: Player) {
  const target = players
    .filter((candidate) => candidate.team === player.team && candidate.id !== player.id && candidate.role !== 'goalie')
    .map((candidate) => {
      const dx = candidate.pos.x - player.pos.x
      const dy = candidate.pos.y - player.pos.y
      const distance = Math.hypot(dx, dy) || 1
      const forward = player.side === 'left' ? dx / distance : -dx / distance
      const tooClosePenalty = distance < 140 ? (140 - distance) * 2.2 : 0
      const score = forward * 240 - Math.abs(dy) * 0.2 - distance * 0.05 - tooClosePenalty
      return { candidate, dx, dy, distance, score }
    })
    .sort((a, b) => b.score - a.score)[0]

  if (target) return target.candidate
  return null
}

export function getGoalieDistributionDirection(players: Player[], player: Player) {
  const target = getGoalieDistributionTarget(players, player)
  if (target) {
    const dx = target.pos.x - player.pos.x
    const dy = target.pos.y - player.pos.y
    const distance = Math.hypot(dx, dy) || 1
    return {
      x: dx / distance,
      y: dy / distance,
    }
  }

  return {
    x: player.side === 'left' ? 0.96 : -0.96,
    y: player.pos.y < GAME_HEIGHT / 2 ? 0.28 : -0.28,
  }
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
/**
 * Comprueba si un portero consigue bloquear o desviar una bola cercana a su arco.
 *
 * La parada no necesita posesión inmediata: puede convertirse en desvío o en
 * captura según velocidad y distancia.
 */
export function tryGoalieSave(ball: Phaser.GameObjects.Arc, ballVelocity: Vector, players: Player[]) {
  for (const player of players) {
    if (player.role !== 'goalie') continue

    const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y)
    if (distance > GOALIE_SAVE_RADIUS) continue

    const speed = Math.hypot(ballVelocity.x, ballVelocity.y)
    const towardGoal = player.side === 'left' ? ballVelocity.x < 0 : ballVelocity.x > 0
    if (!towardGoal) continue

    if (speed < 260 && distance < GOALIE_CLAIM_RADIUS + 4) {
      player.goalieCatchTime = Date.now()
      return {
        saved: true,
        claimedBy: player.id,
        ballVelocity: { x: 0, y: 0 },
      }
    }

    const clearAngle = player.side === 'left'
      ? Phaser.Math.Angle.Between(player.pos.x, player.pos.y, RINK.x + RINK.width * 0.68, GAME_HEIGHT / 2)
      : Phaser.Math.Angle.Between(player.pos.x, player.pos.y, RINK.x + RINK.width * 0.32, GAME_HEIGHT / 2)

    return {
      saved: true,
      claimedBy: null,
      ballVelocity: kickBall({ x: 0, y: 0 }, clearAngle, Math.max(240, speed * 0.55)),
    }
  }

  return { saved: false, claimedBy: null, ballVelocity }
}

export function shouldCallBully(players: Player[], ball: Phaser.GameObjects.Arc, ballVelocity: Vector) {
  const nearbyPlayers = players.filter((player) => Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y) < BULLY_CLUSTER_RADIUS)
  const teams = new Set(nearbyPlayers.map((player) => player.team))
  const speed = Math.hypot(ballVelocity.x, ballVelocity.y)

  return nearbyPlayers.length >= BULLY_MIN_PLAYERS && teams.size >= 2 && speed < 22
}

export function checkGoal(ball: Phaser.GameObjects.Arc) {
  const inGoalY = ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2
  if (!inGoalY) return null
  if (ball.x < RINK.x - 10) return 'red' as TeamColor
  if (ball.x > RINK.x + RINK.width + 10) return 'blue' as TeamColor
  return null
}
