import * as Phaser from 'phaser'
import {
  BULLY_PLAYER_OFFSET, BULLY_SETUP_MS, CENTER_CIRCLE_RADIUS, DIRECT_FREE_HIT_SPOT_OFFSET, FOUL_AI_AIM_MS, FOUL_MAX_SETUP_MS,
  FOUL_SETUP_MS, GAME_HEIGHT, GAME_WIDTH, GOAL_NET_HOLD_X, GOALIE_BASE_X, GOALIE_RADIUS, KICKOFF_MAX_SETUP_MS,
  KICKOFF_MIN_SETUP_MS, PENALTY_AREA_DEPTH, PENALTY_AREA_HEIGHT, PENALTY_SPOT_OFFSET, PLAYER_ACCEL, PLAYER_RADIUS,
  RESTART_ARRIVE_PX, RESTART_MIN_DISTANCE, RESTART_SKATE_DECEL, RESTART_SKATE_SPEED, RINK,
} from '../constants'
import { attackDir, getFormation, teamSide } from '../formation'
import { getGoalLineX } from '../utils'
import { findPlayerById, getControlledPlayer } from './playerHelpers'
import type { ActiveBully, ActiveFoulRestart, ActiveKickoff, Ball, Player, TeamColor, Vector } from '../types'
import type { RuleState } from './rules'

/**
 * Prepara el saque de centro (art. 5): limpia la jugada y deja la bola en el
 * punto central. Con `snap` coloca a todos en su sitio de golpe (solo al
 * empezar el partido); si no, los jugadores patinan hasta él en el ritual de
 * `updateKickoffState`. Las faltas de equipo se conservan.
 */
export function resetKickoffState(options: {
  team: TeamColor
  players: Player[]
  ball: Ball
  ruleState: RuleState
  timeNow: number
  snap: boolean
}) {
  const { team, players, ball, ruleState, timeNow, snap } = options
  for (const player of players) {
    const index = Number(player.id.split('-')[1])
    const formation = getFormation(player.side)[index]
    player.home = { x: formation.x, y: formation.y }
    player.possessionCooldownUntil = 0
    player.goalieCatchTime = 0
    player.ignoreBallUntil = 0
    player.goalieRecoverUntil = 0
    player.sprinting = false
  }

  ball.x = GAME_WIDTH / 2
  ball.y = GAME_HEIGHT / 2

  const kicker = pickKickoffPlayer(players, team, ['pivot', 'wing', 'defender'], null, timeNow)
  const partner = pickKickoffPlayer(players, team, ['wing', 'pivot', 'defender'], kicker?.id ?? null, timeNow)
  const kickoff: ActiveKickoff = {
    team,
    takerPlayerId: kicker?.id ?? '',
    partnerPlayerId: partner?.id ?? null,
    readyAt: timeNow + (snap ? 0 : KICKOFF_MIN_SETUP_MS),
    deadline: timeNow + (snap ? 0 : KICKOFF_MAX_SETUP_MS),
  }
  if (snap) {
    for (const p of players) {
      if (p.suspendedUntil && p.suspendedUntil > timeNow) continue
      const t = kickoffTarget(p, kickoff, players)
      p.pos = { x: t.x, y: t.y }
      p.velocity = { x: 0, y: 0 }
      p.facing = { x: attackDir(p), y: 0 }
    }
  }

  return {
    ballCarrierId: null,
    ballVelocity: { x: 0, y: 0 },
    lastTouch: team,
    lastLooseBallTime: 0,
    activeBully: null as ActiveBully | null,
    activeFoulRestart: null as ActiveFoulRestart | null,
    activeKickoff: kickoff,
    stuckCarrierStartTime: 0,
    stuckCarrierOrigin: null as Vector | null,
    ruleState: { ...ruleState, pendingFoul: null, pendingBully: null },
  }
}

function pickKickoffPlayer(players: Player[], team: TeamColor, roles: Player['role'][], exclude: string | null, timeNow: number) {
  for (const role of roles) {
    const p = players.find((x) => x.team === team && x.role === role && x.id !== exclude && !(x.suspendedUntil && x.suspendedUntil > timeNow))
    if (p) return p
  }
  return null
}

/**
 * Sitio de cada jugador en el saque de centro. Todos en su mitad; dentro del
 * círculo central solo el que saca (pegado a la bola) y un compañero; los
 * rivales esperan fuera del círculo.
 */
function kickoffTarget(p: Player, kickoff: ActiveKickoff, players: Player[]): Vector {
  const cx = GAME_WIDTH / 2
  const cy = GAME_HEIGHT / 2
  const back = -attackDir(p)
  if (p.role === 'goalie') return { x: p.side === 'left' ? RINK.x + GOALIE_BASE_X : RINK.x + RINK.width - GOALIE_BASE_X, y: cy }
  if (p.id === kickoff.takerPlayerId) return { x: cx + back * (PLAYER_RADIUS + 6), y: cy }
  if (p.id === kickoff.partnerPlayerId) return { x: cx + back * CENTER_CIRCLE_RADIUS * 0.62, y: cy - CENTER_CIRCLE_RADIUS * 0.55 }
  const others = players.filter((x) => x.team === p.team && x.role !== 'goalie' && x.id !== kickoff.takerPlayerId && x.id !== kickoff.partnerPlayerId)
  const i = Math.max(0, others.findIndex((x) => x.id === p.id))
  if (p.team === kickoff.team) {
    const slots = [{ x: 230, y: -105 }, { x: 230, y: 105 }, { x: 150, y: 150 }]
    const s = slots[Math.min(i, slots.length - 1)]
    return { x: cx + back * s.x, y: cy + s.y }
  }
  // Rivales: dos al borde del círculo cerrando el pase al centro, el resto atrás
  const ring = CENTER_CIRCLE_RADIUS + PLAYER_RADIUS + 10
  const slots = [
    { x: ring * 0.82, y: -ring * 0.57 },
    { x: ring * 0.82, y: ring * 0.57 },
    { x: 250, y: -95 },
    { x: 250, y: 95 },
  ]
  const s = slots[Math.min(i, slots.length - 1)]
  return { x: cx + back * s.x, y: cy + s.y }
}

/**
 * Patina hacia (tx, ty) acelerando y frenando como un jugador (llegada suave),
 * sin el límite de zona del portero: sirve también para cruzar la pista en el
 * descanso. Devuelve true si ya está en su sitio.
 */
export function skateToward(player: Player, tx: number, ty: number, dt: number, speed = RESTART_SKATE_SPEED) {
  const dx = tx - player.pos.x
  const dy = ty - player.pos.y
  const dist = Math.hypot(dx, dy)
  const vx = player.velocity.x
  const vy = player.velocity.y
  if (dist < RESTART_ARRIVE_PX && Math.hypot(vx, vy) < 40) {
    player.velocity.x = vx * 0.8
    player.velocity.y = vy * 0.8
    return true
  }
  const desired = Math.min(speed, Math.sqrt(2 * RESTART_SKATE_DECEL * dist))
  const ux = dist > 0 ? dx / dist : 0
  const uy = dist > 0 ? dy / dist : 0
  const ddx = ux * desired - vx
  const ddy = uy * desired - vy
  const dl = Math.hypot(ddx, ddy)
  const maxDv = Math.max(PLAYER_ACCEL, RESTART_SKATE_DECEL) * 1.25 * dt
  const k = dl > maxDv ? maxDv / dl : 1
  player.velocity.x = vx + ddx * k
  player.velocity.y = vy + ddy * k
  player.pos.x += player.velocity.x * dt
  player.pos.y += player.velocity.y * dt
  player.pos.x = Phaser.Math.Clamp(player.pos.x, RINK.x + PLAYER_RADIUS, RINK.x + RINK.width - PLAYER_RADIUS)
  player.pos.y = Phaser.Math.Clamp(player.pos.y, RINK.y + PLAYER_RADIUS, RINK.y + RINK.height - PLAYER_RADIUS)
  const sp = Math.hypot(player.velocity.x, player.velocity.y)
  if (sp > 60) player.facing = { x: player.velocity.x / sp, y: player.velocity.y / sp }
  return false
}

/** Ya casi quieto en su sitio, se gira poco a poco hacia `dir`. */
function settleFacing(player: Player, dir: Vector, dt: number) {
  if (Math.hypot(player.velocity.x, player.velocity.y) > 60) return
  const t = Math.min(1, dt * 7)
  const fx = player.facing.x + (dir.x - player.facing.x) * t
  const fy = player.facing.y + (dir.y - player.facing.y) * t
  const l = Math.hypot(fx, fy) || 1
  player.facing = { x: fx / l, y: fy / l }
}

/** Patina a su sitio y, ya parado, se gira hacia `look`. Devuelve true al estar colocado. */
function placePlayer(p: Player, target: Vector, look: Vector, dt: number) {
  const arrived = skateToward(p, target.x, target.y, dt)
  const ll = Math.hypot(look.x, look.y) || 1
  settleFacing(p, { x: look.x / ll, y: look.y / ll }, dt)
  return arrived
}

/**
 * Ritual del saque de centro: todos patinan a su sitio; cuando están colocados
 * (o vence el plazo) el árbitro pita y el que saca recibe la bola.
 * Devuelve el que saca al pitar, o null mientras se colocan.
 */
export function updateKickoffState(options: {
  time: number
  dt: number
  kickoff: ActiveKickoff
  players: Player[]
  ball: Ball
}) {
  const { time, dt, kickoff, players, ball } = options
  let allSet = true
  for (const p of players) {
    if (p.suspendedUntil && p.suspendedUntil > time) continue
    const look = p.id === kickoff.takerPlayerId || p.role === 'goalie'
      ? { x: attackDir(p), y: 0 }
      : { x: ball.x - p.pos.x, y: ball.y - p.pos.y }
    if (!placePlayer(p, kickoffTarget(p, kickoff, players), look, dt)) allSet = false
  }
  ball.x = GAME_WIDTH / 2
  ball.y = GAME_HEIGHT / 2
  if (time < kickoff.readyAt || (!allSet && time < kickoff.deadline)) return null
  return findPlayerById(players, kickoff.takerPlayerId)
}

/**
 * Congela la bola dentro de la red tras un gol. Los jugadores se quedan donde
 * están para celebrarlo (MatchScene los deja deslizarse hasta frenar);
 * resetKickoffState los coloca en formación al acabar la celebración. No
 * resetea el estado de reglas: eso también ocurre en resetKickoffState.
 */
export function applyGoalReset(options: {
  scorer: TeamColor
  players: Player[]
  ball: Ball
}) {
  const { scorer, players, ball } = options
  // El que marca ataca la portería contraria a su lado
  if (teamSide(players, scorer) === 'left') {
    ball.x = getGoalLineX('right') + GOAL_NET_HOLD_X
    ball.y = Phaser.Math.Clamp(ball.y, GAME_HEIGHT / 2 - 54, GAME_HEIGHT / 2 + 54)
  } else {
    ball.x = getGoalLineX('left') - GOAL_NET_HOLD_X
    ball.y = Phaser.Math.Clamp(ball.y, GAME_HEIGHT / 2 - 54, GAME_HEIGHT / 2 + 54)
  }
}

/**
 * Coloca la bola en el sitio de la falta y abre el ritual del saque. Los
 * jugadores no se paran de golpe: frenan y patinan a su sitio en
 * `updateFoulRestartState`.
 */
export function startFoulRestartState(options: {
  foul: NonNullable<RuleState['pendingFoul']>
  players: Player[]
  ball: Ball
  timeNow: number
}) {
  const { foul, players, ball, timeNow } = options
  const taker = findPlayerById(players, foul.victimPlayerId)
  const isDirect = foul.sanction === 'direct-free-hit' || foul.sanction === 'penalty'
  // Libre directo a 7,40 m y penalti a 5,40 m de la portería que ataca el ejecutante
  const spotOffset = foul.sanction === 'penalty' ? PENALTY_SPOT_OFFSET : DIRECT_FREE_HIT_SPOT_OFFSET
  const restartX = isDirect
    ? (taker?.side === 'left' ? getGoalLineX('right') - spotOffset : getGoalLineX('left') + spotOffset)
    : foul.restartX
  const restartY = isDirect ? GAME_HEIGHT / 2 : foul.restartY

  ball.x = restartX
  ball.y = restartY

  return {
    ballVelocity: { x: 0, y: 0 },
    ballCarrierId: null,
    ballIgnoreContactsUntil: timeNow + FOUL_SETUP_MS,
    activeFoulRestart: {
      takerPlayerId: foul.victimPlayerId,
      x: restartX,
      y: restartY,
      readyAt: timeNow + FOUL_SETUP_MS,
      deadline: timeNow + FOUL_MAX_SETUP_MS,
      sanction: foul.sanction,
    } as ActiveFoulRestart,
  }
}

/**
 * Inicia el saque neutral (art. 13): bola en el sitio, un jugador de cada
 * equipo enfrentados y el resto a 3 m.
 */
export function startBullyState(options: {
  x: number
  y: number
  bluePlayerId: string
  redPlayerId: string
  players: Player[]
  ball: Ball
  timeNow: number
}) {
  const { x, y, bluePlayerId, redPlayerId, ball, timeNow } = options
  ball.x = x
  ball.y = y
  return {
    ballVelocity: { x: 0, y: 0 },
    ballCarrierId: null,
    ballIgnoreContactsUntil: timeNow + BULLY_SETUP_MS,
    activeBully: {
      bluePlayerId,
      redPlayerId,
      x,
      y,
      releaseAt: timeNow + BULLY_SETUP_MS,
      deadline: timeNow + FOUL_MAX_SETUP_MS,
    } as ActiveBully,
  }
}

const clampToRink = (v: Vector, margin = 60): Vector => ({
  x: Phaser.Math.Clamp(v.x, RINK.x + margin, RINK.x + RINK.width - margin),
  y: Phaser.Math.Clamp(v.y, RINK.y + margin, RINK.y + RINK.height - margin),
})

/** Aparta `target` hasta `min` px de (x, y), hacia fuera desde la bola. */
function keepAway(target: Vector, x: number, y: number, min: number, from: Vector): Vector {
  let dx = target.x - x
  let dy = target.y - y
  let d = Math.hypot(dx, dy)
  if (d >= min) return target
  if (d < 1) {
    dx = from.x - x
    dy = from.y - y
    d = Math.hypot(dx, dy) || 1
  }
  return { x: x + (dx / d) * min, y: y + (dy / d) * min }
}

/** Puesto del portero bajo palos (línea de gol), como pide el libre directo y el penalti. */
function goalLineSpot(side: Player['side']): Vector {
  const gx = getGoalLineX(side)
  return { x: gx + (side === 'left' ? 1 : -1) * GOALIE_RADIUS * 0.8, y: GAME_HEIGHT / 2 }
}

/**
 * Sitio de cada jugador en un saque de falta.
 * - Libre indirecto: compañeros abren líneas de pase; rivales a 3 m como mínimo.
 * - Libre directo y penalti (art. 30): los demás, dentro del área que defiende
 *   el equipo que lanza (la lejana); el portero que defiende, en la línea de gol.
 */
function foulTarget(p: Player, foul: ActiveFoulRestart, taker: Player, players: Player[], time: number): Vector {
  const advance = attackDir(taker)
  if (foul.sanction === 'free-hit') {
    if (p.role === 'goalie') return { x: p.home.x, y: GAME_HEIGHT / 2 }
    if (p.team === taker.team) {
      if (p.role === 'wing') return clampToRink({ x: foul.x + advance * 185, y: p.home.y })
      if (p.role === 'pivot') return clampToRink({ x: foul.x + advance * 95, y: GAME_HEIGHT / 2 + (p.home.y < GAME_HEIGHT / 2 ? -55 : 55) })
      return clampToRink({ x: foul.x - advance * 85, y: p.home.y })
    }
    const base = {
      x: p.home.x + Phaser.Math.Clamp((foul.x - p.home.x) * 0.32, -95, 95),
      y: p.home.y + Phaser.Math.Clamp((foul.y - p.home.y) * 0.42, -95, 95),
    }
    return clampToRink(keepAway(base, foul.x, foul.y, RESTART_MIN_DISTANCE + PLAYER_RADIUS, p.home), PLAYER_RADIUS + 4)
  }

  if (p.role === 'goalie') return goalLineSpot(p.side)
  // Rejilla dentro del área lejana: dos filas, repartidos a lo ancho
  const others = players.filter((x) => x.role !== 'goalie' && x.id !== taker.id && !(x.suspendedUntil && x.suspendedUntil > time))
  const i = Math.max(0, others.findIndex((x) => x.id === p.id))
  const n = Math.max(1, others.length)
  const cols = Math.ceil(n / 2)
  const row = i % 2
  const col = Math.floor(i / 2)
  const gx = getGoalLineX(taker.side)
  const into = taker.side === 'left' ? 1 : -1
  const depth = PENALTY_AREA_DEPTH * (0.45 + row * 0.35)
  const span = PENALTY_AREA_HEIGHT * 0.8
  const y = GAME_HEIGHT / 2 - span / 2 + (cols > 1 ? (col / (cols - 1)) * span : span / 2) + (row ? span / (cols * 4) : 0)
  return { x: gx + into * depth, y }
}

/**
 * Tick del saque de falta.
 *
 * Mientras se colocan (hasta que llegan todos, o vence el plazo), el
 * ejecutante patina detrás de la bola y el resto a su sitio. Ya listo,
 * devuelve la puntería del ejecutante y, al pulsar la acción, release=true
 * para que la escena resuelva el pase o el tiro. El rojo lanza solo.
 * `whistle` sale true el paso en que el árbitro pita (directo y penalti).
 */
export function updateFoulRestartState(options: {
  time: number
  dt: number
  activeFoulRestart: ActiveFoulRestart | null
  players: Player[]
  ball: Ball
  controlledPlayerIndex: number
  centerText: Phaser.GameObjects.Text
  passJustDown: boolean
  shootJustDown: boolean
}) {
  const { time, dt, activeFoulRestart: foul, players, ball, controlledPlayerIndex, centerText, passJustDown, shootJustDown } = options
  if (!foul) return null
  const idle = { controlledPlayerIndex, taker: null as Player | null, shouldPass: false, shouldShot: false, release: false, autoFacing: null as Vector | null, whistle: false }

  const taker = findPlayerById(players, foul.takerPlayerId)
  const wasReady = time - dt * 1000 >= foul.readyAt
  let allSet = true
  let takerSet = true
  if (taker) {
    const toGoal = { x: attackDir(taker), y: 0 }
    const takerTarget = { x: foul.x - attackDir(taker) * (PLAYER_RADIUS + 4), y: foul.y }
    if (time < foul.readyAt || !wasReady) {
      takerSet = placePlayer(taker, takerTarget, toGoal, dt)
    } else {
      taker.velocity = { x: 0, y: 0 }
    }
    for (const p of players) {
      if (p.id === taker.id) continue
      if (p.suspendedUntil && p.suspendedUntil > time) continue
      const look = { x: foul.x - p.pos.x, y: foul.y - p.pos.y }
      if (!placePlayer(p, foulTarget(p, foul, taker, players, time), look, dt)) allSet = false
    }
  }
  // Hasta que todos están en su sitio no se puede sacar (con un plazo por si alguien se atasca)
  if (time >= foul.readyAt && !wasReady && (!takerSet || (!allSet && time < foul.deadline))) foul.readyAt = time + 1

  ball.x = foul.x
  ball.y = foul.y
  if (time < foul.readyAt) return idle

  const whistle = !wasReady && foul.sanction !== 'free-hit'
  centerText.setVisible(false)
  if (!taker) return { ...idle, whistle }

  let nextControlledIndex = controlledPlayerIndex
  const controlled = getControlledPlayer(players, controlledPlayerIndex)
  if (controlled.id !== taker.id) {
    const options = players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
    const index = options.findIndex((player) => player.id === taker.id)
    if (index >= 0) nextControlledIndex = index
  }

  if (taker.team === 'red') {
    const targetX = foul.sanction === 'free-hit'
      ? taker.pos.x + (taker.side === 'left' ? 220 : -220)
      : (taker.side === 'left' ? GAME_WIDTH - 24 : 24)
    const targetY = foul.sanction === 'free-hit'
      ? GAME_HEIGHT / 2 + Phaser.Math.Clamp((taker.home.y - GAME_HEIGHT / 2) * 0.55, -90, 90)
      : GAME_HEIGHT / 2 + Phaser.Math.Clamp(taker.pos.y - GAME_HEIGHT / 2, -34, 34)
    const raw = { x: targetX - taker.pos.x, y: targetY - taker.pos.y }
    const length = Math.hypot(raw.x, raw.y) || 1
    return {
      controlledPlayerIndex,
      taker,
      shouldPass: foul.sanction === 'free-hit',
      shouldShot: foul.sanction !== 'free-hit',
      // Tras el pitido, un instante de concentración antes de lanzar
      release: foul.sanction === 'free-hit' || time - foul.readyAt >= FOUL_AI_AIM_MS,
      autoFacing: { x: raw.x / length, y: raw.y / length },
      whistle,
    }
  }

  // Libre indirecto: no vale gol directo, solo pase
  const shouldPass = foul.sanction === 'free-hit' && passJustDown
  const shouldShot = foul.sanction === 'free-hit' ? shouldPass : (shootJustDown || passJustDown)
  return {
    controlledPlayerIndex: nextControlledIndex,
    taker,
    shouldPass,
    shouldShot,
    release: shouldPass || shouldShot,
    autoFacing: null as Vector | null,
    whistle,
  }
}

/**
 * Tick del saque neutral: los dos participantes se enfrentan sobre la bola,
 * de espaldas a su campo; el resto se aparta a 3 m. Devuelve true el paso en
 * que el árbitro pita y la bola queda libre.
 */
export function updateBullyState(options: {
  time: number
  dt: number
  activeBully: ActiveBully | null
  players: Player[]
  ball: Ball
  centerText: Phaser.GameObjects.Text
}) {
  const { time, dt, activeBully: bully, players, ball, centerText } = options
  if (!bully) return false

  let set = true
  for (const p of players) {
    if (p.suspendedUntil && p.suspendedUntil > time) continue
    if (p.id === bully.bluePlayerId || p.id === bully.redPlayerId) {
      const t = { x: bully.x - attackDir(p) * BULLY_PLAYER_OFFSET, y: bully.y }
      if (!placePlayer(p, t, { x: attackDir(p), y: 0 }, dt)) set = false
      continue
    }
    if (p.role === 'goalie') {
      placePlayer(p, { x: p.home.x, y: GAME_HEIGHT / 2 }, { x: bully.x - p.pos.x, y: bully.y - p.pos.y }, dt)
      continue
    }
    const away = keepAway({ x: p.pos.x, y: p.pos.y }, bully.x, bully.y, RESTART_MIN_DISTANCE + PLAYER_RADIUS, p.home)
    placePlayer(p, clampToRink(away, PLAYER_RADIUS + 4), { x: bully.x - p.pos.x, y: bully.y - p.pos.y }, dt)
  }

  ball.x = bully.x
  ball.y = bully.y
  if (time >= bully.releaseAt && (set || time >= bully.deadline)) {
    centerText.setVisible(false)
    return true
  }
  centerText.setText('Saque neutral').setVisible(true)
  return false
}
