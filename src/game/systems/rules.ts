import type { Player, TeamColor } from '../types'

/** Estado mínimo de reglas para empezar a soportar faltas y bullys. */
export type RuleState = {
  pendingFoul: null | {
    againstTeam: TeamColor
    byPlayerId: string
    victimPlayerId: string
    restartX: number
    restartY: number
    message: string
  }
  pendingBully: null | {
    x: number
    y: number
    message: string
  }
}

export function createRuleState(): RuleState {
  return {
    pendingFoul: null,
    pendingBully: null,
  }
}

export function registerStealFoul(state: RuleState, offender: Player, victim: Player, restartX: number, restartY: number) {
  state.pendingFoul = {
    againstTeam: offender.team,
    byPlayerId: offender.id,
    victimPlayerId: victim.id,
    restartX,
    restartY,
    message: `Falta de ${offender.team === 'blue' ? 'azul' : 'rojo'}`,
  }
}

export function registerBully(state: RuleState, x: number, y: number) {
  state.pendingBully = {
    x,
    y,
    message: 'Bully',
  }
}
