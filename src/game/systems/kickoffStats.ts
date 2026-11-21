import { RINK } from '../constants'

type Team = 'blue' | 'red'
type Pair = Record<Team, number>

/** Ventanas de medida (ms), no de juego: tope del acarreo, plazo para cruzar y pérdida «temprana». */
const CARRY_CAP_MS = 6000
const CROSS_WINDOW_MS = 15000
const LOST_EARLY_MS = 3000

type View = {
  ballCarrierId: string | null
  ball: { x: number, y: number }
  players: Array<{ id: string, team: Team, side: 'left' | 'right' }>
  lastTouch: Team
  simNow: number
  activeKickoff: unknown
  activeFoulRestart: unknown
  activeBully: unknown
}

/**
 * R-05 · cómo se ejecuta el saque de centro (art. 5.2, 5.6, 5.7; solo lectura, lo llama matchStats
 * una vez por paso). El saque termina al pitar (activeKickoff pasa a null). Por equipo que saca:
 * saques, ms de acarreo del que saca (tope 6 s), saques en que la bola cruza a campo rival sin que
 * el rival la controle (y ms hasta cruzar) y saques perdidos en los primeros 3 s.
 */
export function kickoffTracker(s: View) {
  const mk = (): Pair => ({ blue: 0, red: 0 })
  const stats = { kickoffsTaken: mk(), kickoffCarryMsSum: mk(), kickoffCrossed: mk(), kickoffCrossMsSum: mk(), kickoffLostEarly: mk() }
  let prevKickoff: unknown = null
  let tr: null | { team: Team, at: number, taker: string | null, atkRight: boolean } = null

  /** Cierra el acarreo si seguía en curso y termina el seguimiento. */
  const close = () => {
    if (tr?.taker) stats.kickoffCarryMsSum[tr.team] += Math.min(CARRY_CAP_MS, s.simNow - tr.at)
    tr = null
  }

  const step = () => {
    if (s.activeKickoff || s.activeFoulRestart || s.activeBully) close()
    if (prevKickoff && !s.activeKickoff) {
      const c = s.ballCarrierId ? s.players.find(p => p.id === s.ballCarrierId) : undefined
      const team = c ? c.team : s.lastTouch
      const side = s.players.find(p => p.team === team)?.side
      stats.kickoffsTaken[team]++
      tr = { team, at: s.simNow, taker: c && c.team === team ? c.id : null, atkRight: side === 'left' }
    }
    prevKickoff = s.activeKickoff
    if (!tr) return
    const el = s.simNow - tr.at
    const carrier = s.ballCarrierId ? s.players.find(p => p.id === s.ballCarrierId) : undefined
    const rivalHas = !!carrier && carrier.team !== tr.team
    // El acarreo acaba al soltar la bola o perderla
    if (tr.taker && s.ballCarrierId !== tr.taker) {
      stats.kickoffCarryMsSum[tr.team] += Math.min(CARRY_CAP_MS, el)
      tr.taker = null
    }
    const cx = RINK.x + RINK.width / 2
    const crossed = tr.atkRight ? s.ball.x > cx : s.ball.x < cx
    if (rivalHas) {
      if (el <= LOST_EARLY_MS) stats.kickoffLostEarly[tr.team]++
      close()
    } else if (crossed) {
      if (el <= CROSS_WINDOW_MS) { stats.kickoffCrossed[tr.team]++; stats.kickoffCrossMsSum[tr.team] += el }
      close()
    } else if (el > CROSS_WINDOW_MS) close()
  }

  return { step, stats }
}
