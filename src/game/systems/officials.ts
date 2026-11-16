/**
 * Árbitros a pie (WP-50, SPEC §9): movimiento y gestos. Es lógica visual pura:
 * no colisionan con la bola ni con los jugadores y no tocan la física ni las
 * reglas; solo leen sus eventos. Sistema en diagonal: uno cubre la mitad
 * derecha junto a la valla lejana y el otro la izquierda junto a la cercana,
 * siguen la bola a 4–8 m, andan o corren según lo lejos que estén de su sitio,
 * se apartan de la bola y de los jugadores y, ante un evento, el más cercano a
 * la jugada hace el gesto (los demás se orientan hacia ella).
 */
import * as Phaser from 'phaser'
import { RINK } from '../constants'
import { REFEREES, WORLD_PX_PER_M } from '../render/artSpec'
import { createReferee, drawReferee, type GestureDraw, type RefereeView } from '../render/officials'
import type { Ball, Player } from '../types'
import type { RuleState } from './rules'

const R = REFEREES
const MX = WORLD_PX_PER_M.x
const MY = WORLD_PX_PER_M.y
const CX = RINK.x + RINK.width / 2
const CY = RINK.y + RINK.height / 2

interface Gesture {
  kind: GestureDraw['kind']
  start: number
  end: number
  aim: number
  down: number
  cardColor: number
}

interface Ref {
  view: RefereeView
  /** 0 = valla lejana (mitad derecha), 1 = valla cercana (mitad izquierda). */
  index: number
  x: number
  y: number
  vx: number
  vy: number
  yaw: number
  phase: number
  gesture: Gesture | null
  /** Posición forzada (bully) hasta `until`. */
  hold: { x: number; y: number; until: number } | null
}

const angleTo = (fx: number, fy: number, tx: number, ty: number) => Math.atan2(tx - fx, ty - fy)
const mix = (pair: readonly [number, number], t: number) => pair[0] + (pair[1] - pair[0]) * t
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export class Officials {
  private readonly refs: Ref[]
  private now: number
  private ball: Ball | null = null

  constructor(scene: Phaser.Scene) {
    this.now = scene.time.now
    this.refs = [0, 1].map((index) => ({
      view: createReferee(scene, index),
      index,
      x: CX + (index === 0 ? 1 : -1) * 6 * MX,
      y: this.laneY(index),
      vx: 0, vy: 0, yaw: index === 0 ? 0 : Math.PI, phase: 0, gesture: null, hold: null,
    }))
  }

  /** y de mundo del carril de cada árbitro. */
  private laneY(index: number) {
    return index === 0 ? RINK.y + R.laneM * MY : RINK.y + RINK.height - R.laneM * MY
  }

  /** Avanza el movimiento y dibuja; se llama cada frame (incluso en pausas del juego). */
  update(time: number, dt: number, ball: Ball, players: Player[]) {
    this.now = time
    this.ball = ball
    for (const r of this.refs) {
      this.move(r, dt, ball, players)
      const g = r.gesture
      if (g && time >= g.end) r.gesture = null
      const t = g ? clamp01((time - g.start) / (g.end - g.start)) : 0
      const draw: GestureDraw | null = g
        ? { kind: g.kind, env: Math.min(1, t / 0.2, (1 - t) / 0.2), aim: g.aim, down: g.down, cardColor: g.cardColor }
        : null
      drawReferee(r.view, { x: r.x, y: r.y, yaw: r.yaw, speedMps: Math.hypot(r.vx, r.vy) / MX, phase: r.phase, gesture: draw })
    }
  }

  /** Punto al que va el árbitro: sigue la bola por su carril manteniendo la distancia mínima. */
  private target(r: Ref, ball: Ball): { x: number; y: number } {
    if (r.hold && this.now < r.hold.until) return r.hold
    r.hold = null
    const lane = this.laneY(r.index)
    const minX = r.index === 0 ? CX - R.overlapM * MX : RINK.x + R.endMarginM * MX
    const maxX = r.index === 0 ? RINK.x + RINK.width - R.endMarginM * MX : CX + R.overlapM * MX
    const dy = (lane - ball.y) / MX
    const needDx = Math.sqrt(Math.max(0, R.followMinM * R.followMinM - dy * dy)) * MX
    // Se queda del lado en el que ya está respecto a la bola (sin saltar de un lado a otro)
    const sign = r.x <= ball.x ? -1 : 1
    return { x: Phaser.Math.Clamp(ball.x + sign * needDx, minX, maxX), y: lane }
  }

  private move(r: Ref, dt: number, ball: Ball, players: Player[]) {
    const tgt = this.target(r, ball)
    const gesturing = !!r.gesture
    const ex = tgt.x - r.x
    const ey = tgt.y - r.y
    const err = Math.hypot(ex, ey) / MX
    const runT = clamp01((err - R.runErrM[0]) / (R.runErrM[1] - R.runErrM[0]))
    const want = gesturing || err < 0.4 ? 0 : mix([R.walkMps, R.runMps], runT) * MX
    const dvx = err > 1e-3 ? (ex / (err * MX)) * want : 0
    const dvy = err > 1e-3 ? (ey / (err * MX)) * want : 0
    // Aceleración suave hacia la velocidad deseada
    const dv = Math.hypot(dvx - r.vx, dvy - r.vy)
    const maxDv = R.accelMps2 * MX * dt * (gesturing ? 1.6 : 1)
    const f = dv > maxDv ? maxDv / dv : 1
    r.vx += (dvx - r.vx) * f
    r.vy += (dvy - r.vy) * f

    let x = r.x + r.vx * dt
    let y = r.y + r.vy * dt
    // Evitación: empujón lateral lejos de los jugadores cercanos y de la bola
    const push = R.avoidMps * MX * dt
    const away = (ox: number, oy: number, radiusM: number, k: number) => {
      const dx = x - ox
      const dy = y - oy
      const d = Math.hypot(dx, dy)
      if (d >= radiusM * MX) return
      const nx = d > 1e-3 ? dx / d : 0
      const ny = d > 1e-3 ? dy / d : 1
      const s = (1 - d / (radiusM * MX)) * push * k
      x += nx * s
      y += ny * s
    }
    for (const p of players) {
      if (p.suspendedUntil && p.suspendedUntil > this.now) continue
      away(p.pos.x, p.pos.y, R.playerAvoidM, 1)
    }
    away(ball.x, ball.y, R.ballAvoidM, 1.6)

    // Dentro de la pista y, salvo en el bully, en la banda de su lateral
    x = Phaser.Math.Clamp(x, RINK.x + R.endMarginM * MX, RINK.x + RINK.width - R.endMarginM * MX)
    const held = !!r.hold
    const lo = held ? RINK.y + R.laneBandM[0] * MY : r.index === 0 ? RINK.y + R.laneBandM[0] * MY : RINK.y + RINK.height - R.laneBandM[1] * MY
    const hi = held ? RINK.y + RINK.height - R.laneBandM[0] * MY : r.index === 0 ? RINK.y + R.laneBandM[1] * MY : RINK.y + RINK.height - R.laneBandM[0] * MY
    y = Phaser.Math.Clamp(y, lo, hi)
    const stepPx = Math.hypot(x - r.x, y - r.y)
    r.x = x
    r.y = y

    // Fase por distancia recorrida: el pie de apoyo no resbala
    const speedM = Math.hypot(r.vx, r.vy) / MX
    const stride = mix(R.strideM, clamp01((speedM - R.walkMps) / (R.runMps - R.walkMps)))
    r.phase = (r.phase + (Math.PI * 2 * stepPx) / (MX * stride)) % (Math.PI * 20)

    // Mira hacia donde va; parado o gesticulando, hacia el gesto o la jugada
    const g = r.gesture
    const yawWant = g ? g.aim : speedM > 0.6 ? Math.atan2(r.vx, r.vy) : angleTo(r.x, r.y, ball.x, ball.y)
    const dyaw = Phaser.Math.Angle.Wrap(yawWant - r.yaw)
    const maxTurn = R.turnRate * dt
    r.yaw = Phaser.Math.Angle.Wrap(r.yaw + Phaser.Math.Clamp(dyaw, -maxTurn, maxTurn))
  }

  /** El árbitro más cercano a (x, y) hace el gesto; el otro sigue a la jugada. */
  private gesture(kind: Gesture['kind'], toX: number, toY: number, down: number, ms: number, cardColor = 0) {
    const b = this.ball ?? { x: CX, y: CY }
    const near = this.refs.reduce((a, c) => (Math.hypot(a.x - b.x, a.y - b.y) <= Math.hypot(c.x - b.x, c.y - b.y) ? a : c))
    near.gesture = { kind, start: this.now, end: this.now + ms, aim: angleTo(near.x, near.y, toX, toY), down, cardColor }
  }

  /** Silbato de saque o reanudación: brazo arriba, mirando a la bola. */
  whistle() {
    const b = this.ball ?? { x: CX, y: CY }
    this.gesture('whistle', b.x, b.y, 0, R.gestureMs.whistle)
  }

  /** Gol: el más cercano a la bola señala el centro de la pista. */
  goal() {
    this.gesture('point', CX, CY, R.pointDown, R.gestureMs.goal)
  }

  /**
   * Falta: tarjeta alzada al infractor si lo han sancionado; si no, brazo hacia
   * la dirección del saque (libre indirecto) o al punto de saque (directo y penalti).
   */
  foul(foul: NonNullable<RuleState['pendingFoul']>, players: Player[]) {
    const offender = players.find(p => p.id === foul.byPlayerId)
    if (offender && offender.suspendedUntil && offender.suspendedUntil > this.now) {
      this.gesture('card', offender.pos.x, offender.pos.y, 0, R.gestureMs.card, R.cardBlue)
      return
    }
    this.gesture('point', foul.restartX, foul.restartY, foul.sanction === 'free-hit' ? 0.12 : R.pointDown, R.gestureMs.point)
  }

  /** Bully: los dos se colocan cerca del punto, uno a cada lado. */
  bully(x: number, y: number) {
    const until = this.now + R.bullyHoldMs
    for (const r of this.refs) {
      const s = r.index === 0 ? -1 : 1
      r.hold = { x: x + s * R.bullyOffsetM[0] * MX, y: y + s * R.bullyOffsetM[1] * MY, until }
    }
  }
}

/** Crea los dos árbitros de la escena. */
export function createOfficials(scene: Phaser.Scene): Officials {
  return new Officials(scene)
}
