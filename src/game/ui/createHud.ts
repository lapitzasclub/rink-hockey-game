import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../constants'

export function createHud(scene: Phaser.Scene) {
  const hudText = scene.add.text(24, 18, '', {
    fontFamily: 'Arial',
    fontSize: '28px',
    color: '#f7fbff',
    fontStyle: 'bold',
  })

  const subHudText = scene.add.text(GAME_WIDTH / 2, 20, '', {
    fontFamily: 'Arial',
    fontSize: '18px',
    color: '#bfd2eb',
    align: 'center',
  }).setOrigin(0.5, 0)

  const centerText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
    fontFamily: 'Arial',
    fontSize: '42px',
    color: '#ffffff',
    fontStyle: 'bold',
    align: 'center',
    backgroundColor: '#00000088',
    padding: { x: 18, y: 10 },
  }).setOrigin(0.5).setVisible(false)

  return { hudText, subHudText, centerText }
}
