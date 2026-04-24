import * as Phaser from 'phaser'
import { GOALIE_RADIUS, PLAYER_RADIUS } from '../constants'
import type { Player, Role, TeamColor, TeamSide } from '../types'
import { getRoleShort } from '../utils'

export function createPlayer(
  scene: Phaser.Scene,
  id: string,
  team: TeamColor,
  side: TeamSide,
  role: Role,
  x: number,
  y: number,
  color: number,
  controllable: boolean,
): Player {
  const radius = role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  const body = scene.add.circle(x, y, radius, color)
  body.setStrokeStyle(controllable ? 4 : 2, 0xeaf4ff)
  const stick = scene.add.rectangle(x + (side === 'left' ? 18 : -18), y, 28, 5, 0xd6a05f)
  const label = scene.add.text(x, y - 30, getRoleShort(role), {
    fontFamily: 'Arial',
    fontSize: '14px',
    color: '#e9f2ff',
    fontStyle: 'bold',
  }).setOrigin(0.5)

  return {
    id,
    team,
    side,
    role,
    body,
    stick,
    label,
    pos: { x, y },
    velocity: { x: 0, y: 0 },
    facing: { x: side === 'left' ? 1 : -1, y: 0 },
    home: { x, y },
    controllable,
  }
}
