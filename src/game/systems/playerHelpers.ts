import * as Phaser from 'phaser'
import { GAME_HEIGHT, GOALIE_SELECT_RANGE, SWITCH_AIM_ANGLE_PX, SWITCH_AIM_MAX_ANGLE, SWITCH_AIM_MIN, SWITCH_AIM_TOUCH_SCALE, SWITCH_DEFEND, TOUCH_ASSIST_EXTRA } from '../constants'
import { touchAssist } from './difficulty'
import { getGoalLineX } from '../utils'
import type { Player, TeamColor } from '../types'

/**
 * Jugadores azules que el humano puede controlar: los de campo y, al final, el portero (E-03).
 * El índice de control apunta a esta lista; el portero va el último para que los índices de
 * los de campo no cambien.
 */
export function getControllablePlayers(players: Player[]) {
  const list = players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
  for (const player of players) if (player.team === 'blue' && player.role === 'goalie') list.push(player)
  return list
}

/** Devuelve el jugador actualmente controlado; usa módulo para evitar índice fuera de rango. */
export function getControlledPlayer(players: Player[], controlledPlayerIndex: number) {
  const controllables = getControllablePlayers(players)
  return controllables[controlledPlayerIndex % controllables.length]
}

/** Devuelve el jugador de campo del equipo indicado más cercano a la posición de la bola. */
export function getClosestPlayerToBall(players: Player[], team: TeamColor, ballX: number, ballY: number) {
  const teamPlayers = players.filter((player) => player.team === team && player.role !== 'goalie')
  return [...teamPlayers].sort((a, b) => {
    const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, ballX, ballY)
    const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, ballX, ballY)
    return da - db
  })[0]
}

/** Busca un jugador por id. Devuelve null si no existe (evita propagación de undefined). */
export function findPlayerById(players: Player[], id: string) {
  return players.find((player) => player.id === id) ?? null
}

/** Lo que pide el botón de cambio: `aim`, el stick al pulsar (sin marcar, cambio por cercanía). */
export type SwitchRequest = { aim: { x: number, y: number } }

const touchAim = { x: 0, y: 0 }
/**
 * Stick para el cambio con dirección en la escala de mando/teclado (B-03): con el joystick táctil
 * (nipplejs llega a fondo con módulo 0,5) se escala por SWITCH_AIM_TOUCH_SCALE, sin pasar de 1;
 * `touch` solo si la dirección sale del joystick (con mando en el móvil cuenta el mando).
 * Devuelve un vector reutilizado: el llamante no debe guardarlo.
 */
export function switchAim(aim: { x: number, y: number }, touch: boolean) {
  if (!touch) return aim
  const len = Math.hypot(aim.x, aim.y)
  const k = len > 0 ? Math.min(SWITCH_AIM_TOUCH_SCALE, 1 / len) : 0
  touchAim.x = aim.x * k
  touchAim.y = aim.y * k
  return touchAim
}

/**
 * Selecciona el mejor candidato para recibir el control.
 *
 * Prioridad: (1) el portador azul (también el portero con la bola); (2) con `request` y el stick
 * marcado, el compañero hacia donde apunta (el portero cuenta si la bola está cerca de su
 * portería); (3) el de campo más cercano a la bola. Al pulsar cambio sin stick no se queda en el
 * mismo: si ya era el más cercano pasa al portero (bola cerca de su portería) o al siguiente.
 * Defendiendo, la cercanía penaliza al que va por detrás de la bola (SWITCH_DEFEND, B-07), y el
 * stick hacia la bola no cuenta como dirección de cambio (B-11).
 * Sin `request` (control automático) puede devolver el actual. En táctil, con
 * TOUCH_ASSIST_EXTRA.goalieAutoSelect en false, al portero solo se llega con el CAMBIO que le apunta (B-06).
 */
export function selectBestControlledPlayer(players: Player[], controlledPlayerIndex: number, ballCarrierId: string | null, ballX: number, ballY: number, now = 0, request?: SwitchRequest) {
  const options = getControllablePlayers(players)
  const current = options[controlledPlayerIndex % options.length]
  const ballCarrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null

  if (ballCarrier?.team === 'blue') {
    const index = options.indexOf(ballCarrier)
    if (index >= 0) return index
  }

  const goalieIndex = options.findIndex(p => p.role === 'goalie')
  const goalie = goalieIndex >= 0 ? options[goalieIndex] : null
  const nearGoal = !!goalie && Phaser.Math.Distance.Between(getGoalLineX(goalie.side), GAME_HEIGHT / 2, ballX, ballY) < GOALIE_SELECT_RANGE
  const free = (p: Player) => p.role !== 'goalie' && (p.suspendedUntil ?? 0) <= now

  const ownLineX = getGoalLineX(current.side)
  const towardOwn = ownLineX < ballX ? -1 : 1
  const defending = ballCarrier ? ballCarrier.team !== 'blue' : Math.abs(ballX - ownLineX) < Math.abs(ballX - getGoalLineX(current.side === 'left' ? 'right' : 'left'))

  const aim = request?.aim
  const aimLen = aim ? Math.hypot(aim.x, aim.y) : 0
  // B-11: defendiendo, el stick hacia la bola es el reflejo de ir a por ella, con cualquier control,
  // no una elección de compañero: decide la cercanía con SWITCH_DEFEND (el que puede encarar)
  const toBallX = ballX - current.pos.x
  const toBallY = ballY - current.pos.y
  const toBall = Math.hypot(toBallX, toBallY)
  const aimAtBall = defending && !!aim && aimLen > 0 && toBall > 1 &&
    Math.acos(Phaser.Math.Clamp((toBallX * aim.x + toBallY * aim.y) / (toBall * aimLen), -1, 1)) <= SWITCH_DEFEND.ballAimRad
  if (aim && aimLen >= SWITCH_AIM_MIN && !aimAtBall) {
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < options.length; i += 1) {
      const p = options[i]
      if (p === current || !(free(p) || (p === goalie && nearGoal))) continue
      const dx = p.pos.x - current.pos.x
      const dy = p.pos.y - current.pos.y
      const dist = Math.hypot(dx, dy)
      if (dist < 1) continue
      const angle = Math.acos(Phaser.Math.Clamp((dx * aim.x + dy * aim.y) / (dist * aimLen), -1, 1))
      if (angle > SWITCH_AIM_MAX_ANGLE) continue
      const score = dist + angle * SWITCH_AIM_ANGLE_PX
      if (score < bestScore) { bestScore = score; best = i }
    }
    if (best >= 0) return best
  }

  // Por cercanía a la bola: el más cercano y el siguiente (por si el más cercano ya es el actual).
  // Defendiendo (B-07), el que va por detrás de la bola respecto a nuestra portería cuenta más lejos
  let nearest = -1
  let nearestDist = Infinity
  let nearestRaw = Infinity
  let second = -1
  let secondDist = Infinity
  for (let i = 0; i < options.length; i += 1) {
    const p = options[i]
    if (!free(p)) continue
    const raw = Phaser.Math.Distance.Between(p.pos.x, p.pos.y, ballX, ballY)
    const behind = defending ? (ballX - p.pos.x) * towardOwn : 0
    const d = behind > 0 ? raw + SWITCH_DEFEND.behindPx * Math.min(1, behind / SWITCH_DEFEND.rampPx) : raw
    if (d < nearestDist) { second = nearest; secondDist = nearestDist; nearestDist = d; nearestRaw = raw; nearest = i }
    else if (d < secondDist) { secondDist = d; second = i }
  }
  if (nearest < 0) return controlledPlayerIndex % options.length

  const autoGoalie = TOUCH_ASSIST_EXTRA.goalieAutoSelect || touchAssist.team !== 'blue'
  if (goalie && current !== goalie && nearGoal && autoGoalie) {
    const goalieDist = Phaser.Math.Distance.Between(goalie.pos.x, goalie.pos.y, ballX, ballY)
    if (goalieDist < nearestRaw || (request && options[nearest] === current)) return goalieIndex
  }
  if (request && options[nearest] === current && second >= 0) return second
  return nearest
}
