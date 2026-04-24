import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, GOAL_HEIGHT, GOAL_WIDTH, RINK } from '../constants'

export function drawRink(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  g.fillStyle(0xf4f8ff, 1)
  g.fillRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 32)
  g.lineStyle(6, 0x18365d, 1)
  g.strokeRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 32)

  g.lineStyle(4, 0xc62c42, 1)
  g.strokeLineShape(new Phaser.Geom.Line(GAME_WIDTH / 2, RINK.y, GAME_WIDTH / 2, RINK.y + RINK.height))
  g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 80)

  g.lineStyle(3, 0x5194d1, 1)
  g.strokeRect(RINK.x - 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)
  g.strokeRect(RINK.x + RINK.width - GOAL_WIDTH + 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)

  g.fillStyle(0xdcecff, 1)
  g.fillRect(RINK.x - 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)
  g.fillRect(RINK.x + RINK.width - GOAL_WIDTH + 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)

  g.lineStyle(2, 0x8db8e0, 1)
  g.strokeCircle(RINK.x + 170, GAME_HEIGHT / 2, 60)
  g.strokeCircle(RINK.x + RINK.width - 170, GAME_HEIGHT / 2, 60)

  scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Prototype build 0.4  •  código modularizado', {
    fontFamily: 'Arial',
    fontSize: '16px',
    color: '#99aec8',
  }).setOrigin(0.5)
}
