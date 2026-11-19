import * as Phaser from 'phaser'
import {
  AI_STEAL_ENGAGE_FRONT_DOT,
  GOALIE_DISTRIBUTION_DELAY_MS,
  MANUAL_STEAL_RANGE,
  PLAYER_SPRINT_ACCEL_MULTIPLIER,
  STAMINA_LOW_THRESHOLD,
  aiProfileFor,
} from '../constants'
import { aiStateOf } from './aiDecision'
import { seek } from './movement'
import type { Player } from '../types'
import { normalizedVector } from '../utils'

export { updateGoalieAI } from './goalieAI'

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
 * Se le da una ventana corta de control y después se fuerza la distribución. Solo se llama con
 * la bola en su poder.
 */
export function shouldGoaliePass(player: Player, now: number, delayMs = GOALIE_DISTRIBUTION_DELAY_MS) {
  const catchTime = player.goalieCatchTime ?? 0
  // Con la bola y sin reloj (le llegó por un camino que no lo arranca): se arranca ahora, nunca se la queda
  if (catchTime <= 0) {
    player.goalieCatchTime = now
    return false
  }
  return now - catchTime >= delayMs
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
