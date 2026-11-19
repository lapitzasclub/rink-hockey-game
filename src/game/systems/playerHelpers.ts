import * as Phaser from 'phaser'
import { GAME_HEIGHT, GOALIE_SELECT_RANGE } from '../constants'
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

/**
 * Selecciona el mejor candidato para recibir el control.
 *
 * Prioridad: (1) el portador azul (también el portero con la bola); (2) el de campo más cercano
 * a la bola. El portero entra en el ciclo defendiendo: si el cambio no movería a nadie (ya se
 * lleva al más cercano) con la bola cerca de su portería, si es el segundo cambio seguido
 * (preferGoalie: el más cercano cambia mientras se pulsa) o si él está más cerca de la bola que todos
 * los de campo, pasa al portero; desde el portero se vuelve al de campo más cercano.
 */
export function selectBestControlledPlayer(players: Player[], controlledPlayerIndex: number, ballCarrierId: string | null, ballX: number, ballY: number, now = 0, preferGoalie = false) {
  const options = getControllablePlayers(players)
  const current = options[controlledPlayerIndex % options.length]
  const ballCarrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null

  if (ballCarrier?.team === 'blue') {
    const index = options.indexOf(ballCarrier)
    if (index >= 0) return index
  }

  let nearest = -1
  let nearestDist = Infinity
  let goalieIndex = -1
  for (let i = 0; i < options.length; i += 1) {
    const p = options[i]
    if (p.role === 'goalie') { goalieIndex = i; continue }
    if ((p.suspendedUntil ?? 0) > now) continue
    const d = Phaser.Math.Distance.Between(p.pos.x, p.pos.y, ballX, ballY)
    if (d < nearestDist) { nearestDist = d; nearest = i }
  }
  if (nearest < 0) return controlledPlayerIndex % options.length

  if (goalieIndex >= 0 && current.role !== 'goalie') {
    const goalie = options[goalieIndex]
    const nearGoal = Phaser.Math.Distance.Between(getGoalLineX(goalie.side), GAME_HEIGHT / 2, ballX, ballY) < GOALIE_SELECT_RANGE
    const goalieDist = Phaser.Math.Distance.Between(goalie.pos.x, goalie.pos.y, ballX, ballY)
    if (nearGoal && (preferGoalie || options[nearest] === current || goalieDist < nearestDist)) return goalieIndex
  }
  return nearest
}
