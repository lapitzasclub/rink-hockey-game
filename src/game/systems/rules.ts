import { BLUE_CARD_DURATION_MS, DIRECT_FREE_HIT_FOUL_THRESHOLD } from '../constants'
import { SANCTION } from '../types'
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

/** Emite una tarjeta azul al jugador: lo suspende BLUE_CARD_DURATION_MS. */
export function registerBlueCard(player: Player, timeNow: number) {
  player.suspendedUntil = timeNow + BLUE_CARD_DURATION_MS
}

export function registerStealFoul(state: RuleState, offender: Player, victim: Player, restartX: number, restartY: number, timeNow: number) {
  state.teamFouls[offender.team] += 1
  const fouls = state.teamFouls[offender.team]
  const isDirect = fouls >= DIRECT_FREE_HIT_FOUL_THRESHOLD
  const sanction = isDirect ? SANCTION.DIRECT_FREE_HIT : SANCTION.FREE_HIT

  if (isDirect) registerBlueCard(offender, timeNow)

  state.pendingFoul = {
    againstTeam: offender.team,
    byPlayerId: offender.id,
    victimPlayerId: victim.id,
    restartX,
    restartY,
    sanction,
    message: isDirect
      ? `Tarjeta azul, ${offender.team === 'blue' ? 'azul' : 'rojo'} (${fouls} faltas)`
      : `Falta de ${offender.team === 'blue' ? 'azul' : 'rojo'} (${fouls})`,
  }
}

/** Falta por invasión de la zona del portero mientras este tiene el balón. */
export function registerGoalieZoneFoul(state: RuleState, offender: Player, goalie: Player, timeNow: number) {
  state.teamFouls[offender.team] += 1
  const fouls = state.teamFouls[offender.team]
  registerBlueCard(offender, timeNow)

  const advance = goalie.side === 'left' ? -1 : 1
  state.pendingFoul = {
    againstTeam: offender.team,
    byPlayerId: offender.id,
    victimPlayerId: goalie.id,
    restartX: goalie.pos.x + advance * 40,
    restartY: goalie.pos.y,
    sanction: SANCTION.DIRECT_FREE_HIT,
    message: `Tarjeta azul — invasión zona portero (${fouls})`,
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
