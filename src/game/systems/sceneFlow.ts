import * as Phaser from 'phaser'
import type { Ball, Player } from '../types'
import { selectBestControlledPlayer } from './playerHelpers'
import { checkGoal } from './ball'
import { applyGoalReset } from './matchFlow'
import { nombreDeHueco } from '../externalMatch'

/**
 * Espera el retardo de la celebración del gol o del descanso y, al vencer,
 * lanza el reinicio (el ritual del saque de centro).
 *
 * Devuelve 0 si el reinicio ya se ejecutó, o el mismo restartAt si aún no.
 */
export function handlePendingRestart(options: {
  time: number
  restartAt: number
  centerText: Phaser.GameObjects.Text
  onRestart: () => void
}) {
  if (options.restartAt > 0 && options.time >= options.restartAt) {
    options.centerText.setVisible(false)
    options.onRestart()
    return 0
  }
  return options.restartAt
}

/**
 * Transfiere el control al mejor candidato azul cuando el jugador pulsa switch.
 *
 * Si el equipo azul tiene la bola, se cambia al portador. Si no, al compañero hacia donde
 * marca el stick o al más cercano a la bola (selectBestControlledPlayer).
 * No hace nada si justDown es false.
 */
export function maybeSwitchControlledPlayer(options: {
  justDown: boolean
  players: Player[]
  controlledPlayerIndex: number
  ballCarrierId: string | null
  ball: Ball
  timeNow: number
  aim: { x: number, y: number }
}) {
  if (!options.justDown) return options.controlledPlayerIndex
  return selectBestControlledPlayer(options.players, options.controlledPlayerIndex, options.ballCarrierId, options.ball.x, options.ball.y, options.timeNow, { aim: options.aim })
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
  const goal = checkGoal(options.ball, options.ballVelocity, options.enteredFromFront, options.players)
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
    options.centerText.setText(`¡Gol ${nombreDeHueco('red', 'rojo')}!`).setVisible(true)
    applyGoalReset({ scorer: goal.scorer, players: options.players, ball: options.ball })
  } else {
    next.blueScore += 1
    options.centerText.setText(`¡Gol ${nombreDeHueco('blue', 'azul')}!`).setVisible(true)
    applyGoalReset({ scorer: goal.scorer, players: options.players, ball: options.ball })
  }

  return next
}
