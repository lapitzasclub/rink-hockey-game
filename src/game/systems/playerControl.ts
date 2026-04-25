import * as Phaser from 'phaser'
import { PLAYER_ACCEL, PLAYER_SPRINT_ACCEL_MULTIPLIER, STAMINA_LOW_THRESHOLD, STAMINA_MAX, STAMINA_RECOVERY_PER_SECOND, STAMINA_SPRINT_DRAIN_PER_SECOND } from '../constants'
import { applySkating } from './movement'
import { getControlledPlayer } from './playerHelpers'
import type { Player } from '../types'

export function updateControlledPlayerMotion(options: {
  players: Player[]
  controlledPlayerIndex: number
  cursors: Phaser.Types.Input.Keyboard.CursorKeys
  wasd: Record<string, Phaser.Input.Keyboard.Key>
  joystickInput: { x: number, y: number }
  sprintKey: Phaser.Input.Keyboard.Key
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

  const wantsSprint = !!options.sprintKey?.isDown && lenientCanSprint(player)
  player.sprinting = wantsSprint && len > 0

  if (player.sprinting) player.stamina = Math.max(0, (player.stamina ?? STAMINA_MAX) - STAMINA_SPRINT_DRAIN_PER_SECOND * options.dt)
  else player.stamina = Math.min(STAMINA_MAX, (player.stamina ?? STAMINA_MAX) + STAMINA_RECOVERY_PER_SECOND * options.dt)

  const accel = PLAYER_ACCEL * (player.sprinting ? PLAYER_SPRINT_ACCEL_MULTIPLIER : 1)
  if (len > 0) {
    player.velocity.x += (inputX / len) * accel * options.dt
    player.velocity.y += (inputY / len) * accel * options.dt
    player.facing = { x: inputX / len, y: inputY / len }
  }

  applySkating(player, options.dt)
  return player
}

function lenientCanSprint(player: Player) {
  return (player.stamina ?? STAMINA_MAX) > STAMINA_LOW_THRESHOLD
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
    player.stamina = Math.min(STAMINA_MAX, (player.stamina ?? STAMINA_MAX) + STAMINA_RECOVERY_PER_SECOND * options.dt * 0.8)
    if (player.role === 'goalie') {
      player.sprinting = false
      options.updateGoalieAI(player, options.ball.x, options.ball.y, options.dt, options.timeNow)
    } else {
      options.updateFieldPlayerAI(options.players, player, options.ball.x, options.ball.y, options.ballCarrierId, options.dt)
    }
    if (player.sprinting) player.stamina = Math.max(0, (player.stamina ?? STAMINA_MAX) - STAMINA_SPRINT_DRAIN_PER_SECOND * options.dt * 0.55)
    applySkating(player, options.dt)
  }
}
