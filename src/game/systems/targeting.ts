import * as Phaser from 'phaser'
import { GAME_HEIGHT, PASS_ASSIST_BLEND, PASS_ASSIST_CONE_DOT, RINK, SHOT_ASSIST_BLEND } from '../constants'
import type { Player, Vector } from '../types'

/**
 * Elige el mejor receptor de pase en función de la mirada del pasador y la
 * distancia al gol rival. Solo considera compañeros dentro del cono frontal
 * definido por PASS_ASSIST_CONE_DOT.
 *
 * @returns El jugador con mejor puntuación, o null si no hay ninguno válido.
 */
export function getBestPassTarget(players: Player[], player: Player): Player | null {
  const teammates = players.filter(
    (c) => c.team === player.team && c.id !== player.id && c.role !== 'goalie',
  )
  const facingLength = Math.hypot(player.facing.x, player.facing.y) || 1
  const facing = { x: player.facing.x / facingLength, y: player.facing.y / facingLength }

  return teammates
    .map((candidate) => {
      const dx = candidate.pos.x - player.pos.x
      const dy = candidate.pos.y - player.pos.y
      const distance = Math.hypot(dx, dy) || 1
      const dir = { x: dx / distance, y: dy / distance }
      const facingDot = facing.x * dir.x + facing.y * dir.y
      // Penalizar por distancia para evitar pases innecesariamente largos
      const score = facingDot * 180 - distance * 0.3
      return { candidate, score, facingDot }
    })
    .filter((entry) => entry.facingDot >= PASS_ASSIST_CONE_DOT)
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null
}

/**
 * Calcula una dirección de pase que mezcla el facing del jugador con la
 * dirección exacta al mejor compañero disponible (PASS_ASSIST_BLEND).
 *
 * La asistencia evita pasar completamente en perpendicular al movimiento,
 * pero no sustituye la dirección del jugador — sigue siendo necesario mirar
 * vagamente hacia el receptor.
 */
export function getAssistedPassDirection(players: Player[], player: Player, fallbackDirection: Vector): Vector {
  const target = getBestPassTarget(players, player)
  if (!target) return fallbackDirection

  const raw = { x: target.pos.x - player.pos.x, y: target.pos.y - player.pos.y }
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
 * La corrección vertical se limita a ±36 px desde el centro para no forzar
 * tiros al palo en jugadores muy adelantados.
 */
export function getAssistedShotDirection(player: Player, fallbackDirection: Vector): Vector {
  const targetX = player.side === 'left' ? RINK.x + RINK.width + 24 : RINK.x - 24
  const targetY = GAME_HEIGHT / 2 + Phaser.Math.Clamp(player.pos.y - GAME_HEIGHT / 2, -36, 36)

  const raw = { x: targetX - player.pos.x, y: targetY - player.pos.y }
  const rawLength = Math.hypot(raw.x, raw.y) || 1
  const goalDirection = { x: raw.x / rawLength, y: raw.y / rawLength }

  const blended = {
    x: fallbackDirection.x * (1 - SHOT_ASSIST_BLEND) + goalDirection.x * SHOT_ASSIST_BLEND,
    y: fallbackDirection.y * (1 - SHOT_ASSIST_BLEND) + goalDirection.y * SHOT_ASSIST_BLEND,
  }
  const length = Math.hypot(blended.x, blended.y) || 1
  return { x: blended.x / length, y: blended.y / length }
}
