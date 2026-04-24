import * as Phaser from 'phaser'
import { BLUE_LINE_OFFSET, GAME_HEIGHT, GAME_WIDTH, GOAL_BACK_DEPTH, GOAL_HEIGHT, GOAL_LINE_OFFSET, RINK } from '../constants'

export function drawRink(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  const centerX = GAME_WIDTH / 2
  const centerY = GAME_HEIGHT / 2
  const leftGoalLineX = RINK.x + GOAL_LINE_OFFSET
  const rightGoalLineX = RINK.x + RINK.width - GOAL_LINE_OFFSET
  const faceoffTopY = centerY - 155
  const faceoffBottomY = centerY + 155
  const faceoffCircleRadius = 66

  g.fillStyle(0xfdfefe, 1)
  g.fillRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)
  g.lineStyle(7, 0x174ca8, 1)
  g.strokeRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)

  g.lineStyle(4, 0x174ca8, 1)
  g.strokeLineShape(new Phaser.Geom.Line(centerX - BLUE_LINE_OFFSET, RINK.y + 8, centerX - BLUE_LINE_OFFSET, RINK.y + RINK.height - 8))
  g.strokeLineShape(new Phaser.Geom.Line(centerX + BLUE_LINE_OFFSET, RINK.y + 8, centerX + BLUE_LINE_OFFSET, RINK.y + RINK.height - 8))
  g.strokeCircle(centerX, centerY, 72)

  g.lineStyle(4, 0xe02626, 1)
  for (let y = RINK.y + 4; y < RINK.y + RINK.height; y += 36) {
    g.strokeLineShape(new Phaser.Geom.Line(centerX, y, centerX, Math.min(y + 18, RINK.y + RINK.height)))
  }
  g.strokeLineShape(new Phaser.Geom.Line(leftGoalLineX, RINK.y + 20, leftGoalLineX, RINK.y + RINK.height - 20))
  g.strokeLineShape(new Phaser.Geom.Line(rightGoalLineX, RINK.y + 20, rightGoalLineX, RINK.y + RINK.height - 20))

  drawFaceoffCircle(g, RINK.x + 245, faceoffTopY, faceoffCircleRadius)
  drawFaceoffCircle(g, RINK.x + 245, faceoffBottomY, faceoffCircleRadius)
  drawFaceoffCircle(g, RINK.x + RINK.width - 245, faceoffTopY, faceoffCircleRadius)
  drawFaceoffCircle(g, RINK.x + RINK.width - 245, faceoffBottomY, faceoffCircleRadius)

  g.fillStyle(0xe02626, 1)
  g.fillCircle(centerX - 132, centerY - 84, 6)
  g.fillCircle(centerX + 132, centerY - 84, 6)
  g.fillCircle(centerX - 132, centerY + 84, 6)
  g.fillCircle(centerX + 132, centerY + 84, 6)

  drawGoalFrame(g, leftGoalLineX, centerY, true)
  drawGoalFrame(g, rightGoalLineX, centerY, false)
  drawGoalCrease(g, leftGoalLineX, centerY, true)
  drawGoalCrease(g, rightGoalLineX, centerY, false)

  scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Prototype build 0.6  •  portería, proporciones y salidas del portero', {
    fontFamily: 'Arial',
    fontSize: '16px',
    color: '#6f86a8',
  }).setOrigin(0.5)
}

function drawGoalFrame(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  g.lineStyle(3, 0x8c9199, 1)
  g.fillStyle(0xe8edf3, 0.55)
  const top = centerY - GOAL_HEIGHT / 2
  const leftX = leftSide ? goalLineX - GOAL_BACK_DEPTH : goalLineX
  const width = GOAL_BACK_DEPTH

  g.fillRect(leftX, top, width, GOAL_HEIGHT)
  g.strokeRect(leftX, top, width, GOAL_HEIGHT)
}

function drawGoalCrease(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  g.lineStyle(4, 0xe02626, 1)
  g.fillStyle(0xbde9ff, 0.85)
  const radius = 34
  const rectWidth = 20
  const rectHeight = 68

  const points = leftSide
    ? [
        new Phaser.Math.Vector2(goalLineX, centerY - radius),
        new Phaser.Math.Vector2(goalLineX - radius, centerY - radius * 0.75),
        new Phaser.Math.Vector2(goalLineX - radius, centerY + radius * 0.75),
        new Phaser.Math.Vector2(goalLineX, centerY + radius),
      ]
    : [
        new Phaser.Math.Vector2(goalLineX, centerY - radius),
        new Phaser.Math.Vector2(goalLineX + radius, centerY - radius * 0.75),
        new Phaser.Math.Vector2(goalLineX + radius, centerY + radius * 0.75),
        new Phaser.Math.Vector2(goalLineX, centerY + radius),
      ]

  g.fillPoints(points, true, true)
  g.strokePoints(points, true, true)

  if (leftSide) {
    g.strokeRoundedRect(goalLineX - rectWidth, centerY - rectHeight / 2, rectWidth, rectHeight, 12)
  } else {
    g.strokeRoundedRect(goalLineX, centerY - rectHeight / 2, rectWidth, rectHeight, 12)
  }
}

function drawFaceoffCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number) {
  g.lineStyle(4, 0xe02626, 1)
  g.strokeCircle(x, y, radius)
  g.fillStyle(0xe02626, 1)
  g.fillCircle(x, y, 5)
  g.strokeLineShape(new Phaser.Geom.Line(x - 18, y, x - 6, y))
  g.strokeLineShape(new Phaser.Geom.Line(x + 6, y, x + 18, y))
  g.strokeLineShape(new Phaser.Geom.Line(x, y - 18, x, y - 6))
  g.strokeLineShape(new Phaser.Geom.Line(x, y + 6, x, y + 18))
  g.strokeLineShape(new Phaser.Geom.Line(x - 32, y - radius, x - 32, y - radius + 18))
  g.strokeLineShape(new Phaser.Geom.Line(x + 32, y - radius, x + 32, y - radius + 18))
  g.strokeLineShape(new Phaser.Geom.Line(x - 32, y + radius - 18, x - 32, y + radius))
  g.strokeLineShape(new Phaser.Geom.Line(x + 32, y + radius - 18, x + 32, y + radius))
}
