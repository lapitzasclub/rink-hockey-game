import { PERIOD_COUNT, PERIOD_RESTART_DELAY_MS } from '../constants'
import type { RuleState } from './rules'

/**
 * Decrementa el reloj en 1 segundo y gestiona el cambio de periodo.
 *
 * Si el tiempo llega a cero y quedan periodos, inicia el siguiente con un
 * retardo de celebración. Si era el último periodo, llama a finishMatch.
 * Las faltas por equipo se resetean al inicio de cada nuevo periodo.
 */
export function tickMatchClock(options: {
  matchEnded: boolean
  restartAt: number
  remainingSeconds: number
  currentPeriod: number
  ruleState: RuleState
  centerText: { setText(text: string): { setVisible(visible: boolean): unknown } }
  timeNow: number
  matchDuration: number
  finishMatch: () => void
}) {
  if (options.matchEnded || options.restartAt > 0) {
    return {
      remainingSeconds: options.remainingSeconds,
      currentPeriod: options.currentPeriod,
      ruleState: options.ruleState,
    }
  }

  const remainingSeconds = Math.max(0, options.remainingSeconds - 1)
  if (remainingSeconds !== 0) {
    return {
      remainingSeconds,
      currentPeriod: options.currentPeriod,
      ruleState: options.ruleState,
    }
  }

  if (options.currentPeriod < PERIOD_COUNT) {
    const currentPeriod = options.currentPeriod + 1
    const ruleState = {
      ...options.ruleState,
      period: currentPeriod,
      teamFouls: { blue: 0, red: 0 },
    }
    options.centerText.setText(`Inicio del ${currentPeriod}º tiempo`).setVisible(true)
    return {
      remainingSeconds: options.matchDuration,
      currentPeriod,
      ruleState,
      restartAt: options.timeNow + PERIOD_RESTART_DELAY_MS,
    }
  }

  options.finishMatch()
  return {
    remainingSeconds,
    currentPeriod: options.currentPeriod,
    ruleState: options.ruleState,
  }
}
