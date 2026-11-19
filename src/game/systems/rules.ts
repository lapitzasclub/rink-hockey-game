import {
  BLUE_CARD_DURATION_MS, CLEAR_CHANCE_LANE, CLEAR_CHANCE_MAX_DIST, FREE_HIT_BOARD_MARGIN, GAME_HEIGHT,
  PENALTY_AREA_DEPTH, PENALTY_AREA_HEIGHT, RINK, TEAM_FOUL_DIRECT_EVERY, TEAM_FOUL_DIRECT_FIRST,
} from '../constants'
import { gameToRealMs } from './matchClock'
import { SANCTION } from '../types'
import type { Player, TeamColor } from '../types'
import { nombreDeHueco } from '../externalMatch'
import { getGoalLineX } from '../utils'

export type BullyParticipant = {
  bluePlayerId: string
  redPlayerId: string
}

/** Faltas de equipo del partido (no se reinician en el descanso, art. 17.2) y reinicios pendientes. */
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
  // 2 minutos de juego, no reales: con el reloj acelerado duran lo mismo en proporción a la parte
  player.suspendedUntil = timeNow + gameToRealMs(BLUE_CARD_DURATION_MS)
}

/** Área de penalti que defiende `side`: 9 × 5,40 m delante de la línea de gol; las líneas cuentan como dentro. */
export function insideGoalArea(side: Player['side'], x: number, y: number) {
  const gx = getGoalLineX(side)
  const depth = side === 'left' ? x - gx : gx - x
  return Math.abs(y - GAME_HEIGHT / 2) <= PENALTY_AREA_HEIGHT / 2 && depth >= 0 && depth <= PENALTY_AREA_DEPTH
}

/** Esquina del área más cercana, sobre la línea de gol: saques de lo que pasa detrás de la portería. */
function areaCorner(side: Player['side'], y: number) {
  return { x: getGoalLineX(side), y: GAME_HEIGHT / 2 + (y < GAME_HEIGHT / 2 ? -1 : 1) * PENALTY_AREA_HEIGHT / 2 }
}

/** La 10.ª falta de equipo y cada 5 más dan libre directo (art. 23.3). */
export function teamFoulGivesDirect(fouls: number) {
  return fouls >= TEAM_FOUL_DIRECT_FIRST && (fouls - TEAM_FOUL_DIRECT_FIRST) % TEAM_FOUL_DIRECT_EVERY === 0
}

/**
 * Ocasión clara de gol: el que sufre la falta lleva la bola, está cerca de la
 * portería rival, va hacia ella y no tiene ningún defensor de campo delante.
 */
function isClearChance(players: Player[], offender: Player, victim: Player, timeNow: number) {
  const gx = getGoalLineX(offender.side)
  const gy = GAME_HEIGHT / 2
  if (Math.hypot(victim.pos.x - gx, victim.pos.y - gy) > CLEAR_CHANCE_MAX_DIST) return false
  const toGoal = offender.side === 'left' ? -1 : 1
  if ((victim.velocity.x * toGoal) < 40) return false
  for (const d of players) {
    if (d.team !== offender.team || d.role === 'goalie' || d.id === offender.id) continue
    if (d.suspendedUntil && d.suspendedUntil > timeNow) continue
    const ahead = (d.pos.x - victim.pos.x) * toGoal > 0
    if (ahead && Math.abs(d.pos.y - victim.pos.y) < CLEAR_CHANCE_LANE) return false
  }
  return true
}

/** Quien saca la falta: el que la sufre, salvo que sea el portero (saca el compañero de campo más cercano). */
function pickTaker(players: Player[], victim: Player, timeNow: number) {
  if (victim.role !== 'goalie') return victim
  let best: Player | null = null
  let bestD = Infinity
  for (const p of players) {
    if (p.team !== victim.team || p.role === 'goalie') continue
    if (p.suspendedUntil && p.suspendedUntil > timeNow) continue
    const d = Math.hypot(p.pos.x - victim.pos.x, p.pos.y - victim.pos.y)
    if (d < bestD) { bestD = d; best = p }
  }
  return best ?? victim
}

const teamLabel = (team: TeamColor) => nombreDeHueco(team, team === 'blue' ? 'azul' : 'rojo')

/**
 * Señala una falta en juego activo y decide el reinicio (art. 23, 24, 27–29):
 * - dentro del área del infractor → penalti;
 * - cortando una ocasión clara → libre directo;
 * - falta de equipo → libre indirecto, salvo la 10.ª, 15.ª… que dan libre directo;
 * - grave (`serious`) → además tarjeta azul, y no cuenta como falta de equipo.
 * Penalti y ocasión clara no se anotan como falta de equipo (art. 23.7).
 */
export function registerFoul(state: RuleState, options: {
  players: Player[]
  offender: Player
  victim: Player
  x: number
  y: number
  timeNow: number
  serious?: boolean
}) {
  const { players, offender, victim, timeNow, serious = false } = options
  let { x, y } = options
  // Falta del defensor detrás de su portería: se saca en la esquina del área (art. 27.2.c)
  const gl = getGoalLineX(offender.side)
  if (offender.side === 'left' ? x < gl : x > gl) ({ x, y } = areaCorner(offender.side, y))
  const taker = pickTaker(players, victim, timeNow)
  const inArea = insideGoalArea(offender.side, x, y)
  const clear = !inArea && victim.role !== 'goalie' && isClearChance(players, offender, victim, timeNow)

  let sanction: NonNullable<RuleState['pendingFoul']>['sanction'] = SANCTION.FREE_HIT
  let reason = ''
  if (inArea) {
    sanction = SANCTION.PENALTY
    reason = 'Penalti'
  } else if (clear) {
    sanction = SANCTION.DIRECT_FREE_HIT
    reason = 'Libre directo · ocasión clara'
  } else if (!serious) {
    state.teamFouls[offender.team] += 1
    const fouls = state.teamFouls[offender.team]
    if (teamFoulGivesDirect(fouls)) {
      sanction = SANCTION.DIRECT_FREE_HIT
      reason = `Libre directo · ${fouls}.ª falta de ${teamLabel(offender.team)}`
    } else {
      reason = `Falta de ${teamLabel(offender.team)} (${fouls})${fouls === TEAM_FOUL_DIRECT_FIRST - 1 || (fouls > TEAM_FOUL_DIRECT_FIRST && teamFoulGivesDirect(fouls + 1)) ? ' · ¡la próxima, directo!' : ''}`
    }
  } else {
    reason = `Falta grave de ${teamLabel(offender.team)}`
  }
  if (serious) {
    registerBlueCard(offender, timeNow)
    reason = `Tarjeta azul · ${reason}`
  }

  // Libre indirecto pegado a la valla: la bola se separa 70 cm (art. 27.2.d)
  const m = FREE_HIT_BOARD_MARGIN
  state.pendingFoul = {
    againstTeam: offender.team,
    byPlayerId: offender.id,
    victimPlayerId: taker.id,
    restartX: Math.min(Math.max(x, RINK.x + m), RINK.x + RINK.width - m),
    restartY: Math.min(Math.max(y, RINK.y + m), RINK.y + RINK.height - m),
    sanction,
    message: reason,
  }
}

/** Falta en un intento de robo al portador (contacto, enganche, empujón). */
export function registerStealFoul(state: RuleState, players: Player[], offender: Player, victim: Player, timeNow: number, serious: boolean) {
  registerFoul(state, { players, offender, victim, x: victim.pos.x, y: victim.pos.y, timeNow, serious })
}

/**
 * Invadir la zona protegida del portero mientras tiene la bola: obstrucción,
 * falta de equipo con libre indirecto para el equipo del portero.
 */
export function registerGoalieZoneFoul(state: RuleState, players: Player[], offender: Player, goalie: Player, timeNow: number) {
  const advance = goalie.side === 'left' ? 1 : -1
  registerFoul(state, { players, offender, victim: goalie, x: goalie.pos.x + advance * 60, y: goalie.pos.y, timeNow })
  if (state.pendingFoul && state.pendingFoul.sanction === SANCTION.FREE_HIT) {
    state.pendingFoul.message = `Falta al portero · ${state.pendingFoul.message}`
  }
}

/**
 * Saque neutral (el antiguo bully, art. 13): bola trabada sin saber quién la tiene.
 * Si queda detrás de la portería se saca en la esquina del área más cercana (art. 13.3.c).
 */
export function registerBully(state: RuleState, x: number, y: number, participants: BullyParticipant) {
  let at = { x, y }
  for (const side of ['left', 'right'] as const) {
    const gx = getGoalLineX(side)
    if (side === 'left' ? x < gx : x > gx) at = areaCorner(side, y)
  }
  state.pendingBully = {
    x: at.x,
    y: at.y,
    message: 'Saque neutral',
    participants,
  }
}
