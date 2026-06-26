import * as Phaser from 'phaser'
import { BALL_CLAIM_FACING_BONUS, BALL_CLAIM_FACING_PENALTY, BALL_CLAIM_FRONT_DOT, BALL_CONTROL_DISTANCE, BALL_CONTROL_PROTECTION_BACK_EXTRA_MS, BALL_CONTROL_PROTECTION_MS, BALL_FRICTION, BALL_MAGNET_DISTANCE, BALL_MAGNET_MAX_SPEED, BALL_PICKUP_DISTANCE, BALL_PROTECT_OFFSET_SIDE, BALL_PROTECT_VELOCITY_BLEND, BALL_RADIUS, BULLY_CLUSTER_RADIUS, BULLY_MIN_PLAYERS, GAME_HEIGHT, GOAL_BACK_DEPTH, GOAL_HEIGHT, GOALIE_CLAIM_RADIUS, GOALIE_RADIUS, GOALIE_SAVE_RADIUS, GOAL_POST_REBOUND, GOAL_SIDE_REBOUND, PLAYER_RADIUS, RINK } from '../constants'
import type { Ball, BullyCandidate, Player, TeamColor, Vector } from '../types'
import { getGoalLineX } from '../utils'
import { findPlayerById, getControllablePlayers } from './playerHelpers'

/**
 * Actualiza la posición del balón.
 *
 * Si existe portador, el balón queda anclado delante del jugador. Si no,
 * avanza con inercia, rebote en bandas y apertura del área de portería.
 */
export function updateBallPosition(ball: Ball, ballVelocity: Vector, ballCarrierId: string | null, players: Player[], dt: number) {
  const carrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null

  if (carrier) {
    const carryOffset = carrier.role === 'goalie' ? GOALIE_RADIUS + 8 : PLAYER_RADIUS + 8
    const speed = Math.hypot(carrier.velocity.x, carrier.velocity.y)
    const velocityDir = speed > 1 ? { x: carrier.velocity.x / speed, y: carrier.velocity.y / speed } : { x: 0, y: 0 }
    const lateral = { x: -carrier.facing.y, y: carrier.facing.x }
    const lateralSign = carrier.side === 'left' ? 1 : -1
    let nextBallX = carrier.pos.x + carrier.facing.x * carryOffset + lateral.x * BALL_PROTECT_OFFSET_SIDE * lateralSign + velocityDir.x * BALL_PROTECT_VELOCITY_BLEND * speed
    let nextBallY = carrier.pos.y + carrier.facing.y * carryOffset + lateral.y * BALL_PROTECT_OFFSET_SIDE * lateralSign + velocityDir.y * BALL_PROTECT_VELOCITY_BLEND * speed

    const goalTop = GAME_HEIGHT / 2 - GOAL_HEIGHT / 2
    const goalBottom = GAME_HEIGHT / 2 + GOAL_HEIGHT / 2
    const leftGoalLineX = getGoalLineX('left')
    const rightGoalLineX = getGoalLineX('right')
    const leftNetBackX = leftGoalLineX - GOAL_BACK_DEPTH
    const rightNetBackX = rightGoalLineX + GOAL_BACK_DEPTH
    const insideLeftGoalCage = nextBallX >= leftNetBackX && nextBallX <= leftGoalLineX && nextBallY >= goalTop && nextBallY <= goalBottom
    const insideRightGoalCage = nextBallX >= rightGoalLineX && nextBallX <= rightNetBackX && nextBallY >= goalTop && nextBallY <= goalBottom

    const carrierInGoalHeight = carrier.pos.y >= goalTop - PLAYER_RADIUS && carrier.pos.y <= goalBottom + PLAYER_RADIUS
    // Solo clampear cuando el portador está en el lado campo (no cuando ya pasó por detrás de la red)
    if (carrier.pos.x > leftNetBackX && carrier.pos.x < leftGoalLineX + PLAYER_RADIUS && !insideLeftGoalCage && nextBallX < leftGoalLineX && carrierInGoalHeight) {
      nextBallX = leftGoalLineX + BALL_RADIUS
    }
    if (carrier.pos.x < rightNetBackX && carrier.pos.x > rightGoalLineX - PLAYER_RADIUS && !insideRightGoalCage && nextBallX > rightGoalLineX && carrierInGoalHeight) {
      nextBallX = rightGoalLineX - BALL_RADIUS
    }

    ball.x = nextBallX
    ball.y = nextBallY
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
  const goalTop = GAME_HEIGHT / 2 - GOAL_HEIGHT / 2
  const goalBottom = GAME_HEIGHT / 2 + GOAL_HEIGHT / 2
  const inGoalMouth = ball.y > goalTop && ball.y < goalBottom
  const leftGoalLineX = getGoalLineX('left')
  const rightGoalLineX = getGoalLineX('right')
  const leftNetBackX = leftGoalLineX - GOAL_BACK_DEPTH
  const rightNetBackX = rightGoalLineX + GOAL_BACK_DEPTH

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

  // Solo bloqueamos la cara del palo dentro de la franja de altura de la portería
  // (BALL_RADIUS desde el palo hacia arriba/abajo) y solo cuando la pelota viene del lado campo.
  // Así puede rodear la portería por arriba o abajo libremente.
  const atGoalHeight = ball.y >= goalTop - BALL_RADIUS && ball.y <= goalBottom + BALL_RADIUS
  const hitLeftPostFace = ball.x >= leftGoalLineX && ball.x <= leftGoalLineX + BALL_RADIUS && atGoalHeight && !inGoalMouth
  const hitRightPostFace = ball.x <= rightGoalLineX && ball.x >= rightGoalLineX - BALL_RADIUS && atGoalHeight && !inGoalMouth
  const nearLeftGoalMouth = ball.x >= leftGoalLineX - BALL_RADIUS - 2 && ball.x <= leftGoalLineX + BALL_RADIUS + 2
  const nearRightGoalMouth = ball.x >= rightGoalLineX - BALL_RADIUS - 2 && ball.x <= rightGoalLineX + BALL_RADIUS + 2
  const hitLeftTopPost = nearLeftGoalMouth && ball.y >= goalTop - BALL_RADIUS && ball.y <= goalTop + BALL_RADIUS
  const hitLeftBottomPost = nearLeftGoalMouth && ball.y >= goalBottom - BALL_RADIUS && ball.y <= goalBottom + BALL_RADIUS
  const hitRightTopPost = nearRightGoalMouth && ball.y >= goalTop - BALL_RADIUS && ball.y <= goalTop + BALL_RADIUS
  const hitRightBottomPost = nearRightGoalMouth && ball.y >= goalBottom - BALL_RADIUS && ball.y <= goalBottom + BALL_RADIUS

  if (hitLeftPostFace || hitRightPostFace) {
    nextVelocity.x *= -GOAL_POST_REBOUND
    ball.x = hitLeftPostFace ? leftGoalLineX + BALL_RADIUS : rightGoalLineX - BALL_RADIUS
  }

  if (hitLeftTopPost || hitLeftBottomPost || hitRightTopPost || hitRightBottomPost) {
    nextVelocity.y *= -GOAL_POST_REBOUND
    if (hitLeftTopPost || hitRightTopPost) ball.y = goalTop - BALL_RADIUS
    else ball.y = goalBottom + BALL_RADIUS
  }

  const insideLeftGoalCage = ball.x >= leftNetBackX && ball.x <= leftGoalLineX && ball.y >= goalTop && ball.y <= goalBottom
  const insideRightGoalCage = ball.x >= rightGoalLineX && ball.x <= rightNetBackX && ball.y >= goalTop && ball.y <= goalBottom
  const behindLeftGoal = ball.x < leftGoalLineX && !insideLeftGoalCage
  const behindRightGoal = ball.x > rightGoalLineX && !insideRightGoalCage

  if (inGoalMouth && ball.x <= leftNetBackX + BALL_RADIUS) {
    nextVelocity.x = Math.abs(nextVelocity.x) * GOAL_POST_REBOUND
    ball.x = leftNetBackX + BALL_RADIUS
  }

  if (inGoalMouth && ball.x >= rightNetBackX - BALL_RADIUS) {
    nextVelocity.x = -Math.abs(nextVelocity.x) * GOAL_POST_REBOUND
    ball.x = rightNetBackX - BALL_RADIUS
  }

  if (behindLeftGoal) {
    // Las paredes de la red solo existen dentro de la caja de la portería (no fuera de su altura).
    // Fuera del rectángulo de red la pelota puede moverse libremente (juego por detrás de portería).
    const inNetZoneX = ball.x >= leftNetBackX && ball.x <= leftGoalLineX
    const inNetZoneY = ball.y >= goalTop - BALL_RADIUS && ball.y <= goalBottom + BALL_RADIUS
    if (inNetZoneX && inNetZoneY) {
      if (ball.x <= leftNetBackX + BALL_RADIUS) {
        nextVelocity.x = Math.abs(nextVelocity.x) * GOAL_SIDE_REBOUND
        ball.x = leftNetBackX + BALL_RADIUS
      }
      if (ball.y > GAME_HEIGHT / 2) {
        const rearBaseY = goalBottom + BALL_RADIUS
        if (ball.y >= rearBaseY) {
          nextVelocity.y = -Math.abs(nextVelocity.y) * GOAL_SIDE_REBOUND
          ball.y = rearBaseY
        }
      } else {
        const rearTopY = goalTop - BALL_RADIUS
        if (ball.y <= rearTopY) {
          nextVelocity.y = Math.abs(nextVelocity.y) * GOAL_SIDE_REBOUND
          ball.y = rearTopY
        }
      }
    }
  }

  if (behindRightGoal) {
    const inNetZoneX = ball.x >= rightGoalLineX && ball.x <= rightNetBackX
    const inNetZoneY = ball.y >= goalTop - BALL_RADIUS && ball.y <= goalBottom + BALL_RADIUS
    if (inNetZoneX && inNetZoneY) {
      if (ball.x >= rightNetBackX - BALL_RADIUS) {
        nextVelocity.x = -Math.abs(nextVelocity.x) * GOAL_SIDE_REBOUND
        ball.x = rightNetBackX - BALL_RADIUS
      }
      if (ball.y > GAME_HEIGHT / 2) {
        const rearBaseY = goalBottom + BALL_RADIUS
        if (ball.y >= rearBaseY) {
          nextVelocity.y = -Math.abs(nextVelocity.y) * GOAL_SIDE_REBOUND
          ball.y = rearBaseY
        }
      } else {
        const rearTopY = goalTop - BALL_RADIUS
        if (ball.y <= rearTopY) {
          nextVelocity.y = Math.abs(nextVelocity.y) * GOAL_SIDE_REBOUND
          ball.y = rearTopY
        }
      }
    }
  }

  return nextVelocity
}

/**
 * Intenta convertir una bola libre en posesión formal de un jugador.
 *
 * También actualiza el índice del jugador controlado cuando la posesión azul
 * cambia a otro compañero de campo.
 */
export function tryClaimBall(ball: Ball, player: Player, ballCarrierId: string | null, ballVelocity: Vector, controlledPlayerIndex: number, players: Player[], now: number) {
  if (ballCarrierId) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }
  if ((player.possessionCooldownUntil ?? 0) > now) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }
  if ((player.ignoreBallUntil ?? 0) > now) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }
  const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y)
  let claimRadius = player.role === 'goalie' ? GOALIE_CLAIM_RADIUS : BALL_PICKUP_DISTANCE
  const toBallX = ball.x - player.pos.x
  const toBallY = ball.y - player.pos.y
  const toBallLength = Math.hypot(toBallX, toBallY) || 1
  const toBallDir = { x: toBallX / toBallLength, y: toBallY / toBallLength }
  const facingLength = Math.hypot(player.facing.x, player.facing.y) || 1
  const facingDir = { x: player.facing.x / facingLength, y: player.facing.y / facingLength }
  const facingDot = facingDir.x * toBallDir.x + facingDir.y * toBallDir.y

  if (player.role !== 'goalie') {
    if (facingDot >= BALL_CLAIM_FRONT_DOT) claimRadius += BALL_CLAIM_FACING_BONUS
    else claimRadius -= BALL_CLAIM_FACING_PENALTY
  }

  if (distance > claimRadius) return { claimed: false, ballCarrierId, ballVelocity, controlledPlayerIndex }

  let nextControlledIndex = controlledPlayerIndex
  if (player.team === 'blue' && player.role !== 'goalie') {
    const options = getControllablePlayers(players)
    const index = options.findIndex((candidate) => candidate.id === player.id)
    if (index >= 0) nextControlledIndex = index
  }

  const protectionBonus = facingDot < -0.2 ? BALL_CONTROL_PROTECTION_BACK_EXTRA_MS : 0
  player.ballProtectionUntil = now + BALL_CONTROL_PROTECTION_MS + protectionBonus

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
export function magnetBallTowardsPlayer(ball: Ball, ballVelocity: Vector, player: Player) {
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

/**
 * Libera la bola desde el portador en una dirección y potencia concretas.
 *
 * Coloca la bola a releaseDistance delante del portador y aplica cooldown de
 * posesión para que no pueda recuperarla inmediatamente.
 */
export function releaseBall(ball: Ball, players: Player[], ballCarrierId: string | null, direction: Vector, power: number, now: number, cooldownMs: number, releaseDistance = BALL_CONTROL_DISTANCE) {
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

/**
 * Aplica un impulso al vector de velocidad del balón en la dirección indicada.
 *
 * El resultado se escala hacia abajo si supera MAX_BALL_SPEED para evitar
 * velocidades físicamente absurdas.
 */
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
 * Comprueba si un portero consigue bloquear o desviar una bola cercana a su arco.
 *
 * La parada no necesita posesión inmediata: puede convertirse en desvío o en
 * captura según velocidad y distancia.
 */
export function tryGoalieSave(ball: Ball, ballVelocity: Vector, players: Player[], now: number) {
  for (const player of players) {
    if (player.role !== 'goalie') continue

    const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y)
    if (distance > GOALIE_SAVE_RADIUS) continue

    const speed = Math.hypot(ballVelocity.x, ballVelocity.y)
    const towardGoal = player.side === 'left' ? ballVelocity.x < 0 : ballVelocity.x > 0
    if (!towardGoal) continue

    if (speed < 260 && distance < GOALIE_CLAIM_RADIUS + 4) {
      player.goalieCatchTime = now
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

/** Devuelve true si la situación actual justifica convocar un bully. */
export function shouldCallBully(players: Player[], ball: Ball, ballVelocity: Vector) {
  return getBullyCandidate(players, ball, ballVelocity) !== null
}

/**
 * Detecta si hay dos jugadores rivales lo suficientemente juntos y quietos
 * como para que la disputa de la bola necesite resolverse con un bully.
 *
 * Condiciones: el jugador azul y rojo más cercanos deben estar ambos dentro de
 * BULLY_CLUSTER_RADIUS y separados menos de 74 px entre sí, y la bola debe
 * ir lenta (o haber muy pocos jugadores cerca).
 */
export function getBullyCandidate(players: Player[], ball: Ball, ballVelocity: Vector): BullyCandidate | null {
  const nearbyPlayers = players.filter((player) => {
    if (player.role === 'goalie') return false
    return Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ball.x, ball.y) < BULLY_CLUSTER_RADIUS
  })

  const blues = nearbyPlayers
    .filter((player) => player.team === 'blue')
    .sort((a, b) => Phaser.Math.Distance.Between(a.pos.x, a.pos.y, ball.x, ball.y) - Phaser.Math.Distance.Between(b.pos.x, b.pos.y, ball.x, ball.y))
  const reds = nearbyPlayers
    .filter((player) => player.team === 'red')
    .sort((a, b) => Phaser.Math.Distance.Between(a.pos.x, a.pos.y, ball.x, ball.y) - Phaser.Math.Distance.Between(b.pos.x, b.pos.y, ball.x, ball.y))

  if (blues.length === 0 || reds.length === 0) return null

  const blue = blues[0]
  const red = reds[0]
  const speed = Math.hypot(ballVelocity.x, ballVelocity.y)
  const playerGap = Phaser.Math.Distance.Between(blue.pos.x, blue.pos.y, red.pos.x, red.pos.y)
  const blueBallDistance = Phaser.Math.Distance.Between(blue.pos.x, blue.pos.y, ball.x, ball.y)
  const redBallDistance = Phaser.Math.Distance.Between(red.pos.x, red.pos.y, ball.x, ball.y)
  const contested = playerGap < 74 && blueBallDistance < BULLY_CLUSTER_RADIUS && redBallDistance < BULLY_CLUSTER_RADIUS

  if (!contested) return null
  if (nearbyPlayers.length < BULLY_MIN_PLAYERS && speed >= 34) return null

  return {
    bluePlayerId: blue.id,
    redPlayerId: red.id,
    x: ball.x,
    y: ball.y,
  }
}

/**
 * Devuelve qué equipo ha marcado si la bola ha cruzado la línea de gol.
 *
 * Solo cuenta gol si la bola entró por el frente (flag persistente que se
 * activa cuando la bola cruza la línea mientras está en la boca de portería).
 */
export function checkGoal(
  ball: Ball,
  ballVelocity: Vector,
  enteredFromFront: { left: boolean; right: boolean },
) {
  const top = GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 + BALL_RADIUS
  const bottom = GAME_HEIGHT / 2 + GOAL_HEIGHT / 2 - BALL_RADIUS
  const inGoalY = ball.y >= top && ball.y <= bottom
  if (!inGoalY) return null

  const leftGoalLineX = getGoalLineX('left')
  const rightGoalLineX = getGoalLineX('right')

  if (enteredFromFront.left && ballVelocity.x < 0 && ball.x <= leftGoalLineX - BALL_RADIUS - 6) {
    return {
      scorer: 'red' as TeamColor,
      holdX: leftGoalLineX - 10,
      holdY: Phaser.Math.Clamp(ball.y, top + 6, bottom - 6),
    }
  }

  if (enteredFromFront.right && ballVelocity.x > 0 && ball.x >= rightGoalLineX + BALL_RADIUS + 6) {
    return {
      scorer: 'blue' as TeamColor,
      holdX: rightGoalLineX + 10,
      holdY: Phaser.Math.Clamp(ball.y, top + 6, bottom - 6),
    }
  }

  return null
}
