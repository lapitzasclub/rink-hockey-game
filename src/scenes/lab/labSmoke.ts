import * as Phaser from 'phaser'
import { GOAL_HALF_H, RINK } from '../../game/constants'
import { getGoalLineX } from '../../game/utils'
import { autopilot } from '../../game/systems/playerControl'

/**
 * Partido de humo (WP-64): IA contra IA sin humano. Observa la escena `match` en solo
 * lectura (salvo el pulso de pase del sacador azul en saques, que sustituye a la tecla)
 * y cuenta estadísticas. Imprime `[smoke] {json}` al cumplirse `smokeMs` de juego y una
 * línea parcial cada 30 s. Uso: `?lab=match&mode=reglamento&auto=1&smokeMs=120000`.
 */

type Team = 'blue' | 'red'
type Pair = Record<Team, number>
const pair = (): Pair => ({ blue: 0, red: 0 })
/** Velocidad mínima (px/s) para tratar un impulso de bola como tiro. */
const SHOT_MIN_SPEED = 380
/** Distancia máxima en x a la línea de gol rival para contar el impulso como tiro. */
const SHOT_MAX_DIST = 460
const SHOT_RESOLVE_MS = 2500
const STILL_SPEED = 4
const JAM_SECONDS = 5

/** Acceso de solo lectura a campos privados de MatchScene (los lee por nombre en runtime). */
type MatchView = Phaser.Scene & {
  ball: { x: number, y: number }
  ballVelocity: { x: number, y: number }
  ballCarrierId: string | null
  players: Array<{ id: string, team: Team, side: 'left' | 'right', role: string, pos: { x: number, y: number }, velocity: { x: number, y: number }, suspendedUntil?: number, facing: { x: number, y: number } }>
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

/** Ganchos opcionales (WP-66): `onStep` tras cada paso de juego; `onDone` al terminar (sin informe de humo). */
export interface SmokeHooks {
  onStep: (ms: number, stop: () => void) => void
  onDone: () => void
}

/**
 * Pulso de pase del sacador azul en los saques de falta: sustituye a la tecla que
 * pulsaría el humano cuando la IA juega por los dos equipos. Devuelve cómo pararlo.
 */
export function driveBlueRestarts(match: Phaser.Scene) {
  const s = match as MatchView
  const drive = () => {
    const f = s.activeFoulRestart
    const taker = f && s.players?.find(p => p.id === f.takerPlayerId)
    const press = !!(taker && taker.team === 'blue' && s.simNow >= f!.readyAt)
    // Hacia la portería rival: el azul ataca a la derecha en la 1.ª parte y a la izquierda tras el descanso
    s.joystickInput.x = press ? (taker!.side === 'right' ? -1 : 1) : 0
    s.joystickInput.y = 0
    s.joystickInput.pass = press
  }
  match.events.on(Phaser.Scenes.Events.UPDATE, drive)
  return () => { match.events.off(Phaser.Scenes.Events.UPDATE, drive) }
}

export function startSmoke(match: Phaser.Scene, mode: string, smokeMs: number, hooks?: SmokeHooks) {
  const s = match as MatchView
  autopilot.on = true
  const st = {
    mode, sec: 0,
    goals: pair(), shots: pair(), onTarget: pair(), saves: pair(),
    fouls: pair(), goalieZoneFouls: pair(), blueCards: pair(), freeHits: 0, directFreeHits: 0, penalties: 0, neutralRestarts: 0, kickoffs: 0,
    possessionChanges: 0, jams: 0, jamSec: 0, badPlayerFrames: 0, badSample: '', consoleErrors: 0,
    // E-00: pases intentados y completados, robos, posesión (s con bola) y paradas hechas por el portero de cada equipo
    passes: pair(), passesDone: pair(), steals: pair(), possessionSec: pair(), savesBy: pair(),
  }
  let ms = 0
  let prevBully: unknown = null
  let prevKickoff: unknown = null
  let nextPartial = 30000
  let done = false
  let errors = 0
  const onErr = () => { errors++ }
  window.addEventListener('error', onErr)
  window.addEventListener('unhandledrejection', onErr)
  const origError = console.error
  console.error = (...a: unknown[]) => { errors++; origError.apply(console, a) }

  let prevBall = { x: 0, y: 0 }
  let prevSpeed = 0
  let prevCarrier: string | null = null
  let lastCarrierTeam: Team | null = null
  let still = 0
  let prevScore = { blue: 0, red: 0 }
  let prevFoulObj: unknown = null
  const prevFouls = pair()
  const prevSusp = new Map<string, number>()
  let pending: null | { team: Team, onTarget: boolean, age: number } = null
  /** Bola soltada por un portador sin tiro todavía: pase candidato hasta que alguien la recoja. */
  let release: null | { team: Team, id: string, age: number, shot: boolean } = null
  /** Dirección de ataque del equipo según su lado actual (cambia en el descanso). */
  const attackDir = (team: Team) => (s.players.find(p => p.team === team)?.side === 'right' ? -1 : 1)


  const snapshot = (final: boolean) => ({ ...st, sec: Math.round(ms / 100) / 10, consoleErrors: errors, final })

  const observe = (delta: number) => {
    if (done || !s.players?.length || !s.ball) return
    const dt = Math.min(delta, 33) / 1000
    ms += dt * 1000
    const inPlay = !s.activeFoulRestart && !s.activeBully && !s.activeKickoff && s.restartAt <= 0

    // Goles
    for (const t of ['blue', 'red'] as Team[]) {
      const sc = t === 'blue' ? s.blueScore : s.redScore
      if (sc > prevScore[t]) {
        st.goals[t] += sc - prevScore[t]
        if (pending && pending.team === t) pending = null
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
    for (const t of ['blue', 'red'] as Team[]) {
      const n = s.ruleState.teamFouls[t]
      if (n > prevFouls[t]) st.fouls[t] += n - prevFouls[t]
      prevFouls[t] = n
    }
    for (const p of s.players) {
      const su = p.suspendedUntil ?? 0
      if (su > s.simNow && !((prevSusp.get(p.id) ?? 0) > s.simNow)) st.blueCards[p.team]++  // la sanción se alarga en los parones: solo cuenta la nueva
      prevSusp.set(p.id, su)
      // Validez de jugadores: NaN o fuera de pista (los sancionados esperan en el banquillo)
      const bad = ![p.pos.x, p.pos.y, p.velocity.x, p.velocity.y].every(Number.isFinite) ||
        (!(su > s.simNow) && (p.pos.x < RINK.x - 12 || p.pos.x > RINK.x + RINK.width + 12 || p.pos.y < RINK.y - 12 || p.pos.y > RINK.y + RINK.height + 40))
      if (bad) { st.badPlayerFrames++; st.badSample ||= `${p.id}@${Math.round(p.pos.x)},${Math.round(p.pos.y)}` }
    }

    // Posesión
    const carrier = s.ballCarrierId ? s.players.find(p => p.id === s.ballCarrierId) : undefined
    if (carrier) {
      if (lastCarrierTeam && lastCarrierTeam !== carrier.team) st.possessionChanges++
      lastCarrierTeam = carrier.team
      st.possessionSec[carrier.team] += dt
      const prev = prevCarrier ? s.players.find(p => p.id === prevCarrier) : undefined
      // Robo: la bola pasa directamente de un portador al rival
      if (prev && prev.team !== carrier.team) st.steals[carrier.team]++
      if (!prevCarrier && release && !release.shot && carrier.id !== release.id) {
        st.passes[release.team]++
        if (carrier.team === release.team) st.passesDone[release.team]++
      }
      if (carrier.id !== prevCarrier) release = null
    } else if (prevCarrier) {
      const prev = s.players.find(p => p.id === prevCarrier)
      // Un toque del rival (lastTouch) es un robo que deja la bola suelta, no un pase
      if (prev && s.lastTouch === prev.team && inPlay) release = { team: prev.team, id: prev.id, age: 0, shot: false }
      else { release = null; if (prev && inPlay) st.steals[prev.team === 'blue' ? 'red' : 'blue']++ }
    }
    if (release && (release.age += dt * 1000) > 4000) release = null

    // Bola parada (atasco): tramos > JAM_SECONDS sin que la bola se mueva y con el juego vivo
    const moved = Math.hypot(s.ball.x - prevBall.x, s.ball.y - prevBall.y) / Math.max(dt, 1e-3)
    prevBall = { x: s.ball.x, y: s.ball.y }
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
      const team = (prevCarrier ? s.players.find(p => p.id === prevCarrier)?.team : null) ?? s.lastTouch
      const dir = attackDir(team)
      const lineX = getGoalLineX(dir > 0 ? 'right' : 'left')
      const dist = (lineX - s.ball.x) * dir
      if (s.ballVelocity.x * dir > 0 && dist > 0 && dist < SHOT_MAX_DIST) {
        const yAt = s.ball.y + s.ballVelocity.y * (dist / Math.abs(s.ballVelocity.x))
        const off = Math.abs(yAt - (RINK.y + RINK.height / 2))
        if (off < GOAL_HALF_H + 70) {
          st.shots[team]++
          const onTarget = off < GOAL_HALF_H
          if (onTarget) st.onTarget[team]++
          pending = { team, onTarget, age: 0 }
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
        st.saves[pending.team]++
        st.savesBy[pending.team === 'blue' ? 'red' : 'blue']++
        pending = null
      }
      else if (pending.age > SHOT_RESOLVE_MS) pending = null
    }

    hooks?.onStep(ms, () => finish())
    if (done) return
    if (!hooks && ms >= nextPartial && ms < smokeMs) {
      nextPartial += 30000
      console.log('[smoke] ' + JSON.stringify(snapshot(false)))
    }
    if (ms >= smokeMs || s.matchEnded) finish()
  }

  const finish = () => {
    if (done) return
    done = true
    autopilot.on = false
    if (!hooks) console.log('[smoke] ' + JSON.stringify(snapshot(true)))
    stopDrive()
    match.events.off(Phaser.Scenes.Events.POST_UPDATE, post)
    console.error = origError
    window.removeEventListener('error', onErr)
    hooks?.onDone()
  }
  const post = (_t: number, delta: number) => observe(delta)
  const stopDrive = driveBlueRestarts(match)
  match.events.on(Phaser.Scenes.Events.POST_UPDATE, post)

  // Simulación acelerada: el bucle de Phaser se detiene y la escena avanza a pasos fijos sin
  // renderizar (el virtual-time de Chrome headless no da tiempo de juego fiable con Vite dev).
  match.events.once(Phaser.Scenes.Events.CREATE, () => {
    const game = match.game
    game.loop.stop()
    const STEP = 1000 / 60
    let now = game.loop.time
    const chunk = () => {
      for (let i = 0; i < 300 && !done; i++) {
        now += STEP
        match.sys.step(now, STEP)
      }
      if (!done) window.setTimeout(chunk, 0)
    }
    window.setTimeout(chunk, 0)
  })
}
