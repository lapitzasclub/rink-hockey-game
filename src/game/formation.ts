import { GAME_HEIGHT, GOALIE_BASE_X, RINK } from './constants'

const MID_X = RINK.x + RINK.width / 2
import type { Player, Role, TeamColor, TeamSide } from './types'

export function getFormation(side: TeamSide) {
  const left = side === 'left'
  const baseX = left ? RINK.x + GOALIE_BASE_X : RINK.x + RINK.width - GOALIE_BASE_X
  const defenseX = left ? RINK.x + 280 : RINK.x + RINK.width - 280
  const wingX = left ? RINK.x + 480 : RINK.x + RINK.width - 480
  const pivotX = left ? MID_X - 70 : MID_X + 70

  return [
    { role: 'goalie' as Role, x: baseX, y: GAME_HEIGHT / 2 },
    { role: 'defender' as Role, x: defenseX, y: GAME_HEIGHT / 2 - 120 },
    { role: 'defender' as Role, x: defenseX, y: GAME_HEIGHT / 2 + 120 },
    { role: 'wing' as Role, x: wingX, y: GAME_HEIGHT / 2 - 150 },
    { role: 'pivot' as Role, x: pivotX, y: GAME_HEIGHT / 2 + 70 },
  ]
}

/**
 * Lado que defiende un equipo ahora mismo. El lado vive en cada jugador
 * (`player.side`) y se invierte en el descanso; el azul empieza a la izquierda.
 */
export function teamSide(players: Player[], team: TeamColor): TeamSide {
  const p = players.find(x => x.team === team)
  return p ? p.side : team === 'blue' ? 'left' : 'right'
}

/** Equipo que marca si la bola entra en la portería de ese lado (el que la ataca). */
export function scorerAtGoal(players: Player[], goalSide: TeamSide): TeamColor {
  return teamSide(players, 'blue') === goalSide ? 'red' : 'blue'
}

/** Sentido de ataque en x de un jugador: +1 hacia la derecha si defiende la izquierda. */
export function attackDir(player: Player): 1 | -1 {
  return player.side === 'left' ? 1 : -1
}

/** Cambio de campo del descanso: cada jugador pasa a defender la otra portería. */
export function switchSides(players: Player[]) {
  for (const p of players) p.side = p.side === 'left' ? 'right' : 'left'
}
