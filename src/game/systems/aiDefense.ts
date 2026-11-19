import { AI_BOARD_MARGIN, AI_MARK_GAP, AI_SUPPORT_SPRINT_DIST, GAME_HEIGHT, PASS_POWER, RINK, aiProfileFor } from '../constants'
import type { Player, TeamColor } from '../types'
import { getGoalLineX } from '../utils'
import { aiStateOf, laneMargin, type AiPlayerState } from './aiDecision'

/**
 * Repliegue y presión del equipo sin bola (E-02) y utilidades de plan
 * compartidas con la táctica de ataque de aiTeam.
 */

export const CENTER_Y = GAME_HEIGHT / 2
const PRESSER_SWITCH_GAP = 30

export const PERMS4 = permutations([0, 1, 2, 3])

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items.slice()]
  const out: number[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1))
    for (const p of permutations(rest)) out.push([items[i], ...p])
  }
  return out
}

const scratchFree: Player[] = []
const scratchRest: Player[] = []
const scratchAtk: Player[] = []
const teamState: Record<TeamColor, { presserId: string }> = {
  blue: { presserId: '' },
  red: { presserId: '' },
}

export function resetDefense() {
  teamState.blue.presserId = teamState.red.presserId = ''
}

export function clampX(x: number) {
  return Math.min(RINK.x + RINK.width - AI_BOARD_MARGIN, Math.max(RINK.x + AI_BOARD_MARGIN, x))
}
export function clampY(y: number) {
  return Math.min(RINK.y + RINK.height - AI_BOARD_MARGIN, Math.max(RINK.y + AI_BOARD_MARGIN, y))
}

export function setPlan(st: AiPlayerState, x: number, y: number, intensity: number, sprint: boolean, faceBall: boolean) {
  st.tx = clampX(x)
  st.ty = clampY(y)
  st.intensity = intensity
  st.sprint = sprint
  st.faceBall = faceBall
}

export function dist(p: Player, x: number, y: number) {
  return Math.hypot(p.pos.x - x, p.pos.y - y)
}

/**
 * Defensa: presionador, cortador de la línea más peligrosa y marcaje en zona
 * con la altura del bloque según la profundidad de la bola.
 */
export function defenseShape(list: Player[], rc: Player | null, cx: number, cy: number, attackers: Player[], fixedPresserId: string, controlledId: string | null, players: Player[], now: number) {
  if (list.length === 0) return
  const team = list[0].team
  const side = list[0].side
  const profile = aiProfileFor(team)
  const ts = teamState[team]
  const adv = side === 'left' ? 1 : -1
  const ownGoalX = getGoalLineX(side)
  const oppGoalX = getGoalLineX(side === 'left' ? 'right' : 'left')
  const full = Math.abs(oppGoalX - ownGoalX)
  const ballDepth = Math.max(0, (cx - ownGoalX) * adv)
  const t = Math.min(1, ballDepth / full)
  const blockDepth = profile.blockLowDepth + (profile.blockHighDepth - profile.blockLowDepth) * t
  const zoneDepth = Math.max(70, Math.min(blockDepth, ballDepth - 45))

  // Presionador
  let presserId = fixedPresserId
  if (!presserId && rc) {
    let nearest: Player | null = null
    let nd = Infinity
    let current: Player | null = null
    let currentD = Infinity
    for (const p of list) {
      const d = dist(p, rc.pos.x, rc.pos.y)
      if (d < nd) {
        nd = d
        nearest = p
      }
      if (p.id === ts.presserId) {
        current = p
        currentD = d
      }
    }
    // Histéresis: no se cambia de presionador por unos píxeles
    const presser = current && currentD <= nd + PRESSER_SWITCH_GAP ? current : nearest
    presserId = presser?.id ?? ''
    ts.presserId = presserId
    if (presser) {
      // Por delante del portador, entre él y nuestra portería: tapa conducción y tiro
      const fl = Math.hypot(rc.facing.x, rc.facing.y)
      const fx = fl > 0.001 ? rc.facing.x / fl : (rc.side === 'left' ? 1 : -1)
      const fy = fl > 0.001 ? rc.facing.y / fl : 0
      const gx = ownGoalX - rc.pos.x
      const gy = CENTER_Y - rc.pos.y
      const gl = Math.hypot(gx, gy) || 1
      const w = profile.pressGoalSide
      const dx = fx * (1 - w) + (gx / gl) * w
      const dy = fy * (1 - w) + (gy / gl) * w
      const dl = Math.hypot(dx, dy) || 1
      const px = rc.pos.x + (dx / dl) * profile.pressDistance
      const py = rc.pos.y + (dy / dl) * profile.pressDistance
      setPlan(aiStateOf(presser), px, py, profile.pressIntensity, dist(presser, px, py) > 70, true)
    }
  } else if (!rc) {
    ts.presserId = ''
  }

  scratchRest.length = 0
  for (const p of list) if (p.id !== presserId && p.id !== controlledId) scratchRest.push(p)
  scratchAtk.length = 0
  for (const a of attackers) if (a.id !== (rc?.id ?? '')) scratchAtk.push(a)
  if (scratchRest.length === 0) return

  // Atacante más peligroso: cerca de nuestra portería y con línea abierta
  let danger: Player | null = null
  let dangerScore = -Infinity
  for (const a of scratchAtk) {
    const lane = Math.min(60, laneMargin(cx, cy, a.pos.x, a.pos.y, PASS_POWER, a.team, players, profile, now))
    const s = -Math.hypot(a.pos.x - ownGoalX, a.pos.y - CENTER_Y) + lane * 2
    if (s > dangerScore) {
      dangerScore = s
      danger = a
    }
  }

  let cutterId = ''
  if (danger && scratchRest.length >= 2) {
    // Se corta cerca del receptor y por su lado de portería: niega el pase y, si llega, ya está encima
    const kx = cx + (danger.pos.x - cx) * profile.cutDepth - adv * 18
    const ky = cy + (danger.pos.y - cy) * profile.cutDepth
    let cutter: Player | null = null
    let cd = Infinity
    for (const p of scratchRest) {
      const d = dist(p, kx, ky)
      if (d < cd) {
        cd = d
        cutter = p
      }
    }
    if (cutter) {
      cutterId = cutter.id
      setPlan(aiStateOf(cutter), kx, ky, 0.95, cd > 160, true)
    }
  }

  // Marcadores: emparejamiento de menor distancia entre el resto y los atacantes sin cubrir
  let m = 0
  for (const p of scratchRest) if (p.id !== cutterId) scratchFree[m++] = p
  scratchFree.length = m
  let a = 0
  for (const at of scratchAtk) if (at !== danger || cutterId === '') scratchAtk[a++] = at
  scratchAtk.length = a
  let bestPerm = PERMS4[0]
  let bestCost = Infinity
  if (m > 0 && a > 0) {
    for (const perm of PERMS4) {
      let cost = 0
      let covered = 0
      for (let i = 0; i < m; i++) {
        const k = perm[i]
        if (k < a) {
          cost += dist(scratchFree[i], scratchAtk[k].pos.x, scratchAtk[k].pos.y)
          covered++
        }
      }
      // Dejar a un atacante sin marca cuesta más que cualquier carrera
      cost += (Math.min(m, a) - covered) * 2000
      if (cost < bestCost) {
        bestCost = cost
        bestPerm = perm
      }
    }
  }
  for (let i = 0; i < m; i++) {
    const p = scratchFree[i]
    const ax = ownGoalX + adv * zoneDepth * 0.85
    const ay = CENTER_Y + (p.home.y - CENTER_Y) * 0.55 + (cy - CENTER_Y) * 0.35
    let x = ax
    let y = ay
    const k = bestPerm[i]
    if (k < a) {
      const at = scratchAtk[k]
      const gx = ownGoalX - at.pos.x
      const gy = CENTER_Y - at.pos.y
      const gl = Math.hypot(gx, gy) || 1
      let mx = at.pos.x + (gx / gl) * AI_MARK_GAP
      const my = at.pos.y + (gy / gl) * AI_MARK_GAP
      const depth = (mx - ownGoalX) * adv
      if (depth > zoneDepth + 50) mx = ownGoalX + adv * (zoneDepth + 50)
      else if (depth < 55) mx = ownGoalX + adv * 55
      x = ax + (mx - ax) * profile.markTightness
      y = ay + (my - ay) * profile.markTightness
    }
    const d = dist(p, x, y)
    setPlan(aiStateOf(p), x, y, 0.88, d > AI_SUPPORT_SPRINT_DIST && (p.stamina ?? 100) > 45, true)
  }
}
