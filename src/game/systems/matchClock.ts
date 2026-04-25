import type { RuleState } from './rules'

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

  if (options.currentPeriod < 4) {
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
      restartAt: options.timeNow + 1400,
    }
  }

  options.finishMatch()
  return {
    remainingSeconds,
    currentPeriod: options.currentPeriod,
    ruleState: options.ruleState,
  }
}
