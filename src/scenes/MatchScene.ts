import * as Phaser from 'phaser'
import {
  BALL_CAPTURE_SHIELD_DISTANCE,
  BALL_FREEZE_AFTER_GOALIE_RELEASE_MS,
  BULLY_SETUP_MS,
  FOUL_CHANCE_ON_STEAL,
  GAME_HEIGHT,
  GAME_WIDTH,
  GOALIE_DISTRIBUTION_POWER,
  GOALIE_RADIUS,
  GOALIE_RELEASE_COOLDOWN_MS,
  GOALIE_RELEASE_DISTANCE,
  MATCH_DURATION,
  PASS_POWER,
  POSSESSION_RELEASE_COOLDOWN_MS,
  PLAYER_ACCEL,
  PLAYER_RADIUS,
  SHOT_POWER,
  STEAL_RELEASE_POWER,
  STUCK_BALL_TIMEOUT_MS,
} from '../game/constants'
import { createBall } from '../game/entities/createBall'
import { createPlayer } from '../game/entities/createPlayer'
import { getFormation } from '../game/formation'
import { drawRink } from '../game/render/drawRink'
import {
  checkGoal,
  checkLooseBallTackle,
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
  updateBallPosition,
} from '../game/systems/ball'
import { clearGoalieCatch, getAimingDirection, markGoalieCaughtBall, shouldGoaliePass, updateFieldPlayerAI, updateGoalieAI, shouldAIShoot } from '../game/systems/ai'
import { applySkating, resolvePlayerSpacing } from '../game/systems/movement'
import {
  findPlayerById,
  getControlledPlayer,
  selectBestControlledPlayer,
} from '../game/systems/playerHelpers'
import { getStickTip, updateVisuals } from '../game/systems/visuals'
import type { ActiveBully, Player, TeamColor, Vector } from '../game/types'
import { createHud } from '../game/ui/createHud'
import { createRuleState, registerBully, registerStealFoul, type RuleState } from '../game/systems/rules'
import { getRoleName } from '../game/utils'

/**
 * Escena principal del partido.
 *
 * Aquí se orquesta el ciclo general del match, pero la lógica detallada vive
 * en systems/ para que el crecimiento del prototipo no concentre todo en un
 * único archivo inmanejable.
 */
export class MatchScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private shootKey!: Phaser.Input.Keyboard.Key
  private passKey!: Phaser.Input.Keyboard.Key
  private switchKey!: Phaser.Input.Keyboard.Key
  private ball!: Phaser.GameObjects.Arc
  private ballVelocity: Vector = { x: 0, y: 0 }
  private ballCarrierId: string | null = null
  private players: Player[] = []
  private controlledPlayerIndex = 0
  private hudText!: Phaser.GameObjects.Text
  private subHudText!: Phaser.GameObjects.Text
  private centerText!: Phaser.GameObjects.Text
  private blueScore = 0
  private redScore = 0
  private remainingSeconds = MATCH_DURATION
  private matchEnded = false
  private restartAt = 0
  private lastTouch: TeamColor = 'blue'
  private ruleState: RuleState = createRuleState()
  private lastLooseBallTime = 0
  private ballIgnoreContactsUntil = 0
  private activeBully: ActiveBully | null = null
  private stuckCarrierStartTime = 0
  private stuckCarrierOrigin: Vector | null = null

  constructor() {
    super('match')
  }

  /** Inicializa escena, entidades, HUD y estado de saque inicial. */
  create() {
    this.cameras.main.setBackgroundColor('#08111b')
    drawRink(this)
    this.createInput()
    this.createTeams()
    this.ball = createBall(this)
    const hud = createHud(this)
    this.hudText = hud.hudText
    this.subHudText = hud.subHudText
    this.centerText = hud.centerText
    this.resetKickoff('blue')

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.matchEnded || this.restartAt > 0) return
        this.remainingSeconds = Math.max(0, this.remainingSeconds - 1)
        if (this.remainingSeconds === 0) this.finishMatch()
      },
    })

    this.updateHud()
  }

  /**
   * Tick principal del partido.
   *
   * Orden importante:
   * 1. input y decisiones,
   * 2. movimiento,
   * 3. balón/posesión/contactos,
   * 4. visuales,
   * 5. reglas de gol y HUD.
   */
  update(time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.033)

    if (this.matchEnded) {
      if (Phaser.Input.Keyboard.JustDown(this.shootKey)) this.scene.restart()
      return
    }

    if (this.restartAt > 0 && time >= this.restartAt) {
      this.restartAt = 0
      this.centerText.setVisible(false)
      this.resetKickoff(this.lastTouch === 'blue' ? 'red' : 'blue')
    }

    if (this.restartAt > 0) return

    if (this.activeBully) {
      this.updateBullyState(time)
      updateVisuals(this.players, getControlledPlayer(this.players, this.controlledPlayerIndex), this.ball, this.ballCarrierId)
      this.updateHud()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.switchKey)) {
      this.controlledPlayerIndex = selectBestControlledPlayer(this.players, this.controlledPlayerIndex, this.ballCarrierId, this.ball.x, this.ball.y)
    }

    this.updateControlledPlayer(dt)
    this.updateTeamAI(dt)
    resolvePlayerSpacing(this.players)
    this.ballVelocity = updateBallPosition(this.ball, this.ballVelocity, this.ballCarrierId, this.players, dt)
    this.handleGoalieSave()
    this.handleBallControl(time)
    this.handleLooseBallContacts()
    this.handleRuleRestarts()
    updateVisuals(this.players, getControlledPlayer(this.players, this.controlledPlayerIndex), this.ball, this.ballCarrierId)
    this.checkGoalState(time)
    this.updateHud()
  }

  private createInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.passKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.switchKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
  }

  private createTeams() {
    const blueLayout = getFormation('left')
    const redLayout = getFormation('right')

    this.players = [
      ...blueLayout.map((slot, index) => createPlayer(this, `blue-${index}`, 'blue', 'left', slot.role, slot.x, slot.y, 0x4da3ff, index !== 0)),
      ...redLayout.map((slot, index) => createPlayer(this, `red-${index}`, 'red', 'right', slot.role, slot.x, slot.y, 0xff5d6c, false)),
    ]
  }

  /** Gestiona el jugador humano actualmente seleccionado. */
  private updateControlledPlayer(dt: number) {
    const player = getControlledPlayer(this.players, this.controlledPlayerIndex)
    let inputX = 0
    let inputY = 0

    if (this.cursors.left.isDown || this.wasd.A.isDown) inputX -= 1
    if (this.cursors.right.isDown || this.wasd.D.isDown) inputX += 1
    if (this.cursors.up.isDown || this.wasd.W.isDown) inputY -= 1
    if (this.cursors.down.isDown || this.wasd.S.isDown) inputY += 1

    const len = Math.hypot(inputX, inputY)
    if (len > 0) {
      player.velocity.x += (inputX / len) * PLAYER_ACCEL * dt
      player.velocity.y += (inputY / len) * PLAYER_ACCEL * dt
      player.facing = { x: inputX / len, y: inputY / len }
    }

    applySkating(player, dt)

    if (Phaser.Input.Keyboard.JustDown(this.passKey)) this.tryPass(player)
    if (Phaser.Input.Keyboard.JustDown(this.shootKey)) this.tryShot(player)
  }

  /**
   * Actualiza toda la IA no controlada por el usuario.
   *
   * Ahora mismo la IA sigue siendo simple, pero ya está preparada para ir
   * creciendo como sistema separado sin inflar la escena.
   */
  private updateTeamAI(dt: number) {
    const controlled = getControlledPlayer(this.players, this.controlledPlayerIndex)

    for (const player of this.players) {
      if (player.id === controlled.id) continue

      if (player.role === 'goalie') updateGoalieAI(player, this.ball.x, this.ball.y, dt, this.time.now)
      else updateFieldPlayerAI(this.players, player, this.ball.x, this.ball.y, this.ballCarrierId, dt)

      applySkating(player, dt)

      const hasBall = this.ballCarrierId === player.id
      const distToBall = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)

      if (player.team === 'red') {
        if (hasBall) {
          if (player.role === 'goalie' && shouldGoaliePass(player, this.time.now)) {
            this.tryPass(player)
          } else if (shouldAIShoot(player)) {
            this.tryShot(player)
          } else if (Math.random() < 0.015) {
            this.tryPass(player)
          }
        } else if (distToBall < 34 && this.ballCarrierId === null) {
          this.claimBallFor(player)
        }
      } else if (player.role === 'goalie' && hasBall && shouldGoaliePass(player, this.time.now)) {
        this.tryPass(player)
      } else if (!hasBall && distToBall < 34 && this.ballCarrierId === null) {
        this.claimBallFor(player)
      }
    }
  }

  /**
   * Permite que los porteros intervengan de forma más creíble ante tiros cercanos.
   */
  private handleGoalieSave() {
    if (this.ballCarrierId) return

    const result = tryGoalieSave(this.ball, this.ballVelocity, this.players)
    if (!result.saved) return

    this.ballVelocity = result.ballVelocity
    if (result.claimedBy) {
      this.ballCarrierId = result.claimedBy
      const goalie = findPlayerById(this.players, result.claimedBy)
      if (goalie) {
        this.lastTouch = goalie.team
        if (goalie.role === 'goalie') markGoalieCaughtBall(goalie, this.time.now)
      }
    }
  }

  /**
   * Resuelve la posesión de la bola.
   *
   * Si hay portador, comprobamos presión rival y posible pérdida.
   * Si no lo hay, se intenta asignar la posesión al jugador válido más cercano.
   */
  private handleBallControl(time: number) {
    if (this.ballCarrierId) {
      const carrier = findPlayerById(this.players, this.ballCarrierId)
      if (!carrier) {
        this.ballCarrierId = null
        this.stuckCarrierStartTime = 0
        this.stuckCarrierOrigin = null
        return
      }

      const nearbyRivals = this.players.filter((player) => {
        if (player.team === carrier.team) return false
        return Phaser.Math.Distance.Between(player.pos.x, player.pos.y, carrier.pos.x, carrier.pos.y) < 54
      })
      const carrierTravel = this.stuckCarrierOrigin
        ? Phaser.Math.Distance.Between(carrier.pos.x, carrier.pos.y, this.stuckCarrierOrigin.x, this.stuckCarrierOrigin.y)
        : 0
      const ballSpeed = Math.hypot(this.ballVelocity.x, this.ballVelocity.y)

      if (nearbyRivals.length > 0 && carrierTravel < 42 && ballSpeed < 45) {
        if (this.stuckCarrierStartTime === 0) {
          this.stuckCarrierStartTime = time
          this.stuckCarrierOrigin = { x: carrier.pos.x, y: carrier.pos.y }
        } else if (time - this.stuckCarrierStartTime >= STUCK_BALL_TIMEOUT_MS) {
          const rival = nearbyRivals.sort((a, b) => {
            const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, carrier.pos.x, carrier.pos.y)
            const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, carrier.pos.x, carrier.pos.y)
            return da - db
          })[0]

          registerBully(this.ruleState, carrier.pos.x, carrier.pos.y, carrier.team === 'blue'
            ? { bluePlayerId: carrier.id, redPlayerId: rival.id }
            : { bluePlayerId: rival.id, redPlayerId: carrier.id })

          this.ballCarrierId = null
          this.ballVelocity = { x: 0, y: 0 }
          this.stuckCarrierStartTime = 0
          this.stuckCarrierOrigin = null
          return
        }
      } else {
        this.stuckCarrierStartTime = 0
        this.stuckCarrierOrigin = this.ballCarrierId ? { x: carrier.pos.x, y: carrier.pos.y } : null
      }

      const thief = this.getClosestRivalToCarrier(carrier)
      if (thief && checkLooseBallTackle(this.players, carrier)) {
        if (Math.random() < FOUL_CHANCE_ON_STEAL) {
          registerStealFoul(this.ruleState, thief, carrier, carrier.pos.x, carrier.pos.y)
          this.ballCarrierId = null
          this.ballVelocity = { x: 0, y: 0 }
          return
        }

        const stealDirection = getAimingDirection(thief)
        const released = releaseBall(this.ball, this.players, this.ballCarrierId, stealDirection, STEAL_RELEASE_POWER, this.time.now, POSSESSION_RELEASE_COOLDOWN_MS)
        this.ballCarrierId = thief.id
        this.ballVelocity = released.ballVelocity
        this.lastTouch = thief.team
      }
      return
    }

    this.stuckCarrierStartTime = 0
    this.stuckCarrierOrigin = null

    if (time < this.ballIgnoreContactsUntil) return

    const candidates = [...this.players].sort((a, b) => {
      const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, this.ball.x, this.ball.y)
      const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, this.ball.x, this.ball.y)
      return da - db
    })

    let claimed = false
    for (const player of candidates) {
      this.ballVelocity = magnetBallTowardsPlayer(this.ball, this.ballVelocity, player)
      if (this.claimBallFor(player)) {
        claimed = true
        break
      }
    }

    if (!claimed) {
      const bullySituation = shouldCallBully(this.players, this.ball, this.ballVelocity)
      if (bullySituation) {
        if (this.lastLooseBallTime === 0) this.lastLooseBallTime = time
        if (time - this.lastLooseBallTime > STUCK_BALL_TIMEOUT_MS) {
          const candidate = getBullyCandidate(this.players, this.ball, this.ballVelocity)
          if (candidate) {
            registerBully(this.ruleState, candidate.x, candidate.y, {
              bluePlayerId: candidate.bluePlayerId,
              redPlayerId: candidate.redPlayerId,
            })
          }
          this.lastLooseBallTime = 0
        }
      } else {
        this.lastLooseBallTime = 0
      }
    } else {
      this.lastLooseBallTime = 0
    }
  }

  /**
   * Aplica micro-contactos cuando la bola va suelta.
   *
   * Esto evita que el balón parezca totalmente desconectado de los jugadores
   * incluso antes de entrar en posesión formal.
   */
  private handleLooseBallContacts() {
    if (this.ballCarrierId) return
    if (this.time.now < this.ballIgnoreContactsUntil) return

    for (const player of this.players) {
      const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      const bodyDistance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
      const stickTip = getStickTip(player)
      const stickDistance = Phaser.Math.Distance.Between(stickTip.x, stickTip.y, this.ball.x, this.ball.y)
      const captureShield = player.role === 'goalie' ? BALL_CAPTURE_SHIELD_DISTANCE - 8 : BALL_CAPTURE_SHIELD_DISTANCE

      if (bodyDistance < captureShield || stickDistance < captureShield - 10) continue

      if (bodyDistance < radius + 12) {
        const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
        this.ballVelocity = kickBall(this.ballVelocity, angle, player.role === 'goalie' ? 70 : 90)
        this.lastTouch = player.team
      }

      if (stickDistance < 14) {
        const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
        this.ballVelocity = kickBall(this.ballVelocity, angle, player.role === 'goalie' ? 55 : 70)
        this.lastTouch = player.team
      }
    }
  }

  /** Intenta asignar la posesión a un jugador concreto y sincroniza el estado local. */
  private claimBallFor(player: Player) {
    const result = tryClaimBall(this.ball, player, this.ballCarrierId, this.ballVelocity, this.controlledPlayerIndex, this.players, this.time.now)
    if (!result.claimed) return false

    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    this.controlledPlayerIndex = result.controlledPlayerIndex
    this.lastTouch = player.team
    if (player.role === 'goalie') markGoalieCaughtBall(player, this.time.now)
    return true
  }

  /** Ejecuta un pase hacia el mejor compañero detectado por heurística simple. */
  private tryPass(player: Player) {
    if (this.ballCarrierId !== player.id) return
    const isGoalie = player.role === 'goalie'
    const direction = isGoalie
      ? getGoalieDistributionDirection(this.players, player)
      : getAssistedPassDirection(this.players, player, getAimingDirection(player))
    const released = releaseBall(
      this.ball,
      this.players,
      this.ballCarrierId,
      direction,
      isGoalie ? GOALIE_DISTRIBUTION_POWER : PASS_POWER,
      this.time.now,
      isGoalie ? GOALIE_RELEASE_COOLDOWN_MS : POSSESSION_RELEASE_COOLDOWN_MS,
      isGoalie ? GOALIE_RELEASE_DISTANCE : undefined,
    )

    if (isGoalie) {
      const target = getGoalieDistributionTarget(this.players, player)
      if (target) {
        const lead = 28
        this.ball.setPosition(
          player.pos.x + direction.x * GOALIE_RELEASE_DISTANCE + (target.pos.x - player.pos.x) * 0.18 + direction.x * lead,
          player.pos.y + direction.y * GOALIE_RELEASE_DISTANCE + (target.pos.y - player.pos.y) * 0.18 + direction.y * lead,
        )
      }
    }
    this.ballCarrierId = released.ballCarrierId
    this.ballVelocity = released.ballVelocity
    this.lastTouch = player.team
    if (player.role === 'goalie') {
      clearGoalieCatch(player)
      player.ignoreBallUntil = this.time.now + GOALIE_RELEASE_COOLDOWN_MS
      player.goalieRecoverUntil = this.time.now + GOALIE_RELEASE_COOLDOWN_MS
      this.ballIgnoreContactsUntil = this.time.now + BALL_FREEZE_AFTER_GOALIE_RELEASE_MS
    }
  }

  /** Ejecuta un tiro hacia una zona de portería con pequeña variación vertical. */
  private tryShot(player: Player) {
    if (this.ballCarrierId !== player.id) return

    const direction = getAssistedShotDirection(player, getAimingDirection(player))
    const released = releaseBall(this.ball, this.players, this.ballCarrierId, direction, SHOT_POWER, this.time.now, POSSESSION_RELEASE_COOLDOWN_MS)
    this.ballCarrierId = released.ballCarrierId
    this.ballVelocity = released.ballVelocity
    this.lastTouch = player.team
    if (player.role === 'goalie') clearGoalieCatch(player)
  }

  private getClosestRivalToCarrier(carrier: Player) {
    return this.players
      .filter((player) => player.team !== carrier.team)
      .sort((a, b) => {
        const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, carrier.pos.x, carrier.pos.y)
        const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, carrier.pos.x, carrier.pos.y)
        return da - db
      })[0] ?? null
  }

  /** Aplica reinicios simples de falta y bully. */
  private handleRuleRestarts() {
    if (this.ruleState.pendingFoul) {
      const foul = this.ruleState.pendingFoul
      this.centerText.setText(foul.message).setVisible(true)
      this.ball.setPosition(foul.restartX, foul.restartY)
      this.ballVelocity = { x: 0, y: 0 }
      this.ballCarrierId = null
      this.ruleState.pendingFoul = null
      this.restartAt = this.time.now + 900
      return
    }

    if (this.ruleState.pendingBully) {
      const bully = this.ruleState.pendingBully
      this.centerText.setText(bully.message).setVisible(true)
      this.startBully(bully.x, bully.y, bully.participants.bluePlayerId, bully.participants.redPlayerId)
      this.ruleState.pendingBully = null
    }
  }

  /** Comprueba si la bola ha cruzado la portería y actualiza marcador. */
  private checkGoalState(time: number) {
    const scorer = checkGoal(this.ball)
    if (!scorer) return

    if (scorer === 'red') {
      this.redScore += 1
      this.onGoal('¡Gol rojo!', time)
    } else {
      this.blueScore += 1
      this.onGoal('¡Gol azul!', time)
    }
  }

  private onGoal(message: string, time: number) {
    this.centerText.setText(message).setVisible(true)
    this.restartAt = time + 1800
    this.ballCarrierId = null
    this.ballVelocity = { x: 0, y: 0 }

    if (message.includes('azul')) {
      this.ball.setPosition(GAME_WIDTH - 62, GAME_HEIGHT / 2)
    } else {
      this.ball.setPosition(62, GAME_HEIGHT / 2)
    }

    for (const player of this.players) {
      player.velocity = { x: 0, y: 0 }
    }
  }

  /** Recoloca a todos los jugadores y reinicia la bola tras gol o al comienzo. */
  private resetKickoff(team: TeamColor) {
    const blue = getFormation('left')
    const red = getFormation('right')

    for (const player of this.players) {
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

    this.ball.setPosition(GAME_WIDTH / 2 + (team === 'blue' ? -22 : 22), GAME_HEIGHT / 2)
    this.ballCarrierId = null
    this.ballVelocity = { x: 0, y: 0 }
    this.lastTouch = team
    this.controlledPlayerIndex = 0
    this.lastLooseBallTime = 0
    this.ballIgnoreContactsUntil = 0
    this.activeBully = null
    this.stuckCarrierStartTime = 0
    this.stuckCarrierOrigin = null
    this.ruleState = createRuleState()
    updateVisuals(this.players, getControlledPlayer(this.players, this.controlledPlayerIndex), this.ball, this.ballCarrierId)
  }

  private startBully(x: number, y: number, bluePlayerId: string, redPlayerId: string) {
    this.ball.setPosition(x, y)
    this.ballVelocity = { x: 0, y: 0 }
    this.ballCarrierId = null
    this.ballIgnoreContactsUntil = this.time.now + BULLY_SETUP_MS

    for (const player of this.players) {
      player.velocity = { x: 0, y: 0 }
    }

    const blue = findPlayerById(this.players, bluePlayerId)
    const red = findPlayerById(this.players, redPlayerId)
    const offset = 26

    if (blue) {
      blue.pos = { x: x - offset, y }
      blue.facing = { x: 1, y: 0 }
    }

    if (red) {
      red.pos = { x: x + offset, y }
      red.facing = { x: -1, y: 0 }
    }

    this.activeBully = {
      bluePlayerId,
      redPlayerId,
      x,
      y,
      releaseAt: this.time.now + BULLY_SETUP_MS,
    }
  }

  private updateBullyState(time: number) {
    const bully = this.activeBully
    if (!bully) return

    const blue = findPlayerById(this.players, bully.bluePlayerId)
    const red = findPlayerById(this.players, bully.redPlayerId)
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

    this.ball.setPosition(bully.x, bully.y)
    this.ballVelocity = { x: 0, y: 0 }
    this.ballCarrierId = null

    if (time >= bully.releaseAt) {
      this.centerText.setVisible(false)
      this.ballIgnoreContactsUntil = 0
      this.activeBully = null
    }
  }

  private finishMatch() {
    this.matchEnded = true
    const result = this.blueScore === this.redScore ? 'Empate' : this.blueScore > this.redScore ? 'Gana azul' : 'Gana rojo'
    this.centerText.setText(`${result}\nPulsa ESPACIO para reiniciar`).setVisible(true)
  }

  /** Refresca marcador, tiempo y ayuda contextual del jugador controlado. */
  private updateHud() {
    const minutes = Math.floor(this.remainingSeconds / 60)
    const seconds = this.remainingSeconds % 60
    this.hudText.setText(`Azul ${this.blueScore}  -  ${this.redScore} Rojo   |   ${minutes}:${seconds.toString().padStart(2, '0')}`)
    const controlled = getControlledPlayer(this.players, this.controlledPlayerIndex)
    this.subHudText.setText(`Controlas: ${getRoleName(controlled.role)} azul | WASD mover | X pase | ESPACIO tiro | SHIFT cambia jugador`)
  }
}
