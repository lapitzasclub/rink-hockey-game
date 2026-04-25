import * as Phaser from 'phaser'
import { BLUE_LINE_OFFSET, GAME_HEIGHT, GAME_WIDTH, GOAL_HEIGHT, GOAL_LINE_OFFSET, RINK } from '../constants'

export function drawRink(scene: Phaser.Scene) {
  const g = scene.add.graphics()
  const centerX = GAME_WIDTH / 2
  const centerY = GAME_HEIGHT / 2
  const leftGoalLineX = RINK.x + GOAL_LINE_OFFSET
  const rightGoalLineX = RINK.x + RINK.width - GOAL_LINE_OFFSET
  const leftBlueLineX = centerX - BLUE_LINE_OFFSET
  const rightBlueLineX = centerX + BLUE_LINE_OFFSET

  g.fillStyle(0xfefefe, 1)
  g.fillRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)
  g.lineStyle(7, 0x111111, 1)
  g.strokeRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 86)

  g.lineStyle(4, 0x111111, 1)
  g.strokeLineShape(new Phaser.Geom.Line(centerX, RINK.y + 8, centerX, RINK.y + RINK.height - 8))
  g.strokeCircle(centerX, centerY, 72)
  g.fillStyle(0x111111, 1)
  g.fillCircle(centerX, centerY, 7)

  g.lineStyle(4, 0xe32626, 1)
  g.strokeLineShape(new Phaser.Geom.Line(leftBlueLineX, RINK.y + 8, leftBlueLineX, RINK.y + RINK.height - 8))
  g.strokeLineShape(new Phaser.Geom.Line(rightBlueLineX, RINK.y + 8, rightBlueLineX, RINK.y + RINK.height - 8))

  drawPenaltyArea(g, leftGoalLineX, centerY, true)
  drawPenaltyArea(g, rightGoalLineX, centerY, false)
  drawGoalCrease(g, leftGoalLineX, centerY, true)
  drawGoalCrease(g, rightGoalLineX, centerY, false)
  drawGoalFrame(g, leftGoalLineX, centerY, true)
  drawGoalFrame(g, rightGoalLineX, centerY, false)

  drawFreeHitDots(g, leftBlueLineX, rightBlueLineX, centerY)

  scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Prototype build 0.7  •  pista adaptada a hockey patines', {
    fontFamily: 'Arial',
    fontSize: '16px',
    color: '#6f86a8',
  }).setOrigin(0.5)
}

function drawPenaltyArea(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  g.lineStyle(4, 0xe32626, 1)
  const boxWidth = 134
  const boxHeight = 286
  const top = centerY - boxHeight / 2
  const x = leftSide ? goalLineX : goalLineX - boxWidth
  g.strokeRect(x, top, boxWidth, boxHeight)
}

function drawGoalFrame(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  g.lineStyle(4, 0xe32626, 1)
  const top = centerY - GOAL_HEIGHT / 2 + 18
  const goalWidth = 24
  const x = leftSide ? goalLineX - goalWidth : goalLineX
  g.strokeRoundedRect(x, top, goalWidth, GOAL_HEIGHT - 36, 8)
}

function drawGoalCrease(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  g.lineStyle(4, 0xe32626, 1)
  const radius = 40
  if (leftSide) {
    g.beginPath()
    g.arc(goalLineX, centerY, radius, Phaser.Math.DegToRad(270), Phaser.Math.DegToRad(90), false)
    g.strokePath()
  } else {
    g.beginPath()
    g.arc(goalLineX, centerY, radius, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270), false)
    g.strokePath()
  }
}

function drawFreeHitDots(g: Phaser.GameObjects.Graphics, leftBlueLineX: number, rightBlueLineX: number, centerY: number) {
  g.fillStyle(0x111111, 1)
  const leftDot1 = leftBlueLineX - 92
  const leftDot2 = leftBlueLineX - 28
  const rightDot1 = rightBlueLineX + 28
  const rightDot2 = rightBlueLineX + 92
  g.fillCircle(leftDot1, centerY, 7)
  g.fillCircle(leftDot2, centerY, 7)
  g.fillCircle(rightDot1, centerY, 7)
  g.fillCircle(rightDot2, centerY, 7)
}
