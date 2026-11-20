import { GAME_HEIGHT, GOALIE_HUMAN_MAX_Y, PLAYER_ACCEL, PLAYER_SPRINT_ACCEL_MULTIPLIER, STAMINA_LOW_THRESHOLD, STAMINA_MAX, STAMINA_RECOVERY_PER_SECOND, STAMINA_SPRINT_DRAIN_PER_SECOND, PRESS_STICK_BLEND, TOUCH_ASSIST_EXTRA } from '../constants'
import { prepareTeamAI } from './aiTeam'
import { touchAssist } from './difficulty'
import { steerGoalieFacing, type GoalieContext } from './goalieAI'
import { applySkating } from './movement'
import { getControlledPlayer } from './playerHelpers'
import type { Ball, Player, Vector } from '../types'

/** Autopiloto (partido de humo, WP-64): la IA también mueve al jugador "humano". */
export const autopilot = { on: false }

/**
 * B-06: id del portero en manos de la persona táctil que mueve la IA porque viene un tiro rival
 * (TOUCH_ASSIST_EXTRA.goalieAiShotSpeed). Lo fija updateTeamAIPlayers; el movimiento del
 * controlado lo respeta en el paso siguiente.
 */
const goalieTakeover = { id: '' }

/** ¿Hay un tiro rival en camino hacia la portería de este portero (bola suelta y rápida hacia ella)? */
function rivalShotIncoming(goalie: Player, ballVelocity: Vector, ballCarrierId: string | null) {
  if (ballCarrierId) return false
  const vx = ballVelocity.x
  if (goalie.side === 'left' ? vx >= 0 : vx <= 0) return false
  return Math.hypot(vx, ballVelocity.y) >= TOUCH_ASSIST_EXTRA.goalieAiShotSpeed
}

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
  /** Bola: el portero controlado no la pierde de vista mientras se mueve. */
  ball: { x: number, y: number }
  /** Punto al que lleva el botón de presionar (null si no se presiona). */
  pressTarget?: { x: number, y: number } | null
}) {
  const player = getControlledPlayer(options.players, options.controlledPlayerIndex)
  if (autopilot.on || goalieTakeover.id === player.id) return player // lo mueve updateTeamAIPlayers

  // Si el jugador controlado está suspendido, solo aplicar rozamiento (sin input)
  if ((player.suspendedUntil && player.suspendedUntil > options.timeNow) || (player.stunUntil ?? 0) > options.timeNow) {
    player.sprinting = false
    applySkating(player, options.dt)
    return player
  }

  const keyboardInputX = options.keyboardAxis.x
  const keyboardInputY = options.keyboardAxis.y

  const usingJoystick = options.isTouchDevice && Math.hypot(options.joystickInput.x, options.joystickInput.y) > 0.08
  let inputX = usingJoystick ? options.joystickInput.x : keyboardInputX
  let inputY = usingJoystick ? options.joystickInput.y : keyboardInputY
  let len = Math.hypot(inputX, inputY)

  const press = player.role !== 'goalie' ? options.pressTarget : null
  if (press) {
    const tx = press.x - player.pos.x
    const ty = press.y - player.pos.y
    const tl = Math.hypot(tx, ty)
    if (tl > 1) {
      const w = len > 0.08 ? PRESS_STICK_BLEND : 1
      const sx = len > 0.08 ? inputX / len : 0
      const sy = len > 0.08 ? inputY / len : 0
      inputX = sx * (1 - w) + (tx / tl) * w
      inputY = sy * (1 - w) + (ty / tl) * w
      len = Math.hypot(inputX, inputY)
    }
  }

  if (player.role === 'goalie') {
    // nipplejs da |stick| ≤ 0,5: en táctil se escala para que el portero acelere como con mando
    const k = usingJoystick && touchAssist.team === player.team ? TOUCH_ASSIST_EXTRA.goalieStickScale : 1
    moveHumanGoalie(player, inputX, inputY, len, k, options.ball, options.dt)
    return player
  }

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

/**
 * Portero en manos del humano: patina con el mando sin sprint, dentro de su zona (el tope en x lo
 * pone applySkating; aquí el recorrido lateral) y mirando a la bola como el de la IA. Las paradas
 * siguen siendo automáticas por posición (tryGoalieSave). `stickScale` escala el módulo del stick.
 */
function moveHumanGoalie(player: Player, inputX: number, inputY: number, len: number, stickScale: number, ball: { x: number, y: number }, dt: number) {
  player.sprinting = false
  player.stamina = Math.min(STAMINA_MAX, (player.stamina ?? STAMINA_MAX) + STAMINA_RECOVERY_PER_SECOND * dt)
  if (len > 0) {
    const k = Math.min(1, len * stickScale)
    player.velocity.x += (inputX / len) * k * PLAYER_ACCEL * dt
    player.velocity.y += (inputY / len) * k * PLAYER_ACCEL * dt
  }
  steerGoalieFacing(player, ball.x - player.pos.x, ball.y - player.pos.y, dt)
  applySkating(player, dt)
  const cy = GAME_HEIGHT / 2
  if (player.pos.y < cy - GOALIE_HUMAN_MAX_Y) { player.pos.y = cy - GOALIE_HUMAN_MAX_Y; if (player.velocity.y < 0) player.velocity.y = 0 }
  else if (player.pos.y > cy + GOALIE_HUMAN_MAX_Y) { player.pos.y = cy + GOALIE_HUMAN_MAX_Y; if (player.velocity.y > 0) player.velocity.y = 0 }
}

/** Permite sprint mientras la stamina supere el umbral bajo, sin cortar en seco al agotarla. */
function lenientCanSprint(player: Player) {
  return (player.stamina ?? STAMINA_MAX) > STAMINA_LOW_THRESHOLD
}

/** Contexto de la IA del portero, reutilizado en cada paso. */
const goalieCtx: GoalieContext = { players: [], ball: { x: 0, y: 0 } as Ball, ballVelocity: { x: 0, y: 0 }, ballCarrierId: null, dt: 0, now: 0, arcade: false }

/**
 * Actualiza IA y movimiento de todos los jugadores no controlados por el humano.
 * Antes de mover a nadie, prepareTeamAI fija el plan táctico de ambos equipos.
 *
 * Los jugadores suspendidos solo recuperan stamina; su movimiento lo gestiona
 * updateSuspendedPlayers en movement.ts.
 */
export function updateTeamAIPlayers(options: {
  players: Player[]
  controlledPlayerIndex: number
  ball: Ball
  ballVelocity: Vector
  ballCarrierId: string | null
  dt: number
  timeNow: number
  arcade: boolean
  updateGoalieAI: (player: Player, ctx: GoalieContext) => void
  updateFieldPlayerAI: (players: Player[], player: Player, ballX: number, ballY: number, ballCarrierId: string | null, dt: number) => void
}) {
  const controlled = getControlledPlayer(options.players, options.controlledPlayerIndex)
  goalieCtx.players = options.players
  goalieCtx.ball = options.ball
  goalieCtx.ballVelocity = options.ballVelocity
  goalieCtx.ballCarrierId = options.ballCarrierId
  goalieCtx.dt = options.dt
  goalieCtx.now = options.timeNow
  goalieCtx.arcade = options.arcade
  prepareTeamAI(options.players, options.ball, options.ballVelocity, options.ballCarrierId, autopilot.on ? null : controlled.id, options.timeNow)

  // Táctil: con un tiro rival en camino, la IA coloca al portero que lleva la persona (B-06)
  const takeover = !autopilot.on && controlled.role === 'goalie' && touchAssist.team === controlled.team &&
    (TOUCH_ASSIST_EXTRA.goalieAiWithoutBall ? options.ballCarrierId !== controlled.id
      : goalieTakeover.id === controlled.id ? !options.ballCarrierId && Math.hypot(options.ballVelocity.x, options.ballVelocity.y) > 30 : rivalShotIncoming(controlled, options.ballVelocity, options.ballCarrierId))
  goalieTakeover.id = takeover ? controlled.id : ''

  for (const player of options.players) {
    if (player.id === controlled.id && !autopilot.on && !takeover) continue
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
      options.updateGoalieAI(player, goalieCtx)
    } else {
      options.updateFieldPlayerAI(options.players, player, options.ball.x, options.ball.y, options.ballCarrierId, options.dt)
    }
    if (player.sprinting) player.stamina = Math.max(0, (player.stamina ?? STAMINA_MAX) - STAMINA_SPRINT_DRAIN_PER_SECOND * options.dt * 0.55)
    applySkating(player, options.dt)
  }
}
