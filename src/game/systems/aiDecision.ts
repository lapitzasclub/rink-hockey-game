import {
  AI_CLAIM_REACH,
  AI_PASS_MAX_DIST,
  AI_PASS_MIN_DIST,
  AI_RIVAL_RUN_SPEED,
  AI_SHOOT_DISTANCE,
  PASSIVITY_AI,
  BALL_CONTROL_DISTANCE,
  BALL_FRICTION,
  GAME_HEIGHT,
  PASS_POWER,
  RINK,
  aiProfileFor,
  type AiProfile,
} from '../constants'
import type { Player } from '../types'
import { getGoalLineX } from '../utils'
import { setAIPassAim } from './targeting'
import { passivityView } from './passivity'

/**
 * Lectura de juego y decisión del portador (E-02).
 *
 * Aquí viven el estado por jugador de la IA, la lectura de líneas de pase
 * (¿llega un rival a cortar la bola antes de que pase?) y la elección entre
 * tirar, pasar o seguir conduciendo con una puntuación, no con dados por paso.
 */

/** Estado de la IA por jugador; un objeto por id que se reutiliza todo el partido. */
export type AiPlayerState = {
  gotBallAt: number
  nextDecisionAt: number
  /** Desplazamiento elegido sobre el puesto base y cuándo se revisa. */
  offX: number
  offY: number
  spotRefreshAt: number
  slot: number
  /** Plan de movimiento del paso actual (lo rellena aiTeam, lo ejecuta updateFieldPlayerAI). */
  tx: number
  ty: number
  intensity: number
  sprint: boolean
  faceBall: boolean
}

const states = new Map<string, AiPlayerState>()

export function aiStateOf(player: Player): AiPlayerState {
  let st = states.get(player.id)
  if (!st) {
    st = { gotBallAt: 0, nextDecisionAt: 0, offX: 0, offY: 0, spotRefreshAt: 0, slot: -1, tx: player.home.x, ty: player.home.y, intensity: 0.8, sprint: false, faceBall: false }
    states.set(player.id, st)
  }
  return st
}

/** Nuevo partido (simNow vuelve a 0): olvida temporizadores viejos. */
export function resetAiStates() {
  for (const st of states.values()) {
    st.gotBallAt = 0
    st.nextDecisionAt = 0
    st.spotRefreshAt = 0
    st.slot = -1
    st.offX = 0
    st.offY = 0
  }
}

/** Jugador que puede intervenir ahora (ni sancionado ni aturdido). */
export function isAvailable(player: Player, now: number) {
  return !((player.suspendedUntil ?? 0) > now) && !((player.stunUntil ?? 0) > now)
}

const LOG_FRICTION = Math.log(BALL_FRICTION)
const CENTER_X = RINK.x + RINK.width / 2

/**
 * Tiempo (s) que tarda una bola lanzada a `speed` en recorrer `distance`
 * con el rozamiento por paso de 60 Hz. Infinity si se para antes.
 */
export function ballTravelTime(distance: number, speed: number) {
  const perStep = speed / 60
  const r = distance * (1 - BALL_FRICTION) / perStep
  if (r >= 0.995) return Infinity
  return Math.log(1 - r) / LOG_FRICTION / 60
}

/**
 * Margen (px) de la línea de bola from→to frente al rival mejor situado para
 * cortarla: distancia del rival a la línea menos lo que puede correr mientras
 * la bola llega a ese punto y su radio de control. Negativo = la corta.
 */
export function laneMargin(fromX: number, fromY: number, toX: number, toY: number, speed: number, team: Player['team'], players: Player[], profile: AiProfile, now: number) {
  const sx = toX - fromX
  const sy = toY - fromY
  const len2 = sx * sx + sy * sy || 1
  const len = Math.sqrt(len2)
  let best = Infinity
  for (const r of players) {
    if (r.team === team || !isAvailable(r, now)) continue
    const u = Math.min(1, Math.max(0, ((r.pos.x - fromX) * sx + (r.pos.y - fromY) * sy) / len2))
    const px = fromX + sx * u
    const py = fromY + sy * u
    const d = Math.hypot(r.pos.x - px, r.pos.y - py)
    const t = ballTravelTime(len * u, speed)
    const run = Math.max(0, (Number.isFinite(t) ? t : 2) - profile.interceptReactionS) * AI_RIVAL_RUN_SPEED * profile.laneRead
    // El portero solo se estira dentro de su área; no corre detrás de los pases
    const reach = r.role === 'goalie' ? 22 + run * 0.35 : AI_CLAIM_REACH + run
    const margin = d - reach
    if (margin < best) best = margin
  }
  return best
}

/** Distancia del rival disponible más cercano a un punto. */
export function nearestRivalDist(x: number, y: number, team: Player['team'], players: Player[], now: number, includeGoalie = false) {
  let best = Infinity
  for (const r of players) {
    if (r.team === team || (!includeGoalie && r.role === 'goalie') || !isAvailable(r, now)) continue
    const d = Math.hypot(r.pos.x - x, r.pos.y - y)
    if (d < best) best = d
  }
  return best
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Valor geométrico de un remate desde (x, y): distancia y ángulo a la boca (0..1). */
export function shotGeometry(x: number, y: number, side: Player['side']) {
  const goalX = getGoalLineX(side === 'left' ? 'right' : 'left')
  const dx = Math.abs(goalX - x)
  const dy = y - GAME_HEIGHT / 2
  const d = Math.hypot(dx, dy) || 1
  // Por detrás de la línea de gol no hay remate
  if ((side === 'left' && x > goalX) || (side === 'right' && x < goalX)) return 0
  const distF = clamp01((AI_SHOOT_DISTANCE * 1.08 - d) / (AI_SHOOT_DISTANCE * 0.75))
  const angF = clamp01((dx / d - 0.3) / 0.55)
  return distF * angF
}

/**
 * Puntuación de tiro del portador (0..1): geometría, rivales tapando la
 * línea a portería y lo bien colocado que está el portero.
 */
export function shotScore(player: Player, players: Player[], now: number) {
  const geo = shotGeometry(player.pos.x, player.pos.y, player.side)
  if (geo <= 0) return 0
  const goalX = getGoalLineX(player.side === 'left' ? 'right' : 'left')
  const goalY = GAME_HEIGHT / 2
  let blockF = 1
  let goalieF = 1
  const sx = goalX - player.pos.x
  const sy = goalY - player.pos.y
  const len2 = sx * sx + sy * sy || 1
  for (const r of players) {
    if (r.team === player.team || !isAvailable(r, now)) continue
    const u = ((r.pos.x - player.pos.x) * sx + (r.pos.y - player.pos.y) * sy) / len2
    if (u <= 0.05 || u > 1) continue
    const d = Math.hypot(r.pos.x - (player.pos.x + sx * u), r.pos.y - (player.pos.y + sy * u))
    if (r.role === 'goalie') {
      // Portero bien metido en la línea del tiro: remate menos franco
      goalieF = 0.72 + 0.28 * clamp01(d / 26)
    } else if (d < 30) {
      blockF = Math.min(blockF, 0.3 + 0.7 * (d / 30))
    }
  }
  // Con un rival encima hay que soltarla ya: el tiro gana valor frente a conducir
  const pressure = nearestRivalDist(player.pos.x, player.pos.y, player.team, players, now)
  const urgency = pressure < 55 ? 0.08 : 0
  return Math.min(1, geo * blockF * goalieF + (geo > 0.25 ? urgency : 0))
}

/** Mejor opción de pase de la última evaluación (búfer reutilizado). */
export const passPick = { mate: null as Player | null, x: 0, y: 0, score: 0 }

/**
 * Punto anticipado de recepción de `mate` para un pase desde `from`:
 * dos iteraciones de «dónde estará cuando llegue la bola».
 */
export function leadPoint(from: Player, mate: Player, lead: number, out: { x: number, y: number }) {
  let x = mate.pos.x
  let y = mate.pos.y
  for (let i = 0; i < 2; i++) {
    const t = ballTravelTime(Math.hypot(x - from.pos.x, y - from.pos.y), PASS_POWER)
    const tt = Number.isFinite(t) ? Math.min(t, 1.1) : 1.1
    x = mate.pos.x + mate.velocity.x * tt * lead
    y = mate.pos.y + mate.velocity.y * tt * lead
  }
  out.x = Math.min(RINK.x + RINK.width - 30, Math.max(RINK.x + 30, x))
  out.y = Math.min(RINK.y + RINK.height - 30, Math.max(RINK.y + 30, y))
  return out
}

const lead = { x: 0, y: 0 }

/**
 * Evalúa a todos los compañeros de campo como receptores y deja la mejor
 * opción en `passPick`. Solo cuentan las líneas que no corta ningún rival.
 * B-10: `cross` (0..1) premia los pases que pasan la línea central y castiga los
 * que se quedan en campo propio; `attack` (0..1) premia los que dejan en posición de tiro.
 */
export function evaluatePasses(player: Player, players: Player[], profile: AiProfile, now: number, cross = 0, attack = 0) {
  passPick.mate = null
  passPick.score = 0
  const goalX = getGoalLineX(player.side === 'left' ? 'right' : 'left')
  const goalY = GAME_HEIGHT / 2
  const carrierGoal = Math.hypot(goalX - player.pos.x, goalY - player.pos.y)
  for (const mate of players) {
    if (mate.team !== player.team || mate.id === player.id || mate.role === 'goalie' || !isAvailable(mate, now)) continue
    leadPoint(player, mate, profile.passLead, lead)
    const dx = lead.x - player.pos.x
    const dy = lead.y - player.pos.y
    const dist = Math.hypot(dx, dy) || 1
    if (dist < AI_PASS_MIN_DIST || dist > AI_PASS_MAX_DIST) continue
    // La bola sale a BALL_CONTROL_DISTANCE del pasador: la línea empieza ahí
    const fx = player.pos.x + (dx / dist) * BALL_CONTROL_DISTANCE
    const fy = player.pos.y + (dy / dist) * BALL_CONTROL_DISTANCE
    const margin = laneMargin(fx, fy, lead.x, lead.y, PASS_POWER, player.team, players, profile, now)
    if (margin < profile.passLaneMargin) continue
    const openF = clamp01(margin / 60)
    const freeF = clamp01((nearestRivalDist(lead.x, lead.y, player.team, players, now) - 40) / 90)
    const advance = Math.max(-1, Math.min(1, (carrierGoal - Math.hypot(goalX - lead.x, goalY - lead.y)) / 260))
    const threat = shotGeometry(lead.x, lead.y, player.side)
    let score = 0.28 * openF + 0.24 * freeF + 0.26 * (advance * 0.5 + 0.5) + 0.22 * threat - 0.08 * (dist / AI_PASS_MAX_DIST)
    if (cross) score += cross * PASSIVITY_AI.crossPassBonus * ((lead.x - CENTER_X) * (player.side === 'left' ? 1 : -1) > 0 ? 1 : -1)
    if (attack) score += attack * PASSIVITY_AI.threatPassBonus * threat
    if (score > passPick.score) {
      passPick.mate = mate
      passPick.x = lead.x
      passPick.y = lead.y
      passPick.score = score
    }
  }
}

/**
 * Valor de seguir conduciendo (0..1): espacio por delante y sin rival
 * encima; decae con el tiempo de posesión para que la bola circule.
 */
export function dribbleScore(player: Player, players: Player[], profile: AiProfile, now: number) {
  const advance = player.side === 'left' ? 1 : -1
  let front = Infinity
  let near = Infinity
  for (const r of players) {
    if (r.team === player.team || r.role === 'goalie' || !isAvailable(r, now)) continue
    const dx = r.pos.x - player.pos.x
    const dy = r.pos.y - player.pos.y
    const d = Math.hypot(dx, dy)
    if (d < near) near = d
    if (dx * advance > -10 && d < front) front = d
  }
  const space = clamp01((front - 45) / 130)
  const safe = clamp01((near - 32) / 70)
  const held = Math.max(0, now - aiStateOf(player).gotBallAt) / 1000
  return Math.max(0, 0.32 * space + 0.38 * safe + 0.1 - held * profile.holdDecayPerS)
}

export type CarrierChoice = 'shoot' | 'pass' | 'hold'

/**
 * Decide qué hace el portador IA este paso. Respeta un tiempo de reacción
 * tras recibir y solo revalúa cada `decisionIntervalMs`; entre medias conduce.
 * Si elige pase deja la dirección anticipada (con su error) en targeting.
 */
export function decideCarrierAction(player: Player, players: Player[], now: number): CarrierChoice {
  const profile = aiProfileFor(player.team)
  const st = aiStateOf(player)
  if (now - st.gotBallAt < profile.reactionMs || now < st.nextDecisionAt) return 'hold'
  // B-10: urgencia frente al tiempo de posesión (cross) o al juego pasivo; 0 en arcade (no hay contadores)
  const urg = now - passivityView.at <= PASSIVITY_AI.freshMs ? passivityView.urgency[player.team] : 0
  const cross = urg > 0 && passivityView.cross[player.team]
  const P = PASSIVITY_AI
  st.nextDecisionAt = now + profile.decisionIntervalMs * (0.75 + Math.random() * 0.5) * (1 - P.fasterDecision * urg)

  const shot = now - st.gotBallAt >= profile.shotReactionMs ? shotScore(player, players, now) : 0
  evaluatePasses(player, players, profile, now, cross ? urg : 0, cross ? 0 : urg)
  const pass = passPick.mate ? passPick.score : 0
  const dribble = dribbleScore(player, players, profile, now) * (1 - P.dribbleCut * urg)
  const shootThreshold = profile.shootThreshold * (cross ? 1 : 1 - P.shootThresholdCut * urg)

  if (shot >= shootThreshold && shot >= pass * 0.9) return 'shoot'
  if (pass >= profile.passThreshold * (1 - P.passThresholdCut * urg) && pass > dribble) {
    const angle = Math.atan2(passPick.y - player.pos.y, passPick.x - player.pos.x) + (Math.random() * 2 - 1) * profile.passErrorRad
    setAIPassAim(player.id, Math.cos(angle), Math.sin(angle))
    return 'pass'
  }
  // Sin línea de pase y con un rival encima: rematar si hay algo de tiro
  if (dribble < 0.08 && shot >= shootThreshold * 0.6) return 'shoot'
  // Al borde del límite: despejar hacia campo rival sin espacio para conducir, o rematar lo que haya
  if (urg >= P.forceAt && (cross ? dribble < P.clearDribble : shot >= P.forceShotMin)) return 'shoot'
  return 'hold'
}

