import {
  AI_ATTACK_GOAL_GAP,
  AI_BALL_PATH_SAMPLES,
  AI_BALL_PATH_STEP,
  AI_CLAIM_REACH,
  AI_CROWD_RADIUS,
  AI_PIVOT_AHEAD,
  AI_PIVOT_GOAL_GAP,
  AI_SPOT_PROBE,
  AI_SUPPORT_BACK,
  AI_SUPPORT_SIDE,
  AI_SUPPORT_SPRINT_DIST,
  AI_WIDE_AHEAD,
  AI_WIDE_LANE,
  BALL_FRICTION,
  PASS_POWER,
  PLAYER_MAX_SPEED,
  aiProfileFor,
} from '../constants'
import type { Ball, Player, TeamColor, Vector } from '../types'
import { getGoalLineX } from '../utils'
import { aiStateOf, isAvailable, laneMargin, nearestRivalDist, resetAiStates, type AiPlayerState } from './aiDecision'
import { passIntent } from './targeting'
import { CENTER_Y, PERMS4, clampX, clampY, defenseShape, dist, resetDefense, setPlan } from './aiDefense'

/**
 * Táctica de equipo (E-02), calculada una vez por paso antes de mover a nadie.
 *
 * - Con bola: el portador conduce por su carril; los demás ocupan huecos
 *   (apoyo corto, ala abierta lejana, pivot entre líneas, ala cercana) y
 *   afinan el sitio buscando línea de pase libre y sin amontonarse.
 * - Sin bola: un presionador al portador, otro corta la línea de pase más
 *   peligrosa y el resto marca en zona con un bloque que sube o baja según
 *   dónde esté la bola.
 * - Bola suelta: cada equipo manda a por ella al que antes corta su
 *   trayectoria (al receptor previsto si es un pase); el equipo que llegará
 *   antes se abre en ataque y el otro se repliega.
 *
 * El resultado es un plan por jugador en su AiPlayerState (tx, ty, ...).
 */

const SLOT_SUPPORT = 0
const SLOT_WIDE = 1
const SLOT_PIVOT = 2
const SLOT_NEAR = 3
/** Coste de dejar vacío cada puesto cuando faltan jugadores: lo último que se deja es el apoyo. */
const SLOT_EMPTY_COST = [170, 70, 90, 0]
const ROLE_MISMATCH_COST = 70
const KEEP_SLOT_BONUS = 40
const PASS_PLAN_MS = 1600

const fieldBlue: Player[] = []
const fieldRed: Player[] = []
const scratchFree: Player[] = []
const teamState: Record<TeamColor, { slotsAt: number, lastCarrier: string }> = {
  blue: { slotsAt: 0, lastCarrier: '' },
  red: { slotsAt: 0, lastCarrier: '' },
}
const passPlan = { active: false, team: 'blue' as TeamColor, receiverId: '', at: 0 }
const ballPath = new Float64Array(AI_BALL_PATH_SAMPLES * 2)
const spot = { x: 0, y: 0 }
const probe = { x: 0, y: 0 }
let lastNow = -1
let lastCarrierId: string | null = null
let seenPassSerial = 0

/**
 * Prepara el plan de todos los jugadores de campo para este paso.
 * `controlledId` es el jugador que mueve el humano (null con piloto automático).
 */
export function prepareTeamAI(players: Player[], ball: Ball, ballVelocity: Vector, carrierId: string | null, controlledId: string | null, now: number) {
  if (now < lastNow) {
    resetAiStates()
    resetDefense()
    teamState.blue.slotsAt = teamState.red.slotsAt = 0
    passPlan.active = false
    lastCarrierId = null
  }
  lastNow = now

  let carrier: Player | null = null
  fieldBlue.length = 0
  fieldRed.length = 0
  for (const p of players) {
    if (p.id === carrierId) carrier = p
    if (p.role === 'goalie') continue
    const st = aiStateOf(p)
    setPlan(st, p.home.x, p.home.y, 0.8, false, true)
    if (!isAvailable(p, now)) continue
    if (p.team === 'blue') fieldBlue.push(p)
    else fieldRed.push(p)
  }

  if (carrierId !== lastCarrierId) {
    if (carrier) aiStateOf(carrier).gotBallAt = now
    else if (lastCarrierId && passIntent.serial !== seenPassSerial) {
      passPlan.active = true
      passPlan.team = passIntent.team
      passPlan.receiverId = passIntent.receiverId
      passPlan.at = now
    }
    lastCarrierId = carrierId
  }
  seenPassSerial = passIntent.serial
  if (passPlan.active && (carrier || now - passPlan.at > PASS_PLAN_MS)) passPlan.active = false

  if (carrier) {
    const atk = carrier.team === 'blue' ? fieldBlue : fieldRed
    const def = carrier.team === 'blue' ? fieldRed : fieldBlue
    if (carrier.role !== 'goalie') planCarrier(carrier)
    attackShape(atk, carrier, carrier.pos.x, carrier.pos.y, carrier.id, controlledId, players, now)
    defenseShape(def, carrier.role === 'goalie' ? null : carrier, carrier.pos.x, carrier.pos.y, atk, '', controlledId, players, now)
    return
  }

  // Bola suelta
  const count = buildBallPath(ball, ballVelocity)
  const forced = passPlan.active ? passPlan.receiverId : ''
  const blueChaser = bestInterceptor(fieldBlue, count, passPlan.active && passPlan.team === 'blue' ? forced : '')
  const blueT = interceptT
  const blueX = interceptX
  const blueY = interceptY
  const redChaser = bestInterceptor(fieldRed, count, passPlan.active && passPlan.team === 'red' ? forced : '')
  const redT = interceptT
  if (blueChaser) planChaser(blueChaser, blueX, blueY)
  if (redChaser) planChaser(redChaser, interceptX, interceptY)

  const blueOwns = blueChaser !== null && (redChaser === null || blueT <= redT)
  const owner = blueOwns ? blueChaser : redChaser
  if (!owner) return
  const ownerSt = aiStateOf(owner)
  const ownerList = owner.team === 'blue' ? fieldBlue : fieldRed
  const otherList = owner.team === 'blue' ? fieldRed : fieldBlue
  const otherChaser = owner.team === 'blue' ? redChaser : blueChaser
  attackShape(ownerList, owner, ownerSt.tx, ownerSt.ty, owner.id, controlledId, players, now)
  defenseShape(otherList, owner, ownerSt.tx, ownerSt.ty, ownerList, otherChaser?.id ?? '', controlledId, players, now)
}

/** Trayectoria prevista de la bola libre (sin rebotes), en ballPath. */
function buildBallPath(ball: Ball, v: Vector) {
  const perStepX = v.x / 60
  const perStepY = v.y / 60
  let decay = 1
  const stepDecay = Math.pow(BALL_FRICTION, AI_BALL_PATH_STEP)
  for (let k = 0; k < AI_BALL_PATH_SAMPLES; k++) {
    decay *= stepDecay
    const travelled = (1 - decay) / (1 - BALL_FRICTION)
    ballPath[k * 2] = clampX(ball.x + perStepX * travelled)
    ballPath[k * 2 + 1] = clampY(ball.y + perStepY * travelled)
  }
  return AI_BALL_PATH_SAMPLES
}

let interceptT = 0
let interceptX = 0
let interceptY = 0

/** Primer punto de la trayectoria al que `p` llega antes que la bola (en interceptT/X/Y). */
function interceptFor(p: Player, count: number) {
  const reaction = aiProfileFor(p.team).interceptReactionS
  const speed = PLAYER_MAX_SPEED * 0.92
  for (let k = 0; k < count; k++) {
    const bx = ballPath[k * 2]
    const by = ballPath[k * 2 + 1]
    const need = Math.max(0, dist(p, bx, by) - AI_CLAIM_REACH * 0.8) / speed + reaction
    const t = ((k + 1) * AI_BALL_PATH_STEP) / 60
    if (need <= t || k === count - 1) {
      interceptT = Math.max(need, t)
      interceptX = bx
      interceptY = by
      return
    }
  }
}

/** El que antes corta la bola; el receptor previsto de un pase tiene preferencia si no llega mucho más tarde. */
function bestInterceptor(list: Player[], count: number, forcedId: string): Player | null {
  let best: Player | null = null
  let bestT = Infinity
  let bx = 0
  let by = 0
  let forced: Player | null = null
  let fT = 0
  let fx = 0
  let fy = 0
  for (const p of list) {
    interceptFor(p, count)
    if (p.id === forcedId) {
      forced = p
      fT = interceptT
      fx = interceptX
      fy = interceptY
    }
    if (interceptT < bestT) {
      bestT = interceptT
      best = p
      bx = interceptX
      by = interceptY
    }
  }
  if (forced && fT <= bestT + 0.45) {
    best = forced
    bestT = fT
    bx = fx
    by = fy
  }
  interceptT = bestT
  interceptX = bx
  interceptY = by
  return best
}

function planChaser(p: Player, x: number, y: number) {
  setPlan(aiStateOf(p), x, y, 1, dist(p, x, y) > 80, true)
}

/** Portador: avanza por su carril sin meterse detrás de la portería rival. */
function planCarrier(carrier: Player) {
  const adv = carrier.side === 'left' ? 1 : -1
  const oppGoalX = getGoalLineX(carrier.side === 'left' ? 'right' : 'left')
  let tx = carrier.pos.x + 80 * adv
  let ty = CENTER_Y + Math.max(-130, Math.min(130, carrier.pos.y - CENTER_Y))
  // No meterse detrás de la portería rival: cerca de la línea se abre al centro
  if ((oppGoalX - tx) * adv < 60) {
    tx = oppGoalX - adv * 60
    ty = CENTER_Y + (carrier.pos.y - CENTER_Y) * 0.5
  }
  const st = aiStateOf(carrier)
  setPlan(st, tx, ty, 1, dist(carrier, tx, ty) > 90, false)
}

/** Puesto base de un hueco de ataque respecto al portador (cx, cy). */
function slotPos(slot: number, side: Player['side'], cx: number, cy: number, out: { x: number, y: number }) {
  const adv = side === 'left' ? 1 : -1
  const ownGoalX = getGoalLineX(side)
  const oppGoalX = getGoalLineX(side === 'left' ? 'right' : 'left')
  const sgn = cy < CENTER_Y ? -1 : 1
  let x: number
  let y: number
  if (slot === SLOT_SUPPORT) {
    x = cx - adv * AI_SUPPORT_BACK
    if ((x - ownGoalX) * adv < 130) x = ownGoalX + adv * 130
    y = cy - sgn * AI_SUPPORT_SIDE
  } else if (slot === SLOT_WIDE) {
    x = cx + adv * AI_WIDE_AHEAD
    y = CENTER_Y - sgn * AI_WIDE_LANE
  } else if (slot === SLOT_PIVOT) {
    x = cx + adv * AI_PIVOT_AHEAD
    if ((oppGoalX - x) * adv < AI_PIVOT_GOAL_GAP) x = oppGoalX - adv * AI_PIVOT_GOAL_GAP
    // Con el portador ya cerca de portería, el pivot se va al segundo palo
    y = (oppGoalX - cx) * adv < AI_PIVOT_GOAL_GAP + 90 ? CENTER_Y - sgn * 75 : CENTER_Y - sgn * 35
  } else {
    x = cx + adv * AI_WIDE_AHEAD * 0.8
    y = CENTER_Y + sgn * AI_WIDE_LANE
    // Si el portador va por ese carril, el ala cercana se adelanta para no pisarle
    if (Math.abs(y - cy) < 90) x += adv * 90
  }
  if ((oppGoalX - x) * adv < AI_ATTACK_GOAL_GAP) x = oppGoalX - adv * AI_ATTACK_GOAL_GAP
  out.x = clampX(x)
  out.y = clampY(y)
  return out
}

function preferredSlot(role: Player['role'], slot: number) {
  if (role === 'defender') return slot === SLOT_SUPPORT
  if (role === 'pivot') return slot === SLOT_PIVOT
  return slot === SLOT_WIDE || slot === SLOT_NEAR
}

/**
 * Ataque: reparte los huecos entre los compañeros libres (permutación de
 * menor coste) y, al refrescar, afina cada sitio buscando línea libre.
 */
function attackShape(list: Player[], carrier: Player, cx: number, cy: number, excludeId: string, controlledId: string | null, players: Player[], now: number) {
  const team = carrier.team
  const profile = aiProfileFor(team)
  const ts = teamState[team]
  scratchFree.length = 0
  for (const p of list) if (p.id !== excludeId && p.id !== controlledId) scratchFree.push(p)
  const n = Math.min(4, scratchFree.length)
  if (n === 0) return
  const refresh = now >= ts.slotsAt || ts.lastCarrier !== carrier.id
  if (refresh) {
    ts.slotsAt = now + profile.supportRefreshMs
    ts.lastCarrier = carrier.id
    let bestCost = Infinity
    let bestPerm = PERMS4[0]
    for (const perm of PERMS4) {
      let cost = 0
      for (let i = 0; i < n; i++) {
        const p = scratchFree[i]
        slotPos(perm[i], p.side, cx, cy, spot)
        cost += dist(p, spot.x, spot.y)
        if (!preferredSlot(p.role, perm[i])) cost += ROLE_MISMATCH_COST
        if (aiStateOf(p).slot === perm[i]) cost -= KEEP_SLOT_BONUS
      }
      for (let i = n; i < 4; i++) cost += SLOT_EMPTY_COST[perm[i]]
      if (cost < bestCost) {
        bestCost = cost
        bestPerm = perm
      }
    }
    for (let i = 0; i < n; i++) aiStateOf(scratchFree[i]).slot = bestPerm[i]
  }

  for (let i = 0; i < n; i++) {
    const p = scratchFree[i]
    const st = aiStateOf(p)
    slotPos(st.slot < 0 ? SLOT_NEAR : st.slot, p.side, cx, cy, spot)
    if (refresh) refineSpot(p, st, cx, cy, i, players, now)
    const x = spot.x + st.offX
    const y = spot.y + st.offY
    const d = dist(p, x, y)
    // Ya en su sitio: mira a la bola para recibir de cara
    setPlan(st, x, y, 0.92, d > AI_SUPPORT_SPRINT_DIST && (p.stamina ?? 100) > 45, d < 50)
  }
}

const PROBE_DX = [0, 1, -1, 0, 0]
const PROBE_DY = [0, 0, 0, 1, -1]

/** Elige el desplazamiento del puesto con línea de pase más libre, sin rival encima ni compañeros al lado. */
function refineSpot(p: Player, st: AiPlayerState, cx: number, cy: number, index: number, players: Player[], now: number) {
  const profile = aiProfileFor(p.team)
  let best = -Infinity
  let bx = 0
  let by = 0
  for (let k = 0; k < PROBE_DX.length; k++) {
    probe.x = clampX(spot.x + PROBE_DX[k] * AI_SPOT_PROBE)
    probe.y = clampY(spot.y + PROBE_DY[k] * AI_SPOT_PROBE)
    const lane = laneMargin(cx, cy, probe.x, probe.y, PASS_POWER, p.team, players, profile, now)
    let score = Math.max(-1, Math.min(lane, 80) / 80) + Math.min(nearestRivalDist(probe.x, probe.y, p.team, players, now), 110) / 110 * 0.6
    // Amontonarse con el portador o con huecos ya elegidos resta
    const dc = Math.hypot(probe.x - cx, probe.y - cy)
    if (dc < AI_CROWD_RADIUS) score -= (1 - dc / AI_CROWD_RADIUS) * 0.9
    for (let j = 0; j < index; j++) {
      const o = aiStateOf(scratchFree[j])
      const d = Math.hypot(probe.x - o.tx, probe.y - o.ty)
      if (d < AI_CROWD_RADIUS) score -= (1 - d / AI_CROWD_RADIUS) * 0.8
    }
    if (k > 0) score -= 0.12
    if (score > best) {
      best = score
      bx = probe.x - spot.x
      by = probe.y - spot.y
    }
  }
  st.offX = bx
  st.offY = by
  // El plan provisional sirve de referencia anti-amontonamiento a los siguientes
  st.tx = spot.x + bx
  st.ty = spot.y + by
}
