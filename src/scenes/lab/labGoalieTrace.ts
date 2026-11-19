import * as Phaser from 'phaser'
import { PLAYER_SPRINT_MAX_SPEED } from '../../game/constants'

/**
 * Traza de «rareza» del portero (E-03): con `?lab=match&auto=1&goalieTrace=1` muestrea a cada
 * paso de simulación (60 Hz) posición, velocidad y mirada de los dos porteros mientras el juego
 * está vivo, e imprime `[goalie] {json}` acumulado cada 20 s de juego. Solo lectura.
 *
 * Métricas (por minuto de juego vivo y portero):
 * - flips: cambios de sentido lateral (vy cambia de signo con |vy| > FLIP_V); jitter: los que
 *   llegan antes de JITTER_MS del anterior (temblor).
 * - fastTurnPct: % de pasos con giro de mirada > FAST_TURN rad/s; snaps: giros > SNAP_RAD en un paso.
 * - accelP99: percentil 99 de |Δv|/dt; hardAccel: pasos por encima de HARD_ACCEL.
 * - teleports: desplazamientos en un paso mayores que lo que permite la velocidad punta.
 * - ghostPct: % de pasos en los que la velocidad no coincide con lo que se mueve (empuja contra un tope).
 * - slidePct: % del tiempo en movimiento con la velocidad casi perpendicular a la mirada.
 */

const FLIP_V = 25
const JITTER_MS = 400
const FAST_TURN = 8
const SNAP_RAD = 0.5
const HARD_ACCEL = 2500
const GHOST_V = 40
const SLIDE_SPEED = 60
const SLIDE_DOT = 0.35
const PRINT_EVERY_MS = 10000

type GView = Phaser.Scene & {
  players: Array<{ id: string, role: string, side: 'left' | 'right', pos: { x: number, y: number }, velocity: { x: number, y: number }, facing: { x: number, y: number } }>
  activeFoulRestart: unknown
  activeBully: unknown
  activeKickoff: unknown
  restartAt: number
  matchEnded: boolean
  simNow: number
  ball: { x: number, y: number }
  ballCarrierId: string | null
}

interface Track {
  px: number, py: number, vx: number, vy: number, ang: number
  lastSign: number, lastFlipAt: number, valid: boolean
}

export function startGoalieTrace(match: Phaser.Scene) {
  const s = match as GView
  const tracks = new Map<string, Track>()
  const st = { liveSec: 0, steps: 0, flips: 0, jitter: 0, fastTurn: 0, snaps: 0, hardAccel: 0, teleports: 0, ghost: 0, moving: 0, slide: 0, turnMax: 0 }
  const accels: number[] = []
  let prevNow = -1
  let nextPrint = 0
  let t0 = 0
  // Bola quieta con juego vivo: se vuelca una vez la escena para diagnosticar atascos
  let stillMs = 0
  let bx = 0
  let by = 0

  const report = () => {
    const min = Math.max(1e-3, st.liveSec / 60) * 2 // dos porteros
    accels.sort((a, b) => a - b)
    const p99 = accels.length ? accels[Math.floor(accels.length * 0.99)] : 0
    const r = (v: number) => Math.round(v * 100) / 100
    console.log('[goalie] ' + JSON.stringify({
      sec: Math.round((s.simNow - t0) / 100) / 10, liveSec: Math.round(st.liveSec),
      flipsPerMin: r(st.flips / min), jitterPerMin: r(st.jitter / min),
      fastTurnPct: r(100 * st.fastTurn / Math.max(1, st.steps)), snapsPerMin: r(st.snaps / min), turnMax: r(st.turnMax),
      accelP99: Math.round(p99), hardAccelPerMin: r(st.hardAccel / min), teleportsPerMin: r(st.teleports / min),
      ghostPct: r(100 * st.ghost / Math.max(1, st.steps)), slidePct: r(100 * st.slide / Math.max(1, st.moving)),
    }))
  }

  const sample = () => {
    if (!s.players?.length) return
    const now = s.simNow
    const dt = (now - prevNow) / 1000
    const first = prevNow < 0
    prevNow = now
    if (first) { t0 = now; nextPrint = now + PRINT_EVERY_MS }
    if (first || dt <= 0 || dt > 0.05) return
    const live = !s.activeFoulRestart && !s.activeBully && !s.activeKickoff && s.restartAt <= 0 && !s.matchEnded
    if (live) st.liveSec += dt
    if (live && Math.hypot(s.ball.x - bx, s.ball.y - by) < 0.5) {
      stillMs += dt * 1000
      if (stillMs > 6000 && stillMs - dt * 1000 <= 6000) {
        console.log('[jam] ' + JSON.stringify({
          t: Math.round((now - t0) / 1000), ball: [Math.round(s.ball.x), Math.round(s.ball.y)], carrier: s.ballCarrierId,
          players: s.players.map(p => `${p.id}:${Math.round(p.pos.x)},${Math.round(p.pos.y)}`).join(' '),
        }))
      }
    } else stillMs = 0
    bx = s.ball.x
    by = s.ball.y
    for (const p of s.players) {
      if (p.role !== 'goalie') continue
      const ang = Math.atan2(p.facing.y, p.facing.x)
      let t = tracks.get(p.id)
      if (!t) {
        t = { px: p.pos.x, py: p.pos.y, vx: p.velocity.x, vy: p.velocity.y, ang, lastSign: 0, lastFlipAt: -1e9, valid: false }
        tracks.set(p.id, t)
      }
      if (live && t.valid) {
        st.steps++
        const dx = p.pos.x - t.px
        const dy = p.pos.y - t.py
        const disp = Math.hypot(dx, dy)
        if (disp > PLAYER_SPRINT_MAX_SPEED * dt * 1.25 + 1) st.teleports++
        const a = Math.hypot(p.velocity.x - t.vx, p.velocity.y - t.vy) / dt
        accels.push(a)
        if (a > HARD_ACCEL) st.hardAccel++
        let da = Math.abs(ang - t.ang)
        if (da > Math.PI) da = Math.PI * 2 - da
        const turn = da / dt
        if (turn > FAST_TURN) st.fastTurn++
        if (da > SNAP_RAD) st.snaps++
        if (turn > st.turnMax) st.turnMax = turn
        if (Math.hypot(p.velocity.x - dx / dt, p.velocity.y - dy / dt) > GHOST_V) st.ghost++
        const speed = Math.hypot(p.velocity.x, p.velocity.y)
        if (speed > SLIDE_SPEED) {
          st.moving++
          const dot = (p.velocity.x * p.facing.x + p.velocity.y * p.facing.y) / speed
          if (Math.abs(dot) < SLIDE_DOT) st.slide++
        }
        if (Math.abs(p.velocity.y) > FLIP_V) {
          const sign = Math.sign(p.velocity.y)
          if (t.lastSign !== 0 && sign !== t.lastSign) {
            st.flips++
            if (now - t.lastFlipAt < JITTER_MS) st.jitter++
            t.lastFlipAt = now
          }
          t.lastSign = sign
        }
      }
      if (!live) t.lastSign = 0
      t.valid = live
      t.px = p.pos.x; t.py = p.pos.y; t.vx = p.velocity.x; t.vy = p.velocity.y; t.ang = ang
    }
    if (now >= nextPrint) { nextPrint += PRINT_EVERY_MS; report() }
  }
  match.events.on(Phaser.Scenes.Events.POST_UPDATE, sample)
}
