import * as Phaser from 'phaser'
import { BALL_RADIUS, GAME_HEIGHT, GAME_WIDTH } from '../constants'
import { createProceduralPuppetTextures } from '../render/createProceduralPuppetTextures'
import type { Ball } from '../types'

/** Crea la pelota manteniendo coordenadas de física separadas del visual. */
export function createBall(scene: Phaser.Scene): Ball {
  createProceduralPuppetTextures(scene)
  const visual = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'puck-pixel')
  visual.setDisplaySize(BALL_RADIUS * 2.6, BALL_RADIUS * 2.6)
  return { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, visual }
}
