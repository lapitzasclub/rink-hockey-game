import { GAME_HEIGHT, PASSIVITY, RINK } from '../constants'
import type { Ball, Player, TeamColor, Vector } from '../types'
import { getGoalLineX } from '../utils'
import { registerPassivity, type PassivityState, type RuleState } from './rules'

/**
 * Tiempo de posesión y juego pasivo (B-10, solo reglamento).
 *
 * - Tiempo de posesión: con la bola en su campo, el equipo que la tiene debe
 *   pasar la línea central en PASSIVITY.ownHalfMs (returnMs si vuelve tras
 *   pisar campo rival).
 * - Juego pasivo (aproximación del criterio del árbitro): en campo rival, el
 *   portador sin rival encima que ni avanza ni tira acumula tiempo; al llegar a
 *   passiveMs hay aviso y, warnMs después, libre indirecto. La presión para
 *   el contador; avanzar o tirar lo anula.
 *
 * Se avanza en stepSimulation solo con la bola en juego: un hueco entre pasos
 * (gol, falta, saque) reinicia la posesión.
 */

const CX = RINK.x + RINK.width / 2
const CY = GAME_HEIGHT / 2

/**
 * Lo que lee la IA (aiDecision): urgencia 0..1 de cada equipo frente a su
 * límite y si es por cruzar el centro (cross) o por atacar sin tirar.
 * `at` es el simNow del último paso; si no es reciente, la IA lo ignora.
 */
export const passivityView = {
  at: -Infinity,
  urgency: { blue: 0, red: 0 } as Record<TeamColor, number>,
  cross: { blue: false, red: false } as Record<TeamColor, boolean>,
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function resetIdle(ps: PassivityState) {
  ps.idleMs = 0
  ps.bestDist = Infinity
  ps.warned = false
  ps.warnElapsedMs = 0
}

function resetPossession(ps: PassivityState, team: TeamColor | null) {
  ps.team = team
  ps.crossed = false
  ps.ownSince = -1
  resetIdle(ps)
}

/** Algún rival de campo disponible a menos de PASSIVITY.pressPx del portador. */
function pressed(carrier: Player, players: Player[], now: number) {
  for (const r of players) {
    if (r.team === carrier.team || r.role === 'goalie') continue
    if ((r.suspendedUntil ?? 0) > now || (r.stunUntil ?? 0) > now) continue
    if (Math.hypot(r.pos.x - carrier.pos.x, r.pos.y - carrier.pos.y) < PASSIVITY.pressPx) return true
  }
  return false
}

/**
 * Un paso de los contadores. Pita (deja `pendingFoul`) si se agota un límite y
 * devuelve 'warn' el paso en que el árbitro avisa de juego pasivo.
 */
export function updatePassivity(rs: RuleState, o: { players: Player[], ball: Ball, ballVelocity: Vector, carrierId: string | null, now: number }): 'warn' | null {
  const ps = rs.passivity
  const { players, ball, now } = o
  const gap = now - ps.lastStep
  ps.lastStep = now
  const resumed = gap > PASSIVITY.resumeGapMs
  if (resumed) resetPossession(ps, null)
  const dtMs = resumed ? 0 : gap
  passivityView.at = now
  passivityView.urgency.blue = passivityView.urgency.red = 0
  passivityView.cross.blue = passivityView.cross.red = false
  const prevHud = ps.hudKind
  ps.hudKind = null

  let carrier: Player | null = null
  if (o.carrierId) for (const p of players) if (p.id === o.carrierId) { carrier = p; break }
  if (carrier && carrier.team !== ps.team) resetPossession(ps, carrier.team)
  const team = ps.team
  if (!team) return null
  let side: Player['side'] = 'left'
  for (const p of players) if (p.team === team) { side = p.side; break }
  const adv = side === 'left' ? 1 : -1
  const own = carrier !== null && carrier.team === team
  const busy = !!(rs.pendingFoul || rs.pendingBully)

  const rel = (ball.x - CX) * adv
  if (rel > 0) {
    ps.crossed = true
    ps.ownSince = -1
  } else if (rel < 0 && ps.ownSince < 0) {
    ps.ownSince = now
    ps.limitMs = ps.crossed ? PASSIVITY.returnMs : PASSIVITY.ownHalfMs
    resetIdle(ps)
  }

  if (ps.ownSince >= 0) {
    const left = ps.limitMs - (now - ps.ownSince)
    // Agotado con la bola suelta se espera a ver quién la controla: si es el rival, posesión nueva
    if (left <= 0 && own && !busy) {
      registerPassivity(rs, players, team, 'possession', ball.x, ball.y, now)
      resetPossession(ps, null)
      return null
    }
    if (left <= PASSIVITY.hudFromMs) {
      ps.hudKind = 'possession'
      ps.hudTeam = team
      ps.hudMs = Math.max(0, left)
      if (prevHud !== 'possession') ps.stats.countdowns++
    }
    passivityView.urgency[team] = clamp01((PASSIVITY.aiLeadMs - left) / PASSIVITY.aiLeadMs)
    passivityView.cross[team] = true
    return null
  }

  // Campo rival: un tiro (bola suelta y rápida hacia la portería rival) anula el contador
  const vx = o.ballVelocity.x
  if (!carrier && vx * adv > 0 && Math.hypot(vx, o.ballVelocity.y) >= PASSIVITY.shotSpeed) resetIdle(ps)
  let result: 'warn' | null = null
  if (own && carrier && carrier.role !== 'goalie') {
    const d = Math.hypot(getGoalLineX(side === 'left' ? 'right' : 'left') - carrier.pos.x, CY - carrier.pos.y)
    if (d < ps.bestDist - PASSIVITY.advancePx) {
      resetIdle(ps)
      ps.bestDist = d
    } else if (!pressed(carrier, players, now)) {
      if (ps.warned) {
        ps.warnElapsedMs += dtMs
        if (ps.warnElapsedMs >= PASSIVITY.warnMs && !busy) {
          registerPassivity(rs, players, team, 'passive', ball.x, ball.y, now)
          resetPossession(ps, null)
          return null
        }
      } else {
        ps.idleMs += dtMs
        if (ps.idleMs >= PASSIVITY.passiveMs) {
          ps.warned = true
          ps.warnElapsedMs = 0
          ps.stats.warnings[team]++
          result = 'warn'
        }
      }
    }
  }
  if (ps.warned) {
    ps.hudKind = 'passive'
    ps.hudTeam = team
    ps.hudMs = Math.max(0, PASSIVITY.warnMs - ps.warnElapsedMs)
    if (prevHud !== 'passive') ps.stats.countdowns++
    passivityView.urgency[team] = 0.5 + 0.5 * clamp01(ps.warnElapsedMs / PASSIVITY.warnMs)
  } else {
    const lead = PASSIVITY.aiLeadMs
    passivityView.urgency[team] = 0.5 * clamp01((ps.idleMs - (PASSIVITY.passiveMs - lead)) / lead)
  }
  return result
}
