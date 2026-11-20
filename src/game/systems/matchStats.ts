import * as Phaser from 'phaser'
import { GOAL_HALF_H, PLAYER_RADIUS, RINK, SHOT_QUALITY } from '../constants'
import type { Player } from '../types'
import { getGoalLineX } from '../utils'
import { autopilot } from './playerControl'
import { getControlledPlayer } from './playerHelpers'

/**
 * Estadísticas del partido (WP-64, B-01): observa MatchScene en solo lectura y cuenta goles,
 * tiros, paradas, pases, faltas, atascos… Lo comparten el humo del laboratorio (`labSmoke`) y
 * el partido real con `?stats=1`. Además mide la calidad de cada tiro (SHOT_QUALITY), el % de
 * paradas en tiros buenos y malos, y cuánto controla la persona a su portero.
 * El llamante decide cuándo observar: `step(ms)` una vez por paso de simulación.
 */

export type Team = 'blue' | 'red'
type Pair = Record<Team, number>
const pair = (): Pair => ({ blue: 0, red: 0 })
const TEAMS: readonly Team[] = ['blue', 'red']
const other = (t: Team): Team => (t === 'blue' ? 'red' : 'blue')

/** Velocidad mínima (px/s) para tratar un impulso de bola como tiro. */
const SHOT_MIN_SPEED = 380
/** Distancia máxima en x a la línea de gol rival para contar el impulso como tiro. */
const SHOT_MAX_DIST = 460
const SHOT_RESOLVE_MS = 2500
const STILL_SPEED = 4
const JAM_SECONDS = 5
/** Un gol o una parada cuentan «con el portero en manos de la persona» si lo llevaba en este último tramo (ms). */
const HUMAN_GOALIE_WINDOW_MS = 1000

/** Acceso de solo lectura a campos privados de MatchScene (los lee por nombre en runtime). */
export type MatchView = Phaser.Scene & {
  ball: { x: number, y: number }
  ballVelocity: { x: number, y: number }
  ballCarrierId: string | null
  players: Array<{ id: string, team: Team, side: 'left' | 'right', role: string, pos: { x: number, y: number }, velocity: { x: number, y: number }, suspendedUntil?: number, facing: { x: number, y: number } }>
  controlledPlayerIndex: number
  blueScore: number
  redScore: number
  lastTouch: Team
  ruleState: { teamFouls: Pair }
  activeFoulRestart: null | { takerPlayerId: string, readyAt: number, sanction: string, x: number }
  activeBully: unknown
  activeKickoff: unknown
  restartAt: number
  matchEnded: boolean
  /** Reloj de la simulación (paso fijo): las marcas de tiempo del partido se comparan con él. */
  simNow: number
  joystickInput: { x: number, y: number, pass: boolean, shoot: boolean }
}

/** Un tiro en el instante de detección (solo con `keepShots`). */
export interface ShotRecord {
  team: Team
  /** Segundo de juego observado. */
  sec: number
  /** Distancia en x a la línea de gol (px), ángulo al eje de la portería (°), velocidad (px/s). */
  dist: number
  angle: number
  speed: number
  pressed: boolean
  /** Hueco (px) entre el borde del tirador y el del rival de campo más cercano. */
  gap: number
  onTarget: boolean
  quality: number
  humanGoalie: boolean
  result: 'goal' | 'save' | 'none'
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Calidad 0–1 de un tiro según SHOT_QUALITY (suma ponderada; ver constants). */
export function shotQuality(dist: number, angleDeg: number, speed: number, pressed: boolean) {
  const q = SHOT_QUALITY
  const fDist = 1 - clamp01((dist - q.distNear) / (q.distFar - q.distNear))
  const fAngle = 1 - clamp01(angleDeg / q.angleMaxDeg)
  const fSpeed = clamp01((speed - q.speedMin) / (q.speedFast - q.speedMin))
  return q.wDist * fDist + q.wAngle * fAngle + q.wSpeed * fSpeed + (pressed ? 0 : q.wFree)
}

export type MatchStats = ReturnType<typeof createMatchStats>

export function createMatchStats(match: Phaser.Scene, mode: string, opts: { keepShots?: boolean } = {}) {
  const s = match as MatchView
  const st = {
    mode, sec: 0,
    goals: pair(), shots: pair(), onTarget: pair(), saves: pair(),
    fouls: pair(), goalieZoneFouls: pair(), blueCards: pair(), freeHits: 0, directFreeHits: 0, penalties: 0, neutralRestarts: 0, kickoffs: 0,
    possessionChanges: 0, jams: 0, jamSec: 0, badPlayerFrames: 0, badSample: '', consoleErrors: 0,
    // E-00: pases intentados y completados, robos, posesión (s con bola) y paradas hechas por el portero de cada equipo
    passes: pair(), passesDone: pair(), steals: pair(), possessionSec: pair(), savesBy: pair(),
    // B-01, por equipo que tira: suma de calidad, tiros buenos (≥ SHOT_QUALITY.hi) y tiros con presión
    shotQualitySum: pair(), shotsHi: pair(), shotsPressed: pair(),
    // B-01, por equipo que defiende (como savesBy): paradas y goles encajados en tiros buenos y malos;
    // goalsNoShot = goles sin tiro detectado antes (rechaces lentos, autogoles…)
    savesHiBy: pair(), savesLoBy: pair(), goalsHiAgainst: pair(), goalsLoAgainst: pair(), goalsNoShotAgainst: pair(),
    // B-01: portero en manos de la persona (controlado y sin piloto automático)
    goalieHumanSec: pair(), goalsAgainstHumanGoalie: pair(), savesHumanGoalie: pair(),
  }
  const shotLog: ShotRecord[] = []
  let ms = 0
  let prevBully: unknown = null
  let prevKickoff: unknown = null
  const prevBall = { x: 0, y: 0 }
  let prevSpeed = 0
  let prevCarrier: string | null = null
  let lastCarrierTeam: Team | null = null
  let still = 0
  const prevScore = pair()
  let prevFoulObj: unknown = null
  const prevFouls = pair()
  const prevSusp = new Map<string, number>()
  /** Último simNow en que la persona llevaba al portero de cada equipo. */
  const humanGoalieAt: Pair = { blue: -Infinity, red: -Infinity }
  let pending: null | { team: Team, onTarget: boolean, age: number, hi: boolean, rec: ShotRecord | null } = null
  /** Bola soltada por un portador sin tiro todavía: pase candidato hasta que alguien la recoja. */
  let release: null | { team: Team, id: string, age: number, shot: boolean } = null
  /** Dirección de ataque del equipo según su lado actual (cambia en el descanso). */
  const attackDir = (team: Team) => (s.players.find(p => p.team === team)?.side === 'right' ? -1 : 1)
  const humanGoalie = (team: Team) => s.simNow - humanGoalieAt[team] <= HUMAN_GOALIE_WINDOW_MS

  /** Observa un paso; false si la escena aún no tiene jugadores ni bola. */
  const step = (delta: number) => {
    if (!s.players?.length || !s.ball) return false
    const dt = Math.min(delta, 33) / 1000
    ms += dt * 1000
    const inPlay = !s.activeFoulRestart && !s.activeBully && !s.activeKickoff && s.restartAt <= 0

    // Portero en manos de la persona
    const ctrl = autopilot.on ? undefined : getControlledPlayer(s.players as unknown as Player[], s.controlledPlayerIndex)
    if (ctrl && ctrl.role === 'goalie') {
      st.goalieHumanSec[ctrl.team] += dt
      humanGoalieAt[ctrl.team] = s.simNow
    }

    // Goles
    for (const t of TEAMS) {
      const sc = t === 'blue' ? s.blueScore : s.redScore
      if (sc > prevScore[t]) {
        const n = sc - prevScore[t]
        st.goals[t] += n
        const def = other(t)
        if (humanGoalie(def)) st.goalsAgainstHumanGoalie[def] += n
        if (pending && pending.team === t) {
          if (pending.hi) st.goalsHiAgainst[def] += n
          else st.goalsLoAgainst[def] += n
          if (pending.rec) pending.rec.result = 'goal'
          pending = null
        } else st.goalsNoShotAgainst[def] += n
      }
      prevScore[t] = sc
    }

    // Faltas, sanciones y tarjetas
    // pendingFoul se consume en el mismo frame que nace: se detecta el saque (activeFoulRestart)
    const af = s.activeFoulRestart
    if (af && !prevFoulObj) {
      if (af.sanction === 'penalty') st.penalties++
      else if (af.sanction === 'direct-free-hit') {
        st.directFreeHits++
      } else st.freeHits++
    }
    prevFoulObj = af
    if (s.activeBully && !prevBully) st.neutralRestarts++
    prevBully = s.activeBully
    if (s.activeKickoff && !prevKickoff) st.kickoffs++
    prevKickoff = s.activeKickoff
    for (const t of TEAMS) {
      const n = s.ruleState.teamFouls[t]
      if (n > prevFouls[t]) st.fouls[t] += n - prevFouls[t]
      prevFouls[t] = n
    }
    for (const p of s.players) {
      const su = p.suspendedUntil ?? 0
      if (su > s.simNow && !((prevSusp.get(p.id) ?? 0) > s.simNow)) st.blueCards[p.team]++  // la sanción se alarga en los parones: solo cuenta la nueva
      prevSusp.set(p.id, su)
      // Validez de jugadores: NaN o fuera de pista (los sancionados esperan en el banquillo)
      const bad = !(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.velocity.x) && Number.isFinite(p.velocity.y)) ||
        (!(su > s.simNow) && (p.pos.x < RINK.x - 12 || p.pos.x > RINK.x + RINK.width + 12 || p.pos.y < RINK.y - 12 || p.pos.y > RINK.y + RINK.height + 40))
      if (bad) { st.badPlayerFrames++; st.badSample ||= `${p.id}@${Math.round(p.pos.x)},${Math.round(p.pos.y)}` }
    }

    // Posesión
    const carrier = s.ballCarrierId ? s.players.find(p => p.id === s.ballCarrierId) : undefined
    const prev = prevCarrier ? s.players.find(p => p.id === prevCarrier) : undefined
    if (carrier) {
      if (lastCarrierTeam && lastCarrierTeam !== carrier.team) st.possessionChanges++
      lastCarrierTeam = carrier.team
      st.possessionSec[carrier.team] += dt
      // Robo: la bola pasa directamente de un portador al rival
      if (prev && prev.team !== carrier.team) st.steals[carrier.team]++
      if (!prevCarrier && release && !release.shot && carrier.id !== release.id) {
        st.passes[release.team]++
        if (carrier.team === release.team) st.passesDone[release.team]++
      }
      if (carrier.id !== prevCarrier) release = null
    } else if (prevCarrier) {
      // Un toque del rival (lastTouch) es un robo que deja la bola suelta, no un pase
      if (prev && s.lastTouch === prev.team && inPlay) release = { team: prev.team, id: prev.id, age: 0, shot: false }
      else { release = null; if (prev && inPlay) st.steals[other(prev.team)]++ }
    }
    if (release && (release.age += dt * 1000) > 4000) release = null

    // Bola parada (atasco): tramos > JAM_SECONDS sin que la bola se mueva y con el juego vivo
    const moved = Math.hypot(s.ball.x - prevBall.x, s.ball.y - prevBall.y) / Math.max(dt, 1e-3)
    prevBall.x = s.ball.x
    prevBall.y = s.ball.y
    if (inPlay && moved < STILL_SPEED) {
      still += dt
      if (still > JAM_SECONDS) {
        const first = still - dt <= JAM_SECONDS
        if (first) st.jams++
        st.jamSec += first ? still : dt
      }
    } else still = 0

    // Tiros: impulso brusco de la bola hacia la portería rival y cerca de ella
    const speed = Math.hypot(s.ballVelocity.x, s.ballVelocity.y)
    if (speed >= SHOT_MIN_SPEED && prevSpeed < SHOT_MIN_SPEED * 0.6 && inPlay) {
      const team = prev?.team ?? s.lastTouch
      const dir = attackDir(team)
      const lineX = getGoalLineX(dir > 0 ? 'right' : 'left')
      const dist = (lineX - s.ball.x) * dir
      if (s.ballVelocity.x * dir > 0 && dist > 0 && dist < SHOT_MAX_DIST) {
        const cy = RINK.y + RINK.height / 2
        const yAt = s.ball.y + s.ballVelocity.y * (dist / Math.abs(s.ballVelocity.x))
        const off = Math.abs(yAt - cy)
        if (off < GOAL_HALF_H + 70) {
          st.shots[team]++
          const onTarget = off < GOAL_HALF_H
          if (onTarget) st.onTarget[team]++
          const angle = Math.atan2(Math.abs(s.ball.y - cy), dist) * 180 / Math.PI
          const gap = shooterGap(team, prev)
          const pressed = gap < SHOT_QUALITY.pressGap
          const quality = shotQuality(dist, angle, speed, pressed)
          const hi = quality >= SHOT_QUALITY.hi
          st.shotQualitySum[team] += quality
          if (hi) st.shotsHi[team]++
          if (pressed) st.shotsPressed[team]++
          let rec: ShotRecord | null = null
          if (opts.keepShots) {
            rec = { team, sec: Math.round(ms / 100) / 10, dist: Math.round(dist), angle: Math.round(angle), speed: Math.round(speed),
              pressed, gap: Math.round(gap), onTarget, quality: Math.round(quality * 100) / 100, humanGoalie: humanGoalie(other(team)), result: 'none' }
            shotLog.push(rec)
          }
          pending = { team, onTarget, age: 0, hi, rec }
          if (release && release.team === team) release.shot = true
        }
      }
    }
    prevSpeed = speed
    prevCarrier = s.ballCarrierId

    // Resolución de tiros a puerta: parada si el portero rival atrapa o rechaza la bola
    if (pending) {
      pending.age += dt * 1000
      const gk = carrier && carrier.role === 'goalie' && carrier.team !== pending.team
      const dir = attackDir(pending.team)
      const lineX = getGoalLineX(dir > 0 ? 'right' : 'left')
      const deflected = s.ballVelocity.x * dir < -40 && Math.abs(lineX - s.ball.x) < 70
      if (pending.onTarget && (gk || deflected)) {
        const def = other(pending.team)
        st.saves[pending.team]++
        st.savesBy[def]++
        if (pending.hi) st.savesHiBy[def]++
        else st.savesLoBy[def]++
        if (humanGoalie(def)) st.savesHumanGoalie[def]++
        if (pending.rec) pending.rec.result = 'save'
        pending = null
      }
      else if (pending.age > SHOT_RESOLVE_MS) pending = null
    }
    return true
  }

  /** Hueco entre bordes del tirador y el rival de campo en pista más cercano (Infinity si no hay). */
  const shooterGap = (team: Team, shooter: MatchView['players'][number] | undefined) => {
    let sh = shooter && shooter.team === team ? shooter : undefined
    if (!sh) {
      // Tiro de primeras con la bola suelta: el compañero más cercano a la bola
      let best = Infinity
      for (const p of s.players) {
        if (p.team !== team) continue
        const d = Math.hypot(p.pos.x - s.ball.x, p.pos.y - s.ball.y)
        if (d < best) { best = d; sh = p }
      }
    }
    let gap = Infinity
    if (!sh) return gap
    for (const p of s.players) {
      if (p.team === team || p.role === 'goalie' || (p.suspendedUntil ?? 0) > s.simNow) continue
      gap = Math.min(gap, Math.hypot(p.pos.x - sh.pos.x, p.pos.y - sh.pos.y) - 2 * PLAYER_RADIUS)
    }
    return gap
  }

  /** % de paradas sobre paradas + goles; null sin muestra (no se mete un 0). */
  const pct = (sv: number, g: number) => (sv + g > 0 ? Math.round(1000 * sv / (sv + g)) / 10 : null)
  const byTeam = <T>(f: (t: Team) => T) => ({ blue: f('blue'), red: f('red') })

  const snapshot = () => ({
    ...st,
    sec: Math.round(ms / 100) / 10,
    shotQuality: byTeam(t => (st.shots[t] ? Math.round(1000 * st.shotQualitySum[t] / st.shots[t]) / 1000 : null)),
    savePctHi: byTeam(t => pct(st.savesHiBy[t], st.goalsHiAgainst[t])),
    savePctLo: byTeam(t => pct(st.savesLoBy[t], st.goalsLoAgainst[t])),
    goalieHumanSec: byTeam(t => Math.round(st.goalieHumanSec[t] * 10) / 10),
    ...(opts.keepShots ? { shotLog } : {}),
  })

  return { step, snapshot, elapsedMs: () => ms }
}
