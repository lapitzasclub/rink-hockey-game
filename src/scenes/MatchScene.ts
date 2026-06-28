import * as Phaser from 'phaser'
import {
  GOAL_HALF_H,
  MATCH_DURATION,
  PENALTY_AREA_DEPTH,
  RINK,
  STICK_SWING_MS,
} from '../game/constants'
import { createBall } from '../game/entities/createBall'
import { createPlayer } from '../game/entities/createPlayer'
import { getFormation } from '../game/formation'
import { drawRink, createGoalNetFlash } from '../game/render/drawRink'
import { createBenchPlayers, updateBenchPlayers, type BenchPlayer } from '../game/render/benchPlayers'
import {
  updateBallPosition,
} from '../game/systems/ball'
import { shouldGoaliePass, updateFieldPlayerAI, updateGoalieAI, shouldAIShoot, shouldAIPassToOpenMate, shouldAIAttemptSteal } from '../game/systems/ai'
import { resolvePlayerSpacing, updateSuspendedPlayers } from '../game/systems/movement'
import {
  findPlayerById,
  getControlledPlayer,
} from '../game/systems/playerHelpers'
import { updateVisuals } from '../game/systems/visuals'
import type { ActiveBully, ActiveFoulRestart, Ball, Player, TeamColor, Vector } from '../game/types'
import { worldToScreen } from '../game/render/viewTransform'
import { createHud } from '../game/ui/createHud'
import { updateMatchHud } from '../game/ui/matchHud'
import { createMobileJoystick } from '../game/input/mobileJoystick'
import { createRuleState, registerGoalieZoneFoul, type RuleState } from '../game/systems/rules'
import { getGoalLineX } from '../game/utils'
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
import { playFoul, playGoal, playPass, playPickup, playSave, playShot, playSteal, playWhistle } from '../game/audio/sounds'

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
  private sprintKey!: Phaser.Input.Keyboard.Key
  private isTouchDevice = window.matchMedia('(pointer: coarse)').matches
  private joystickInput = { x: 0, y: 0, pass: false, shoot: false, switch: false }
  private prevTouchButtons = { pass: false, shoot: false, switch: false }
  private mobileJoystick: { destroy(): void } | null = null
  private ball!: Ball
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
  private goalFlash!: Phaser.GameObjects.Rectangle
  private leftGoalNet!: Phaser.GameObjects.Graphics
  private rightGoalNet!: Phaser.GameObjects.Graphics
  private aimIndicator!: Phaser.GameObjects.Graphics
  // Flag persistente: la pelota cruzó la línea de portería desde el lado campo (boca abierta).
  // Se resetea cuando la pelota sale de la zona de portería. Evita goles falsos por detrás.
  private ballEnteredGoalFromFront = { left: false, right: false }
  private prevBallX = 0
  private benchPlayers: BenchPlayer[] = []

  constructor() {
    super('match')
  }

  /** Inicializa escena, entidades, HUD y estado de saque inicial. */
  create() {
    this.cameras.main.setBackgroundColor('#08111b')
    drawRink(this)
    this.benchPlayers = createBenchPlayers(this)
    const nets = createGoalNetFlash(this)
    this.leftGoalNet  = nets.left
    this.rightGoalNet = nets.right
    this.createInput()
    this.createTeams()
    this.ball = createBall(this)
    this.goalFlash = this.add.rectangle(
      this.cameras.main.width / 2, this.cameras.main.height / 2,
      this.cameras.main.width, this.cameras.main.height,
      0xffec88,
    ).setAlpha(0).setDepth(45)
    this.aimIndicator = this.add.graphics().setDepth(42)
    const hud = createHud(this)
    this.hudText = hud.hudText
    this.subHudText = hud.subHudText
    this.centerText = hud.centerText
    this.mobileJoystick = createMobileJoystick({
      isTouchDevice: this.isTouchDevice,
      zone: document.getElementById('left-zone'),
      passButton: document.getElementById('btn-pass'),
      shootButton: document.getElementById('btn-shoot'),
      sprintButton: document.getElementById('btn-sprint'),
      switchButton: document.getElementById('btn-switch'),
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
    updateBenchPlayers(this.benchPlayers, time)

    if (this.matchEnded) {
      const touchReturn = this.joystickInput.shoot && !this.prevTouchButtons.shoot
      this.prevTouchButtons = { pass: !!this.joystickInput.pass, shoot: !!this.joystickInput.shoot, switch: !!this.joystickInput.switch }
      if (Phaser.Input.Keyboard.JustDown(this.shootKey) || touchReturn) {
        this.scene.start('menu', {
          blueScore: this.blueScore,
          redScore: this.redScore,
          blueFouls: this.ruleState.teamFouls.blue,
          redFouls: this.ruleState.teamFouls.red,
        })
      }
      return
    }

    this.restartAt = handlePendingRestart({
      time,
      restartAt: this.restartAt,
      centerText: this.centerText,
      lastTouch: this.lastTouch,
      resetKickoff: (team) => this.resetKickoff(team),
    })

    if (this.restartAt > 0) {
      this.syncBallVisual()  // mantener balón visible en red durante la celebración
      return
    }

    if (handleSpecialMatchStates({
      activeBully: this.activeBully,
      activeFoulRestart: this.activeFoulRestart,
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      ball: this.ball,
      ballCarrierId: this.ballCarrierId,
      timeNow: time,
      updateBullyState: () => this.updateBullyState(time, dt),
      updateFoulRestartState: () => this.updateFoulRestartState(time, dt),
      updateHud: () => this.updateHud(),
    })) return

    updateSuspendedPlayers(this.players, time, dt)

    // Si el jugador controlado está suspendido, ceder control al siguiente disponible
    const currentControlled = getControlledPlayer(this.players, this.controlledPlayerIndex)
    if (currentControlled.suspendedUntil && currentControlled.suspendedUntil > time) {
      const bluePlayers = this.players.filter(p => p.team === 'blue' && p.role !== 'goalie' && !(p.suspendedUntil && p.suspendedUntil > time))
      if (bluePlayers.length > 0) {
        this.controlledPlayerIndex = this.players.indexOf(bluePlayers[0])
      }
    }

    const controlIntent = this.updateControlledPlayer(dt)

    const touchSwitchPressed = this.joystickInput.switch && !this.prevTouchButtons.switch
    const controlledAfterInput = getControlledPlayer(this.players, this.controlledPlayerIndex)
    const contextualSwitchPressed = controlIntent.switchPressed || ((Phaser.Input.Keyboard.JustDown(this.switchKey) && this.ballCarrierId !== controlledAfterInput.id) || touchSwitchPressed)
    this.controlledPlayerIndex = maybeSwitchControlledPlayer({
      justDown: contextualSwitchPressed,
      players: this.players,
      controlledPlayerIndex: this.controlledPlayerIndex,
      ballCarrierId: this.ballCarrierId,
      ball: this.ball,
    })
    this.updateTeamAI(dt)
    resolvePlayerSpacing(this.players)
    const prevBallX = this.prevBallX || this.ball.x
    this.ballVelocity = updateBallPosition(this.ball, this.ballVelocity, this.ballCarrierId, this.players, dt)
    this.updateGoalEntryFlag(prevBallX)
    this.prevBallX = this.ball.x
    this.handleGoalieSave()
    this.handleBallControl(time)
    this.handleLooseBallContacts()
    this.checkGoalieZoneFoul(time)
    this.handleRuleRestarts()
    updateVisuals(this.players, getControlledPlayer(this.players, this.controlledPlayerIndex), this.ball, this.ballCarrierId, time)
    this.checkGoalState(time)
    this.syncBallVisual()  // re-sincronizar si el gol recolocó el balón tras updateVisuals
    this.updateHud()
  }

  /** Registra todas las teclas de teclado usadas por el jugador humano. */
  private createInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.U)
    this.passKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Y)
    this.switchKey = this.passKey
    this.sprintKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
  }


  /** Instancia los 10 jugadores (5v5) con sus formaciones de inicio. */
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
      sprintKey: this.sprintKey,
      isTouchDevice: this.isTouchDevice,
      dt,
      timeNow: this.time.now,
    })

    const touchPassPressed = this.joystickInput.pass && !this.prevTouchButtons.pass
    const touchShootPressed = this.joystickInput.shoot && !this.prevTouchButtons.shoot

    const actionPressed = Phaser.Input.Keyboard.JustDown(this.shootKey) || touchShootPressed
    const passPressed = Phaser.Input.Keyboard.JustDown(this.passKey) || touchPassPressed
    let switchPressed = false

    if (actionPressed) {
      if (this.ballCarrierId === player.id) this.tryShot(player)
      else this.tryManualSteal(player)
    }
    if (passPressed) {
      if (this.ballCarrierId === player.id) this.tryPass(player)
      else switchPressed = true
    }

    this.prevTouchButtons = {
      pass: !!this.joystickInput.pass,
      shoot: !!this.joystickInput.shoot,
      switch: !!this.joystickInput.switch,
    }

    return { switchPressed }
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
      if (player.suspendedUntil && player.suspendedUntil > this.time.now) continue
      if (player.team === 'blue' && player.role !== 'goalie') continue
      const hasBall = this.ballCarrierId === player.id

      if (player.team === 'red') {
        if (hasBall) {
          if (player.role === 'goalie' && shouldGoaliePass(player, this.time.now)) this.tryPass(player)
          else if (shouldAIShoot(player)) this.tryShot(player)
          else {
            // Pasa con más frecuencia si hay un compañero libre más cerca del gol
            const passChance = shouldAIPassToOpenMate(player, this.players) ? 0.042 : 0.012
            if (Math.random() < passChance) this.tryPass(player)
          }
        } else if (this.ballCarrierId && findPlayerById(this.players, this.ballCarrierId)?.team !== player.team) {
          const carrier = findPlayerById(this.players, this.ballCarrierId)
          if (carrier && shouldAIAttemptSteal(player, carrier)) this.tryManualSteal(player)
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
    if (result.ballCarrierId) playSave()
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
    const prevCarrierId = this.ballCarrierId
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

    if (!prevCarrierId && result.ballCarrierId) playPickup()
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
    playPass()
    player.stickSwingUntil = this.time.now + STICK_SWING_MS
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
    playShot()
    player.stickSwingUntil = this.time.now + STICK_SWING_MS
    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    this.lastTouch = result.lastTouch
  }

  /** Delega el intento de robo y actualiza el estado de posesión si tuvo éxito. */
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
    if (result.lastTouch) {
      playSteal()
      player.stickSwingUntil = this.time.now + STICK_SWING_MS
    }
    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    if (result.lastTouch) this.lastTouch = result.lastTouch
  }

  /** Aplica reinicios simples de falta y bully. */
  private handleRuleRestarts() {
    if (this.ruleState.pendingFoul) {
      const foul = this.ruleState.pendingFoul
      playFoul()
      this.centerText.setText(foul.message).setVisible(true)
      this.startFoulRestart(foul)
      this.ruleState.pendingFoul = null
      return
    }

    if (this.ruleState.pendingBully) {
      const bully = this.ruleState.pendingBully
      playWhistle()
      this.centerText.setText(bully.message).setVisible(true)
      this.startBully(bully.x, bully.y, bully.participants.bluePlayerId, bully.participants.redPlayerId)
      this.ruleState.pendingBully = null
    }
  }

  /**
   * Actualiza el flag que indica si la bola entró a la portería desde el frente.
   * Se activa al cruzar la línea con inGoalMouth=true y se apaga al salir de la zona.
   */
  private updateGoalEntryFlag(prevBallX: number) {
    const goalTop    = RINK.y + RINK.height / 2 - GOAL_HALF_H
    const goalBottom = RINK.y + RINK.height / 2 + GOAL_HALF_H
    const inGoalMouth = this.ball.y > goalTop && this.ball.y < goalBottom
    const leftGoalLineX = getGoalLineX('left')
    const rightGoalLineX = getGoalLineX('right')

    // Cruce de izquierda: pelota venía de delante (x ≥ línea) y ahora está detrás, con boca abierta
    if (inGoalMouth && prevBallX >= leftGoalLineX && this.ball.x < leftGoalLineX) {
      this.ballEnteredGoalFromFront.left = true
    }
    // Resetear si la pelota sale de la zona de portería izquierda
    if (this.ball.x >= leftGoalLineX || !inGoalMouth) {
      this.ballEnteredGoalFromFront.left = false
    }

    // Cruce de derecha
    if (inGoalMouth && prevBallX <= rightGoalLineX && this.ball.x > rightGoalLineX) {
      this.ballEnteredGoalFromFront.right = true
    }
    if (this.ball.x <= rightGoalLineX || !inGoalMouth) {
      this.ballEnteredGoalFromFront.right = false
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
      enteredFromFront: this.ballEnteredGoalFromFront,
    })
    if (!next) return
    playGoal()
    this.cameras.main.shake(300, 0.011)
    this.tweens.add({ targets: this.goalFlash, alpha: { from: 0.42, to: 0 }, duration: 460, ease: 'Expo.Out' })
    // Flash de red: el equipo rojo marca en la portería izquierda, el azul en la derecha
    const scoredNet = next.redScore > this.redScore ? this.leftGoalNet : this.rightGoalNet
    this.tweens.add({ targets: scoredNet, alpha: { from: 0.9, to: 0 }, duration: 700, ease: 'Expo.Out' })
    this.ballVelocity = next.ballVelocity
    this.ballCarrierId = next.ballCarrierId
    this.blueScore = next.blueScore
    this.redScore = next.redScore
    this.restartAt = next.restartAt
  }

  /** Recoloca a todos los jugadores y reinicia la bola tras gol o al comienzo. */
  private resetKickoff(team: TeamColor) {
    this.aimIndicator.clear()
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
    refreshKickoffVisuals(this.players, this.controlledPlayerIndex, this.ball, this.ballCarrierId, this.time.now)
    playWhistle()
  }

  /** Inicia el estado de ejecución de falta delegando a matchFlow. */
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

  /** Inicia el ritual de bully posicionando a los dos participantes. */
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

  /**
   * Tick del estado de falta: mueve jugadores a posición, gestiona la puntería
   * del ejecutante humano (joystick o teclado) y resuelve la acción cuando el
   * jugador pulsa pasar o tirar.
   */
  private updateFoulRestartState(time: number, dt: number) {
    const state = updateFoulRestartPhase({
      time,
      dt,
      activeFoulRestart: this.activeFoulRestart,
      players: this.players,
      ball: this.ball,
      controlledPlayerIndex: this.controlledPlayerIndex,
      centerText: this.centerText,
      passJustDown: Phaser.Input.Keyboard.JustDown(this.passKey) || (this.joystickInput.pass && !this.prevTouchButtons.pass),
      shootJustDown: Phaser.Input.Keyboard.JustDown(this.shootKey) || (this.joystickInput.shoot && !this.prevTouchButtons.shoot),
    })
    if (!state) return

    // Apuntería: IA auto, joystick táctil o teclado WASD/flechas
    const stickLen = Math.hypot(this.joystickInput.x, this.joystickInput.y)
    if (state.taker?.team === 'red' && state.autoFacing) {
      state.taker.facing = state.autoFacing
    } else if (state.taker && state.taker.team === 'blue') {
      if (stickLen > 0.15) {
        state.taker.facing = { x: this.joystickInput.x / stickLen, y: this.joystickInput.y / stickLen }
      } else {
        let kx = 0, ky = 0
        if (this.cursors.left?.isDown || this.wasd['A']?.isDown) kx -= 1
        if (this.cursors.right?.isDown || this.wasd['D']?.isDown) kx += 1
        if (this.cursors.up?.isDown || this.wasd['W']?.isDown) ky -= 1
        if (this.cursors.down?.isDown || this.wasd['S']?.isDown) ky += 1
        const kLen = Math.hypot(kx, ky)
        if (kLen > 0) state.taker.facing = { x: kx / kLen, y: ky / kLen }
      }
    }

    // Indicador de puntería: visible cuando ya se puede actuar y no se ha soltado aún
    if (state.taker && this.activeFoulRestart && time >= this.activeFoulRestart.readyAt && !state.release) {
      this.drawAimIndicator(state.taker, this.activeFoulRestart.sanction, time)
    } else {
      this.aimIndicator.clear()
    }

    this.ballVelocity = { x: 0, y: 0 }
    this.ballCarrierId = null
    this.controlledPlayerIndex = state.controlledPlayerIndex

    if (!state.taker || !state.release) return

    this.ballCarrierId = state.taker.id
    if (state.shouldPass && this.activeFoulRestart?.sanction === 'free-hit') this.tryPass(state.taker)
    else if (state.shouldShot) this.tryShot(state.taker)
    this.aimIndicator.clear()
    this.centerText.setVisible(false)
    this.ballIgnoreContactsUntil = 0
    this.activeFoulRestart = null
    this.prevTouchButtons = {
      pass: !!this.joystickInput.pass,
      shoot: !!this.joystickInput.shoot,
      switch: !!this.joystickInput.switch,
    }
  }

  /** Sincroniza el visual del balón con su posición mundo → pantalla. */
  private syncBallVisual() {
    const s = worldToScreen(this.ball.x, this.ball.y)
    this.ball.visual.setPosition(s.x, s.y)
  }

  /** Dibuja un rastro punteado en la dirección de puntería del ejecutante. */
  private drawAimIndicator(taker: Player, sanction: string, timeNow: number) {
    this.aimIndicator.clear()
    const maxDist = sanction === 'penalty' ? 265 : 195
    const color = sanction === 'penalty' ? 0xff8833 : sanction === 'direct-free-hit' ? 0xffdd55 : 0xe0ecff
    const pulse = 0.35 + 0.22 * Math.sin(timeNow * 0.007)

    for (let d = 22; d <= maxDist; d += 15) {
      const t = d / maxDist
      const sp = worldToScreen(taker.pos.x + taker.facing.x * d, taker.pos.y + taker.facing.y * d)
      this.aimIndicator.fillStyle(color, pulse * (1 - t * 0.65))
      this.aimIndicator.fillCircle(sp.x, sp.y, Math.max(1.2, 3.5 * (1 - t * 0.4)))
    }
    // Marcador en el extremo
    const ep = worldToScreen(taker.pos.x + taker.facing.x * maxDist, taker.pos.y + taker.facing.y * maxDist)
    this.aimIndicator.lineStyle(1.5, color, pulse * 0.9)
    this.aimIndicator.strokeCircle(ep.x, ep.y, 8)
  }

  /** Tick del bully: acerca a los participantes y libera el juego al acabar el contador. */
  private updateBullyState(time: number, dt: number) {
    const released = updateBullyPhase({
      time,
      dt,
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

  /**
   * Falta automática si un jugador rival (no portero) entra en la zona D
   * mientras el portero tiene la posesión del balón.
   */
  private checkGoalieZoneFoul(time: number) {
    if (this.ruleState.pendingFoul || this.ruleState.pendingBully) return
    const centerY = RINK.y + RINK.height / 2
    const foulRadius = GOAL_HALF_H * 2

    for (const goalie of this.players) {
      if (goalie.role !== 'goalie') continue
      if (this.ballCarrierId !== goalie.id) continue

      const gx = getGoalLineX(goalie.side)
      // Centro de la zona = punto de penalti (PENALTY_AREA_DEPTH desde la línea de portería)
      const spotX = goalie.side === 'left' ? gx + PENALTY_AREA_DEPTH : gx - PENALTY_AREA_DEPTH
      const rivalTeam = goalie.team === 'blue' ? 'red' : 'blue'

      for (const rival of this.players) {
        if (rival.team !== rivalTeam || rival.role === 'goalie') continue
        if (rival.suspendedUntil && rival.suspendedUntil > time) continue
        const dist = Math.hypot(rival.pos.x - spotX, rival.pos.y - centerY)
        if (dist < foulRadius) {
          registerGoalieZoneFoul(this.ruleState, rival, goalie, time)
          return
        }
      }
    }
  }

  /** Congela el partido y muestra el resultado final con la pista de volver al menú. */
  private finishMatch() {
    this.matchEnded = true
    const result = this.blueScore === this.redScore ? 'Empate'
      : this.blueScore > this.redScore ? '¡Gana el azul!'
      : '¡Gana el rojo!'
    const hint = this.isTouchDevice ? 'Pulsa A para continuar' : 'Pulsa U para continuar'
    this.centerText.setText(`${result}\n${hint}`).setVisible(true)
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
      timeNow: this.time.now,
    })
  }
}
