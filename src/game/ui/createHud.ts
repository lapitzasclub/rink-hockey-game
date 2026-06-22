import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../constants'

const FONT = '"Courier New", Courier, monospace'

export function createHud(scene: Phaser.Scene) {
  const hudText = scene.add.text(24, 16, '', {
    fontFamily: FONT,
    fontSize: '22px',
    color: '#c8dff7',
    stroke: '#050e18',
    strokeThickness: 4,
    padding: { x: 14, y: 8 },
  }).setDepth(30)

  const subHudText = scene.add.text(24, 58, '', {
    fontFamily: FONT,
    fontSize: '13px',
    color: '#6a9cc4',
    stroke: '#050e18',
    strokeThickness: 3,
    padding: { x: 10, y: 6 },
  }).setDepth(30)

  const centerText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
    fontFamily: FONT,
    fontSize: '30px',
    color: '#e8f4ff',
    stroke: '#08111b',
    strokeThickness: 8,
    fontStyle: 'bold',
    align: 'center',
    padding: { x: 0, y: 0 },
  }).setOrigin(0.5).setVisible(false)

  return { hudText, subHudText, centerText }
}
