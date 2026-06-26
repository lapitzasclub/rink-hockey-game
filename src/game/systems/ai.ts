import * as Phaser from 'phaser'
import {
  AI_MARK_RADIUS,
  AI_OPEN_MATE_GAP,
  AI_SHOOT_DISTANCE,
  AI_STEAL_ATTEMPT_CHANCE,
  AI_STEAL_ENGAGE_FRONT_DOT,
  GAME_HEIGHT,
  GOALIE_DISTRIBUTION_DELAY_MS,
  GOALIE_SAVE_RADIUS,
  MANUAL_STEAL_RANGE,
  PLAYER_SPRINT_ACCEL_MULTIPLIER,
  STAMINA_LOW_THRESHOLD,
} from '../constants'
import { seek } from './movement'
import { findPlayerById } from './playerHelpers'
import type { Player } from '../types'
import { getGoalLineX, normalizedVector } from '../utils'

/**
 * IA del portero.
 *
 * Posicionamiento basado en ángulo: se coloca sobre la línea entre el centro
 * de la portería y la bola, cerrando el ángulo de tiro. Si la bola está detrás
 * de la línea de portería vuelve al centro en vez de seguirla hacia atrás.
 */
export function updateGoalieAI(player: Player, ballX: number, ballY: number, dt: number, now = 0) {
  if ((player.goalieRecoverUntil ?? 0) > now) {
    seek(player, player.home, 0.55, dt)
    player.facing = normalizedVector(player.side === 'left' ? 1 : -1, 0, player.facing)
    return
  }

  const goalLineX = getGoalLineX(player.side)
  const goalCenterY = GAME_HEIGHT / 2

  // Si la bola está detrás de la portería no tiene sentido seguirla
  const ballBehind = player.side === 'left' ? ballX < goalLineX : ballX > goalLineX
  if (ballBehind) {
    seek(player, { x: player.home.x, y: goalCenterY }, 0.7, dt)
    player.facing = normalizedVector(player.side === 'left' ? 1 : -1, 0, player.facing)
    return
  }

  // Cobertura de ángulo: Y proporcional al ángulo bola-portería, pero reducida
  // cuando la bola está muy lateral (donde el peligro directo es menor)
  const dxBall = ballX - goalLineX
  const dyBall = ballY - goalCenterY
  const angleWeight = Phaser.Math.Clamp(Math.abs(dxBall) / 300, 0.35, 1)
  const targetY = Phaser.Math.Clamp(goalCenterY + dyBall * angleWeight * 0.68, goalCenterY - 110, goalCenterY + 110)

  const ballDistance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ballX, ballY)
  const stepOut = ballDistance < GOALIE_SAVE_RADIUS + 20 ? 30 : 16
  const targetX = player.home.x + (player.side === 'left' ? stepOut : -stepOut)

  seek(player, { x: targetX, y: targetY }, 0.8, dt)
  player.facing = normalizedVector(ballX - player.pos.x, ballY - player.pos.y, player.facing)
}

/**
 * IA de jugadores de campo.
 *
 * Diferencia claramente el comportamiento por rol:
 * - Atacando: pivot da opción de pase cerca del portador, ala hace carrera
 *   hacia zona de remate, defensa mantiene posición de seguridad.
 * - Defendiendo: defensa presiona/cubre pasillo, ala marca ala rival,
 *   pivot cubre el canal central ante el portador.
 * - Bola suelta: solo el más cercano persigue, los demás apoyan o mantienen.
 */
export function updateFieldPlayerAI(
  players: Player[],
  player: Player,
  ballX: number,
  ballY: number,
  ballCarrierId: string | null,
  dt: number,
) {
  const teammates = players.filter(p => p.team === player.team && p.role !== 'goalie')
  const rivals = players.filter(p => p.team !== player.team && p.role !== 'goalie')
  const hasBall = ballCarrierId === player.id
  const carrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null
  const sameTeamHasBall = carrier?.team === player.team

  const teamChaserOrder = [...teammates].sort((a, b) =>
    Phaser.Math.Distance.Between(a.pos.x, a.pos.y, ballX, ballY) -
    Phaser.Math.Distance.Between(b.pos.x, b.pos.y, ballX, ballY),
  )
  const pressureIndex = teamChaserOrder.findIndex(p => p.id === player.id)

  const advance = player.side === 'left' ? 1 : -1
  const opponentGoalX = getGoalLineX(player.side === 'left' ? 'right' : 'left')

  let target = { ...player.home }
  let intensity = 1

  if (hasBall) {
    // Portador: avanza hacia portería rival manteniendo carril lateral
    target = {
      x: player.pos.x + 80 * advance,
      y: GAME_HEIGHT / 2 + Phaser.Math.Clamp(ballY - GAME_HEIGHT / 2, -130, 130),
    }

  } else if (ballCarrierId === null) {
    // Bola suelta: solo el más cercano la persigue directamente
    if (pressureIndex === 0) {
      target = { x: ballX, y: ballY }
      intensity = 1
    } else if (pressureIndex === 1) {
      target = {
        x: ballX - advance * 48,
        y: ballY + (player.home.y < GAME_HEIGHT / 2 ? -30 : 30),
      }
      intensity = 0.9
    } else {
      target = {
        x: player.home.x + Phaser.Math.Clamp(ballX - player.home.x, -100, 100),
        y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -80, 80),
      }
      intensity = 0.8
    }

  } else if (sameTeamHasBall) {
    // Equipo en posesión: posicionamiento ofensivo por rol
    if (player.role === 'pivot') {
      // Pivot: opción de pase inmediata, ligeramente adelantado al portador
      if (carrier) {
        target = {
          x: carrier.pos.x + advance * 50,
          y: carrier.pos.y + (player.home.y < GAME_HEIGHT / 2 ? -35 : 35),
        }
        intensity = 0.96
      }
    } else if (player.role === 'wing') {
      // Ala: carrera hacia el área de remate por el carril exterior
      const wingY = player.home.y < GAME_HEIGHT / 2
        ? GAME_HEIGHT / 2 - 130
        : GAME_HEIGHT / 2 + 130
      const runX = Phaser.Math.Clamp(opponentGoalX - advance * 180, Math.min(player.home.x, opponentGoalX - 50), Math.max(player.home.x, opponentGoalX - 50))
      target = { x: runX, y: wingY }
      intensity = 0.92
    } else if (player.role === 'defender') {
      // Defensa: no sube demasiado, cubre contraataque desde posición media
      target = {
        x: player.home.x + advance * 55,
        y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -55, 55),
      }
      intensity = 0.8
    } else {
      target = {
        x: player.home.x + advance * 80,
        y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -80, 80),
      }
      intensity = 0.85
    }

  } else {
    // Rival en posesión: cobertura defensiva por rol
    const rivalCarrier = carrier && carrier.team !== player.team ? carrier : null

    if (player.role === 'defender') {
      if (rivalCarrier && pressureIndex === 0) {
        // Defensa más cercana: cierra por delante al portador
        const carrierDir = normalizedVector(rivalCarrier.facing.x, rivalCarrier.facing.y, { x: rivalCarrier.side === 'left' ? 1 : -1, y: 0 })
        target = {
          x: rivalCarrier.pos.x + carrierDir.x * (player.side === 'left' ? -28 : 28),
          y: rivalCarrier.pos.y + carrierDir.y * 16,
        }
        intensity = 1
      } else if (rivalCarrier) {
        // Otra defensa: cubre el pasillo hacia portería propia
        target = {
          x: rivalCarrier.pos.x + (player.side === 'left' ? -85 : 85),
          y: player.home.y + Phaser.Math.Clamp(rivalCarrier.pos.y - player.home.y, -55, 55),
        }
        intensity = 0.88
      } else {
        target = {
          x: player.home.x,
          y: player.home.y + Phaser.Math.Clamp(ballY - player.home.y, -55, 55),
        }
        intensity = 0.8
      }

    } else if (player.role === 'wing') {
      // Ala: marca al ala rival o cubre el carril exterior
      const opposingWing = rivals.find(r => r.role === 'wing' && Math.abs(r.home.y - player.home.y) < 60)
      if (opposingWing && pressureIndex >= 2) {
        target = {
          x: Phaser.Math.Clamp(opposingWing.pos.x, player.home.x - 100, player.home.x + 140),
          y: opposingWing.pos.y,
        }
        intensity = 0.88
      } else if (rivalCarrier) {
        target = {
          x: rivalCarrier.pos.x + (player.side === 'left' ? -110 : 110),
          y: player.home.y + Phaser.Math.Clamp(rivalCarrier.pos.y - player.home.y, -50, 50),
        }
        intensity = 0.84
      } else {
        target = { ...player.home }
        intensity = 0.78
      }

    } else if (player.role === 'pivot') {
      // Pivot: bloquea el canal central frente al portador o cubre el acceso a portería
      if (rivalCarrier && pressureIndex <= 1) {
        target = {
          x: rivalCarrier.pos.x + (player.side === 'left' ? -65 : 65),
          y: GAME_HEIGHT / 2 + Phaser.Math.Clamp(rivalCarrier.pos.y - GAME_HEIGHT / 2, -70, 70),
        }
        intensity = 0.92
      } else if (rivalCarrier) {
        target = {
          x: rivalCarrier.pos.x + (player.side === 'left' ? -130 : 130),
          y: GAME_HEIGHT / 2 + Phaser.Math.Clamp(rivalCarrier.pos.y - GAME_HEIGHT / 2, -80, 80),
        }
        intensity = 0.82
      } else {
        target = { ...player.home }
        intensity = 0.78
      }
    }
  }

  const distToTarget = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, target.x, target.y)
  const canSprint = (player.stamina ?? 100) > STAMINA_LOW_THRESHOLD
  const shouldSprint = canSprint && (
    (ballCarrierId === null && pressureIndex === 0 && distToTarget > 80) ||
    (!sameTeamHasBall && pressureIndex === 0 && distToTarget > 70) ||
    (hasBall && distToTarget > 90)
  )
  player.sprinting = shouldSprint

  seek(player, target, shouldSprint ? intensity * PLAYER_SPRINT_ACCEL_MULTIPLIER : intensity, dt)
  player.facing = normalizedVector(target.x - player.pos.x, target.y - player.pos.y, player.facing)
}

/**
 * El atacante IA está en zona útil de tiro y mira razonablemente hacia la portería.
 *
 * Evita tiros desde ángulos muy cerrados o dando la espalda a portería.
 */
export function shouldAIShoot(player: Player): boolean {
  const goalX = getGoalLineX(player.side === 'right' ? 'left' : 'right')
  const goalY = GAME_HEIGHT / 2

  const dist = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, goalX, goalY)
  if (dist > AI_SHOOT_DISTANCE) return false

  // El jugador debe mirar razonablemente hacia portería
  const dx = goalX - player.pos.x
  const dy = goalY - player.pos.y
  const len = Math.hypot(dx, dy) || 1
  const facing = getAimingDirection(player)
  const dot = facing.x * (dx / len) + facing.y * (dy / len)
  return dot > 0.28
}

/**
 * Dirección de apuntería del jugador. Si facing es el vector cero (estado
 * de inicio), usa el eje natural de su lado para evitar división por cero.
 */
export function getAimingDirection(player: Player) {
  return player.facing.x === 0 && player.facing.y === 0
    ? { x: player.side === 'left' ? 1 : -1, y: 0 }
    : player.facing
}

/**
 * El portero debe distribuir tras asegurar la bola.
 *
 * Se le da una ventana corta de control y después se fuerza la distribución.
 */
export function shouldGoaliePass(player: Player, now: number) {
  const catchTime = player.goalieCatchTime ?? 0
  return catchTime > 0 && now - catchTime >= GOALIE_DISTRIBUTION_DELAY_MS
}

/**
 * El portador IA tiene un compañero desmarcado más cerca del gol rival.
 *
 * Activa una mayor probabilidad de pase para que la IA no solo corra y dispare.
 */
export function shouldAIPassToOpenMate(player: Player, players: Player[]): boolean {
  const teammates = players.filter(p => p.team === player.team && p.role !== 'goalie' && p.id !== player.id)
  const rivals = players.filter(p => p.team !== player.team && p.role !== 'goalie')

  const goalX = getGoalLineX(player.side === 'right' ? 'left' : 'right')
  const goalY = GAME_HEIGHT / 2

  const carrierDist = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, goalX, goalY)

  for (const mate of teammates) {
    const mateDist = Phaser.Math.Distance.Between(mate.pos.x, mate.pos.y, goalX, goalY)
    if (mateDist >= carrierDist - AI_OPEN_MATE_GAP) continue
    const marked = rivals.some(r => Phaser.Math.Distance.Between(r.pos.x, r.pos.y, mate.pos.x, mate.pos.y) < AI_MARK_RADIUS)
    if (!marked) return true
  }
  return false
}

/**
 * Determina si un jugador IA debe intentar un robo este frame.
 *
 * Modula la probabilidad de intento según si el defensor persigue desde atrás
 * (muy bajo éxito) o si el portador va lento. Devuelve false si el portador
 * está fuera de rango o el ángulo de enganche es desfavorable.
 */
export function shouldAIAttemptSteal(player: Player, carrier: Player): boolean {
  const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, carrier.pos.x, carrier.pos.y)
  if (distance > MANUAL_STEAL_RANGE) return false

  const toCarrierX = carrier.pos.x - player.pos.x
  const toCarrierY = carrier.pos.y - player.pos.y
  const len = Math.hypot(toCarrierX, toCarrierY) || 1
  const facingDir = normalizedVector(player.facing.x, player.facing.y, { x: player.side === 'left' ? 1 : -1, y: 0 })
  const engageDot = facingDir.x * (toCarrierX / len) + facingDir.y * (toCarrierY / len)
  if (engageDot < AI_STEAL_ENGAGE_FRONT_DOT) return false

  const carrierSpeed = Math.hypot(carrier.velocity.x, carrier.velocity.y)
  // Desde atrás (ambos van en la misma dirección): porcentaje drásticamente reducido
  const chasingFromBehind = engageDot > 0.6
  const attemptChance = chasingFromBehind
    ? AI_STEAL_ATTEMPT_CHANCE * 0.18
    : carrierSpeed > 150 ? AI_STEAL_ATTEMPT_CHANCE * 0.7 : AI_STEAL_ATTEMPT_CHANCE

  return Math.random() < attemptChance
}

/** Registra el momento en que el portero capturó la bola para el temporizador de distribución. */
export function markGoalieCaughtBall(player: Player, now: number) {
  player.goalieCatchTime = now
}

/** Cancela el temporizador de distribución al completar un pase o tiro. */
export function clearGoalieCatch(player: Player) {
  player.goalieCatchTime = 0
}
