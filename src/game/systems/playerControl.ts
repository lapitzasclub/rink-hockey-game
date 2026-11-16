import { PLAYER_ACCEL, PLAYER_SPRINT_ACCEL_MULTIPLIER, STAMINA_LOW_THRESHOLD, STAMINA_MAX, STAMINA_RECOVERY_PER_SECOND, STAMINA_SPRINT_DRAIN_PER_SECOND } from '../constants'
import { applySkating } from './movement'
import { getControlledPlayer } from './playerHelpers'
import type { Ball, Player } from '../types'

/** Autopiloto (partido de humo, WP-64): la IA también mueve al jugador "humano". */
export const autopilot = { on: false }

/**
 * Lee el input del jugador humano (teclado o joystick táctil), actualiza el
 * sprint y la stamina, aplica aceleración y delega el movimiento a applySkating.
 *
 * @returns El jugador controlado después de aplicar el movimiento.
 */
export function updateControlledPlayerMotion(options: {
  players: Player[]
  controlledPlayerIndex: number
  /** Eje del teclado ya resuelto con la asignación de teclas (-1..1 por componente). */
  keyboardAxis: { x: number, y: number }
  joystickInput: { x: number, y: number, sprint?: boolean }
  sprintHeld: boolean
  isTouchDevice: boolean
  dt: number
  timeNow: number
}) {
  const player = getControlledPlayer(options.players, options.controlledPlayerIndex)
  if (autopilot.on) return player // lo mueve updateTeamAIPlayers

  // Si el jugador controlado está suspendido, solo aplicar rozamiento (sin input)
  if ((player.suspendedUntil && player.suspendedUntil > options.timeNow) || (player.stunUntil ?? 0) > options.timeNow) {
    player.sprinting = false
    applySkating(player, options.dt)
    return player
  }

  const keyboardInputX = options.keyboardAxis.x
  const keyboardInputY = options.keyboardAxis.y

  const usingJoystick = options.isTouchDevice && Math.hypot(options.joystickInput.x, options.joystickInput.y) > 0.08
  const inputX = usingJoystick ? options.joystickInput.x : keyboardInputX
  const inputY = usingJoystick ? options.joystickInput.y : keyboardInputY
  const len = Math.hypot(inputX, inputY)

  const wantsSprint = (options.sprintHeld || !!options.joystickInput.sprint) && lenientCanSprint(player)
  player.sprinting = wantsSprint && len > 0

  if (player.sprinting) player.stamina = Math.max(0, (player.stamina ?? STAMINA_MAX) - STAMINA_SPRINT_DRAIN_PER_SECOND * options.dt)
  else player.stamina = Math.min(STAMINA_MAX, (player.stamina ?? STAMINA_MAX) + STAMINA_RECOVERY_PER_SECOND * options.dt)

  const accel = PLAYER_ACCEL * (player.sprinting ? PLAYER_SPRINT_ACCEL_MULTIPLIER : 1)
  if (len > 0) {
    player.velocity.x += (inputX / len) * accel * options.dt
    player.velocity.y += (inputY / len) * accel * options.dt
    player.facing = { x: inputX / len, y: inputY / len }
  }

  applySkating(player, options.dt)
  return player
}

/** Permite sprint mientras la stamina supere el umbral bajo, sin cortar en seco al agotarla. */
function lenientCanSprint(player: Player) {
  return (player.stamina ?? STAMINA_MAX) > STAMINA_LOW_THRESHOLD
}

/**
 * Actualiza IA y movimiento de todos los jugadores no controlados por el humano.
 *
 * Los jugadores suspendidos solo recuperan stamina; su movimiento lo gestiona
 * updateSuspendedPlayers en movement.ts.
 */
export function updateTeamAIPlayers(options: {
  players: Player[]
  controlledPlayerIndex: number
  ball: Ball
  ballCarrierId: string | null
  dt: number
  timeNow: number
  updateGoalieAI: (player: Player, ballX: number, ballY: number, dt: number, timeNow: number) => void
  updateFieldPlayerAI: (players: Player[], player: Player, ballX: number, ballY: number, ballCarrierId: string | null, dt: number) => void
}) {
  const controlled = getControlledPlayer(options.players, options.controlledPlayerIndex)

  for (const player of options.players) {
    if (player.id === controlled.id && !autopilot.on) continue
    // Jugador suspendido: no actualizar IA ni física (lo gestiona updateSuspendedPlayers)
    if (player.suspendedUntil && player.suspendedUntil > options.timeNow) continue
    if ((player.stunUntil ?? 0) > options.timeNow) {
      player.sprinting = false
      applySkating(player, options.dt)
      continue
    }
    player.stamina = Math.min(STAMINA_MAX, (player.stamina ?? STAMINA_MAX) + STAMINA_RECOVERY_PER_SECOND * options.dt * 0.8)
    if (player.role === 'goalie') {
      player.sprinting = false
      options.updateGoalieAI(player, options.ball.x, options.ball.y, options.dt, options.timeNow)
    } else {
      options.updateFieldPlayerAI(options.players, player, options.ball.x, options.ball.y, options.ballCarrierId, options.dt)
    }
    if (player.sprinting) player.stamina = Math.max(0, (player.stamina ?? STAMINA_MAX) - STAMINA_SPRINT_DRAIN_PER_SECOND * options.dt * 0.55)
    applySkating(player, options.dt)
  }
}
