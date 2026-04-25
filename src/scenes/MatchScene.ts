import * as Phaser from 'phaser'
import {
  AI_STEAL_ATTEMPT_CHANCE,
  MANUAL_STEAL_RANGE,
  MATCH_DURATION,
} from '../game/constants'
import { createBall } from '../game/entities/createBall'
import { createPlayer } from '../game/entities/createPlayer'
import { getFormation } from '../game/formation'
import { drawRink } from '../game/render/drawRink'
import {
  updateBallPosition,
} from '../game/systems/ball'
import { shouldGoaliePass, updateFieldPlayerAI, updateGoalieAI, shouldAIShoot } from '../game/systems/ai'
import { resolvePlayerSpacing } from '../game/systems/movement'
import {
  findPlayerById,
  getControlledPlayer,
} from '../game/systems/playerHelpers'
import { updateVisuals } from '../game/systems/visuals'
import type { ActiveBully, ActiveFoulRestart, Player, TeamColor, Vector } from '../game/types'
import { createHud } from '../game/ui/createHud'
import { createTouchDebugText, updateMatchHud, updateTouchDebugText } from '../game/ui/matchHud'
import { createMobileJoystick } from '../game/input/mobileJoystick'
import { createRuleState, type RuleState } from '../game/systems/rules'
import {
  refreshKickoffVisuals,
  resetKickoffState,
  startBullyState,
  startFoulRestartState,
  updateBullyState as updateBullyPhase,
  updateFoulRestartState as updateFoulRestartPhase,
} from '../game/systems/matchFlow'
import {
  handleBallControlAction,
  handleGoalieSaveAction,
  handleLooseBallContactsAction,
  tryManualStealAction,
  tryPassAction,
  tryShotAction,
} from '../game/systems/matchActions'
import { tickMatchClock } from '../game/systems/matchClock'
import { updateControlledPlayerMotion, updateTeamAIPlayers } from '../game/systems/playerControl'
import { checkAndApplyGoal, handlePendingRestart, handleSpecialMatchStates, maybeSwitchControlledPlayer } from '../game/systems/sceneFlow'

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
  private isTouchDevice = window.matchMedia('(pointer: coarse)').matches
  private joystickInput = { x: 0, y: 0 }
  private mobileJoystick: { destroy(): void } | null = null
  private ball!: Phaser.GameObjects.Arc
  private ballVelocity: Vector = { x: 0, y: 0 }
  private ballCarrierId: string | null = null
  private players: Player[] = []
  private controlledPlayerIndex = 0
  private hudText!: Phaser.GameObjects.Text
  private subHudText!: Phaser.GameObjects.Text
  private centerText!: Phaser.GameObjects.Text
  private touchDebugText!: Phaser.GameObjects.Text
  private blueScore = 0
  private redScore = 0
  private remainingSeconds = MATCH_DURATION
  private currentPeriod = 1
  private matchEnded = false
  private restartAt = 0
  private lastTouch: TeamColor = 'blue'
  private ruleState: RuleState = createRuleState()
  private lastLooseBallTime = 0
  private ballIgnoreContactsUntil = 0
  private activeBully: ActiveBully | null = null
  private activeFoulRestart: ActiveFoulRestart | null = null
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
    this.touchDebugText = createTouchDebugText(this)
    this.mobileJoystick = createMobileJoystick({
      isTouchDevice: this.isTouchDevice,
      zone: document.getElementById('left-zone'),
      state: this.joystickInput,
    })
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.mobileJoystick?.destroy()
      this.mobileJoystick = null
    })
    this.resetKickoff('blue')

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        const next = tickMatchClock({
          matchEnded: this.matchEnded,
          restartAt: this.restartAt,
          remainingSeconds: this.remainingSeconds,
          currentPeriod: this.currentPeriod,
          ruleState: this.ruleState,
          centerText: this.centerText,
          timeNow: this.time.now,
          matchDuration: MATCH_DURATION,
          finishMatch: () => this.finishMatch(),
        })
        this.remainingSeconds = next.remainingSeconds
        this.currentPeriod = next.currentPeriod
        this.ruleState = next.ruleState
        if (typeof next.restartAt === 'number') this.restartAt = next.restartAt
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
    // joystickInput ya se actualiza por nipplejs

    if (this.matchEnded) {
      if (Phaser.Input.Keyboard.JustDown(this.shootKey)) this.scene.restart()
      return
    }

    this.restartAt = handlePendingRestart({
      time,
      restartAt: this.restartAt,
      centerText: this.centerText,
      lastTouch: this.lastTouch,
      resetKickoff: (team) => this.resetKickoff(team),
    })

    if (this.restartAt > 0) return

    if (handleSpecialMatchStates({
      activeBully: this.activeBully,
      activeFoulRestart: this.activeFoulRestart,
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      ball: this.ball,
      ballCarrierId: this.ballCarrierId,
      updateBullyState: () => this.updateBullyState(time),
      updateFoulRestartState: () => this.updateFoulRestartState(time),
      updateHud: () => this.updateHud(),
    })) return

    this.controlledPlayerIndex = maybeSwitchControlledPlayer({
      justDown: Phaser.Input.Keyboard.JustDown(this.switchKey),
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      ballCarrierId: this.ballCarrierId,
      ball: this.ball,
    })

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
    this.updateTouchDebug()
  }

  private updateTouchDebug() {
    updateTouchDebugText({
      text: this.touchDebugText,
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      joystickInput: this.joystickInput,
      isTouchDevice: this.isTouchDevice,
    })
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
    const player = updateControlledPlayerMotion({
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      cursors: this.cursors,
      wasd: this.wasd,
      joystickInput: this.joystickInput,
      isTouchDevice: this.isTouchDevice,
      dt,
    })

    if (Phaser.Input.Keyboard.JustDown(this.passKey)) this.tryPass(player)
    if (Phaser.Input.Keyboard.JustDown(this.shootKey)) {
      if (this.ballCarrierId === player.id) this.tryShot(player)
      else this.tryManualSteal(player)
    }
  }

  /**
   * Actualiza toda la IA no controlada por el usuario.
   *
   * Ahora mismo la IA sigue siendo simple, pero ya está preparada para ir
   * creciendo como sistema separado sin inflar la escena.
   */
  private updateTeamAI(dt: number) {
    updateTeamAIPlayers({
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      ball: this.ball,
      ballCarrierId: this.ballCarrierId,
      dt,
      timeNow: this.time.now,
      updateGoalieAI,
      updateFieldPlayerAI,
    })

    for (const player of this.players) {
      if (player.team === 'blue' && player.role !== 'goalie') continue
      const hasBall = this.ballCarrierId === player.id

      if (player.team === 'red') {
        if (hasBall) {
          if (player.role === 'goalie' && shouldGoaliePass(player, this.time.now)) this.tryPass(player)
          else if (shouldAIShoot(player)) this.tryShot(player)
          else if (Math.random() < 0.015) this.tryPass(player)
        } else if (this.ballCarrierId && findPlayerById(this.players, this.ballCarrierId)?.team !== player.team) {
          const carrier = findPlayerById(this.players, this.ballCarrierId)
          const inStealRange = carrier
            ? Phaser.Math.Distance.Between(player.pos.x, player.pos.y, carrier.pos.x, carrier.pos.y) <= MANUAL_STEAL_RANGE
            : false
          if (inStealRange && Math.random() < AI_STEAL_ATTEMPT_CHANCE) this.tryManualSteal(player)
        }
      } else if (player.role === 'goalie' && hasBall && shouldGoaliePass(player, this.time.now)) {
        this.tryPass(player)
      }
    }
  }

  /**
   * Permite que los porteros intervengan de forma más creíble ante tiros cercanos.
   */
  private handleGoalieSave() {
    const result = handleGoalieSaveAction({
      ball: this.ball,
      ballVelocity: this.ballVelocity,
      players: this.players,
      ballCarrierId: this.ballCarrierId,
      timeNow: this.time.now,
    })
    if (!result) return
    this.ballVelocity = result.ballVelocity
    this.ballCarrierId = result.ballCarrierId
    if (result.lastTouch) this.lastTouch = result.lastTouch
  }

  /**
   * Resuelve la posesión de la bola.
   *
   * Si hay portador, comprobamos presión rival y posible pérdida.
   * Si no lo hay, se intenta asignar la posesión al jugador válido más cercano.
   */
  private handleBallControl(time: number) {
    const result = handleBallControlAction({
      time,
      ball: this.ball,
      ballVelocity: this.ballVelocity,
      ballCarrierId: this.ballCarrierId,
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      ruleState: this.ruleState,
      lastLooseBallTime: this.lastLooseBallTime,
      ballIgnoreContactsUntil: this.ballIgnoreContactsUntil,
      stuckCarrierStartTime: this.stuckCarrierStartTime,
      stuckCarrierOrigin: this.stuckCarrierOrigin,
    })

    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    this.controlledPlayerIndex = result.controlledPlayerIndex
    this.lastLooseBallTime = result.lastLooseBallTime
    this.stuckCarrierStartTime = result.stuckCarrierStartTime
    this.stuckCarrierOrigin = result.stuckCarrierOrigin
    if (result.lastTouch) this.lastTouch = result.lastTouch
  }

  /**
   * Aplica micro-contactos cuando la bola va suelta.
   *
   * Esto evita que el balón parezca totalmente desconectado de los jugadores
   * incluso antes de entrar en posesión formal.
   */
  private handleLooseBallContacts() {
    const result = handleLooseBallContactsAction({
      ballCarrierId: this.ballCarrierId,
      timeNow: this.time.now,
      ballIgnoreContactsUntil: this.ballIgnoreContactsUntil,
      players: this.players,
      ball: this.ball,
      ballVelocity: this.ballVelocity,
      lastTouch: this.lastTouch,
    })
    if (!result) return
    this.ballVelocity = result.ballVelocity
    this.lastTouch = result.lastTouch
  }

  /** Ejecuta un pase hacia el mejor compañero detectado por heurística simple. */
  private tryPass(player: Player) {
    const result = tryPassAction({
      player,
      ball: this.ball,
      players: this.players,
      ballCarrierId: this.ballCarrierId,
      timeNow: this.time.now,
    })
    if (!result) return
    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    this.lastTouch = result.lastTouch
    this.ballIgnoreContactsUntil = result.ballIgnoreContactsUntil
  }

  /** Ejecuta un tiro hacia una zona de portería con pequeña variación vertical. */
  private tryShot(player: Player) {
    const result = tryShotAction({
      player,
      ball: this.ball,
      players: this.players,
      ballCarrierId: this.ballCarrierId,
      timeNow: this.time.now,
    })
    if (!result) return
    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    this.lastTouch = result.lastTouch
  }

  private tryManualSteal(player: Player) {
    const result = tryManualStealAction({
      player,
      players: this.players,
      ball: this.ball,
      ballCarrierId: this.ballCarrierId,
      timeNow: this.time.now,
      ruleState: this.ruleState,
    })
    if (!result) return
    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    if (result.lastTouch) this.lastTouch = result.lastTouch
  }

  /** Aplica reinicios simples de falta y bully. */
  private handleRuleRestarts() {
    if (this.ruleState.pendingFoul) {
      const foul = this.ruleState.pendingFoul
      this.centerText.setText(foul.message).setVisible(true)
      this.startFoulRestart(foul)
      this.ruleState.pendingFoul = null
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
    const next = checkAndApplyGoal({
      ball: this.ball,
      ballVelocity: this.ballVelocity,
      ballCarrierId: this.ballCarrierId,
      players: this.players,
      blueScore: this.blueScore,
      redScore: this.redScore,
      centerText: this.centerText,
      time,
    })
    if (!next) return
    this.ballVelocity = next.ballVelocity
    this.ballCarrierId = next.ballCarrierId
    this.blueScore = next.blueScore
    this.redScore = next.redScore
    this.restartAt = next.restartAt
  }

  /** Recoloca a todos los jugadores y reinicia la bola tras gol o al comienzo. */
  private resetKickoff(team: TeamColor) {
    const nextState = resetKickoffState({
      team,
      players: this.players,
      ball: this.ball,
      currentPeriod: this.currentPeriod,
      controlledPlayerIndex: this.controlledPlayerIndex,
      ballCarrierId: this.ballCarrierId,
      ballVelocity: this.ballVelocity,
    })

    this.ballCarrierId = nextState.ballCarrierId
    this.ballVelocity = nextState.ballVelocity
    this.lastTouch = nextState.lastTouch
    this.controlledPlayerIndex = nextState.controlledPlayerIndex
    this.lastLooseBallTime = nextState.lastLooseBallTime
    this.ballIgnoreContactsUntil = nextState.ballIgnoreContactsUntil
    this.activeBully = nextState.activeBully
    this.activeFoulRestart = nextState.activeFoulRestart
    this.stuckCarrierStartTime = nextState.stuckCarrierStartTime
    this.stuckCarrierOrigin = nextState.stuckCarrierOrigin
    this.ruleState = nextState.ruleState
    refreshKickoffVisuals(this.players, this.controlledPlayerIndex, this.ball, this.ballCarrierId)
  }

  private startFoulRestart(foul: RuleState['pendingFoul'] extends infer T ? Exclude<T, null> : never) {
    const nextState = startFoulRestartState({
      foul,
      players: this.players,
      ball: this.ball,
      timeNow: this.time.now,
    })
    this.ballVelocity = nextState.ballVelocity
    this.ballCarrierId = nextState.ballCarrierId
    this.ballIgnoreContactsUntil = nextState.ballIgnoreContactsUntil
    this.activeFoulRestart = nextState.activeFoulRestart
  }

  private startBully(x: number, y: number, bluePlayerId: string, redPlayerId: string) {
    const nextState = startBullyState({
      x,
      y,
      bluePlayerId,
      redPlayerId,
      players: this.players,
      ball: this.ball,
      timeNow: this.time.now,
    })
    this.ballVelocity = nextState.ballVelocity
    this.ballCarrierId = nextState.ballCarrierId
    this.ballIgnoreContactsUntil = nextState.ballIgnoreContactsUntil
    this.activeBully = nextState.activeBully
  }

  private updateFoulRestartState(time: number) {
    const state = updateFoulRestartPhase({
      time,
      activeFoulRestart: this.activeFoulRestart,
      players: this.players,
      ball: this.ball,
      controlledPlayerIndex: this.controlledPlayerIndex,
      centerText: this.centerText,
      passJustDown: Phaser.Input.Keyboard.JustDown(this.passKey),
      shootJustDown: Phaser.Input.Keyboard.JustDown(this.shootKey),
    })
    if (!state) return

    this.ballVelocity = { x: 0, y: 0 }
    this.ballCarrierId = null
    this.controlledPlayerIndex = state.controlledPlayerIndex

    if (!state.taker || !state.release) return

    this.ballCarrierId = state.taker.id
    if (state.shouldPass && this.activeFoulRestart?.sanction === 'free-hit') this.tryPass(state.taker)
    else if (state.shouldShot) this.tryShot(state.taker)
    this.centerText.setVisible(false)
    this.ballIgnoreContactsUntil = 0
    this.activeFoulRestart = null
  }

  private updateBullyState(time: number) {
    const released = updateBullyPhase({
      time,
      activeBully: this.activeBully,
      players: this.players,
      ball: this.ball,
      centerText: this.centerText,
    })
    this.ballVelocity = { x: 0, y: 0 }
    this.ballCarrierId = null
    if (!released) return
    this.ballIgnoreContactsUntil = 0
    this.activeBully = null
  }

  private finishMatch() {
    this.matchEnded = true
    const result = this.blueScore === this.redScore ? 'Empate' : this.blueScore > this.redScore ? 'Gana azul' : 'Gana rojo'
    this.centerText.setText(`${result}\nPulsa ESPACIO para reiniciar`).setVisible(true)
  }

  /** Refresca marcador, tiempo y ayuda contextual del jugador controlado. */
  private updateHud() {
    updateMatchHud({
      hudText: this.hudText,
      subHudText: this.subHudText,
      remainingSeconds: this.remainingSeconds,
      currentPeriod: this.currentPeriod,
      blueScore: this.blueScore,
      redScore: this.redScore,
      ruleState: this.ruleState,
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
    })
  }
}
