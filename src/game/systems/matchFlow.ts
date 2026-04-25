import * as Phaser from 'phaser'
import { BULLY_SETUP_MS, DIRECT_FREE_HIT_SPOT_OFFSET, FOUL_SETUP_MS, GAME_HEIGHT, GAME_WIDTH, GOAL_LINE_OFFSET, GOAL_NET_HOLD_X } from '../constants'
import { getFormation } from '../formation'
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
  message: string
  players: Player[]
  ball: Phaser.GameObjects.Arc
}) {
  const { message, players, ball } = options
  const leftGoalLineX = 70 + GOAL_LINE_OFFSET
  const rightGoalLineX = 70 + (GAME_WIDTH - 140) - GOAL_LINE_OFFSET

  if (message.includes('azul')) {
    ball.setPosition(rightGoalLineX + GOAL_NET_HOLD_X, Phaser.Math.Clamp(ball.y, GAME_HEIGHT / 2 - 54, GAME_HEIGHT / 2 + 54))
  } else {
    ball.setPosition(leftGoalLineX - GOAL_NET_HOLD_X, Phaser.Math.Clamp(ball.y, GAME_HEIGHT / 2 - 54, GAME_HEIGHT / 2 + 54))
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
  const restartY = GAME_HEIGHT / 2

  ball.setPosition(restartX, restartY)

  for (const player of players) {
    player.velocity = { x: 0, y: 0 }
  }

  if (taker) {
    taker.pos = { x: restartX + (taker.side === 'left' ? -18 : 18), y: restartY }
    taker.facing = { x: taker.side === 'left' ? 1 : -1, y: 0 }
  }

  if (isDirect) {
    for (const player of players) {
      if (player.role !== 'goalie' && player.id !== taker?.id) {
        player.pos = { x: player.home.x, y: player.home.y }
        player.velocity = { x: 0, y: 0 }
      }
    }

    const defendingGoalie = players.find((player) => player.role === 'goalie' && player.team !== taker?.team)
    if (defendingGoalie) {
      defendingGoalie.pos = { x: defendingGoalie.home.x, y: GAME_HEIGHT / 2 }
      defendingGoalie.velocity = { x: 0, y: 0 }
      defendingGoalie.facing = { x: defendingGoalie.side === 'left' ? 1 : -1, y: 0 }
    }
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
  const offset = 26

  if (blue) {
    blue.pos = { x: x - offset, y }
    blue.facing = { x: 1, y: 0 }
  }

  if (red) {
    red.pos = { x: x + offset, y }
    red.facing = { x: -1, y: 0 }
  }

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

export function updateFoulRestartState(options: {
  time: number
  activeFoulRestart: ActiveFoulRestart | null
  players: Player[]
  ball: Phaser.GameObjects.Arc
  controlledPlayerIndex: number
  centerText: Phaser.GameObjects.Text
  passJustDown: boolean
  shootJustDown: boolean
}) {
  const { time, activeFoulRestart: foul, players, ball, controlledPlayerIndex, centerText, passJustDown, shootJustDown } = options
  if (!foul) return null

  const taker = findPlayerById(players, foul.takerPlayerId)
  if (taker) {
    taker.pos = { x: foul.x + (taker.side === 'left' ? -18 : 18), y: foul.y }
    taker.velocity = { x: 0, y: 0 }
  }

  ball.setPosition(foul.x, foul.y)
  if (time < foul.readyAt) return { controlledPlayerIndex, taker, shouldPass: false, shouldShot: false, release: false }

  centerText.setText(foul.sanction === 'direct-free-hit' ? 'Falta directa, prepara el lanzamiento' : 'Falta, elige dirección y saca').setVisible(true)
  if (!taker) return { controlledPlayerIndex, taker: null, shouldPass: false, shouldShot: false, release: false }

  let nextControlledIndex = controlledPlayerIndex
  const controlled = getControlledPlayer(players, controlledPlayerIndex)
  if (controlled.id !== taker.id) {
    const options = players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
    const index = options.findIndex((player) => player.id === taker.id)
    if (index >= 0) nextControlledIndex = index
  }

  const shouldPass = foul.sanction === 'free-hit' && passJustDown
  const shouldShot = shootJustDown || shouldPass
  return {
    controlledPlayerIndex: nextControlledIndex,
    taker,
    shouldPass,
    shouldShot,
    release: shouldPass || shouldShot,
  }
}

export function updateBullyState(options: {
  time: number
  activeBully: ActiveBully | null
  players: Player[]
  ball: Phaser.GameObjects.Arc
  centerText: Phaser.GameObjects.Text
}) {
  const { time, activeBully: bully, players, ball, centerText } = options
  if (!bully) return false

  const blue = findPlayerById(players, bully.bluePlayerId)
  const red = findPlayerById(players, bully.redPlayerId)
  const offset = 26

  if (blue) {
    blue.pos = { x: bully.x - offset, y: bully.y }
    blue.velocity = { x: 0, y: 0 }
    blue.facing = { x: 1, y: 0 }
  }

  if (red) {
    red.pos = { x: bully.x + offset, y: bully.y }
    red.velocity = { x: 0, y: 0 }
    red.facing = { x: -1, y: 0 }
  }

  ball.setPosition(bully.x, bully.y)
  if (time >= bully.releaseAt) {
    centerText.setVisible(false)
    return true
  }

  return false
}

export function refreshKickoffVisuals(scenePlayers: Player[], controlledPlayerIndex: number, ball: Phaser.GameObjects.Arc, ballCarrierId: string | null) {
  updateVisuals(scenePlayers, getControlledPlayer(scenePlayers, controlledPlayerIndex), ball, ballCarrierId)
}
