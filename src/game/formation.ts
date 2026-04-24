import { GAME_HEIGHT, RINK } from './constants'
import type { Role, TeamSide } from './types'

export function getFormation(side: TeamSide) {
  const left = side === 'left'
  const baseX = left ? RINK.x + 110 : RINK.x + RINK.width - 110
  const defenseX = left ? RINK.x + 280 : RINK.x + RINK.width - 280
  const wingX = left ? RINK.x + 480 : RINK.x + RINK.width - 480
  const pivotX = left ? RINK.x + 650 : RINK.x + RINK.width - 650

  return [
    { role: 'goalie' as Role, x: baseX, y: GAME_HEIGHT / 2 },
    { role: 'defender' as Role, x: defenseX, y: GAME_HEIGHT / 2 - 120 },
    { role: 'defender' as Role, x: defenseX, y: GAME_HEIGHT / 2 + 120 },
    { role: 'wing' as Role, x: wingX, y: GAME_HEIGHT / 2 - 150 },
    { role: 'pivot' as Role, x: pivotX, y: GAME_HEIGHT / 2 + 70 },
  ]
}
