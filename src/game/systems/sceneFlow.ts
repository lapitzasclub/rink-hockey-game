import * as Phaser from 'phaser'
import type { ActiveBully, ActiveFoulRestart, TeamColor, Player } from '../types'
import { getControlledPlayer, selectBestControlledPlayer } from './playerHelpers'
import { updateVisuals } from './visuals'
import { checkGoal } from './ball'
import { applyGoalReset } from './matchFlow'

export function handlePendingRestart(options: {
  time: number
  restartAt: number
  centerText: Phaser.GameObjects.Text
  lastTouch: TeamColor
  resetKickoff: (team: TeamColor) => void
}) {
  if (options.restartAt > 0 && options.time >= options.restartAt) {
    options.centerText.setVisible(false)
    options.resetKickoff(options.lastTouch === 'blue' ? 'red' : 'blue')
    return 0
  }
  return options.restartAt
}

export function handleSpecialMatchStates(options: {
  activeBully: ActiveBully | null
  activeFoulRestart: ActiveFoulRestart | null
  players: Player[]
  controlledPlayerIndex: number
  ball: Phaser.GameObjects.Arc
  ballCarrierId: string | null
  updateBullyState: () => void
  updateFoulRestartState: () => void
  updateHud: () => void
}) {
  if (options.activeBully) {
    options.updateBullyState()
    updateVisuals(options.players, getControlledPlayer(options.players, options.controlledPlayerIndex), options.ball, options.ballCarrierId)
    options.updateHud()
    return true
  }

  if (options.activeFoulRestart) {
    options.updateFoulRestartState()
    updateVisuals(options.players, getControlledPlayer(options.players, options.controlledPlayerIndex), options.ball, options.ballCarrierId)
    options.updateHud()
    return true
  }

  return false
}

export function maybeSwitchControlledPlayer(options: {
  justDown: boolean
  players: Player[]
  controlledPlayerIndex: number
  ballCarrierId: string | null
  ball: Phaser.GameObjects.Arc
}) {
  if (!options.justDown) return options.controlledPlayerIndex
  return selectBestControlledPlayer(options.players, options.controlledPlayerIndex, options.ballCarrierId, options.ball.x, options.ball.y)
}

export function checkAndApplyGoal(options: {
  ball: Phaser.GameObjects.Arc
  ballVelocity: { x: number, y: number }
  ballCarrierId: string | null
  players: Player[]
  blueScore: number
  redScore: number
  centerText: Phaser.GameObjects.Text
  time: number
}) {
  const goal = checkGoal(options.ball)
  if (!goal) return null

  options.ball.setPosition(goal.holdX, goal.holdY)
  const next = {
    ballVelocity: { x: 0, y: 0 },
    ballCarrierId: null,
    blueScore: options.blueScore,
    redScore: options.redScore,
    restartAt: options.time + 1800,
  }

  if (goal.scorer === 'red') {
    next.redScore += 1
    options.centerText.setText('¡Gol rojo!').setVisible(true)
    applyGoalReset({ message: '¡Gol rojo!', players: options.players, ball: options.ball })
  } else {
    next.blueScore += 1
    options.centerText.setText('¡Gol azul!').setVisible(true)
    applyGoalReset({ message: '¡Gol azul!', players: options.players, ball: options.ball })
  }

  return next
}
