import * as Phaser from 'phaser'
import type { Player, TeamColor } from '../types'

/** Devuelve los jugadores de campo azules que el humano puede controlar (excluyendo el portero). */
export function getControllablePlayers(players: Player[]) {
  return players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
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
 * Prioridad: (1) portador azul si el equipo tiene la bola, (2) jugador azul más
 * cercano a la bola, (3) siguiente en índice como fallback de último recurso.
 */
export function selectBestControlledPlayer(players: Player[], controlledPlayerIndex: number, ballCarrierId: string | null, ballX: number, ballY: number) {
  const options = getControllablePlayers(players)
  const ballCarrier = ballCarrierId ? findPlayerById(players, ballCarrierId) : null

  if (ballCarrier?.team === 'blue' && ballCarrier.role !== 'goalie') {
    const index = options.findIndex((player) => player.id === ballCarrier.id)
    if (index >= 0) return index
  }

  const nearestToBall = [...options].sort((a, b) => {
    const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, ballX, ballY)
    const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, ballX, ballY)
    return da - db
  })[0]

  const index = options.findIndex((player) => player.id === nearestToBall.id)
  return index >= 0 ? index : (controlledPlayerIndex + 1) % options.length
}
