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
  /** Tiempo de posesión y juego pasivo (B-10); lo avanza passivity.ts. */
  passivity: PassivityState
}

export type PassivityKind = 'possession' | 'passive' | 'kickoff'

/** Contadores de posesión y pasividad del equipo con la bola (tiempos en simNow). */
export type PassivityState = {
  /** Equipo en posesión (último que controló la bola); null tras un parón hasta que alguien la controle. */
  team: TeamColor | null
  /** Ya pisó campo rival en esta posesión: al volver a su campo solo tiene PASSIVITY.returnMs. */
  crossed: boolean
  /** simNow en que la bola entró en su campo (-1 = el tiempo de posesión no corre) y su límite. */
  ownSince: number
  limitMs: number
  /** Qué límite corre en ownSince: posesión normal o los 5 s del saque de centro (art. 5.7). */
  limitKind: 'possession' | 'kickoff'
  /** Marca que deja el saque de centro al soltar la bola; updatePassivity la consume. */
  kickoffTeam: TeamColor | null
  kickoffAt: number
  /** Juego pasivo en campo rival: ms sin avanzar ni presión, mejor distancia a la portería y aviso. */
  idleMs: number
  bestDist: number
  warned: boolean
  warnElapsedMs: number
  lastStep: number
  /** Lo que enseña el HUD: tipo, equipo y ms que quedan. */
  hudKind: PassivityKind | null
  hudTeam: TeamColor
  hudMs: number
  /** Para el humo: pitadas por equipo y tipo, avisos y veces que aparece la cuenta atrás. */
  stats: { possession: Record<TeamColor, number>, passive: Record<TeamColor, number>, kickoff: Record<TeamColor, number>, warnings: Record<TeamColor, number>, countdowns: number }
}

export function createPassivityState(): PassivityState {
  return {
    team: null, crossed: false, ownSince: -1, limitMs: 0, limitKind: 'possession', kickoffTeam: null, kickoffAt: 0, idleMs: 0, bestDist: Infinity, warned: false, warnElapsedMs: 0,
    lastStep: -Infinity, hudKind: null, hudTeam: 'blue', hudMs: 0,
    stats: { possession: { blue: 0, red: 0 }, passive: { blue: 0, red: 0 }, kickoff: { blue: 0, red: 0 }, warnings: { blue: 0, red: 0 }, countdowns: 0 },
  }
}

export function createRuleState(): RuleState {
  return {
    teamFouls: { blue: 0, red: 0 },
    period: 1,
    pendingFoul: null,
    pendingBully: null,
    passivity: createPassivityState(),
  }
}

/** Emite una tarjeta azul al jugador: lo suspende BLUE_CARD_DURATION_MS. */
export function registerBlueCard(player: Player, timeNow: number) {
  // 2 minutos de juego, no reales: con el reloj acelerado duran lo mismo en proporción a la parte
  player.suspendedUntil = timeNow + gameToRealMs(BLUE_CARD_DURATION_MS)
  // Ya en camino al banquillo: el pintado no lo sienta de golpe en el mismo paso
  if (!player.penPhase) {
    player.penPhase = 'out'
    player.penPhaseAt = timeNow
  }
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
 * Tiempo de posesión agotado o juego pasivo tras el aviso: libre indirecto para el rival
 * donde está la bola, sin falta de equipo. Saca el jugador de campo rival más cercano a la bola.
 * Dentro del área del infractor se saca en el borde del área; detrás de su portería, en la esquina.
 */
export function registerPassivity(state: RuleState, players: Player[], team: TeamColor, kind: PassivityKind, x: number, y: number, timeNow: number) {
  let offender: Player | null = null
  let taker: Player | null = null
  let dOff = Infinity
  let dTaker = Infinity
  for (const p of players) {
    if (p.role === 'goalie' || (p.suspendedUntil && p.suspendedUntil > timeNow)) continue
    const d = Math.hypot(p.pos.x - x, p.pos.y - y)
    if (p.team === team) { if (d < dOff) { dOff = d; offender = p } } else if (d < dTaker) { dTaker = d; taker = p }
  }
  if (!offender || !taker) return
  const side = offender.side
  const gl = getGoalLineX(side)
  if (side === 'left' ? x < gl : x > gl) ({ x, y } = areaCorner(side, y))
  else if (insideGoalArea(side, x, y)) x = gl + (side === 'left' ? 1 : -1) * (PENALTY_AREA_DEPTH + FREE_HIT_BOARD_MARGIN)
  const m = FREE_HIT_BOARD_MARGIN
  state.passivity.stats[kind][team] += 1
  state.pendingFoul = {
    againstTeam: team,
    byPlayerId: offender.id,
    victimPlayerId: taker.id,
    restartX: Math.min(Math.max(x, RINK.x + m), RINK.x + RINK.width - m),
    restartY: Math.min(Math.max(y, RINK.y + m), RINK.y + RINK.height - m),
    sanction: SANCTION.FREE_HIT,
    message: kind === 'kickoff'
      ? `Cinco segundos de saque de ${teamLabel(team)} · libre indirecto`
      : `${kind === 'possession' ? 'Tiempo de posesión' : 'Juego pasivo'} de ${teamLabel(team)} · libre indirecto`,
  }
}

/**
 * R-03 · gol anulado por entrar directo de un saque de centro (art. 5.8: libre indirecto para el
 * que defendía) o de un libre indirecto (art. 7.3.b: saque neutral), en la esquina inferior del
 * área más cercana a donde entró la bola. `y` es la altura de entrada.
 */
export function registerAnnulledGoal(state: RuleState, players: Player[], scorer: TeamColor, kind: 'kickoff' | 'free-hit', y: number, timeNow: number) {
  const defender: TeamColor = scorer === 'blue' ? 'red' : 'blue'
  const side = players.find(p => p.team === defender)?.side
  if (!side) return
  const at = areaCorner(side, y)
  let atk: Player | null = null
  let def: Player | null = null
  let dAtk = Infinity
  let dDef = Infinity
  for (const p of players) {
    if (p.role === 'goalie' || (p.suspendedUntil && p.suspendedUntil > timeNow)) continue
    const d = Math.hypot(p.pos.x - at.x, p.pos.y - at.y)
    if (p.team === scorer) { if (d < dAtk) { dAtk = d; atk = p } } else if (d < dDef) { dDef = d; def = p }
  }
  if (!atk || !def) return
  if (kind === 'free-hit') {
    state.pendingBully = {
      x: at.x,
      y: at.y,
      message: 'Gol anulado: libre indirecto directo · saque neutral',
      participants: scorer === 'blue' ? { bluePlayerId: atk.id, redPlayerId: def.id } : { bluePlayerId: def.id, redPlayerId: atk.id },
    }
    return
  }
  const m = FREE_HIT_BOARD_MARGIN
  state.pendingFoul = {
    againstTeam: scorer,
    byPlayerId: atk.id,
    victimPlayerId: def.id,
    restartX: Math.min(Math.max(at.x, RINK.x + m), RINK.x + RINK.width - m),
    restartY: Math.min(Math.max(at.y, RINK.y + m), RINK.y + RINK.height - m),
    sanction: SANCTION.FREE_HIT,
    message: 'Gol anulado: saque de centro directo · libre indirecto',
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
