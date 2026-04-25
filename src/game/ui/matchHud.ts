import * as Phaser from 'phaser'
import { GAME_HEIGHT } from '../constants'
import { getControlledPlayer } from '../systems/playerHelpers'
import { getRoleName } from '../utils'
import type { Player } from '../types'
import type { RuleState } from '../systems/rules'

export function createTouchDebugText(scene: Phaser.Scene) {
  return scene.add.text(20, GAME_HEIGHT - 78, '', {
    fontFamily: 'Arial',
    fontSize: '16px',
    color: '#9fd3ff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: { x: 6, y: 4 },
  }).setDepth(30)
}

export function updateTouchDebugText(options: {
  text: Phaser.GameObjects.Text
  players: Player[]
  controlledPlayerIndex: number
  joystickInput: { x: number, y: number, debug?: string, build?: string }
  isTouchDevice: boolean
}) {
  const controlled = getControlledPlayer(options.players, options.controlledPlayerIndex)
  options.text.setText(
    `joy ${options.joystickInput.x.toFixed(2)},${options.joystickInput.y.toFixed(2)} | ` +
    `vel ${controlled.velocity.x.toFixed(1)},${controlled.velocity.y.toFixed(1)} | ` +
    `touch-ui ${options.isTouchDevice ? 'on' : 'off'} | ` +
    `${options.joystickInput.build ?? 'no-build'} | ${options.joystickInput.debug ?? 'no-debug'}`,
  )
}

export function updateMatchHud(options: {
  hudText: Phaser.GameObjects.Text
  subHudText: Phaser.GameObjects.Text
  remainingSeconds: number
  currentPeriod: number
  blueScore: number
  redScore: number
  ruleState: RuleState
  players: Player[]
  controlledPlayerIndex: number
}) {
  const minutes = Math.floor(options.remainingSeconds / 60)
  const seconds = options.remainingSeconds % 60
  options.hudText.setText(`Azul ${options.blueScore}  -  ${options.redScore} Rojo   |   T${options.currentPeriod} ${minutes}:${seconds.toString().padStart(2, '0')}   |   Faltas ${options.ruleState.teamFouls.blue}-${options.ruleState.teamFouls.red}`)
  const controlled = getControlledPlayer(options.players, options.controlledPlayerIndex)
  options.subHudText.setText(`Controlas: ${getRoleName(controlled.role)} azul | WASD mover | X pase | ESPACIO tiro | SHIFT cambia jugador`)
}
