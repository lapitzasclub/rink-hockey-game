import * as Phaser from 'phaser'
import {
  FIELD_PLAYER_BOTTOM_BOARD_MARGIN, GOALIE_OUT_DEPTH, PEN_EXIT_MAX_MS, PEN_WALK_SPEED, GOALIE_RADIUS, GOALIE_X_MAX, GOALIE_X_MIN,
  PLAYER_SEPARATION_GAP, PLAYER_ACCEL, PLAYER_FRICTION, PLAYER_MAX_SPEED, PLAYER_RADIUS, PLAYER_SPRINT_MAX_SPEED, RINK,
  SKATE_ARRIVE_DEADZONE, SKATE_ARRIVE_DECEL_FACTOR, SKATE_ARRIVE_STOP_PX, SKATE_BALL_GRIP, SKATE_BRAKE_DECEL, SKATE_BUMP_MIN,
  SKATE_COLLISION_RESTITUTION, SKATE_CONTACT_PUSH, SKATE_GLIDE_FRICTION, SKATE_GOALIE_MASS, SKATE_LATERAL_GRIP, SKATE_PIVOT_SPEED, SKATE_REVERSE_COS,
  SKATE_THRUST_SPEED_PER_ACCEL, SKATE_TURN_BRAKE_COS, SKATE_TURN_RATE, SKATE_TURN_SPEED_REF, SKATE_WALL_FRICTION, SKATE_WALL_RESTITUTION,
  STAMINA_EXHAUSTED_SPEED_FACTOR, STAMINA_LOW_THRESHOLD,
} from '../constants'
import type { Player, Vector } from '../types'
import { penaltyPath } from '../render/rink/table'
import { skateToward } from './matchFlow'

/** Agarre del patín (1 = normal); el evento arcade «pista de hielo» lo baja. */
export const skateMods = { grip: 1 }

/**
 * Estado del patín de un jugador de campo: dirección de marcha (h) y la propulsión pedida en este
 * paso (dirección unitaria, aceleración y tope de velocidad deseado), que consume applySkating.
 */
type SkateState = { hx: number, hy: number, at: number, dx: number, dy: number, accel: number, cap: number }
const skateStates = new WeakMap<Player, SkateState>()
/** Sin pasar por applySkating en este tiempo (saques, banquillo, duelo), el heading se vuelve a tomar de la velocidad. */
const SKATE_STALE_MS = 50

function skateStateOf(player: Player): SkateState {
  let st = skateStates.get(player)
  if (!st) {
    st = { hx: 1, hy: 0, at: -Infinity, dx: 0, dy: 0, accel: 0, cap: Infinity }
    skateStates.set(player, st)
  }
  return st
}

/** Pide propulsión en la dirección unitaria (ux, uy) con aceleración `accel` sin pasar de `cap` px/s. */
export function driveSkater(player: Player, ux: number, uy: number, accel: number, cap = Infinity) {
  const st = skateStateOf(player)
  st.dx = ux
  st.dy = uy
  st.accel = accel
  st.cap = cap
}

/**
 * Patina hacia un objetivo (primitiva de la IA). Anticipa la llegada: el tope de velocidad es el
 * que deja frenar a tiempo y, si el objetivo queda de costado y cerca, el que permite la curva con
 * el agarre lateral; así no se pasa de largo, no orbita y no tiembla en su sitio.
 */
export function seek(player: Player, target: Vector, intensity: number, _dt: number) {
  const dx = target.x - player.pos.x
  const dy = target.y - player.pos.y
  const len = Math.hypot(dx, dy)
  const accel = PLAYER_ACCEL * intensity
  if (len < SKATE_ARRIVE_DEADZONE) {
    driveSkater(player, 0, 0, accel, 0)
    return
  }
  const ux = dx / len
  const uy = dy / len
  const grip = skateMods.grip
  let cap = Math.sqrt(2 * SKATE_BRAKE_DECEL * SKATE_ARRIVE_DECEL_FACTOR * grip * Math.max(0, len - SKATE_ARRIVE_STOP_PX))
  const vx = player.velocity.x
  const vy = player.velocity.y
  const sp = Math.hypot(vx, vy)
  if (sp > SKATE_PIVOT_SPEED) {
    const cos = (vx * ux + vy * uy) / sp
    // Radio que hace falta para llegar ≈ d / (2 sen θ); por detrás ya frena la física
    const sin = cos < 0 ? 1 : Math.max(0.05, Math.sqrt(1 - cos * cos))
    cap = Math.min(cap, Math.sqrt(SKATE_LATERAL_GRIP * grip * len / (2 * sin)))
  }
  driveSkater(player, ux, uy, accel, cap)
}

/** Gira el heading hacia (tx, ty) como mucho `maxAngle` rad. */
function turnHeading(st: SkateState, tx: number, ty: number, maxAngle: number) {
  const cross = st.hx * ty - st.hy * tx
  const dot = st.hx * tx + st.hy * ty
  const ang = Math.atan2(cross, dot)
  if (Math.abs(ang) <= maxAngle) {
    st.hx = tx
    st.hy = ty
    return
  }
  const a = ang > 0 ? maxAngle : -maxAngle
  const c = Math.cos(a)
  const s = Math.sin(a)
  const hx = st.hx * c - st.hy * s
  st.hy = st.hx * s + st.hy * c
  st.hx = hx
}

/** Apunta en `player.bump` un impulso recibido si supera el umbral (en el mismo paso gana el mayor). */
function recordBump(player: Player, ix: number, iy: number, now: number) {
  const m2 = ix * ix + iy * iy
  if (m2 < SKATE_BUMP_MIN * SKATE_BUMP_MIN) return
  const b = player.bump
  if (!b) { player.bump = { x: ix, y: iy, at: now }; return }
  if (b.at === now && b.x * b.x + b.y * b.y >= m2) return
  b.x = ix
  b.y = iy
  b.at = now
}

/** Rebote amortiguado contra una valla de normal (nx, ny) hacia dentro de la pista. */
function bounceWall(player: Player, nx: number, ny: number, now: number) {
  const v = player.velocity
  const vn = v.x * nx + v.y * ny
  if (vn >= 0) return
  let tx = v.x - vn * nx
  let ty = v.y - vn * ny
  // Rozamiento de Coulomb: la tangencial pierde en proporción al golpe (rozar la valla apenas frena)
  const tl = Math.hypot(tx, ty)
  if (tl > 0) {
    const k = Math.max(0, tl - SKATE_WALL_FRICTION * (1 + SKATE_WALL_RESTITUTION) * -vn) / tl
    tx *= k
    ty *= k
  }
  const nvx = tx - vn * SKATE_WALL_RESTITUTION * nx
  const nvy = ty - vn * SKATE_WALL_RESTITUTION * ny
  recordBump(player, nvx - v.x, nvy - v.y, now)
  v.x = nvx
  v.y = nvy
}

/** Tope de velocidad común (sprint, stamina y multiplicador del arcade). */
function clampMaxSpeed(player: Player) {
  const v = player.velocity
  const speed = Math.hypot(v.x, v.y)
  const stamina = player.stamina ?? 100
  const staminaMod = stamina < STAMINA_LOW_THRESHOLD && player.role !== 'goalie' ? STAMINA_EXHAUSTED_SPEED_FACTOR : 1
  const maxSpeed = (player.sprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED) * staminaMod * (player.speedMultiplier ?? 1)
  if (speed > maxSpeed) {
    v.x = (v.x / speed) * maxSpeed
    v.y = (v.y / speed) * maxSpeed
  }
}

/**
 * Integra el movimiento de un jugador en un paso fijo. El portero conserva el rozamiento isótropo
 * (su IA lo compensa); los de campo patinan con heading, agarre lateral finito, frenada y empuje
 * con curva (ver SKATE_* en constants.ts). `now` es el tiempo de simulación del paso y `withBall`
 * si lleva la bola (algo menos de agarre y de giro).
 */
export function applySkating(player: Player, dt: number, now: number, withBall = false) {
  if (player.role === 'goalie') {
    applyGoalieSkating(player, dt)
    return
  }
  const st = skateStateOf(player)
  const v = player.velocity
  let s = Math.hypot(v.x, v.y)
  if (now - st.at > SKATE_STALE_MS) {
    const fl = Math.hypot(player.facing.x, player.facing.y)
    if (s > 1) { st.hx = v.x / s; st.hy = v.y / s }
    else if (fl > 0) { st.hx = player.facing.x / fl; st.hy = player.facing.y / fl }
  }
  st.at = now
  const grip = skateMods.grip
  const ballK = withBall ? SKATE_BALL_GRIP : 1
  const hasDir = st.dx !== 0 || st.dy !== 0
  // Juego de pies: casi parado empuja hacia donde quiere ir y el agarre lateral no estorba
  const fw = Math.max(0, 1 - s / SKATE_PIVOT_SPEED)

  // Frenada por ángulo: parcial para cerrar una curva cerrada, total para invertir el sentido
  let brake = 0
  if (hasDir && s > SKATE_PIVOT_SPEED) {
    const cosA = (v.x * st.dx + v.y * st.dy) / s
    brake = Phaser.Math.Clamp((SKATE_TURN_BRAKE_COS - cosA) / (SKATE_TURN_BRAKE_COS - SKATE_REVERSE_COS), 0, 1)
  }

  // Giro del patín: hacia donde quiere ir salvo al invertir; sin propulsión se alinea con la marcha
  const turn = (SKATE_TURN_RATE * ballK / (1 + s / SKATE_TURN_SPEED_REF)) * dt
  if (hasDir && brake < 1) turnHeading(st, st.dx, st.dy, turn)
  else if (s > 1) turnHeading(st, v.x / s, v.y / s, turn)

  // Empuje: a lo largo del patín (y hacia el objetivo con juego de pies), con curva cerca del tope
  if (hasDir && brake < 1 && st.accel > 0 && s < st.cap) {
    const vCurve = st.accel * SKATE_THRUST_SPEED_PER_ACCEL
    const x = s / vCurve
    const g = Math.max(0, 1 - x * x)
    const along = Math.max(0, st.dx * st.hx + st.dy * st.hy)
    const a = st.accel * grip * g * (1 - brake) * dt
    v.x += (fw * st.dx + (1 - fw) * along * st.hx) * a
    v.y += (fw * st.dy + (1 - fw) * along * st.hy) * a
  }

  // Agarre lateral finito: la velocidad de costado respecto al patín se pierde poco a poco (deriva)
  const vl = v.x * st.hx + v.y * st.hy
  let lx = v.x - vl * st.hx
  let ly = v.y - vl * st.hy
  const lat = Math.hypot(lx, ly)
  if (lat > 0) {
    const k = Math.max(0, lat - SKATE_LATERAL_GRIP * grip * ballK * (1 - fw) * dt) / lat
    lx *= k
    ly *= k
  }
  v.x = vl * st.hx + lx
  v.y = vl * st.hy + ly

  // Frenada: por ángulo y por ir más rápido que el tope pedido (llegada), sin bajar de él
  s = Math.hypot(v.x, v.y)
  if (s > 0 && (brake > 0 || s > st.cap)) {
    const effort = Math.min(1, st.accel / (PLAYER_ACCEL * 0.5))
    const full = SKATE_BRAKE_DECEL * grip * effort * dt
    let target = brake > 0 ? Math.max(0, s - full * brake) : s
    if (target > st.cap) target = Math.max(st.cap, s - full)
    v.x *= target / s
    v.y *= target / s
  }

  const roll = 1 - (1 - SKATE_GLIDE_FRICTION) * grip
  v.x *= roll
  v.y *= roll
  clampMaxSpeed(player)
  st.dx = 0
  st.dy = 0
  st.accel = 0
  st.cap = Infinity

  player.pos.x += v.x * dt
  player.pos.y += v.y * dt
  const minX = RINK.x + PLAYER_RADIUS
  const maxX = RINK.x + RINK.width - PLAYER_RADIUS
  const minY = RINK.y + PLAYER_RADIUS
  const maxY = RINK.y + RINK.height - PLAYER_RADIUS - FIELD_PLAYER_BOTTOM_BOARD_MARGIN
  if (player.pos.x < minX) { player.pos.x = minX; bounceWall(player, 1, 0, now) }
  else if (player.pos.x > maxX) { player.pos.x = maxX; bounceWall(player, -1, 0, now) }
  if (player.pos.y < minY) { player.pos.y = minY; bounceWall(player, 0, 1, now) }
  else if (player.pos.y > maxY) { player.pos.y = maxY; bounceWall(player, 0, -1, now) }
}

/** Manejo del portero de siempre: rozamiento isótropo, tope de velocidad y de su zona. */
function applyGoalieSkating(player: Player, dt: number) {
  player.velocity.x *= PLAYER_FRICTION
  player.velocity.y *= PLAYER_FRICTION
  clampMaxSpeed(player)
  player.pos.x += player.velocity.x * dt
  player.pos.y += player.velocity.y * dt
  player.pos.x = Phaser.Math.Clamp(player.pos.x, RINK.x + GOALIE_RADIUS, RINK.x + RINK.width - GOALIE_RADIUS)
  player.pos.y = Phaser.Math.Clamp(player.pos.y, RINK.y + GOALIE_RADIUS, RINK.y + RINK.height - GOALIE_RADIUS)
  // Tope de su zona; la velocidad contra el tope se anula para que no «patine» sin moverse
  const out = GOALIE_X_MAX + GOALIE_OUT_DEPTH
  const minX = player.side === 'left' ? RINK.x + GOALIE_X_MIN : RINK.x + RINK.width - out
  const maxX = player.side === 'left' ? RINK.x + out : RINK.x + RINK.width - GOALIE_X_MIN
  if (player.pos.x < minX) { player.pos.x = minX; if (player.velocity.x < 0) player.velocity.x = 0 }
  else if (player.pos.x > maxX) { player.pos.x = maxX; if (player.velocity.x > 0) player.velocity.x = 0 }
}

const penPath = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]

/** Primer asiento libre de su equipo en la zona de sancionados. */
function freePenaltySeat(players: Player[], player: Player) {
  for (let i = 0; i < 3; i++) {
    if (!players.some((o) => o !== player && o.team === player.team && o.penPhase && o.penSeat === i)) return i
  }
  return 0
}

function pathLength(pts: Vector[]) {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return l
}

/** Coloca al jugador a `d` px del camino, con la velocidad y orientación de ir en `dir` (la zancada del rig sale de ahí). */
function placeOnPath(player: Player, pts: Vector[], d: number, dir: 1 | -1) {
  let rest = Math.max(0, d)
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y
    const sx = pts[i].x - ax, sy = pts[i].y - ay
    const l = Math.hypot(sx, sy)
    if (rest <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, rest / l) : 1
      player.pos.x = ax + sx * t
      player.pos.y = ay + sy * t
      if (l > 0) {
        const ux = (sx / l) * dir, uy = (sy / l) * dir
        player.velocity = { x: ux * PEN_WALK_SPEED, y: uy * PEN_WALK_SPEED }
        player.facing = { x: ux, y: uy }
      }
      return
    }
    rest -= l
  }
}

/**
 * Sancionados (tarjeta azul): patinan a la puerta de su banquillo, la cruzan,
 * van por el pasillo hasta su asiento y, cumplida la sanción, vuelven a la
 * pista por el mismo camino. La sanción cuenta tiempo efectivo: con el juego
 * parado (`paused`) no corre (art. 3).
 */
export function updateSuspendedPlayers(players: Player[], timeNow: number, dt: number, paused = false) {
  for (const player of players) {
    if (!player.suspendedUntil) continue
    if (paused && player.penPhase !== 'back' && player.suspendedUntil > timeNow) player.suspendedUntil += dt * 1000
    if (!player.penPhase) {
      player.penPhase = 'out'
      player.penPhaseAt = timeNow
    }
    if (player.penSeat === undefined) player.penSeat = freePenaltySeat(players, player)
    const path = penaltyPath(player.team, player.penSeat, PLAYER_RADIUS + 2, penPath)
    const len = pathLength(path)
    player.sprinting = false

    if (player.penPhase === 'out') {
      const arrived = skateToward(player, path[0].x, path[0].y, dt)
      if (arrived || timeNow - (player.penPhaseAt ?? timeNow) > PEN_EXIT_MAX_MS) {
        player.penPhase = 'exit'
        player.penWalk = 0
      }
    } else if (player.penPhase === 'exit') {
      player.penWalk = (player.penWalk ?? 0) + PEN_WALK_SPEED * dt
      placeOnPath(player, path, player.penWalk, 1)
      if (player.penWalk >= len) {
        player.penPhase = 'seated'
        player.penPhaseAt = timeNow
        player.velocity = { x: 0, y: 0 }
      }
    } else if (player.penPhase === 'seated') {
      player.velocity = { x: 0, y: 0 }
      if (timeNow >= player.suspendedUntil) {
        player.penPhase = 'back'
        player.penWalk = len
      }
    } else {
      // De vuelta sigue fuera del juego hasta pisar la pista
      player.suspendedUntil = timeNow + 1000
      player.penWalk = (player.penWalk ?? len) - PEN_WALK_SPEED * dt
      placeOnPath(player, path, player.penWalk, -1)
      if (player.penWalk <= 0) {
        player.suspendedUntil = 0
        player.penPhase = undefined
        player.penSeat = undefined
        player.penWalk = undefined
        player.velocity = { x: 0, y: PEN_WALK_SPEED }
        player.facing = { x: 0, y: 1 }
      }
    }
  }
}

/**
 * Separa jugadores solapados (mitad y mitad, como siempre) y, si se acercaban, resuelve el choque
 * con un impulso entre masas (el portero pesa más) y restitución baja: conserva el momento.
 * Los impulsos por encima de SKATE_BUMP_MIN quedan en `bump` con el tiempo de simulación `now`.
 */
export function resolvePlayerSpacing(players: Player[], now: number) {
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i]
      const b = players[j]
      // Los jugadores en el banquillo no colisionan con los de la pista
      if ((a.suspendedUntil && a.suspendedUntil > 0) || (b.suspendedUntil && b.suspendedUntil > 0)) continue
      const ar = a.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      const br = b.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const dist = Math.hypot(dx, dy) || 1
      const minDist = ar + br + PLAYER_SEPARATION_GAP

      if (dist < minDist) {
        const push = (minDist - dist) / 2
        const nx = dx / dist
        const ny = dy / dist
        a.pos.x -= nx * push
        a.pos.y -= ny * push
        b.pos.x += nx * push
        b.pos.y += ny * push
        const ia = a.role === 'goalie' ? 1 / SKATE_GOALIE_MASS : 1
        const ib = b.role === 'goalie' ? 1 / SKATE_GOALIE_MASS : 1
        // Empujón de contacto mientras se solapan (cuerpo contra cuerpo), repartido por masas
        const shove = SKATE_CONTACT_PUSH / (ia + ib)
        a.velocity.x -= nx * shove * ia
        a.velocity.y -= ny * shove * ia
        b.velocity.x += nx * shove * ib
        b.velocity.y += ny * shove * ib
        const vn = (b.velocity.x - a.velocity.x) * nx + (b.velocity.y - a.velocity.y) * ny
        if (vn < 0) {
          const j = (-(1 + SKATE_COLLISION_RESTITUTION) * vn) / (ia + ib)
          a.velocity.x -= nx * j * ia
          a.velocity.y -= ny * j * ia
          b.velocity.x += nx * j * ib
          b.velocity.y += ny * j * ib
          recordBump(a, -nx * j * ia, -ny * j * ia, now)
          recordBump(b, nx * j * ib, ny * j * ib, now)
        }
      }
    }
  }
}
