import * as Phaser from 'phaser'
import { GOALIE_AI_MAX_Y, GOAL_HALF_H, MANUAL_STEAL_RANGE, PLAYER_RADIUS, RINK, SHOT_CONTEXT, SHOT_QUALITY } from '../constants'
import type { Player } from '../types'
import { getGoalLineX } from '../utils'
import { bisectorY } from './goalieAI'
import { autopilot } from './playerControl'
import { getControlledPlayer } from './playerHelpers'
import { stealTryCount } from './matchActions'
import { ballCarriedBy } from './ball'
import { goaliePassTracker } from './goaliePassStats'

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
  players: Array<{ id: string, team: Team, side: 'left' | 'right', role: string, pos: { x: number, y: number }, velocity: { x: number, y: number }, suspendedUntil?: number, facing: { x: number, y: number }, anim?: { type: string, at: number }, stunUntil?: number, stunKind?: string }>
  controlledPlayerIndex: number
  blueScore: number
  redScore: number
  lastTouch: Team
  ruleState: { teamFouls: Pair, passivity?: { hudKind: string | null, stats: { possession: Pair, passive: Pair, warnings: Pair, countdowns: number } } }
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
  /** B-03 · portero rival: px fuera de su sitio ideal (bisectriz) y px entre él y el cruce del tiro por su vertical. */
  gkOff: number
  place: number
  /** ms que tarda la bola en llegar a la vertical del portero. */
  tGk: number
  /** Tras pase (SHOT_CONTEXT.passWindowMs) y desplazamiento en y de ese pase (px; 0 sin pase). */
  afterPass: boolean
  passLat: number
  /** Contragolpe (robo reciente) y rivales de campo en la línea bola–portería. */
  counter: boolean
  defBetween: number
  /** px de la persona (si defiende) al tirador; -1 si el equipo que defiende no tiene persona. */
  hDist: number
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
    // B-03, por equipo que defiende y solo tiros a puerta: contexto del tiro (SHOT_CONTEXT) y
    // paradas / goles tras pase y sin pase
    facedOn: pair(), facedAfterPass: pair(), facedCounter: pair(), gkOffSum: pair(), placeSum: pair(), defBetweenSum: pair(),
    savesPassBy: pair(), goalsPassAgainst: pair(), savesNoPassBy: pair(), goalsNoPassAgainst: pair(),
    // B-03, por equipo que defiende con el rival en posesión: s defendiendo, atacantes libres·s
    // (SHOT_CONTEXT.markPx), s con el portador doblado y s con la persona encima del portador
    defSec: pair(), unmarkedSec: pair(), doubleSec: pair(), humanOnCarrierSec: pair(),
    // B-06: pérdidas en conducción del portador de campo (robo directo o bola suelta por toque rival),
    // de ellas, por carga arcade; intentos de robo (stealTryCount, B-07) y, de la persona, intentos y robos directos
    losses: pair(), lossesCheck: pair(), stealTries: pair(), stealTriesHuman: pair(), stealsHuman: pair(),
    // B-07, por equipo que encaja: goles con la bola conducida por uno de los suyos (ballCarriedBy)
    goalsCarriedOwn: pair(),
    // B-07, por equipo que defiende: jugador·s de campo a distancia de robo del portador rival (la
    // persona aparte), robos directos, y s de rivales encima de la persona cuando ella conduce y sus pérdidas
    pressSec: pair(), pressSecHuman: pair(), stealsDirect: pair(), pressOnHumanSec: pair(), lossesHuman: pair(),
    // B-07: s defendiendo con la persona por el lado de nuestra portería respecto al portador
    humanGoalSideSec: pair(),
  }
  const shotLog: ShotRecord[] = []
  let ms = 0
  let prevBully: unknown = null, prevKickoff: unknown = null
  const prevBall = { x: 0, y: 0 }
  let prevSpeed = 0, still = 0
  let prevCarrier: string | null = null, lastCarrierTeam: Team | null = null
  const prevScore = pair()
  let prevFoulObj: unknown = null
  const prevFouls = pair()
  const prevSusp = new Map<string, number>()
  const gkPass = goaliePassTracker(s)  // B-09: pases al portero propio
  /** Último simNow en que la persona llevaba al portero de cada equipo. */
  const humanGoalieAt: Pair = { blue: -Infinity, red: -Infinity }
  let pending: null | { team: Team, onTarget: boolean, age: number, hi: boolean, pass: boolean, rec: ShotRecord | null } = null
  /** Bola soltada por un portador sin tiro todavía: pase candidato hasta que alguien la recoja. */
  let release: null | { team: Team, id: string, age: number, shot: boolean, y: number } = null
  /** B-03: último pase recibido por cada jugador (simNow y desplazamiento en y del pase). */
  const recvAt = new Map<string, number>()
  const recvLat = new Map<string, number>()
  /** B-03: último robo de cada equipo (simNow). */
  const stealAt: Pair = { blue: -Infinity, red: -Infinity }
  /** Jugador en manos de la persona en este paso (null con piloto automático). */
  let humanId: string | null = null
  /** B-07: intentos de robo ya contados por jugador (stealTryCount es acumulado entre partidos). */
  const stealTriesSeen = new Map<string, number>()
  /** B-06: el portador de campo `from` pierde la bola; `thiefId` si el rival se la queda directamente. */
  const noteLoss = (from: MatchView['players'][number], thiefId: string | null) => {
    if (from.role !== 'goalie') {
      st.losses[from.team]++
      if (from.stunKind === 'check' && (from.stunUntil ?? 0) > s.simNow) st.lossesCheck[from.team]++
    }
    if (thiefId && thiefId === humanId) st.stealsHuman[other(from.team)]++
    if (thiefId) st.stealsDirect[other(from.team)]++
    if (from.id === humanId) st.lossesHuman[from.team]++
  }
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
    humanId = ctrl?.id ?? null
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
          if (pending.pass) st.goalsPassAgainst[def] += n
          else st.goalsNoPassAgainst[def] += n
          if (pending.rec) pending.rec.result = 'goal'
          pending = null
        } else st.goalsNoShotAgainst[def] += n
        // Conducida en el mismo paso del gol (un pase o despeje que entra no cuenta)
        if (ballCarriedBy.team === def) st.goalsCarriedOwn[def] += n
      }
      prevScore[t] = sc
    }
    gkPass.step()
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
      const tries = stealTryCount.get(p.id) ?? 0
      const seen = stealTriesSeen.get(p.id)
      if (seen === undefined) stealTriesSeen.set(p.id, tries)
      else if (tries > seen) {
        stealTriesSeen.set(p.id, tries)
        st.stealTries[p.team] += tries - seen
        if (p.id === humanId) st.stealTriesHuman[p.team] += tries - seen
      }
    }

    // Posesión
    const carrier = s.ballCarrierId ? s.players.find(p => p.id === s.ballCarrierId) : undefined
    const prev = prevCarrier ? s.players.find(p => p.id === prevCarrier) : undefined
    if (carrier) {
      if (lastCarrierTeam && lastCarrierTeam !== carrier.team) st.possessionChanges++
      lastCarrierTeam = carrier.team
      st.possessionSec[carrier.team] += dt
      // Robo: la bola pasa directamente de un portador al rival
      if (prev && prev.team !== carrier.team) { st.steals[carrier.team]++; stealAt[carrier.team] = s.simNow; noteLoss(prev, carrier.id) }
      if (!prevCarrier && release && !release.shot && carrier.id !== release.id) {
        st.passes[release.team]++
        if (carrier.team === release.team) {
          st.passesDone[release.team]++
          recvAt.set(carrier.id, s.simNow)
          recvLat.set(carrier.id, Math.abs(s.ball.y - release.y))
        }
      }
      if (carrier.id !== prevCarrier) release = null
    } else if (prevCarrier) {
      // Un toque del rival (lastTouch) es un robo que deja la bola suelta, no un pase
      if (prev && s.lastTouch === prev.team && inPlay) release = { team: prev.team, id: prev.id, age: 0, shot: false, y: s.ball.y }
      else {
        release = null
        if (prev && inPlay) { st.steals[other(prev.team)]++; stealAt[other(prev.team)] = s.simNow; noteLoss(prev, null) }
      }
    }
    if (release && (release.age += dt * 1000) > 4000) release = null

    if (carrier && carrier.role !== 'goalie' && inPlay) coverage(carrier, ctrl?.team === other(carrier.team) ? ctrl.id : null, dt)
    if (carrier && carrier.role !== 'goalie' && inPlay) {
      const def = other(carrier.team)
      for (const d of s.players) {
        if (d.team !== def || !live(d) || Math.hypot(d.pos.x - carrier.pos.x, d.pos.y - carrier.pos.y) > MANUAL_STEAL_RANGE) continue
        if (d.id === humanId) st.pressSecHuman[def] += dt
        else st.pressSec[def] += dt
        if (carrier.id === humanId) st.pressOnHumanSec[def] += dt
      }
    }

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
          const cx = shotContext(team, prev, lineX, dir, dist)
          if (onTarget) {
            const def = other(team)
            st.facedOn[def]++
            if (cx.afterPass) st.facedAfterPass[def]++
            if (cx.counter) st.facedCounter[def]++
            st.gkOffSum[def] += cx.gkOff
            st.placeSum[def] += cx.place
            st.defBetweenSum[def] += cx.defBetween
          }
          let rec: ShotRecord | null = null
          if (opts.keepShots) {
            rec = { team, sec: Math.round(ms / 100) / 10, dist: Math.round(dist), angle: Math.round(angle), speed: Math.round(speed),
              pressed, gap: Math.round(gap), onTarget, quality: Math.round(quality * 100) / 100, humanGoalie: humanGoalie(other(team)), result: 'none',
              gkOff: Math.round(cx.gkOff), place: Math.round(cx.place), tGk: Math.round(cx.tGk), afterPass: cx.afterPass,
              passLat: Math.round(cx.passLat), counter: cx.counter, defBetween: cx.defBetween, hDist: Math.round(cx.hDist) }
            shotLog.push(rec)
          }
          pending = { team, onTarget, age: 0, hi, pass: cx.afterPass, rec }
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
        if (pending.pass) st.savesPassBy[def]++
        else st.savesNoPassBy[def]++
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

  const live = (p: MatchView['players'][number]) => p.role !== 'goalie' && !((p.suspendedUntil ?? 0) > s.simNow)
  /** B-03: cobertura de la defensa con el rival en posesión (atacantes libres, portador doblado). */
  const coverage = (carrier: MatchView['players'][number], humanId: string | null, dt: number) => {
    const def = other(carrier.team)
    const r = SHOT_CONTEXT.markPx
    st.defSec[def] += dt
    let onCarrier = 0
    const toOwn = getGoalLineX(carrier.side === 'left' ? 'right' : 'left') < carrier.pos.x ? -1 : 1
    for (const d of s.players) {
      if (d.team !== def || !live(d)) continue
      if (d.id === humanId && (d.pos.x - carrier.pos.x) * toOwn > 0) st.humanGoalSideSec[def] += dt
      if (Math.hypot(d.pos.x - carrier.pos.x, d.pos.y - carrier.pos.y) < r) {
        onCarrier++
        if (d.id === humanId) st.humanOnCarrierSec[def] += dt
      }
    }
    if (onCarrier >= 2) st.doubleSec[def] += dt
    for (const a of s.players) {
      if (a.team !== carrier.team || a === carrier || !live(a)) continue
      let marked = false
      for (const d of s.players) {
        if (d.team === def && live(d) && Math.hypot(d.pos.x - a.pos.x, d.pos.y - a.pos.y) < r) { marked = true; break }
      }
      if (!marked) st.unmarkedSec[def] += dt
    }
  }

  const ctxOut = { gkOff: 0, place: 0, tGk: 0, afterPass: false, passLat: 0, counter: false, defBetween: 0, hDist: -1 }
  /**
   * Contexto del tiro para el portero rival (B-03), en el instante de detección: lo lejos que
   * está de su sitio ideal (bisectriz, como goalieAI), lo que tiene que moverse hasta el cruce
   * del tiro por su vertical, si viene de pase o de robo y cuántos defensores tapan la línea.
   */
  const shotContext = (team: Team, prev: MatchView['players'][number] | undefined, lineX: number, dir: number, dist: number) => {
    const o = ctxOut
    const def = other(team)
    const cy = RINK.y + RINK.height / 2
    let gk: MatchView['players'][number] | undefined
    for (const p of s.players) if (p.team === def && p.role === 'goalie') { gk = p; break }
    o.gkOff = o.place = o.tGk = 0
    if (gk) {
      const along = (gk.pos.x - lineX) * dir
      const ideal = cy + Math.max(-GOALIE_AI_MAX_Y, Math.min(GOALIE_AI_MAX_Y, bisectorY(dist, s.ball.y - cy, along)))
      o.gkOff = Math.abs(gk.pos.y - ideal)
      const t = Math.max(0, (gk.pos.x - s.ball.x) / s.ballVelocity.x)
      o.place = Math.abs(s.ball.y + s.ballVelocity.y * t - gk.pos.y)
      o.tGk = t * 1000
    }
    const shooter = prev && prev.team === team ? prev : undefined
    if (shooter) {
      o.afterPass = s.simNow - (recvAt.get(shooter.id) ?? -Infinity) <= SHOT_CONTEXT.passWindowMs
      o.passLat = o.afterPass ? recvLat.get(shooter.id) ?? 0 : 0
    } else {
      // De primeras: la bola venía suelta de un pase del mismo equipo
      o.afterPass = !!release && release.team === team && !release.shot
      o.passLat = o.afterPass && release ? Math.abs(s.ball.y - release.y) : 0
    }
    o.counter = s.simNow - stealAt[team] <= SHOT_CONTEXT.counterMs
    o.hDist = -1
    for (const p of s.players) {
      if (p.id !== humanId || p.team !== def) continue
      o.hDist = Math.hypot(p.pos.x - (shooter?.pos.x ?? s.ball.x), p.pos.y - (shooter?.pos.y ?? s.ball.y))
    }
    // Rivales de campo sobre el segmento bola–centro de la boca
    const ex = lineX - s.ball.x
    const ey = cy - s.ball.y
    const len2 = ex * ex + ey * ey || 1
    o.defBetween = 0
    for (const p of s.players) {
      if (p.team !== def || p.role === 'goalie' || (p.suspendedUntil ?? 0) > s.simNow) continue
      const u = ((p.pos.x - s.ball.x) * ex + (p.pos.y - s.ball.y) * ey) / len2
      if (u <= 0 || u >= 1) continue
      const d = Math.abs((p.pos.x - s.ball.x) * ey - (p.pos.y - s.ball.y) * ex) / Math.sqrt(len2)
      if (d < SHOT_CONTEXT.laneHalfPx) o.defBetween++
    }
    return o
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
    // B-03, por portero (equipo que defiende), sobre los tiros a puerta que recibe
    afterPassPct: byTeam(t => (st.facedOn[t] ? Math.round(1000 * st.facedAfterPass[t] / st.facedOn[t]) / 10 : null)),
    counterPct: byTeam(t => (st.facedOn[t] ? Math.round(1000 * st.facedCounter[t] / st.facedOn[t]) / 10 : null)),
    gkOff: byTeam(t => (st.facedOn[t] ? Math.round(10 * st.gkOffSum[t] / st.facedOn[t]) / 10 : null)),
    place: byTeam(t => (st.facedOn[t] ? Math.round(10 * st.placeSum[t] / st.facedOn[t]) / 10 : null)),
    defBetween: byTeam(t => (st.facedOn[t] ? Math.round(100 * st.defBetweenSum[t] / st.facedOn[t]) / 100 : null)),
    savePctPass: byTeam(t => pct(st.savesPassBy[t], st.goalsPassAgainst[t])),
    savePctNoPass: byTeam(t => pct(st.savesNoPassBy[t], st.goalsNoPassAgainst[t])),
    unmarked: byTeam(t => (st.defSec[t] ? Math.round(100 * st.unmarkedSec[t] / st.defSec[t]) / 100 : null)),
    doublePct: byTeam(t => (st.defSec[t] ? Math.round(1000 * st.doubleSec[t] / st.defSec[t]) / 10 : null)),
    humanOnCarrierPct: byTeam(t => (st.defSec[t] ? Math.round(1000 * st.humanOnCarrierSec[t] / st.defSec[t]) / 10 : null)),
    ...gkPass.stats,
    passivityCalls: s.ruleState.passivity?.stats ?? null,   // B-10: pitadas por equipo y tipo, avisos, cuentas atrás
    ...(opts.keepShots ? { shotLog } : {}),
  })

  return { step, snapshot, elapsedMs: () => ms }
}
