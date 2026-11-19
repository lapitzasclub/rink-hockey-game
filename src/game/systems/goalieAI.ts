import {
  CLEAR_CHANCE_LANE,
  GAME_HEIGHT,
  GOALIE_AI_MAX_Y,
  GOALIE_AI_TRACK,
  GOALIE_ARRIVE_GAIN,
  GOALIE_BEHIND_MAX_Y,
  GOALIE_BEHIND_TRACK,
  GOALIE_DIVE_ACCEL,
  GOALIE_DIVE_SPEED,
  GOALIE_FACE_MAX_RAD,
  GOALIE_MOVE_ACCEL,
  GOALIE_MOVE_SPEED,
  GOALIE_OUT_DEPTH,
  GOALIE_OUT_LANE,
  GOALIE_OUT_RANGE,
  GOALIE_SHOT_MIN_SPEED,
  GOALIE_SHOT_MOUTH_MARGIN,
  GOALIE_SHOT_READ_RANGE,
  GOALIE_SMOTHER_SPEED,
  GOALIE_TARGET_DEADZONE,
  GOALIE_TARGET_TAU,
  GOALIE_TURN_RATE,
  GOALIE_X_MAX,
  GOAL_HALF_H,
  PLAYER_FRICTION,
  RINK,
  aiProfileFor,
} from '../constants'
import type { Ball, Player, Vector } from '../types'
import { getGoalLineX } from '../utils'

/**
 * IA del portero (E-03).
 *
 * Tres capas, para que se mueva como alguien que patina y no como un cursor:
 * 1. Objetivo crudo: sobre la bisectriz del ángulo bola–postes a su profundidad, poste cubierto
 *    con la bola tras la línea, salida continua ante el mano a mano y, pasado su tiempo de
 *    reacción (perfil de IA, el mando de dificultad), el punto de cruce del tiro que ve venir; una
 *    bola muerta a su alcance la va a cubrir.
 * 2. Objetivo suavizado: zona muerta + filtro de primer orden (sin temblor al seguir la bola).
 * 3. Patinaje: velocidad deseada con perfil de frenada y aceleración neta limitada; la mirada
 *    gira a ritmo limitado y nunca hacia su propia portería.
 */

interface GoalieMind {
  /** Objetivo suavizado. */
  tx: number
  ty: number
  /** Instante en que vio salir el tiro que viene (0 = ninguno). */
  shotSeenAt: number
  /** Estirándose hacia el cruce leído del tiro. */
  reading: boolean
  readY: number
  /** Último paso en que pensó: si queda viejo (rituales, control humano) se reinicia. */
  lastAt: number
}

const minds = new WeakMap<Player, GoalieMind>()
const STALE_MS = 120

function mindOf(player: Player, now: number): GoalieMind {
  let m = minds.get(player)
  if (!m) {
    m = { tx: 0, ty: 0, shotSeenAt: 0, reading: false, readY: 0, lastAt: -1e9 }
    minds.set(player, m)
    // La mirada se modifica en sitio: que sea un objeto propio
    player.facing = { x: player.facing.x, y: player.facing.y }
  }
  if (now - m.lastAt > STALE_MS) {
    m.tx = player.pos.x
    m.ty = player.pos.y
    m.shotSeenAt = 0
    m.reading = false
  }
  m.lastAt = now
  return m
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Desplazamiento lateral (respecto al centro de la boca) de la bisectriz del ángulo bola–postes
 * a `along` px por delante de la línea de gol. La bisectriz corta la línea en el punto que la
 * reparte en proporción a la distancia de la bola a cada poste (teorema de la bisectriz).
 */
function bisectorY(dxBall: number, dyBall: number, along: number) {
  const d1 = Math.hypot(dxBall, dyBall + GOAL_HALF_H)
  const d2 = Math.hypot(dxBall, dyBall - GOAL_HALF_H)
  const onLine = -GOAL_HALF_H + (2 * GOAL_HALF_H * d1) / (d1 + d2)
  return onLine + (dyBall - onLine) * Math.min(1, along / Math.max(1, dxBall))
}

/**
 * Cuánto sale el portero (0..GOALIE_OUT_DEPTH) ante un portador rival solo delante de él:
 * rampa continua con la distancia, sin escalones que lo hagan salir y volver de golpe.
 */
function oneOnOneDepth(goalie: Player, players: Player[], carrierId: string | null, lineX: number, dir: number) {
  if (!carrierId) return 0
  let carrier: Player | null = null
  for (const p of players) if (p.id === carrierId) { carrier = p; break }
  if (!carrier || carrier.team === goalie.team || carrier.role === 'goalie') return 0
  const ahead = (carrier.pos.x - lineX) * dir
  const cy = GAME_HEIGHT / 2
  if (ahead <= 0 || Math.abs(carrier.pos.y - cy) > GOALIE_OUT_LANE) return 0
  const dist = Math.hypot(ahead, carrier.pos.y - cy)
  if (dist > GOALIE_OUT_RANGE) return 0
  // Algún defensor propio entre el portador y la portería: no hay mano a mano
  for (const p of players) {
    if (p.team !== goalie.team || p.role === 'goalie' || (p.suspendedUntil ?? 0) > 0) continue
    const pAhead = (p.pos.x - lineX) * dir
    if (pAhead > 0 && pAhead < ahead && Math.abs(p.pos.y - carrier.pos.y) < CLEAR_CHANCE_LANE) return 0
  }
  return GOALIE_OUT_DEPTH * clamp((GOALIE_OUT_RANGE - dist) / (GOALIE_OUT_RANGE * 0.5), 0, 1)
}

/**
 * Lectura del tiro: una bola libre y rápida hacia su portería que cruzaría la boca. Solo
 * empieza a estirarse pasado su tiempo de reacción desde que la ve salir (sin clarividencia).
 */
function readShot(m: GoalieMind, goalie: Player, ball: Ball, bv: Vector, carrierId: string | null, lineX: number, dir: number, now: number, arcade: boolean) {
  const speed = Math.hypot(bv.x, bv.y)
  const toward = -bv.x * dir
  const ahead = (ball.x - lineX) * dir
  if (carrierId || speed < GOALIE_SHOT_MIN_SPEED || toward < speed * 0.5 || ahead < 0 || ahead > GOALIE_SHOT_READ_RANGE) {
    m.shotSeenAt = 0
    m.reading = false
    return
  }
  if (m.shotSeenAt === 0) m.shotSeenAt = now
  const profile = aiProfileFor(goalie.team)
  if (now - m.shotSeenAt < profile.goalieReactionMs * (arcade ? profile.arcadeGoalieReactionScale : 1)) return
  // Cruce con la vertical del portero, con la velocidad que ve ahora
  const t = (goalie.pos.x - ball.x) / bv.x
  const cy = GAME_HEIGHT / 2
  const yHit = ball.y + bv.y * Math.max(0, t)
  if (Math.abs(yHit - cy) > GOAL_HALF_H + GOALIE_SHOT_MOUTH_MARGIN) {
    m.reading = false
    return
  }
  m.reading = true
  m.readY = clamp(yHit, cy - GOALIE_AI_MAX_Y, cy + GOALIE_AI_MAX_Y)
}

/**
 * Patina hacia (tx, ty) con velocidad deseada que frena a tiempo (sin pasarse y volver) y
 * aceleración neta limitada. Compensa el rozamiento que aplicará applySkating.
 */
export function skateGoalieTo(player: Player, tx: number, ty: number, maxSpeed: number, accel: number, dt: number) {
  const ex = tx - player.pos.x
  const ey = ty - player.pos.y
  const err = Math.hypot(ex, ey)
  let want = Math.min(maxSpeed, err * GOALIE_ARRIVE_GAIN, Math.sqrt(2 * accel * 0.85 * err))
  if (err < 0.5) want = 0
  const wx = err > 0 ? (ex / err) * want : 0
  const wy = err > 0 ? (ey / err) * want : 0
  const dvx = wx - player.velocity.x
  const dvy = wy - player.velocity.y
  const dl = Math.hypot(dvx, dvy)
  const maxDv = accel * dt
  const k = dl > maxDv ? maxDv / dl : 1
  player.velocity.x = (player.velocity.x + dvx * k) / PLAYER_FRICTION
  player.velocity.y = (player.velocity.y + dvy * k) / PLAYER_FRICTION
}

/**
 * Gira la mirada del portero hacia (lx, ly) a ritmo limitado, sin pasar de GOALIE_FACE_MAX_RAD
 * respecto al frente: con la bola a un lado o detrás mira de reojo, no se da la vuelta.
 */
export function steerGoalieFacing(player: Player, lx: number, ly: number, dt: number) {
  const dir = player.side === 'left' ? 1 : -1
  const forward = dir > 0 ? 0 : Math.PI
  const len = Math.hypot(lx, ly)
  let rel = len < 4 ? 0 : Math.atan2(ly, lx) - forward
  rel = Math.atan2(Math.sin(rel), Math.cos(rel))
  rel = clamp(rel, -GOALIE_FACE_MAX_RAD, GOALIE_FACE_MAX_RAD)
  const cur = Math.atan2(player.facing.y, player.facing.x)
  let d = forward + rel - cur
  d = Math.atan2(Math.sin(d), Math.cos(d))
  if (Math.abs(d) < 0.02) return
  const step = GOALIE_TURN_RATE * dt
  const a = cur + (d > step ? step : d < -step ? -step : d)
  player.facing.x = Math.cos(a)
  player.facing.y = Math.sin(a)
}

/** Contexto de un paso de la IA del portero. */
export interface GoalieContext {
  players: Player[]
  ball: Ball
  ballVelocity: Vector
  ballCarrierId: string | null
  dt: number
  now: number
  arcade: boolean
}

export function updateGoalieAI(player: Player, ctx: GoalieContext) {
  const { ball, dt, now } = ctx
  const m = mindOf(player, now)
  const dir = player.side === 'left' ? 1 : -1
  const lineX = getGoalLineX(player.side)
  const cy = GAME_HEIGHT / 2
  const baseX = player.side === 'left' ? RINK.x + GOALIE_X_MAX : RINK.x + RINK.width - GOALIE_X_MAX
  const recovering = (player.goalieRecoverUntil ?? 0) > now
  const carrying = ctx.ballCarrierId === player.id

  const dxBall = (ball.x - lineX) * dir
  const dyBall = ball.y - cy
  let rawY: number
  let depth = 0
  // Bola muerta a su alcance (rebote que se queda en la boca): va a por ella en vez de mirarla
  const reachX = (baseX - lineX) * dir + GOALIE_OUT_DEPTH
  const smother = !recovering && !ctx.ballCarrierId && dxBall >= 0 && dxBall <= reachX && Math.abs(dyBall) <= GOALIE_AI_MAX_Y
    && Math.hypot(ctx.ballVelocity.x, ctx.ballVelocity.y) < GOALIE_SMOTHER_SPEED
  if (recovering || carrying) {
    rawY = cy
  } else if (smother) {
    rawY = ball.y
    depth = clamp(dxBall - (baseX - lineX) * dir, 0, GOALIE_OUT_DEPTH)
  } else if (dxBall < 0) {
    rawY = cy + clamp(dyBall * GOALIE_BEHIND_TRACK, -GOALIE_BEHIND_MAX_Y, GOALIE_BEHIND_MAX_Y)
  } else {
    depth = oneOnOneDepth(player, ctx.players, ctx.ballCarrierId, lineX, dir)
    const along = (baseX - lineX) * dir + depth
    rawY = clamp(cy + bisectorY(dxBall, dyBall, along) * GOALIE_AI_TRACK, cy - GOALIE_AI_MAX_Y, cy + GOALIE_AI_MAX_Y)
  }

  if (recovering || carrying) {
    m.shotSeenAt = 0
    m.reading = false
  } else {
    readShot(m, player, ball, ctx.ballVelocity, ctx.ballCarrierId, lineX, dir, now, ctx.arcade)
  }

  const alpha = 1 - Math.exp(-dt / GOALIE_TARGET_TAU)
  if (m.reading) {
    // La estirada va directa al cruce leído: es la reacción, no se filtra
    m.ty = m.readY
  } else {
    const err = rawY - m.ty
    if (err > GOALIE_TARGET_DEADZONE) m.ty += (err - GOALIE_TARGET_DEADZONE) * alpha
    else if (err < -GOALIE_TARGET_DEADZONE) m.ty += (err + GOALIE_TARGET_DEADZONE) * alpha
  }
  m.tx += (baseX + dir * depth - m.tx) * alpha

  if (m.reading) skateGoalieTo(player, m.tx, m.ty, GOALIE_DIVE_SPEED, GOALIE_DIVE_ACCEL, dt)
  else skateGoalieTo(player, m.tx, m.ty, GOALIE_MOVE_SPEED, GOALIE_MOVE_ACCEL, dt)

  if (recovering) steerGoalieFacing(player, dir, 0, dt)
  else steerGoalieFacing(player, ball.x - player.pos.x, ball.y - player.pos.y, dt)
}
