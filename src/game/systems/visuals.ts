import * as Phaser from 'phaser'
import type { Player } from '../types'
import { getRoleShort } from '../utils'

export function updateVisuals(players: Player[], controlled: Player, ball: Phaser.GameObjects.Arc, ballCarrierId: string | null) {
  for (const player of players) {
    player.body.setPosition(player.pos.x, player.pos.y)
    player.label.setPosition(player.pos.x, player.pos.y - 30)

    const aimX = ballCarrierId === player.id ? player.pos.x + player.facing.x * 40 : ball.x
    const aimY = ballCarrierId === player.id ? player.pos.y + player.facing.y * 40 : ball.y
    const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, aimX, aimY)
    player.stick.setPosition(player.pos.x + Math.cos(angle) * 18, player.pos.y + Math.sin(angle) * 18)
    player.stick.rotation = angle

    const active = controlled.id === player.id
    const carrying = ballCarrierId === player.id
    player.body.setStrokeStyle(active ? 5 : player.controllable ? 4 : 2, carrying ? 0x9cff7a : active ? 0xfff27a : 0xeaf4ff)
    player.label.setText(`${getRoleShort(player.role)}${active ? '★' : ''}${carrying ? '●' : ''}`)
  }
}

export function getStickTip(player: Player) {
  const angle = player.stick.rotation
  return { x: player.stick.x + Math.cos(angle) * 14, y: player.stick.y + Math.sin(angle) * 14 }
}
