import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../constants'

export function createHud(scene: Phaser.Scene) {
  const hudText = scene.add.text(24, 16, '', {
    fontFamily: 'Arial',
    fontSize: '26px',
    color: '#f7fbff',
    fontStyle: 'bold',
    backgroundColor: '#00000066',
    padding: { x: 12, y: 8 },
  }).setDepth(30)

  const subHudText = scene.add.text(24, 58, '', {
    fontFamily: 'Arial',
    fontSize: '16px',
    color: '#bfd2eb',
    align: 'left',
    backgroundColor: '#00000055',
    padding: { x: 10, y: 6 },
    wordWrap: { width: GAME_WIDTH - 120 },
  }).setDepth(30)

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
