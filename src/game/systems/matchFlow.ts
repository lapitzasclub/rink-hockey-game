import * as Phaser from 'phaser'
import { BULLY_PLAYER_OFFSET, BULLY_SETUP_MS, DIRECT_FREE_HIT_SPOT_OFFSET, FOUL_SETUP_MS, GAME_HEIGHT, GAME_WIDTH, GOAL_NET_HOLD_X, PLAYER_SPRINT_MAX_SPEED, RINK } from '../constants'
import { getFormation } from '../formation'
import { getGoalLineX } from '../utils'
import { findPlayerById, getControlledPlayer } from './playerHelpers'
import { updateVisuals } from './visuals'
import type { ActiveBully, ActiveFoulRestart, Player, TeamColor, Vector } from '../types'
import { createRuleState, type RuleState } from './rules'

export function resetKickoffState(options: {
  team: TeamColor
  players: Player[]
  ball: Phaser.GameObjects.Arc
  currentPeriod: number
  controlledPlayerIndex: number
  ballCarrierId: string | null
  ballVelocity: Vector
}) {
  const { team, players, ball, currentPeriod } = options
  const blue = getFormation('left')
  const red = getFormation('right')

  for (const player of players) {
    const index = Number(player.id.split('-')[1])
    const formation = player.team === 'blue' ? blue[index] : red[index]
    player.home = { x: formation.x, y: formation.y }
    player.pos = { x: formation.x, y: formation.y }
    player.velocity = { x: 0, y: 0 }
    player.facing = { x: player.side === 'left' ? 1 : -1, y: 0 }
    player.possessionCooldownUntil = 0
    player.goalieCatchTime = 0
    player.ignoreBallUntil = 0
    player.goalieRecoverUntil = 0
  }

  ball.setPosition(GAME_WIDTH / 2 + (team === 'blue' ? -22 : 22), GAME_HEIGHT / 2)

  return {
    ballCarrierId: null,
    ballVelocity: { x: 0, y: 0 },
    lastTouch: team,
    controlledPlayerIndex: 0,
    lastLooseBallTime: 0,
    ballIgnoreContactsUntil: 0,
    activeBully: null as ActiveBully | null,
    activeFoulRestart: null as ActiveFoulRestart | null,
    stuckCarrierStartTime: 0,
    stuckCarrierOrigin: null as Vector | null,
    ruleState: { ...createRuleState(), period: currentPeriod },
  }
}

export function applyGoalReset(options: {
  scorer: TeamColor
  players: Player[]
  ball: Phaser.GameObjects.Arc
}) {
  const { scorer, players, ball } = options
  if (scorer === 'blue') {
    ball.setPosition(getGoalLineX('right') + GOAL_NET_HOLD_X, Phaser.Math.Clamp(ball.y, GAME_HEIGHT / 2 - 54, GAME_HEIGHT / 2 + 54))
  } else {
    ball.setPosition(getGoalLineX('left') - GOAL_NET_HOLD_X, Phaser.Math.Clamp(ball.y, GAME_HEIGHT / 2 - 54, GAME_HEIGHT / 2 + 54))
  }

  const blue = getFormation('left')
  const red = getFormation('right')
  for (const player of players) {
    const index = Number(player.id.split('-')[1])
    const formation = player.team === 'blue' ? blue[index] : red[index]
    player.home = { x: formation.x, y: formation.y }
    player.pos = { x: formation.x, y: formation.y }
    player.velocity = { x: 0, y: 0 }
    player.facing = { x: player.side === 'left' ? 1 : -1, y: 0 }
  }
}

export function startFoulRestartState(options: {
  foul: NonNullable<RuleState['pendingFoul']>
  players: Player[]
  ball: Phaser.GameObjects.Arc
  timeNow: number
}) {
  const { foul, players, ball, timeNow } = options
  const taker = findPlayerById(players, foul.victimPlayerId)
  const isDirect = foul.sanction === 'direct-free-hit' || foul.sanction === 'penalty'
  const restartX = isDirect ? (taker?.side === 'left' ? GAME_WIDTH - DIRECT_FREE_HIT_SPOT_OFFSET : DIRECT_FREE_HIT_SPOT_OFFSET) : foul.restartX
  const restartY = isDirect ? GAME_HEIGHT / 2 : foul.restartY

  ball.setPosition(restartX, restartY)

  // Parar a todos; posiciones las ajusta updateFoulRestartState con lerp (sin snap)
  for (const player of players) {
    player.velocity = { x: 0, y: 0 }
  }

  return {
    ballVelocity: { x: 0, y: 0 },
    ballCarrierId: null,
    ballIgnoreContactsUntil: timeNow + FOUL_SETUP_MS,
    activeFoulRestart: {
      takerPlayerId: foul.victimPlayerId,
      x: restartX,
      y: restartY,
      readyAt: timeNow + FOUL_SETUP_MS,
      sanction: foul.sanction,
    } as ActiveFoulRestart,
  }
}

export function startBullyState(options: {
  x: number
  y: number
  bluePlayerId: string
  redPlayerId: string
  players: Player[]
  ball: Phaser.GameObjects.Arc
  timeNow: number
}) {
  const { x, y, bluePlayerId, redPlayerId, players, ball, timeNow } = options
  ball.setPosition(x, y)

  for (const player of players) {
    player.velocity = { x: 0, y: 0 }
  }

  const blue = findPlayerById(players, bluePlayerId)
  const red = findPlayerById(players, redPlayerId)

  // Facing inmediato; la posición la alcanza updateBullyState con lerp
  if (blue) blue.facing = { x: 1, y: 0 }
  if (red) red.facing = { x: -1, y: 0 }

  return {
    ballVelocity: { x: 0, y: 0 },
    ballCarrierId: null,
    ballIgnoreContactsUntil: timeNow + BULLY_SETUP_MS,
    activeBully: {
      bluePlayerId,
      redPlayerId,
      x,
      y,
      releaseAt: timeNow + BULLY_SETUP_MS,
    } as ActiveBully,
  }
}

/** Mueve un jugador hacia (tx, ty) a velocidad de sprint máxima, sin exceder la distancia restante. */
function movePlayerToward(player: Player, tx: number, ty: number, dt: number) {
  const dx = tx - player.pos.x
  const dy = ty - player.pos.y
  const dist = Math.hypot(dx, dy)
  if (dist < 2) { player.velocity = { x: 0, y: 0 }; return }
  const step = Math.min(dist, PLAYER_SPRINT_MAX_SPEED * dt)
  player.pos.x += (dx / dist) * step
  player.pos.y += (dy / dist) * step
  player.velocity.x = (dx / dist) * PLAYER_SPRINT_MAX_SPEED
  player.velocity.y = (dy / dist) * PLAYER_SPRINT_MAX_SPEED
  player.facing = { x: dx / dist, y: dy / dist }
}

export function updateFoulRestartState(options: {
  time: number
  dt: number
  activeFoulRestart: ActiveFoulRestart | null
  players: Player[]
  ball: Phaser.GameObjects.Arc
  controlledPlayerIndex: number
  centerText: Phaser.GameObjects.Text
  passJustDown: boolean
  shootJustDown: boolean
}) {
  const { time, dt, activeFoulRestart: foul, players, ball, controlledPlayerIndex, centerText, passJustDown, shootJustDown } = options
  if (!foul) return null

  const taker = findPlayerById(players, foul.takerPlayerId)
  if (taker) {
    const takerTargetX = foul.x + (taker.side === 'left' ? -18 : 18)
    if (time < foul.readyAt) {
      movePlayerToward(taker, takerTargetX, foul.y, dt)

      if (foul.sanction === 'free-hit') {
        // Posicionamiento táctico: aliados abren espacio, rivales se ajustan
        const advance = taker.side === 'left' ? 1 : -1
        for (const p of players) {
          if (p.id === taker.id || p.role === 'goalie') continue
          let tx: number, ty: number
          if (p.team === taker.team) {
            if (p.role === 'wing') {
              tx = Phaser.Math.Clamp(foul.x + advance * 185, RINK.x + 60, RINK.x + RINK.width - 60)
              ty = p.home.y
            } else if (p.role === 'pivot') {
              tx = Phaser.Math.Clamp(foul.x + advance * 95, RINK.x + 60, RINK.x + RINK.width - 60)
              ty = GAME_HEIGHT / 2 + (p.home.y < GAME_HEIGHT / 2 ? -55 : 55)
            } else {
              tx = Phaser.Math.Clamp(foul.x - advance * 85, RINK.x + 60, RINK.x + RINK.width - 60)
              ty = p.home.y
            }
          } else {
            // Rivales: posición defensiva desplazada hacia la bola
            tx = p.home.x + Phaser.Math.Clamp((foul.x - p.home.x) * 0.32, -95, 95)
            ty = p.home.y + Phaser.Math.Clamp((foul.y - p.home.y) * 0.42, -95, 95)
            // Distancia mínima reglamentaria al balón
            const bx = tx - foul.x
            const by = ty - foul.y
            const bd = Math.hypot(bx, by)
            if (bd < 60) { const s = 60 / (bd || 1); tx = foul.x + bx * s; ty = foul.y + by * s }
          }
          movePlayerToward(p, tx, ty, dt)
        }
      } else {
        // Directa / penalti: todos a home, portero defensor al centro
        for (const p of players) {
          if (p.id === taker.id) continue
          if (p.role === 'goalie' && p.team !== taker.team) {
            movePlayerToward(p, p.home.x, GAME_HEIGHT / 2, dt)
          } else if (p.role !== 'goalie') {
            movePlayerToward(p, p.home.x, p.home.y, dt)
          }
        }
      }
    } else {
      taker.pos = { x: takerTargetX, y: foul.y }
      taker.velocity = { x: 0, y: 0 }
    }
  }

  ball.setPosition(foul.x, foul.y)
  if (time < foul.readyAt) return { controlledPlayerIndex, taker, shouldPass: false, shouldShot: false, release: false, autoFacing: null as Vector | null }

  // El indicador de puntería es suficiente; ocultar el letrero durante la acción
  centerText.setVisible(false)
  if (!taker) return { controlledPlayerIndex, taker: null, shouldPass: false, shouldShot: false, release: false, autoFacing: null as Vector | null }

  let nextControlledIndex = controlledPlayerIndex
  const controlled = getControlledPlayer(players, controlledPlayerIndex)
  if (controlled.id !== taker.id) {
    const options = players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
    const index = options.findIndex((player) => player.id === taker.id)
    if (index >= 0) nextControlledIndex = index
  }

  if (taker.team === 'red') {
    const targetX = foul.sanction === 'free-hit'
      ? taker.pos.x + (taker.side === 'left' ? 220 : -220)
      : (taker.side === 'left' ? GAME_WIDTH - 24 : 24)
    const targetY = foul.sanction === 'free-hit'
      ? GAME_HEIGHT / 2 + Phaser.Math.Clamp((taker.home.y - GAME_HEIGHT / 2) * 0.55, -90, 90)
      : GAME_HEIGHT / 2 + Phaser.Math.Clamp(taker.pos.y - GAME_HEIGHT / 2, -34, 34)
    const raw = { x: targetX - taker.pos.x, y: targetY - taker.pos.y }
    const length = Math.hypot(raw.x, raw.y) || 1
    const autoFacing = { x: raw.x / length, y: raw.y / length }
    return {
      controlledPlayerIndex,
      taker,
      shouldPass: foul.sanction === 'free-hit',
      shouldShot: foul.sanction !== 'free-hit',
      release: true,
      autoFacing,
    }
  }

  const shouldPass = foul.sanction === 'free-hit' && passJustDown
  // Libre indirecto: no puede disparar directo a portería; solo pase válido
  const shouldShot = foul.sanction === 'free-hit' ? shouldPass : (shootJustDown || passJustDown)
  return {
    controlledPlayerIndex: nextControlledIndex,
    taker,
    shouldPass,
    shouldShot,
    release: shouldPass || shouldShot,
    autoFacing: null as Vector | null,
  }
}

export function updateBullyState(options: {
  time: number
  dt: number
  activeBully: ActiveBully | null
  players: Player[]
  ball: Phaser.GameObjects.Arc
  centerText: Phaser.GameObjects.Text
}) {
  const { time, dt, activeBully: bully, players, ball, centerText } = options
  if (!bully) return false

  const blue = findPlayerById(players, bully.bluePlayerId)
  const red = findPlayerById(players, bully.redPlayerId)

  // Jugadores se acercan a la posición de bully a velocidad de sprint
  if (blue) {
    movePlayerToward(blue, bully.x - BULLY_PLAYER_OFFSET, bully.y, dt)
    blue.facing = { x: 1, y: 0 }
  }
  if (red) {
    movePlayerToward(red, bully.x + BULLY_PLAYER_OFFSET, bully.y, dt)
    red.facing = { x: -1, y: 0 }
  }

  ball.setPosition(bully.x, bully.y)
  if (time >= bully.releaseAt) {
    centerText.setVisible(false)
    return true
  }

  // Countdown visual del bully
  const remaining = Math.ceil((bully.releaseAt - time) / 1000)
  centerText.setText(remaining > 0 ? `Bully — ${remaining}` : 'Bully — ¡Ya!').setVisible(true)
  return false
}

export function refreshKickoffVisuals(scenePlayers: Player[], controlledPlayerIndex: number, ball: Phaser.GameObjects.Arc, ballCarrierId: string | null, timeNow: number) {
  updateVisuals(scenePlayers, getControlledPlayer(scenePlayers, controlledPlayerIndex), ball, ballCarrierId, timeNow)
}
