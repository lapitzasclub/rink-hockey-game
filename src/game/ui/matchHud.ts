import type { Scoreboard } from './scoreboard'
import type { Player } from '../types'
import type { RuleState } from '../systems/rules'

/** Refresca el videomarcador común (goles, periodo, reloj, faltas y sancionados). */
export function updateMatchHud(options: {
  scoreboard: Scoreboard
  remainingSeconds: number
  currentPeriod: number
  blueScore: number
  redScore: number
  ruleState: RuleState
  players: Player[]
  timeNow: number
}) {
  const suspensions = options.players
    .filter(p => p.suspendedUntil && p.suspendedUntil > options.timeNow)
    .map(p => ({ team: p.team, secondsLeft: Math.ceil((p.suspendedUntil! - options.timeNow) / 1000) }))
  options.scoreboard.update({
    blueScore: options.blueScore,
    redScore: options.redScore,
    remainingSeconds: options.remainingSeconds,
    currentPeriod: options.currentPeriod,
    teamFouls: options.ruleState.teamFouls,
    suspensions,
  })
}
