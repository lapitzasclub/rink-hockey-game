import * as Phaser from 'phaser'
import { BALL_CONTROL_DISTANCE, BALL_FRICTION, BALL_RADIUS, GAME_HEIGHT, GOAL_HALF_H, GOALIE_PASS, PASS_ASSIST_BLEND, PASS_ASSIST_CONE_DOT, PASS_HUMAN_LEAD_S, PASS_LANE_BLOCK_PENALTY, PASS_LANE_CLEAR_DIST, SHOT_AIM_MAX_OFFSET, SHOT_ASSIST_BLEND, SHOT_ASSIST_BLEND_HUMAN, TOUCH_ASSIST, TOUCH_ASSIST_EXTRA, TOUCH_SHOT_AIM, aiProfileFor } from '../constants'
import { touchAssist } from './difficulty'
import type { Player, Vector } from '../types'
import { autopilot } from './playerControl'
import { getGoalLineX } from '../utils'

/**
 * Pase de la IA ya decidido (aiDecision): dirección exacta hacia el punto
 * anticipado del receptor. Se consume en el siguiente getAssistedPassDirection.
 */
const aiPassAim = { playerId: '', x: 0, y: 0 }

export function setAIPassAim(playerId: string, x: number, y: number) {
  aiPassAim.playerId = playerId
  aiPassAim.x = x
  aiPassAim.y = y
}

/** Dirección de pase decidida para ese jugador, si sigue pendiente (para guardarla mientras carga). */
export function peekAIPassAim(playerId: string) {
  return aiPassAim.playerId === playerId ? { x: aiPassAim.x, y: aiPassAim.y } : null
}

/**
 * Último pase de jugador de campo (humano o IA): receptor previsto. La IA de
 * equipo lo lee al quedar la bola suelta para que el receptor vaya a por ella.
 */
export const passIntent = { serial: 0, team: 'blue' as Player['team'], receiverId: '' }

/**
 * B-09 · pase al portero propio. `aiGoaliePass`: la IA lo decidió (aiDecision) y sale con su
 * aiPassAim; `goalieRelease`: el pase que acaba de salir va al portero (matchActions ajusta la
 * potencia); `goaliePassLog`: lo leen las estadísticas (serial sube con cada pase al portero).
 */
const aiGoaliePass = { passerId: '', goalieId: '', at: 0 }
const goalieRelease = { passerId: '', goalieId: '', dist: 0 }
/** Pase al portero en vuelo: los de campo de su equipo lo dejan pasar hasta `until` (o hasta que acaba). */
const gkFlight = { goalieId: '', until: 0 }
export const goaliePassLog = { serial: 0, team: 'blue' as Player['team'], goalieId: '' }
const AI_GOALIE_PASS_STALE_MS = 3000

export function markAIGoaliePass(passerId: string, goalieId: string, now: number) {
  aiGoaliePass.passerId = passerId
  aiGoaliePass.goalieId = goalieId
  aiGoaliePass.at = now
}

/** La IA eligió otro pase: el de portero pendiente (si lo había) ya no vale. */
export function clearAIGoaliePass(passerId: string) {
  if (aiGoaliePass.passerId === passerId) aiGoaliePass.passerId = ''
}

/** Distancia del pase al portero que acaba de soltar `passerId` (−1 si no fue al portero); lo consume. */
export function takeGoalieRelease(passerId: string) {
  if (goalieRelease.passerId !== passerId) return -1
  goalieRelease.passerId = ''
  return goalieRelease.dist
}

/**
 * Portero del equipo del pasador si se le puede pasar ahora (GOALIE_PASS): a distancia razonable,
 * sin rival de campo cerca de la línea ni cerca de él (la bola acabaría en la boca de la propia
 * portería con un rival encima). null si no.
 */
export function ownGoalieTarget(players: Player[], passer: Player, now: number): Player | null {
  if (!GOALIE_PASS.enabled || passer.role === 'goalie') return null
  let gk: Player | null = null
  for (const p of players) if (p.role === 'goalie' && p.team === passer.team) { gk = p; break }
  // Recién sacada, aturdido o batido: no la atraparía
  if (!gk || (gk.ignoreBallUntil ?? 0) > now || (gk.stunUntil ?? 0) > now || (gk.saveDisabledUntil ?? 0) > now || (gk.suspendedUntil ?? 0) > now) return null
  const sx = gk.pos.x - passer.pos.x
  const sy = gk.pos.y - passer.pos.y
  const dist = Math.hypot(sx, sy)
  const mouthX = getGoalLineX(gk.side)
  const mouthY = GAME_HEIGHT / 2
  if (dist < GOALIE_PASS.minDistPx || dist > GOALIE_PASS.maxDistPx) return null
  const len2 = dist * dist || 1
  for (const r of players) {
    if (r.team === passer.team || r.role === 'goalie') continue
    if (Math.hypot(r.pos.x - gk.pos.x, r.pos.y - gk.pos.y) < GOALIE_PASS.rivalNearGoaliePx) return null
    if (Math.hypot(r.pos.x - mouthX, r.pos.y - mouthY) < GOALIE_PASS.rivalNearMouthPx) return null
    const u = Math.min(1, Math.max(0, ((r.pos.x - passer.pos.x) * sx + (r.pos.y - passer.pos.y) * sy) / len2))
    if (Math.hypot(r.pos.x - (passer.pos.x + sx * u), r.pos.y - (passer.pos.y + sy * u)) < GOALIE_PASS.laneClearPx) return null
  }
  return gk
}

/**
 * Potencia de un pase al portero propio a `dist` px: con el rozamiento por paso la bola pierde
 * 60·(1 − f)/f px/s por px recorrido, así que llega a GOALIE_PASS.arriveSpeed.
 */
export function goaliePassPower(dist: number) {
  const travel = Math.max(0, dist - BALL_CONTROL_DISTANCE)
  return Math.min(GOALIE_PASS.maxPower, GOALIE_PASS.arriveSpeed + travel * 60 * (1 - BALL_FRICTION) / BALL_FRICTION)
}

/**
 * Los de campo del equipo (también el pasador, que la persigue) dejan pasar el pase al portero
 * mientras viaja: si no, el que defiende delante de la portería o acude a la bola se la queda.
 */
export function letGoaliePassThrough(players: Player[], passer: Player, power: number, now: number) {
  const travelMs = Math.log(GOALIE_PASS.arriveSpeed / Math.max(power, GOALIE_PASS.arriveSpeed + 1)) / Math.log(BALL_FRICTION) * 1000 / 60
  const ms = Math.min(GOALIE_PASS.mateLetMaxMs, travelMs + GOALIE_PASS.mateLetExtraMs)
  for (const m of players) {
    if (m.team !== passer.team || m.role === 'goalie') continue
    m.ignoreBallUntil = Math.max(m.ignoreBallUntil ?? 0, now + ms)
  }
  gkFlight.goalieId = goalieRelease.goalieId
  gkFlight.until = now + ms
}

/** Por debajo de esta velocidad (px/s) el pase al portero que nadie controla se da por muerto. */
const GK_FLIGHT_DEAD_SPEED = 40

/**
 * Una vez por paso (updateTeamAIPlayers): corta la ventana de letGoaliePassThrough en cuanto el
 * pase al portero acaba (alguien la controla), lo rebasa hacia su portería, rebota en él o se
 * para; desde ahí los compañeros vuelven a poder despejarla.
 */
export function watchGoaliePass(players: Player[], ball: Vector, ballVelocity: Vector, carrierId: string | null, now: number) {
  if (!gkFlight.goalieId) return
  let gk: Player | null = null
  for (const p of players) if (p.id === gkFlight.goalieId) { gk = p; break }
  const over = now >= gkFlight.until
  if (!gk || over) { gkFlight.goalieId = ''; return }
  const dir = gk.side === 'left' ? 1 : -1
  const past = (gk.pos.x - ball.x) * dir > 0
  const away = ballVelocity.x * dir > 0
  const dead = Math.hypot(ballVelocity.x, ballVelocity.y) < GK_FLIGHT_DEAD_SPEED
  if (!carrierId && !past && !away && !dead) return
  gkFlight.goalieId = ''
  for (const m of players) {
    if (m.team !== gk.team || m.role === 'goalie') continue
    if ((m.ignoreBallUntil ?? 0) > now && (m.ignoreBallUntil ?? 0) <= gkFlight.until) m.ignoreBallUntil = now
  }
}

function noteGoalieRelease(player: Player, gk: Player) {
  goalieRelease.passerId = player.id
  goalieRelease.goalieId = gk.id
  goalieRelease.dist = Math.hypot(gk.pos.x - player.pos.x, gk.pos.y - player.pos.y)
  goaliePassLog.serial++
  goaliePassLog.team = player.team
  goaliePassLog.goalieId = gk.id
}

/** Coseno entre la dirección `dir` (unitaria) y la recta from→to. */
function aimDot(from: Player, to: Player, dir: Vector) {
  const dx = to.pos.x - from.pos.x
  const dy = to.pos.y - from.pos.y
  const d = Math.hypot(dx, dy) || 1
  return (dir.x * dx + dir.y * dy) / d
}

/**
 * Elige el mejor receptor de pase en función de la mirada del pasador y la
 * distancia al gol rival. Solo considera compañeros dentro del cono frontal
 * definido por PASS_ASSIST_CONE_DOT; un rival cerca de la línea penaliza.
 *
 * @returns El jugador con mejor puntuación, o null si no hay ninguno válido.
 */
export function getBestPassTarget(players: Player[], player: Player): Player | null {
  const facingLength = Math.hypot(player.facing.x, player.facing.y) || 1
  const fx = player.facing.x / facingLength
  const fy = player.facing.y / facingLength
  let best: Player | null = null
  let bestScore = -Infinity
  for (const candidate of players) {
    if (candidate.team !== player.team || candidate.id === player.id || candidate.role === 'goalie') continue
    const dx = candidate.pos.x - player.pos.x
    const dy = candidate.pos.y - player.pos.y
    const distance = Math.hypot(dx, dy) || 1
    const facingDot = fx * (dx / distance) + fy * (dy / distance)
    if (facingDot < (touchAssist.team === player.team ? TOUCH_ASSIST.passConeDot : PASS_ASSIST_CONE_DOT)) continue
    // Penalizar por distancia para evitar pases innecesariamente largos
    const score = facingDot * 180 - distance * 0.3 - laneBlockPenalty(players, player, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/** Penalización (0..PASS_LANE_BLOCK_PENALTY) por rivales cerca de la línea pasador→receptor. */
export function laneBlockPenalty(players: Player[], from: Player, to: Player) {
  const sx = to.pos.x - from.pos.x
  const sy = to.pos.y - from.pos.y
  const len2 = sx * sx + sy * sy || 1
  let closest = Infinity
  for (const r of players) {
    if (r.team === from.team || r.role === 'goalie') continue
    const u = Math.min(1, Math.max(0, ((r.pos.x - from.pos.x) * sx + (r.pos.y - from.pos.y) * sy) / len2))
    const d = Math.hypot(r.pos.x - (from.pos.x + sx * u), r.pos.y - (from.pos.y + sy * u))
    if (d < closest) closest = d
  }
  return closest >= PASS_LANE_CLEAR_DIST ? 0 : PASS_LANE_BLOCK_PENALTY * (1 - closest / PASS_LANE_CLEAR_DIST)
}

/**
 * Calcula una dirección de pase que mezcla el facing del jugador con la
 * dirección al mejor compañero disponible (PASS_ASSIST_BLEND), apuntando a
 * donde estará. Si la IA ya decidió el pase, sale exacto hacia su punto.
 *
 * La asistencia evita pasar completamente en perpendicular al movimiento,
 * pero no sustituye la dirección del jugador — sigue siendo necesario mirar
 * vagamente hacia el receptor.
 *
 * B-09: al portero propio (ownGoalieTarget) solo con la mirada clavada en él (GOALIE_PASS.coneDot)
 * y mejor alineada que con el compañero de campo; entonces sale recta hacia él.
 */
export function getAssistedPassDirection(players: Player[], player: Player, fallbackDirection: Vector, now = 0): Vector {
  goalieRelease.passerId = ''
  const target = getBestPassTarget(players, player)
  if (aiPassAim.playerId === player.id) {
    aiPassAim.playerId = ''
    let gk: Player | null = null
    if (aiGoaliePass.passerId === player.id) {
      aiGoaliePass.passerId = ''
      if (now - aiGoaliePass.at <= AI_GOALIE_PASS_STALE_MS) for (const p of players) if (p.id === aiGoaliePass.goalieId) { gk = p; break }
    }
    notePassIntent(player, gk ?? target)
    if (gk) noteGoalieRelease(player, gk)
    return { x: aiPassAim.x, y: aiPassAim.y }
  }
  const fl = Math.hypot(fallbackDirection.x, fallbackDirection.y) || 1
  const aim = { x: fallbackDirection.x / fl, y: fallbackDirection.y / fl }
  const gk = ownGoalieTarget(players, player, now)
  const gkDot = gk ? aimDot(player, gk, aim) : -1
  if (gk && gkDot >= GOALIE_PASS.coneDot && (!target || gkDot > aimDot(player, target, aim))) {
    notePassIntent(player, gk)
    noteGoalieRelease(player, gk)
    const d = Math.hypot(gk.pos.x - player.pos.x, gk.pos.y - player.pos.y) || 1
    return { x: (gk.pos.x - player.pos.x) / d, y: (gk.pos.y - player.pos.y) / d }
  }
  notePassIntent(player, target)
  if (!target) return fallbackDirection

  const lead = touchAssist.team === player.team ? TOUCH_ASSIST.passLeadS : PASS_HUMAN_LEAD_S
  const passBlend = touchAssist.team === player.team ? TOUCH_ASSIST.passBlend : PASS_ASSIST_BLEND
  const raw = { x: target.pos.x + target.velocity.x * lead - player.pos.x, y: target.pos.y + target.velocity.y * lead - player.pos.y }
  const rawLength = Math.hypot(raw.x, raw.y) || 1
  const dirToMate = { x: raw.x / rawLength, y: raw.y / rawLength }

  const blended = {
    x: fallbackDirection.x * (1 - passBlend) + dirToMate.x * passBlend,
    y: fallbackDirection.y * (1 - passBlend) + dirToMate.y * passBlend,
  }
  const length = Math.hypot(blended.x, blended.y) || 1
  return { x: blended.x / length, y: blended.y / length }
}

function notePassIntent(player: Player, target: Player | null) {
  passIntent.serial++
  passIntent.team = player.team
  passIntent.receiverId = target?.id ?? ''
}

/**
 * Elige el compañero de campo óptimo para la distribución del portero.
 *
 * Prioriza compañeros adelantados y no demasiado cercanos. La penalización
 * por distancia corta evita distribuciones que el rival puede interceptar
 * casi sin moverse.
 *
 * @returns El jugador más adecuado, o null si el equipo no tiene campo despejado.
 */
export function getGoalieDistributionTarget(players: Player[], player: Player): Player | null {
  const best = players
    .filter((c) => c.team === player.team && c.id !== player.id && c.role !== 'goalie')
    .map((candidate) => {
      const dx = candidate.pos.x - player.pos.x
      const dy = candidate.pos.y - player.pos.y
      const distance = Math.hypot(dx, dy) || 1
      const forward = player.side === 'left' ? dx / distance : -dx / distance
      const tooClosePenalty = distance < 140 ? (140 - distance) * 2.2 : 0
      const score = forward * 240 - Math.abs(dy) * 0.2 - distance * 0.05 - tooClosePenalty
      return { candidate, score }
    })
    .sort((a, b) => b.score - a.score)[0]

  return best?.candidate ?? null
}

/**
 * Devuelve la dirección normalizada para la distribución del portero.
 *
 * Si hay un compañero válido, apunta directamente hacia él. Si no lo hay,
 * despeja en diagonal hacia el carril lateral de su propio campo.
 */
export function getGoalieDistributionDirection(players: Player[], player: Player): Vector {
  const target = getGoalieDistributionTarget(players, player)
  if (target) {
    const dx = target.pos.x - player.pos.x
    const dy = target.pos.y - player.pos.y
    const distance = Math.hypot(dx, dy) || 1
    return { x: dx / distance, y: dy / distance }
  }
  // Despeje lateral por defecto cuando no hay receptor
  return {
    x: player.side === 'left' ? 0.96 : -0.96,
    y: player.pos.y < GAME_HEIGHT / 2 ? 0.28 : -0.28,
  }
}

/**
 * Combina la mirada del portador con la dirección a la portería rival (SHOT_ASSIST_BLEND) para
 * reducir tiros absurdos en ángulo cerrado. Se apunta al centro corrido hacia el tirador como
 * mucho ±SHOT_AIM_MAX_OFFSET px, para no forzar tiros al palo en jugadores muy adelantados.
 *
 * La persona en táctil (B-06), con `players`, corre ese punto hacia el palo que el portero rival
 * deja más abierto visto desde el tirador (TOUCH_ASSIST_EXTRA.shotAimPost).
 */
export function getAssistedShotDirection(player: Player, fallbackDirection: Vector, players?: Player[]): Vector {
  // Se apunta a la línea de gol (no al fondo de pista): con la boca real, el error angular importa
  const targetX = getGoalLineX(player.side === 'left' ? 'right' : 'left')
  let targetY = GAME_HEIGHT / 2 + Phaser.Math.Clamp(player.pos.y - GAME_HEIGHT / 2, -SHOT_AIM_MAX_OFFSET, SHOT_AIM_MAX_OFFSET)

  // La IA (rojo, porteros y el azul con piloto automático) apunta exacto; el humano conserva influencia sobre la dirección
  const isAi = player.team === 'red' || player.role === 'goalie' || autopilot.on
  const touch = !isAi && touchAssist.team === player.team
  if (touch && players && TOUCH_ASSIST_EXTRA.shotAimPost > 0) {
    const postY = openPostY(player, players, targetX)
    targetY += (postY - targetY) * TOUCH_ASSIST_EXTRA.shotAimPost
  }

  const raw = { x: targetX - player.pos.x, y: targetY - player.pos.y }
  const rawLength = Math.hypot(raw.x, raw.y) || 1
  const goalDirection = { x: raw.x / rawLength, y: raw.y / rawLength }

  const blend = isAi ? SHOT_ASSIST_BLEND : touch ? TOUCH_ASSIST.shotBlend : SHOT_ASSIST_BLEND_HUMAN
  const bx = fallbackDirection.x * (1 - blend) + goalDirection.x * blend
  const by = fallbackDirection.y * (1 - blend) + goalDirection.y * blend
  // Precisión del perfil de IA (E-04): error angular uniforme
  const error = isAi ? aiProfileFor(player.team).shotErrorRad : 0
  const angle = Math.atan2(by, bx) + (error > 0 ? (Math.random() * 2 - 1) * error : 0)
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

/**
 * y del palo (menos el radio de la bola y TOUCH_SHOT_AIM.postMarginPx) del lado que el portero
 * rival deja más abierto: se proyecta el portero sobre la línea de gol desde el tirador y gana
 * el hueco más grande.
 */
function openPostY(shooter: Player, players: Player[], lineX: number) {
  const cy = GAME_HEIGHT / 2
  let gy = cy
  for (const p of players) {
    if (p.role !== 'goalie' || p.team === shooter.team) continue
    const dx = p.pos.x - shooter.pos.x
    const lx = lineX - shooter.pos.x
    // Portero entre tirador y línea: proyección; si no (fuera de sitio), su altura tal cual
    gy = dx * lx > 0 && Math.abs(dx) > 1 ? shooter.pos.y + (p.pos.y - shooter.pos.y) * (lx / dx) : p.pos.y
    break
  }
  const half = GOAL_HALF_H - BALL_RADIUS - TOUCH_SHOT_AIM.postMarginPx
  // Hueco por arriba (gy − palo superior) frente a hueco por abajo (palo inferior − gy)
  return gy - (cy - half) >= (cy + half) - gy ? cy - half : cy + half
}
