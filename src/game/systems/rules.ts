import type { Player, TeamColor } from '../types'

export type BullyParticipant = {
  bluePlayerId: string
  redPlayerId: string
}

/** Estado mínimo de reglas para empezar a soportar faltas y bullys. */
export type RuleState = {
  teamFouls: Record<TeamColor, number>
  period: number
  pendingFoul: null | {
    againstTeam: TeamColor
    byPlayerId: string
    victimPlayerId: string
    restartX: number
    restartY: number
    message: string
    sanction: 'free-hit' | 'direct-free-hit' | 'penalty'
  }
  pendingBully: null | {
    x: number
    y: number
    message: string
    participants: BullyParticipant
  }
}

export function createRuleState(): RuleState {
  return {
    teamFouls: { blue: 0, red: 0 },
    period: 1,
    pendingFoul: null,
    pendingBully: null,
  }
}

export function registerStealFoul(state: RuleState, offender: Player, victim: Player, restartX: number, restartY: number) {
  state.teamFouls[offender.team] += 1
  const fouls = state.teamFouls[offender.team]
  const sanction = fouls >= 10 ? 'direct-free-hit' : 'free-hit'

  state.pendingFoul = {
    againstTeam: offender.team,
    byPlayerId: offender.id,
    victimPlayerId: victim.id,
    restartX,
    restartY,
    sanction,
    message: sanction === 'direct-free-hit'
      ? `Falta directa, ${offender.team === 'blue' ? 'azul' : 'rojo'} suma ${fouls}`
      : `Falta de ${offender.team === 'blue' ? 'azul' : 'rojo'} (${fouls})`,
  }
}

export function registerBully(state: RuleState, x: number, y: number, participants: BullyParticipant) {
  state.pendingBully = {
    x,
    y,
    message: 'Bully',
    participants,
  }
}
