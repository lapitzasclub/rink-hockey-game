import * as Phaser from 'phaser'
import {
  BALL_CAPTURE_SHIELD_DISTANCE,
  BALL_FREEZE_AFTER_GOALIE_RELEASE_MS,
  GOALIE_DISTRIBUTION_POWER,
  GOALIE_RADIUS,
  GOALIE_RELEASE_COOLDOWN_MS,
  GOALIE_RELEASE_DISTANCE,
  MANUAL_STEAL_FOUL_CHANCE,
  MANUAL_STEAL_RANGE,
  MANUAL_STEAL_SUCCESS_CHANCE,
  PASS_POWER,
  PLAYER_RADIUS,
  POSSESSION_RELEASE_COOLDOWN_MS,
  SHOT_POWER,
  STEAL_RELEASE_POWER,
  STUCK_BALL_TIMEOUT_MS,
} from '../constants'
import {
  getAssistedPassDirection,
  getAssistedShotDirection,
  getBullyCandidate,
  getGoalieDistributionDirection,
  getGoalieDistributionTarget,
  kickBall,
  magnetBallTowardsPlayer,
  releaseBall,
  shouldCallBully,
  tryClaimBall,
  tryGoalieSave,
} from './ball'
import { clearGoalieCatch, getAimingDirection, markGoalieCaughtBall } from './ai'
import { findPlayerById } from './playerHelpers'
import { getStickTip } from './visuals'
import { registerBully, registerStealFoul, type RuleState } from './rules'
import type { Player, Vector } from '../types'

export function handleGoalieSaveAction(options: {
  ball: Phaser.GameObjects.Arc
  ballVelocity: Vector
  players: Player[]
  ballCarrierId: string | null
  timeNow: number
}) {
  if (options.ballCarrierId) return null
  const result = tryGoalieSave(options.ball, options.ballVelocity, options.players)
  if (!result.saved) return null

  let lastTouch: Player['team'] | null = null
  if (result.claimedBy) {
    const goalie = findPlayerById(options.players, result.claimedBy)
    if (goalie) {
      lastTouch = goalie.team
      if (goalie.role === 'goalie') markGoalieCaughtBall(goalie, options.timeNow)
    }
  }

  return {
    ballVelocity: result.ballVelocity,
    ballCarrierId: result.claimedBy ?? null,
    lastTouch,
  }
}

export function handleBallControlAction(options: {
  time: number
  ball: Phaser.GameObjects.Arc
  ballVelocity: Vector
  ballCarrierId: string | null
  players: Player[]
  controlledPlayerIndex: number
  ruleState: RuleState
  lastLooseBallTime: number
  ballIgnoreContactsUntil: number
  stuckCarrierStartTime: number
  stuckCarrierOrigin: Vector | null
}) {
  const state = {
    ballCarrierId: options.ballCarrierId,
    ballVelocity: options.ballVelocity,
    controlledPlayerIndex: options.controlledPlayerIndex,
    lastLooseBallTime: options.lastLooseBallTime,
    stuckCarrierStartTime: options.stuckCarrierStartTime,
    stuckCarrierOrigin: options.stuckCarrierOrigin,
    lastTouch: null as Player['team'] | null,
  }

  if (state.ballCarrierId) {
    const carrier = findPlayerById(options.players, state.ballCarrierId)
    if (!carrier) {
      state.ballCarrierId = null
      state.stuckCarrierStartTime = 0
      state.stuckCarrierOrigin = null
      return state
    }

    const nearbyRivals = options.players.filter((player) => player.team !== carrier.team && Phaser.Math.Distance.Between(player.pos.x, player.pos.y, carrier.pos.x, carrier.pos.y) < 54)
    const carrierTravel = state.stuckCarrierOrigin ? Phaser.Math.Distance.Between(carrier.pos.x, carrier.pos.y, state.stuckCarrierOrigin.x, state.stuckCarrierOrigin.y) : 0
    const ballSpeed = Math.hypot(state.ballVelocity.x, state.ballVelocity.y)

    if (nearbyRivals.length > 0 && carrierTravel < 42 && ballSpeed < 45) {
      if (state.stuckCarrierStartTime === 0) {
        state.stuckCarrierStartTime = options.time
        state.stuckCarrierOrigin = { x: carrier.pos.x, y: carrier.pos.y }
      } else if (options.time - state.stuckCarrierStartTime >= STUCK_BALL_TIMEOUT_MS) {
        const rival = nearbyRivals.sort((a, b) => Phaser.Math.Distance.Between(a.pos.x, a.pos.y, carrier.pos.x, carrier.pos.y) - Phaser.Math.Distance.Between(b.pos.x, b.pos.y, carrier.pos.x, carrier.pos.y))[0]
        registerBully(options.ruleState, carrier.pos.x, carrier.pos.y, carrier.team === 'blue' ? { bluePlayerId: carrier.id, redPlayerId: rival.id } : { bluePlayerId: rival.id, redPlayerId: carrier.id })
        state.ballCarrierId = null
        state.ballVelocity = { x: 0, y: 0 }
        state.stuckCarrierStartTime = 0
        state.stuckCarrierOrigin = null
      }
    } else {
      state.stuckCarrierStartTime = 0
      state.stuckCarrierOrigin = state.ballCarrierId ? { x: carrier.pos.x, y: carrier.pos.y } : null
    }

    return state
  }

  state.stuckCarrierStartTime = 0
  state.stuckCarrierOrigin = null
  if (options.time < options.ballIgnoreContactsUntil) return state

  const candidates = [...options.players].sort((a, b) => Phaser.Math.Distance.Between(a.pos.x, a.pos.y, options.ball.x, options.ball.y) - Phaser.Math.Distance.Between(b.pos.x, b.pos.y, options.ball.x, options.ball.y))
  let claimed = false

  for (const player of candidates) {
    state.ballVelocity = magnetBallTowardsPlayer(options.ball, state.ballVelocity, player)
    const result = tryClaimBall(options.ball, player, state.ballCarrierId, state.ballVelocity, state.controlledPlayerIndex, options.players, options.time)
    if (!result.claimed) continue
    state.ballCarrierId = result.ballCarrierId
    state.ballVelocity = result.ballVelocity
    state.controlledPlayerIndex = result.controlledPlayerIndex
    state.lastTouch = player.team
    if (player.role === 'goalie') markGoalieCaughtBall(player, options.time)
    claimed = true
    break
  }

  if (!claimed) {
    const bullySituation = shouldCallBully(options.players, options.ball, state.ballVelocity)
    if (bullySituation) {
      if (state.lastLooseBallTime === 0) state.lastLooseBallTime = options.time
      if (options.time - state.lastLooseBallTime > STUCK_BALL_TIMEOUT_MS) {
        const candidate = getBullyCandidate(options.players, options.ball, state.ballVelocity)
        if (candidate) registerBully(options.ruleState, candidate.x, candidate.y, { bluePlayerId: candidate.bluePlayerId, redPlayerId: candidate.redPlayerId })
        state.lastLooseBallTime = 0
      }
    } else {
      state.lastLooseBallTime = 0
    }
  } else {
    state.lastLooseBallTime = 0
  }

  return state
}

export function handleLooseBallContactsAction(options: {
  ballCarrierId: string | null
  timeNow: number
  ballIgnoreContactsUntil: number
  players: Player[]
  ball: Phaser.GameObjects.Arc
  ballVelocity: Vector
  lastTouch: Player['team']
}) {
  if (options.ballCarrierId || options.timeNow < options.ballIgnoreContactsUntil) return null
  let nextVelocity = options.ballVelocity
  let nextLastTouch = options.lastTouch

  for (const player of options.players) {
    const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
    const bodyDistance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, options.ball.x, options.ball.y)
    const stickTip = getStickTip(player)
    const stickDistance = Phaser.Math.Distance.Between(stickTip.x, stickTip.y, options.ball.x, options.ball.y)
    const captureShield = player.role === 'goalie' ? BALL_CAPTURE_SHIELD_DISTANCE - 8 : BALL_CAPTURE_SHIELD_DISTANCE

    if (bodyDistance < captureShield || stickDistance < captureShield - 10) continue
    if (bodyDistance < radius + 12) {
      const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, options.ball.x, options.ball.y)
      nextVelocity = kickBall(nextVelocity, angle, player.role === 'goalie' ? 70 : 90)
      nextLastTouch = player.team
    }
    if (stickDistance < 14) {
      const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, options.ball.x, options.ball.y)
      nextVelocity = kickBall(nextVelocity, angle, player.role === 'goalie' ? 55 : 70)
      nextLastTouch = player.team
    }
  }

  return { ballVelocity: nextVelocity, lastTouch: nextLastTouch }
}

export function tryPassAction(options: {
  player: Player
  ball: Phaser.GameObjects.Arc
  players: Player[]
  ballCarrierId: string | null
  timeNow: number
}) {
  if (options.ballCarrierId !== options.player.id) return null
  const isGoalie = options.player.role === 'goalie'
  const direction = isGoalie ? getGoalieDistributionDirection(options.players, options.player) : getAssistedPassDirection(options.players, options.player, getAimingDirection(options.player))
  const released = releaseBall(options.ball, options.players, options.ballCarrierId, direction, isGoalie ? GOALIE_DISTRIBUTION_POWER : PASS_POWER, options.timeNow, isGoalie ? GOALIE_RELEASE_COOLDOWN_MS : POSSESSION_RELEASE_COOLDOWN_MS, isGoalie ? GOALIE_RELEASE_DISTANCE : undefined)

  if (isGoalie) {
    const target = getGoalieDistributionTarget(options.players, options.player)
    if (target) {
      const lead = 28
      options.ball.setPosition(
        options.player.pos.x + direction.x * GOALIE_RELEASE_DISTANCE + (target.pos.x - options.player.pos.x) * 0.18 + direction.x * lead,
        options.player.pos.y + direction.y * GOALIE_RELEASE_DISTANCE + (target.pos.y - options.player.pos.y) * 0.18 + direction.y * lead,
      )
    }
  }

  const next = {
    ballCarrierId: released.ballCarrierId,
    ballVelocity: released.ballVelocity,
    lastTouch: options.player.team,
    ballIgnoreContactsUntil: 0,
  }

  if (options.player.role === 'goalie') {
    clearGoalieCatch(options.player)
    options.player.ignoreBallUntil = options.timeNow + GOALIE_RELEASE_COOLDOWN_MS
    options.player.goalieRecoverUntil = options.timeNow + GOALIE_RELEASE_COOLDOWN_MS
    next.ballIgnoreContactsUntil = options.timeNow + BALL_FREEZE_AFTER_GOALIE_RELEASE_MS
  }

  return next
}

export function tryShotAction(options: {
  player: Player
  ball: Phaser.GameObjects.Arc
  players: Player[]
  ballCarrierId: string | null
  timeNow: number
}) {
  if (options.ballCarrierId !== options.player.id) return null
  const direction = getAssistedShotDirection(options.player, getAimingDirection(options.player))
  const released = releaseBall(options.ball, options.players, options.ballCarrierId, direction, SHOT_POWER, options.timeNow, POSSESSION_RELEASE_COOLDOWN_MS)
  if (options.player.role === 'goalie') clearGoalieCatch(options.player)
  return {
    ballCarrierId: released.ballCarrierId,
    ballVelocity: released.ballVelocity,
    lastTouch: options.player.team,
  }
}

export function tryManualStealAction(options: {
  player: Player
  players: Player[]
  ball: Phaser.GameObjects.Arc
  ballCarrierId: string | null
  timeNow: number
  ruleState: RuleState
}) {
  const carrier = options.ballCarrierId ? findPlayerById(options.players, options.ballCarrierId) : null
  if (!carrier || carrier.team === options.player.team) return null
  const distance = Phaser.Math.Distance.Between(options.player.pos.x, options.player.pos.y, carrier.pos.x, carrier.pos.y)
  if (distance > MANUAL_STEAL_RANGE) return null

  const roll = Math.random()
  if (roll < MANUAL_STEAL_FOUL_CHANCE) {
    registerStealFoul(options.ruleState, options.player, carrier, carrier.pos.x, carrier.pos.y)
    return { ballCarrierId: null, ballVelocity: { x: 0, y: 0 } }
  }

  if (roll < MANUAL_STEAL_FOUL_CHANCE + MANUAL_STEAL_SUCCESS_CHANCE) {
    const stealDirection = getAimingDirection(options.player)
    const released = releaseBall(options.ball, options.players, options.ballCarrierId, stealDirection, STEAL_RELEASE_POWER, options.timeNow, POSSESSION_RELEASE_COOLDOWN_MS)
    return { ballCarrierId: options.player.id, ballVelocity: released.ballVelocity, lastTouch: options.player.team }
  }

  return null
}
