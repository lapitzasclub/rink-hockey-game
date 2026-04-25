import * as Phaser from 'phaser'
import { getControlledPlayer } from '../systems/playerHelpers'
import { getRoleName } from '../utils'
import type { Player } from '../types'
import type { RuleState } from '../systems/rules'


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
  options.hudText.setText(`Azul ${options.blueScore} - ${options.redScore} Rojo   ·   T${options.currentPeriod} ${minutes}:${seconds.toString().padStart(2, '0')}   ·   Faltas ${options.ruleState.teamFouls.blue}-${options.ruleState.teamFouls.red}`)
  const controlled = getControlledPlayer(options.players, options.controlledPlayerIndex)
  const stamina = Math.round(controlled.stamina ?? 100)
  options.subHudText.setText(`Controlas: ${getRoleName(controlled.role)} azul · Estamina propia ${stamina}%${controlled.sprinting ? ' · Sprint' : ''}\nWASD mover · SHIFT sprint · U acción (tiro / robo) · Y pase o cambio jugador`)
}
