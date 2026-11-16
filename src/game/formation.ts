import { GAME_HEIGHT, GOALIE_BASE_X, RINK } from './constants'

const MID_X = RINK.x + RINK.width / 2
import type { Role, TeamSide } from './types'

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
