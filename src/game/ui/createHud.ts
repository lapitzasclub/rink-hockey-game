import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../constants'
import { ARCADE_FONT } from '../render/arcadeFx'
import { createScoreboard } from './scoreboard'
import { createPassivityHud } from './passivityHud'

/** Videomarcador común y texto central (faltas, saques, resultado), todo en Russo One. */
export function createHud(scene: Phaser.Scene, showFouls = true) {
  const scoreboard = createScoreboard(scene, showFouls)
  // Tiempo de posesión y juego pasivo: solo en reglamento (B-10)
  const passivity = showFouls ? createPassivityHud(scene) : null

  const centerText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
    fontFamily: ARCADE_FONT,
    fontSize: '30px',
    color: '#e8f4ff',
    stroke: '#08111b',
    strokeThickness: 8,
    align: 'center',
  }).setOrigin(0.5).setVisible(false)

  return { scoreboard, centerText, passivity }
}
