import * as Phaser from 'phaser'
import { PLAYER_ACCEL } from '../constants'
import { applySkating } from './movement'
import { getControlledPlayer } from './playerHelpers'
import type { Player } from '../types'

export function updateControlledPlayerMotion(options: {
  players: Player[]
  controlledPlayerIndex: number
  cursors: Phaser.Types.Input.Keyboard.CursorKeys
  wasd: Record<string, Phaser.Input.Keyboard.Key>
  joystickInput: { x: number, y: number }
  isTouchDevice: boolean
  dt: number
}) {
  const player = getControlledPlayer(options.players, options.controlledPlayerIndex)

  const keyboardInputX =
    (options.cursors.left.isDown || options.wasd.A.isDown ? -1 : 0) +
    (options.cursors.right.isDown || options.wasd.D.isDown ? 1 : 0)
  const keyboardInputY =
    (options.cursors.up.isDown || options.wasd.W.isDown ? -1 : 0) +
    (options.cursors.down.isDown || options.wasd.S.isDown ? 1 : 0)

  const usingJoystick = options.isTouchDevice && Math.hypot(options.joystickInput.x, options.joystickInput.y) > 0.08
  const inputX = usingJoystick ? options.joystickInput.x : keyboardInputX
  const inputY = usingJoystick ? options.joystickInput.y : keyboardInputY

  const len = Math.hypot(inputX, inputY)
  if (len > 0) {
    player.velocity.x += (inputX / len) * PLAYER_ACCEL * options.dt
    player.velocity.y += (inputY / len) * PLAYER_ACCEL * options.dt
    player.facing = { x: inputX / len, y: inputY / len }
  }

  applySkating(player, options.dt)
  return player
}

export function updateTeamAIPlayers(options: {
  players: Player[]
  controlledPlayerIndex: number
  ball: Phaser.GameObjects.Arc
  ballCarrierId: string | null
  dt: number
  timeNow: number
  updateGoalieAI: (player: Player, ballX: number, ballY: number, dt: number, timeNow: number) => void
  updateFieldPlayerAI: (players: Player[], player: Player, ballX: number, ballY: number, ballCarrierId: string | null, dt: number) => void
}) {
  const controlled = getControlledPlayer(options.players, options.controlledPlayerIndex)

  for (const player of options.players) {
    if (player.id === controlled.id) continue
    if (player.role === 'goalie') options.updateGoalieAI(player, options.ball.x, options.ball.y, options.dt, options.timeNow)
    else options.updateFieldPlayerAI(options.players, player, options.ball.x, options.ball.y, options.ballCarrierId, options.dt)
    applySkating(player, options.dt)
  }
}
