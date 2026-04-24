import type { Player, Vector } from './types'

export function normalizedVector(x: number, y: number, fallback: Vector): Vector {
  const length = Math.hypot(x, y)
  if (length < 0.001) return fallback
  return { x: x / length, y: y / length }
}

export function getRoleShort(role: Player['role']) {
  switch (role) {
    case 'goalie': return 'POR'
    case 'defender': return 'DEF'
    case 'wing': return 'ALA'
    case 'pivot': return 'PIV'
  }
}

export function getRoleName(role: Player['role']) {
  switch (role) {
    case 'goalie': return 'portero'
    case 'defender': return 'defensa'
    case 'wing': return 'ala'
    case 'pivot': return 'pivote'
  }
}
