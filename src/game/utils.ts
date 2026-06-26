import { GOAL_LINE_OFFSET, RINK } from './constants'
import type { Player, TeamSide, Vector } from './types'

/**
 * Normaliza un vector (x, y). Si la magnitud es prácticamente cero devuelve
 * el fallback, evitando división por cero en estados de reposo o de inicio.
 */
export function normalizedVector(x: number, y: number, fallback: Vector): Vector {
  const length = Math.hypot(x, y)
  if (length < 0.001) return fallback
  return { x: x / length, y: y / length }
}

/** Coordenada X de la línea de portería según el lado de la pista. */
export function getGoalLineX(side: TeamSide): number {
  return side === 'left'
    ? RINK.x + GOAL_LINE_OFFSET
    : RINK.x + RINK.width - GOAL_LINE_OFFSET
}

const ROLE_SHORT: Record<Player['role'], string> = {
  goalie: 'POR',
  defender: 'DEF',
  wing: 'ALA',
  pivot: 'PIV',
}

const ROLE_NAME: Record<Player['role'], string> = {
  goalie: 'portero',
  defender: 'defensa',
  wing: 'ala',
  pivot: 'pivote',
}

/** Abreviatura de tres letras del rol, para etiquetas en pista. */
export function getRoleShort(role: Player['role']) { return ROLE_SHORT[role] }

/** Nombre completo del rol en español, para el HUD del jugador controlado. */
export function getRoleName(role: Player['role']) { return ROLE_NAME[role] }
