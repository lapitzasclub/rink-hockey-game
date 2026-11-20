import { goaliePassLog } from './targeting'

type Team = 'blue' | 'red'
type Pair = Record<Team, number>

/** Ventana (ms) tras un pase al portero propio en la que un gol encajado cuenta como «después». */
const GOAL_AFTER_MS = 5000

/**
 * B-09 · estadísticas del pase al portero propio (solo lectura, lo llama matchStats una vez por
 * paso): pases por equipo que pasa, los que acaba atrapando el portero (el primero en hacerse con
 * la bola es él) y goles encajados por ese equipo en los GOAL_AFTER_MS siguientes.
 */
export function goaliePassTracker(s: { ballCarrierId: string | null, simNow: number, blueScore: number, redScore: number }) {
  const stats = { goaliePasses: { blue: 0, red: 0 } as Pair, goaliePassesDone: { blue: 0, red: 0 } as Pair, goalsAfterGoaliePass: { blue: 0, red: 0 } as Pair }
  let serial = goaliePassLog.serial
  let pass: null | { team: Team, id: string, at: number, open: boolean } = null
  const prevScore: Pair = { blue: s.blueScore, red: s.redScore }

  const step = () => {
    if (goaliePassLog.serial !== serial) {
      serial = goaliePassLog.serial
      stats.goaliePasses[goaliePassLog.team]++
      pass = { team: goaliePassLog.team, id: goaliePassLog.goalieId, at: s.simNow, open: true }
    }
    if (pass?.open && s.ballCarrierId) {
      pass.open = false
      if (s.ballCarrierId === pass.id) stats.goaliePassesDone[pass.team]++
    }
    // Gol del rival del equipo que pasó (blueScore sube = encaja el rojo)
    const conceded: Team | null = s.redScore > prevScore.red ? 'blue' : s.blueScore > prevScore.blue ? 'red' : null
    if (pass && conceded === pass.team && s.simNow - pass.at <= GOAL_AFTER_MS) stats.goalsAfterGoaliePass[pass.team]++
    prevScore.blue = s.blueScore
    prevScore.red = s.redScore
    if (pass && s.simNow - pass.at > GOAL_AFTER_MS) pass = null
  }

  return { step, stats }
}
