import * as Phaser from 'phaser'
import { GAME_HEIGHT, PASS_ASSIST_BLEND, PASS_ASSIST_CONE_DOT, PASS_HUMAN_LEAD_S, PASS_LANE_BLOCK_PENALTY, PASS_LANE_CLEAR_DIST, SHOT_AIM_MAX_OFFSET, SHOT_ASSIST_BLEND, SHOT_ASSIST_BLEND_HUMAN, aiProfileFor } from '../constants'
import type { Player, Vector } from '../types'
import { autopilot } from './playerControl'
import { getGoalLineX } from '../utils'

/**
 * Pase de la IA ya decidido (aiDecision): dirección exacta hacia el punto
 * anticipado del receptor. Se consume en el siguiente getAssistedPassDirection.
 */
const aiPassAim = { playerId: '', x: 0, y: 0 }

export function setAIPassAim(playerId: string, x: number, y: number) {
  aiPassAim.playerId = playerId
  aiPassAim.x = x
  aiPassAim.y = y
}

/**
 * Último pase de jugador de campo (humano o IA): receptor previsto. La IA de
 * equipo lo lee al quedar la bola suelta para que el receptor vaya a por ella.
 */
export const passIntent = { serial: 0, team: 'blue' as Player['team'], receiverId: '' }

/**
 * Elige el mejor receptor de pase en función de la mirada del pasador y la
 * distancia al gol rival. Solo considera compañeros dentro del cono frontal
 * definido por PASS_ASSIST_CONE_DOT; un rival cerca de la línea penaliza.
 *
 * @returns El jugador con mejor puntuación, o null si no hay ninguno válido.
 */
export function getBestPassTarget(players: Player[], player: Player): Player | null {
  const facingLength = Math.hypot(player.facing.x, player.facing.y) || 1
  const fx = player.facing.x / facingLength
  const fy = player.facing.y / facingLength
  let best: Player | null = null
  let bestScore = -Infinity
  for (const candidate of players) {
    if (candidate.team !== player.team || candidate.id === player.id || candidate.role === 'goalie') continue
    const dx = candidate.pos.x - player.pos.x
    const dy = candidate.pos.y - player.pos.y
    const distance = Math.hypot(dx, dy) || 1
    const facingDot = fx * (dx / distance) + fy * (dy / distance)
    if (facingDot < PASS_ASSIST_CONE_DOT) continue
    // Penalizar por distancia para evitar pases innecesariamente largos
    const score = facingDot * 180 - distance * 0.3 - laneBlockPenalty(players, player, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/** Penalización (0..PASS_LANE_BLOCK_PENALTY) por rivales cerca de la línea pasador→receptor. */
function laneBlockPenalty(players: Player[], from: Player, to: Player) {
  const sx = to.pos.x - from.pos.x
  const sy = to.pos.y - from.pos.y
  const len2 = sx * sx + sy * sy || 1
  let closest = Infinity
  for (const r of players) {
    if (r.team === from.team || r.role === 'goalie') continue
    const u = Math.min(1, Math.max(0, ((r.pos.x - from.pos.x) * sx + (r.pos.y - from.pos.y) * sy) / len2))
    const d = Math.hypot(r.pos.x - (from.pos.x + sx * u), r.pos.y - (from.pos.y + sy * u))
    if (d < closest) closest = d
  }
  return closest >= PASS_LANE_CLEAR_DIST ? 0 : PASS_LANE_BLOCK_PENALTY * (1 - closest / PASS_LANE_CLEAR_DIST)
}

/**
 * Calcula una dirección de pase que mezcla el facing del jugador con la
 * dirección al mejor compañero disponible (PASS_ASSIST_BLEND), apuntando a
 * donde estará. Si la IA ya decidió el pase, sale exacto hacia su punto.
 *
 * La asistencia evita pasar completamente en perpendicular al movimiento,
 * pero no sustituye la dirección del jugador — sigue siendo necesario mirar
 * vagamente hacia el receptor.
 */
export function getAssistedPassDirection(players: Player[], player: Player, fallbackDirection: Vector): Vector {
  const target = getBestPassTarget(players, player)
  if (aiPassAim.playerId === player.id) {
    aiPassAim.playerId = ''
    notePassIntent(player, target)
    return { x: aiPassAim.x, y: aiPassAim.y }
  }
  notePassIntent(player, target)
  if (!target) return fallbackDirection

  const lead = PASS_HUMAN_LEAD_S
  const raw = { x: target.pos.x + target.velocity.x * lead - player.pos.x, y: target.pos.y + target.velocity.y * lead - player.pos.y }
  const rawLength = Math.hypot(raw.x, raw.y) || 1
  const dirToMate = { x: raw.x / rawLength, y: raw.y / rawLength }

  const blended = {
    x: fallbackDirection.x * (1 - PASS_ASSIST_BLEND) + dirToMate.x * PASS_ASSIST_BLEND,
    y: fallbackDirection.y * (1 - PASS_ASSIST_BLEND) + dirToMate.y * PASS_ASSIST_BLEND,
  }
  const length = Math.hypot(blended.x, blended.y) || 1
  return { x: blended.x / length, y: blended.y / length }
}

function notePassIntent(player: Player, target: Player | null) {
  passIntent.serial++
  passIntent.team = player.team
  passIntent.receiverId = target?.id ?? ''
}

/**
 * Elige el compañero de campo óptimo para la distribución del portero.
 *
 * Prioriza compañeros adelantados y no demasiado cercanos. La penalización
 * por distancia corta evita distribuciones que el rival puede interceptar
 * casi sin moverse.
 *
 * @returns El jugador más adecuado, o null si el equipo no tiene campo despejado.
 */
export function getGoalieDistributionTarget(players: Player[], player: Player): Player | null {
  const best = players
    .filter((c) => c.team === player.team && c.id !== player.id && c.role !== 'goalie')
    .map((candidate) => {
      const dx = candidate.pos.x - player.pos.x
      const dy = candidate.pos.y - player.pos.y
      const distance = Math.hypot(dx, dy) || 1
      const forward = player.side === 'left' ? dx / distance : -dx / distance
      const tooClosePenalty = distance < 140 ? (140 - distance) * 2.2 : 0
      const score = forward * 240 - Math.abs(dy) * 0.2 - distance * 0.05 - tooClosePenalty
      return { candidate, score }
    })
    .sort((a, b) => b.score - a.score)[0]

  return best?.candidate ?? null
}

/**
 * Devuelve la dirección normalizada para la distribución del portero.
 *
 * Si hay un compañero válido, apunta directamente hacia él. Si no lo hay,
 * despeja en diagonal hacia el carril lateral de su propio campo.
 */
export function getGoalieDistributionDirection(players: Player[], player: Player): Vector {
  const target = getGoalieDistributionTarget(players, player)
  if (target) {
    const dx = target.pos.x - player.pos.x
    const dy = target.pos.y - player.pos.y
    const distance = Math.hypot(dx, dy) || 1
    return { x: dx / distance, y: dy / distance }
  }
  // Despeje lateral por defecto cuando no hay receptor
  return {
    x: player.side === 'left' ? 0.96 : -0.96,
    y: player.pos.y < GAME_HEIGHT / 2 ? 0.28 : -0.28,
  }
}

/**
 * Combina la mirada del portador con la dirección al centro de la portería
 * rival (SHOT_ASSIST_BLEND) para reducir tiros absurdos en ángulo cerrado.
 *
 * La corrección vertical se limita a ±SHOT_AIM_MAX_OFFSET px desde el centro para no forzar
 * tiros al palo en jugadores muy adelantados.
 */
export function getAssistedShotDirection(player: Player, fallbackDirection: Vector): Vector {
  // Se apunta a la línea de gol (no al fondo de pista): con la boca real, el error angular importa
  const targetX = getGoalLineX(player.side === 'left' ? 'right' : 'left')
  const targetY = GAME_HEIGHT / 2 + Phaser.Math.Clamp(player.pos.y - GAME_HEIGHT / 2, -SHOT_AIM_MAX_OFFSET, SHOT_AIM_MAX_OFFSET)

  const raw = { x: targetX - player.pos.x, y: targetY - player.pos.y }
  const rawLength = Math.hypot(raw.x, raw.y) || 1
  const goalDirection = { x: raw.x / rawLength, y: raw.y / rawLength }

  // La IA (rojo, porteros y el azul con piloto automático) apunta exacto; el humano conserva influencia sobre la dirección
  const isAi = player.team === 'red' || player.role === 'goalie' || autopilot.on
  const blend = isAi ? SHOT_ASSIST_BLEND : SHOT_ASSIST_BLEND_HUMAN
  const bx = fallbackDirection.x * (1 - blend) + goalDirection.x * blend
  const by = fallbackDirection.y * (1 - blend) + goalDirection.y * blend
  // Precisión del perfil de IA (E-04): error angular uniforme
  const error = isAi ? aiProfileFor(player.team).shotErrorRad : 0
  const angle = Math.atan2(by, bx) + (error > 0 ? (Math.random() * 2 - 1) * error : 0)
  return { x: Math.cos(angle), y: Math.sin(angle) }
}
