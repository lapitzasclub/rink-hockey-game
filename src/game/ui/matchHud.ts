import * as Phaser from 'phaser'
import { getControlledPlayer } from '../systems/playerHelpers'
import { getRoleName } from '../utils'
import type { Player } from '../types'
import type { RuleState } from '../systems/rules'

/** Formatea segundos totales como M:SS (ej. 90 → "1:30"). */
function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Refresca el HUD superior (marcador, tiempo, faltas) y el subtexto del jugador
 * controlado (rol, stamina, sprint, suspensiones activas).
 */
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
  timeNow: number
}) {
  options.hudText.setText(
    `Azul ${options.blueScore} — ${options.redScore} Rojo   ·   T${options.currentPeriod}  ${formatClock(options.remainingSeconds)}   ·   F ${options.ruleState.teamFouls.blue}-${options.ruleState.teamFouls.red}`
  )
  const controlled = getControlledPlayer(options.players, options.controlledPlayerIndex)
  const stamina = Math.round(controlled.stamina ?? 100)

  // Suspensiones activas (tarjeta azul)
  const suspensions = options.players
    .filter(p => p.suspendedUntil && p.suspendedUntil > options.timeNow)
    .map(p => {
      const secsLeft = Math.ceil((p.suspendedUntil! - options.timeNow) / 1000)
      return `${p.team === 'blue' ? 'AZ' : 'RJ'} ${secsLeft}s`
    })
  const suspText = suspensions.length > 0 ? `  ·  ⬛ ${suspensions.join(' ')}` : ''

  options.subHudText.setText(
    `${getRoleName(controlled.role)} azul · Stam ${stamina}%${controlled.sprinting ? ' · SPRINT' : ''}${suspText}`
  )
}
