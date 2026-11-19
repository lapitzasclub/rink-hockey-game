import { PERIOD_COUNT, PERIOD_RESTART_DELAY_MS } from '../constants'
import type { RuleState } from './rules'

/**
 * Escala del reloj del partido en curso: segundos de juego por segundo real.
 * El marcador cuenta 25:00 por parte aunque la parte dure pocos minutos reales;
 * lo que se mide en tiempo de juego (tarjeta azul) se convierte con esto.
 * MatchScene lo fija al empezar cada partido.
 */
export const matchTime = { scale: 1 }

/** Milisegundos reales que dura un intervalo dado en tiempo de juego. */
export function gameToRealMs(gameMs: number) {
  return gameMs / matchTime.scale
}

/**
 * Decrementa el reloj en 1 segundo de juego y gestiona el descanso entre partes.
 * Se llama cada `1000 / matchTime.scale` ms reales.
 *
 * Si el tiempo llega a cero y quedan periodos, inicia el siguiente con un
 * retardo de celebración. Si era el último periodo, llama a finishMatch.
 * Las faltas de equipo pasan de una parte a la otra (art. 17.2).
 */
export function tickMatchClock(options: {
  matchEnded: boolean
  restartAt: number
  /** Tiempo efectivo (art. 3): el reloj se para en los saques de centro, de falta y neutrales. */
  paused?: boolean
  remainingSeconds: number
  currentPeriod: number
  ruleState: RuleState
  centerText: { setText(text: string): { setVisible(visible: boolean): unknown } }
  timeNow: number
  matchDuration: number
  finishMatch: () => void
}) {
  if (options.matchEnded || options.restartAt > 0 || options.paused) {
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
    }
    options.centerText.setText(`Descanso · cambio de campo\nEmpieza la ${currentPeriod}ª parte`).setVisible(true)
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
