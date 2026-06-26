import * as Phaser from 'phaser'
import type { ActiveBully, ActiveFoulRestart, Ball, TeamColor, Player } from '../types'
import { getControlledPlayer, selectBestControlledPlayer } from './playerHelpers'
import { updateVisuals } from './visuals'
import { checkGoal } from './ball'
import { applyGoalReset } from './matchFlow'

/**
 * Espera el retardo de celebración de gol y lanza el kickoff cuando expira.
 *
 * Devuelve 0 si el reinicio ya se ejecutó, o el mismo restartAt si aún no.
 */
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

/**
 * Cortocircuita el tick normal del partido durante bully o falta.
 *
 * Actualiza el modo especial activo, refresca visuales y HUD, y devuelve true
 * para que la escena omita el resto de la lógica del frame.
 */
export function handleSpecialMatchStates(options: {
  activeBully: ActiveBully | null
  activeFoulRestart: ActiveFoulRestart | null
  players: Player[]
  controlledPlayerIndex: number
  ball: Ball
  ballCarrierId: string | null
  timeNow: number
  updateBullyState: () => void
  updateFoulRestartState: () => void
  updateHud: () => void
}) {
  if (options.activeBully) {
    options.updateBullyState()
    updateVisuals(options.players, getControlledPlayer(options.players, options.controlledPlayerIndex), options.ball, options.ballCarrierId, options.timeNow)
    options.updateHud()
    return true
  }

  if (options.activeFoulRestart) {
    options.updateFoulRestartState()
    updateVisuals(options.players, getControlledPlayer(options.players, options.controlledPlayerIndex), options.ball, options.ballCarrierId, options.timeNow)
    options.updateHud()
    return true
  }

  return false
}

/**
 * Transfiere el control al mejor candidato azul cuando el jugador pulsa switch.
 *
 * Si el equipo azul tiene la bola, se cambia al portador. Si no, al más cercano
 * a la bola. No hace nada si justDown es false.
 */
export function maybeSwitchControlledPlayer(options: {
  justDown: boolean
  players: Player[]
  controlledPlayerIndex: number
  ballCarrierId: string | null
  ball: Ball
}) {
  if (!options.justDown) return options.controlledPlayerIndex
  return selectBestControlledPlayer(options.players, options.controlledPlayerIndex, options.ballCarrierId, options.ball.x, options.ball.y)
}

/**
 * Valida si la bola cruzó la portería por el frente, actualiza el marcador,
 * congela la bola en la red y devuelve el estado para la celebración.
 *
 * Devuelve null si no se ha marcado ningún gol este frame.
 */
export function checkAndApplyGoal(options: {
  ball: Ball
  ballVelocity: { x: number, y: number }
  ballCarrierId: string | null
  players: Player[]
  blueScore: number
  redScore: number
  centerText: Phaser.GameObjects.Text
  time: number
  enteredFromFront: { left: boolean; right: boolean }
}) {
  const goal = checkGoal(options.ball, options.ballVelocity, options.enteredFromFront)
  if (!goal) return null

  options.ball.x = goal.holdX
  options.ball.y = goal.holdY
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
    applyGoalReset({ scorer: goal.scorer, players: options.players, ball: options.ball })
  } else {
    next.blueScore += 1
    options.centerText.setText('¡Gol azul!').setVisible(true)
    applyGoalReset({ scorer: goal.scorer, players: options.players, ball: options.ball })
  }

  return next
}
