import * as Phaser from 'phaser'
import {
  AI_STEAL_ENGAGE_FRONT_DOT,
  GAME_HEIGHT,
  GOALIE_AI_MAX_Y,
  GOALIE_AI_TRACK,
  GOALIE_DISTRIBUTION_DELAY_MS,
  GOALIE_SAVE_RADIUS,
  MANUAL_STEAL_RANGE,
  PLAYER_SPRINT_ACCEL_MULTIPLIER,
  STAMINA_LOW_THRESHOLD,
  aiProfileFor,
} from '../constants'
import { aiStateOf } from './aiDecision'
import { seek } from './movement'
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
  const targetY = Phaser.Math.Clamp(goalCenterY + dyBall * angleWeight * GOALIE_AI_TRACK, goalCenterY - GOALIE_AI_MAX_Y, goalCenterY + GOALIE_AI_MAX_Y)

  const ballDistance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, ballX, ballY)
  const stepOut = ballDistance < GOALIE_SAVE_RADIUS + 20 ? 30 : 16
  const targetX = player.home.x + (player.side === 'left' ? stepOut : -stepOut)

  seek(player, { x: targetX, y: targetY }, 0.8, dt)
  player.facing = normalizedVector(ballX - player.pos.x, ballY - player.pos.y, player.facing)
}

const seekTarget = { x: 0, y: 0 }

/**
 * IA de jugadores de campo: ejecuta el plan del paso que dejó prepareTeamAI
 * (aiTeam.ts) — destino, intensidad, sprint y si mira a la bola.
 */
export function updateFieldPlayerAI(
  _players: Player[],
  player: Player,
  ballX: number,
  ballY: number,
  _ballCarrierId: string | null,
  dt: number,
) {
  const st = aiStateOf(player)
  const canSprint = (player.stamina ?? 100) > STAMINA_LOW_THRESHOLD
  player.sprinting = canSprint && st.sprint
  seekTarget.x = st.tx
  seekTarget.y = st.ty
  seek(player, seekTarget, player.sprinting ? st.intensity * PLAYER_SPRINT_ACCEL_MULTIPLIER : st.intensity, dt)
  const fx = st.faceBall ? ballX - player.pos.x : st.tx - player.pos.x
  const fy = st.faceBall ? ballY - player.pos.y : st.ty - player.pos.y
  const len = Math.hypot(fx, fy)
  // Sin destino ni bola que mirar conserva la mirada (evita girar en el sitio)
  if (len > 4) player.facing = { x: fx / len, y: fy / len }
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
 * Determina si un jugador IA debe intentar un robo este frame.
 *
 * Modula la probabilidad de intento según si el defensor persigue desde atrás
 * (muy bajo éxito) o si el portador va lento. Devuelve false si el portador
 * está fuera de rango o el ángulo de enganche es desfavorable.
 */
export function shouldAIAttemptSteal(player: Player, carrier: Player, arcade = false): boolean {
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
  const profile = aiProfileFor(player.team)
  const base = profile.stealAttemptChance * (arcade ? profile.arcadeStealScale : 1)
  const attemptChance = chasingFromBehind
    ? base * 0.18
    : carrierSpeed > 150 ? base * 0.7 : base

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
