/**
 * Reacciones en juego (E-20): gestos cortos de tronco y brazos tras una parada, un palo o
 * un tiro fuera por poco, una falta o una tarjeta. Se deciden en la simulación (a paso fijo,
 * tiempos en `simNow`) y solo escriben `player.reaction`; la pose la calcula
 * `render/puppet/reactionClips.ts`. No tocan física, IA ni velocidades.
 * Nunca a quien lleva la bola ni a quien está en una acción, y se cortan al instante si el
 * jugador recibe la bola o actúa.
 */
import { ARCADE_CHECK_COOLDOWN_MS, GOAL_HALF_H, REACTION, RINK } from '../constants'
import type { Ball, Player, ReactionKind } from '../types'
import { getGoalLineX } from '../utils'

/** Último tiro visto (por la marca `anim` del tirador) y bola del paso anterior. */
export type ReactionState = {
  shooterId: string | null
  shotAt: number
  seenShotAt: number
  prevBallX: number
  /** Sancionado que aún puede recibir la palmada de un compañero al salir. */
  patFor: string | null
}

export function createReactionState(): ReactionState {
  return { shooterId: null, shotAt: 0, seenShotAt: -Infinity, prevBallX: NaN, patFor: null }
}

const R = REACTION
const GOAL_CY = RINK.y + RINK.height / 2
const LEFT_X = getGoalLineX('left')
const RIGHT_X = getGoalLineX('right')

const suspended = (p: Player, now: number) => (p.suspendedUntil ?? 0) > now || !!p.penPhase

/** Inicio de la última acción del jugador (pase, tiro, robo, recepción, carga), o -Infinity. */
function lastActionAt(p: Player): number {
  let at = p.anim && p.anim.type !== 'save' && p.anim.type !== 'celebrate' ? p.anim.at : -Infinity
  if (p.checkCooldownUntil) at = Math.max(at, p.checkCooldownUntil - ARCADE_CHECK_COOLDOWN_MS)
  return at
}

/** Cargando, aturdido, en un gesto de parón o con una acción posterior a `since` aún en curso. */
function busy(p: Player, now: number, since: number) {
  if (p.aiCharge || p.charge || (p.stunUntil ?? 0) > now) return true
  if (p.mood && now >= p.mood.at && now < p.mood.until) return true
  const at = lastActionAt(p)
  return at > since && now - at < R.actMs
}

/**
 * Desde cuándo cuenta una acción como «está actuando»: el pitido para el juego (la acción
 * que lo provocó no cuenta), el tiro propio tampoco; el resto, cualquiera.
 */
function sinceFor(kind: ReactionKind, st: ReactionState, now: number) {
  if (kind === 'protest' || kind === 'own' || kind === 'card' || kind === 'mine') return now
  if (kind === 'rue' || kind === 'miss') return st.shotAt
  return -Infinity
}

/** Lado (±1, derecha del jugador) hacia el punto (x, y), con el convenio de `markGoalieSave`. */
function sideTo(p: Player, x: number, y: number): 1 | -1 {
  const lat = -(x - p.pos.x) * p.facing.y + (y - p.pos.y) * p.facing.x
  return lat < 0 ? -1 : 1
}

/** Marca la reacción si el jugador está libre; reutiliza el objeto para no asignar en partido. */
function react(st: ReactionState, p: Player, kind: ReactionKind, at: number, now: number, carrierId: string | null, side: 1 | -1 = 1) {
  if (kind !== 'mine' && p.id === carrierId) return false
  if (kind !== 'card' && suspended(p, now)) return false
  if (busy(p, now, sinceFor(kind, st, now))) return false
  const until = at + R.ms[kind]
  const r = p.reaction
  if (!r) { p.reaction = { kind, at, until, side }; return true }
  r.kind = kind; r.at = at; r.until = until; r.side = side
  return true
}

function byId(players: Player[], id: string | null) {
  if (!id) return null
  for (const p of players) if (p.id === id) return p
  return null
}

/** Tirador del último tiro si fue hace menos de `shotWindowMs`. */
function recentShooter(st: ReactionState, players: Player[], now: number) {
  if (!st.shooterId || now - st.shotAt > R.shotWindowMs) return null
  return byId(players, st.shooterId)
}

/** Portero rival del equipo `team` más cercano a (x, y). */
function rivalGoalie(players: Player[], team: Player['team'], x: number, y: number) {
  let best: Player | null = null
  let bd = Infinity
  for (const p of players) {
    if (p.role !== 'goalie' || p.team === team) continue
    const d = Math.hypot(p.pos.x - x, p.pos.y - y)
    if (d < bd) { bd = d; best = p }
  }
  return best
}

/**
 * Parada tras un tiro: si el portero bloca, «¡mía!» y hasta `mates` compañeros cercanos
 * golpean el stick contra el suelo; el tirador, manos al casco (también si solo la desvía).
 */
export function reactSave(st: ReactionState, players: Player[], goalie: Player | null, caught: boolean, carrierId: string | null, now: number) {
  if (!goalie) return
  const shooter = recentShooter(st, players, now)
  if (!shooter || shooter.team === goalie.team) return
  st.shooterId = null
  react(st, shooter, 'rue', now, now, carrierId)
  if (!caught) return
  react(st, goalie, 'mine', now + R.mineDelayMs, now, carrierId)
  let left = R.mates
  // Los más cercanos primero: dos pasadas baratas sobre 4 compañeros, sin ordenar ni asignar
  let skip: Player | null = null
  while (left > 0) {
    let best: Player | null = null
    let bd = R.mateRadius
    for (const p of players) {
      if (p === skip || p.team !== goalie.team || p.role === 'goalie') continue
      const d = Math.hypot(p.pos.x - goalie.pos.x, p.pos.y - goalie.pos.y)
      if (d < bd) { bd = d; best = p }
    }
    if (!best) break
    react(st, best, 'tap', now + R.mineDelayMs + (R.mates - left) * R.tapStaggerMs, now, carrierId)
    skip = best
    left--
  }
}

/** Palo o tiro fuera por poco: el tirador, cabeza atrás; el portero rival resopla. */
function reactMiss(st: ReactionState, players: Player[], shooter: Player, x: number, y: number, carrierId: string | null, now: number) {
  st.shooterId = null
  react(st, shooter, 'miss', now, now, carrierId)
  const gk = rivalGoalie(players, shooter.team, x, y)
  if (gk) react(st, gk, 'phew', now, now, carrierId)
}

/** La bola dio en un poste este paso (`ballFrameHit.post`). */
export function reactPost(st: ReactionState, players: Player[], ball: Ball, carrierId: string | null, now: number) {
  const shooter = recentShooter(st, players, now)
  if (shooter) reactMiss(st, players, shooter, ball.x, ball.y, carrierId, now)
}

/** Falta pitada: la víctima protesta con los brazos abiertos; el infractor levanta la mano o, si ve tarjeta, protesta y sale cabizbajo. */
export function reactFoul(st: ReactionState, players: Player[], byId_: string, victimId: string, carrierId: string | null, now: number) {
  const off = byId(players, byId_)
  const vic = byId(players, victimId)
  if (vic && vic !== off) react(st, vic, 'protest', now, now, carrierId)
  if (!off) return
  const card = (off.suspendedUntil ?? 0) > now
  if (card && react(st, off, 'card', now, now, carrierId)) st.patFor = off.id
  else if (!card) react(st, off, 'own', now, now, carrierId)
}

/**
 * Paso de simulación: detecta tiros nuevos y tiros fuera por poco, da la palmada al
 * sancionado y corta las reacciones de quien recibe la bola o actúa. `live` = bola en juego.
 */
export function updateReactions(st: ReactionState, players: Player[], ball: Ball, carrierId: string | null, now: number, live: boolean) {
  for (const p of players) {
    const a = p.anim
    if (a && (a.type === 'shot' || a.type === 'turbo') && a.at > st.seenShotAt) {
      st.seenShotAt = a.at
      st.shotAt = a.at
      st.shooterId = p.id
    }
  }
  // El tiro se resuelve cuando alguien se hace con la bola: el portero rival la bloca (parada)
  const holder = byId(players, carrierId)
  if (holder && st.shooterId) {
    if (holder.role === 'goalie') reactSave(st, players, holder, true, carrierId, now)
    st.shooterId = null
  }
  const px = st.prevBallX
  st.prevBallX = ball.x
  if (live && px === px) {
    const shooter = recentShooter(st, players, now)
    const crossed = (px > LEFT_X && ball.x <= LEFT_X) || (px < RIGHT_X && ball.x >= RIGHT_X)
    const off = Math.abs(ball.y - GOAL_CY) - GOAL_HALF_H
    if (shooter && crossed && off > 0 && off < R.nearMissPx) {
      const gk = rivalGoalie(players, shooter.team, ball.x, ball.y)
      // Solo junto a la portería rival, no por detrás de la propia
      if (gk && Math.abs(gk.pos.x - ball.x) < Math.abs(ball.x - (LEFT_X + RIGHT_X) / 2)) reactMiss(st, players, shooter, ball.x, ball.y, carrierId, now)
    }
  }

  const pen = byId(players, st.patFor)
  if (pen && pen.penPhase !== 'out' && pen.penPhase !== 'exit') st.patFor = null
  for (const p of players) {
    const r = p.reaction
    if (r && r.until > now) {
      const acted = (p.id === carrierId && r.kind !== 'mine') || lastActionAt(p) > r.at || !!p.aiCharge || !!p.charge
      if (acted) r.until = now
    }
    if (st.patFor && pen && p !== pen && p.team === pen.team && p.role !== 'goalie'
      && Math.hypot(p.pos.x - pen.pos.x, p.pos.y - pen.pos.y) < R.patRadius
      && react(st, p, 'pat', now, now, carrierId, sideTo(p, pen.pos.x, pen.pos.y))) st.patFor = null
  }
}
