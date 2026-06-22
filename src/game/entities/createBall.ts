import * as Phaser from 'phaser'
import { BALL_RADIUS, GAME_HEIGHT, GAME_WIDTH } from '../constants'

export function createBall(scene: Phaser.Scene) {
  const ball = scene.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, BALL_RADIUS, 0xf5a120)
  ball.setStrokeStyle(1.5, 0xb86e10)
  return ball
}
