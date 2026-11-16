import * as Phaser from 'phaser'
import {
  ARCADE_AI_CHECK_CHANCE,
  ARCADE_GOAL_CELEBRATION_MS,
  ARCADE_HEAD_SCALE,
  GAME_HEIGHT,
  GAME_WIDTH,
  GOAL_HALF_H,
  GOALIE_ZONE_RADIUS,
  HALF_GAME_SECONDS,
  RINK,
  STICK_SWING_MS,
} from '../game/constants'
import { createBall } from '../game/entities/createBall'
import { createPlayer } from '../game/entities/createPlayer'
import { getFormation, switchSides, teamSide } from '../game/formation'
import { drawRink, createGoalNetFlash } from '../game/render/drawRink'
import { createArena, type Arena } from '../game/render/arena'
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
import { setVisualHeadScale, updateVisuals } from '../game/systems/visuals'
import type { ActiveBully, ActiveFoulRestart, Ball, GameMode, Player, TeamColor, Vector } from '../game/types'
import { worldToScreen } from '../game/render/viewTransform'
import { createHud } from '../game/ui/createHud'
import type { Scoreboard } from '../game/ui/scoreboard'
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
import { matchTime, tickMatchClock } from '../game/systems/matchClock'
import { getHalfRealMinutes } from '../game/ui/prefs'
import { autopilot, updateControlledPlayerMotion, updateTeamAIPlayers } from '../game/systems/playerControl'
import { BIND_ACTIONS, codesFor, onBindingsChange, type BindAction } from '../game/input/keyBindings'
import { consumePad, padAxis, padHeld } from '../game/input/gamepad'
import { actionPrompt } from '../game/input/inputMode'
import { checkAndApplyGoal, handlePendingRestart, handleSpecialMatchStates, maybeSwitchControlledPlayer } from '../game/systems/sceneFlow'
import { playCrowdRoar, playFoul, playGoal, playPass, playPickup, playSave, playShot, playSteal, playWhistle, startCrowdAmbience } from '../game/audio/sounds'
import { announce, announceOneOf, stopAnnouncer } from '../game/audio/announcer'
import { ArcadeController } from '../game/systems/arcade'
import { celebrateGoal } from '../game/render/puppet/actions'
import { CameraDirector } from '../game/systems/cameraDirector'
import { createOfficials, type Officials } from '../game/systems/officials'
import { ArcadeFx } from '../game/render/arcadeFx'
import { createArcadeHud, type ArcadeHud } from '../game/ui/arcadeHud'

export type MatchSceneData = { mode?: GameMode }

/**
 * Escena principal del partido.
 *
 * Aquí se orquesta el ciclo general del match, pero la lógica detallada vive
 * en systems/ para que el crecimiento del prototipo no concentre todo en un
 * único archivo inmanejable.
 */
export class MatchScene extends Phaser.Scene {
  /** Teclas por acción según la asignación de Ajustes → Controles (keyBindings.ts). */
  private keys: Record<BindAction, Phaser.Input.Keyboard.Key[]> = { up: [], down: [], left: [], right: [], sprint: [], shoot: [], pass: [] }
  private isTouchDevice = window.matchMedia('(pointer: coarse)').matches
  private joystickInput = { x: 0, y: 0, pass: false, shoot: false, switch: false, sprint: false }
  private prevTouchButtons = { pass: false, shoot: false, switch: false }
  private mobileJoystick: { destroy(): void } | null = null
  private ball!: Ball
  private ballVelocity: Vector = { x: 0, y: 0 }
  private ballCarrierId: string | null = null
  private players: Player[] = []
  private controlledPlayerIndex = 0
  private scoreboard!: Scoreboard
  private centerText!: Phaser.GameObjects.Text
  private blueScore = 0
  private redScore = 0
  private remainingSeconds = HALF_GAME_SECONDS
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
  private officials!: Officials
  private mode: GameMode = 'arcade'
  private uiCamera!: Phaser.Cameras.Scene2D.Camera
  private uiBuilding = false
  private cameraDirector!: CameraDirector
  /** Solo lab (WP-66): si es true, la cámara principal no sigue ni cambia de zoom. */
  labCameraLock = false
  private arcade: ArcadeController | null = null
  private fx: ArcadeFx | null = null
  private arcadeHud: ArcadeHud | null = null
  private crowd: { setIntensity(v: number): void, stop(): void } | null = null
  private arena!: Arena

  constructor() {
    super('match')
  }

  /**
   * Phaser reutiliza la instancia de la escena entre partidos: los campos no
   * se reinician solos, así que se resetea aquí todo el estado de partido.
   */
  init(data: MatchSceneData = {}) {
    this.mode = data.mode ?? 'arcade'
    this.joystickInput = { x: 0, y: 0, pass: false, shoot: false, switch: false, sprint: false }
    this.prevTouchButtons = { pass: false, shoot: false, switch: false }
    this.ballVelocity = { x: 0, y: 0 }
    this.ballCarrierId = null
    this.players = []
    this.controlledPlayerIndex = 0
    this.blueScore = 0
    this.redScore = 0
    // Reloj acelerado: 25:00 de juego en los minutos reales elegidos; se fija por partido
    matchTime.scale = HALF_GAME_SECONDS / (getHalfRealMinutes() * 60)
    this.remainingSeconds = this.periodDuration
    this.currentPeriod = 1
    this.matchEnded = false
    this.restartAt = 0
    this.lastTouch = 'blue'
    this.ruleState = createRuleState()
    this.lastLooseBallTime = 0
    this.ballIgnoreContactsUntil = 0
    this.activeBully = null
    this.activeFoulRestart = null
    this.stuckCarrierStartTime = 0
    this.stuckCarrierOrigin = null
    this.ballEnteredGoalFromFront = { left: false, right: false }
    this.prevBallX = 0
    this.arcade = null
    this.fx = null
    this.arcadeHud = null
    this.crowd = null
  }

  private get isArcade() {
    return this.mode === 'arcade'
  }

  /** Cada parte cuenta 25:00 de juego en ambos modos; lo que cambia es la duración real (Ajustes). */
  private get periodDuration() {
    return HALF_GAME_SECONDS
  }

  /** Crea objetos de interfaz: los ve solo la cámara UI, sin zoom. */
  private withUi<T>(build: () => T): T {
    this.uiBuilding = true
    try {
      return build()
    } finally {
      this.uiBuilding = false
    }
  }

  /**
   * Dos cámaras: la principal (mundo, con zoom dinámico en arcade) y una de UI
   * fija. Cada objeto nuevo se asigna a una de las dos al añadirse a la escena.
   */
  private setupCameras() {
    this.cameras.main.setBackgroundColor('#08111b')
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT)
    const route = (obj: Phaser.GameObjects.GameObject) => {
      if (this.uiBuilding) this.cameras.main.ignore(obj)
      else this.uiCamera.ignore(obj)
    }
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, route)
    // Los listeners de la escena sobreviven al restart: quitarlo al salir
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCameras, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, route)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCameras, this)
    })
  }

  /** Con Scale.EXPAND el lienzo cambia de tamaño: la UI se mantiene centrada en el área 16:9. */
  private fitCameras() {
    const { width, height } = this.scale.gameSize
    this.cameras.main.setSize(width, height)
    this.uiCamera.setSize(width, height)
    this.uiCamera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
    if (!this.labCameraLock) this.cameraDirector?.refit()
  }

  /** Inicializa escena, entidades, HUD y estado de saque inicial. */
  create() {
    this.setupCameras()
    setVisualHeadScale(this.isArcade ? ARCADE_HEAD_SCALE : 1)
    this.arena = createArena(this)
    drawRink(this)
    this.benchPlayers = createBenchPlayers(this)
    const nets = createGoalNetFlash(this)
    this.leftGoalNet  = nets.left
    this.rightGoalNet = nets.right
    this.createInput()
    if (this.isArcade) {
      this.fx = new ArcadeFx(this, (build) => this.withUi(build))
      // Antes que los jugadores: la capa de powerups queda por debajo
      this.arcade = new ArcadeController(this, this.fx)
    }
    this.createTeams()
    this.ball = createBall(this)
    this.officials = createOfficials(this)
    this.aimIndicator = this.add.graphics().setDepth(42)
    this.withUi(() => {
      this.goalFlash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 3, GAME_HEIGHT * 3, 0xffec88)
        .setAlpha(0).setDepth(45)
      const hud = createHud(this, !this.isArcade)
      this.scoreboard = hud.scoreboard
      this.centerText = hud.centerText.setDepth(55)
      if (this.isArcade) {
        this.arcadeHud = createArcadeHud(this)
      }
    })
    this.cameraDirector = new CameraDirector(this.cameras.main, this.isArcade)
    this.fitCameras()
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
      this.crowd?.stop()
      this.crowd = null
      this.arcade?.destroy()
      this.fx?.destroy()
      stopAnnouncer()
    })
    this.resetKickoff('blue')
    this.cameraDirector.snapTo(this.ball)
    if (this.arcade) {
      this.arcade.start(this.players, this.time.now)
      this.crowd = startCrowdAmbience()
      this.crowd.setIntensity(0.3)
      this.fx?.showBanner('¡A JUGAR!', '#ffe36a', 'MODO ARCADE', 1100)
      announce('¡Bienvenidos al hockey arcade!', true)
    }

    // Pausa del shell (menú de pausa, ajustes, móvil en vertical): silencio y teclas limpias al volver
    const onPause = () => {
      this.crowd?.setIntensity(-1)
      stopAnnouncer()
    }
    const onResume = () => {
      this.input.keyboard?.resetKeys()
      this.crowd?.setIntensity(this.getCrowdIntensity())
    }
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause)
    this.events.on(Phaser.Scenes.Events.RESUME, onResume)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause)
      this.events.off(Phaser.Scenes.Events.RESUME, onResume)
    })

    this.time.addEvent({
      // Un segundo de juego por tick
      delay: 1000 / matchTime.scale,
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
          matchDuration: this.periodDuration,
          finishMatch: () => this.finishMatch(),
        })
        this.remainingSeconds = next.remainingSeconds
        const newHalf = next.currentPeriod !== this.currentPeriod
        if (newHalf) this.startSecondHalf()
        this.currentPeriod = next.currentPeriod
        this.ruleState = next.ruleState
        if (typeof next.restartAt === 'number') this.restartAt = next.restartAt
        // El marcador no se refresca durante la pausa del descanso: que ya muestre 25:00 y 2ª parte
        if (newHalf) this.updateHud()
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
    this.officials.update(time, dt, this.ball, this.players)
    this.arena.update(time, this.matchEnded ? 0.9 : this.getCrowdIntensity())
    if (!this.labCameraLock) this.cameraDirector.update({
      dt,
      timeNow: time,
      ball: this.ball,
      ballVelocity: this.ballVelocity,
      controlled: this.players.length ? getControlledPlayer(this.players, this.controlledPlayerIndex) : null,
    })

    if (this.matchEnded) {
      const touchReturn = this.joystickInput.shoot && !this.prevTouchButtons.shoot
      this.prevTouchButtons = { pass: !!this.joystickInput.pass, shoot: !!this.joystickInput.shoot, switch: !!this.joystickInput.switch }
      if (this.justDown('shoot') || touchReturn) {
        this.scene.start('menu', {
          blueScore: this.blueScore,
          redScore: this.redScore,
          blueFouls: this.ruleState.teamFouls.blue,
          redFouls: this.ruleState.teamFouls.red,
          mode: this.mode,
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
    if (this.arcade) {
      const change = this.arcade.update({
        timeNow: time,
        dt,
        players: this.players,
        ballCarrierId: this.ballCarrierId,
        ball: this.ball,
        blueScore: this.blueScore,
        redScore: this.redScore,
        controlledId: getControlledPlayer(this.players, this.controlledPlayerIndex).id,
      })
      if (change) this.applyBallChange(change)
      this.crowd?.setIntensity(this.getCrowdIntensity())
    }

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
    const contextualSwitchPressed = controlIntent.switchPressed || ((this.justDown('pass') && this.ballCarrierId !== controlledAfterInput.id) || touchSwitchPressed)
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
    this.arcade?.postVisuals(this.players, this.ball, this.ballVelocity, time)
    this.checkGoalState(time)
    this.syncBallVisual()  // re-sincronizar si el gol recolocó el balón tras updateVisuals
    this.updateHud()
  }

  /** Registra las teclas del jugador humano y las recrea si se reasignan (desde la pausa). */
  private createInput() {
    const build = () => {
      const kb = this.input.keyboard!
      for (const list of Object.values(this.keys)) list.forEach(key => kb.removeKey(key, true))
      for (const { action } of BIND_ACTIONS) this.keys[action] = codesFor(action).map(code => kb.addKey(code))
    }
    build()
    const off = onBindingsChange(build)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off)
  }

  private isDown(action: BindAction) {
    if (action === 'sprint' && padHeld('sprint')) return true
    return this.keys[action].some(key => key.isDown)
  }

  /** Consume el «recién pulsado» de todas las teclas de la acción, como hacía JustDown con una sola. */
  private justDown(action: BindAction) {
    let hit = false
    for (const key of this.keys[action]) if (Phaser.Input.Keyboard.JustDown(key)) hit = true
    if ((action === 'shoot' || action === 'pass') && consumePad(action)) hit = true
    return hit
  }

  /** Dirección pedida por teclado o, si se está usando, por el stick o la cruceta del mando. */
  private keyboardAxis() {
    const pad = padAxis()
    if (pad.x !== 0 || pad.y !== 0) return pad
    return {
      x: (this.isDown('left') ? -1 : 0) + (this.isDown('right') ? 1 : 0),
      y: (this.isDown('up') ? -1 : 0) + (this.isDown('down') ? 1 : 0),
    }
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
      keyboardAxis: this.keyboardAxis(),
      joystickInput: this.joystickInput,
      sprintHeld: this.isDown('sprint'),
      isTouchDevice: this.isTouchDevice,
      dt,
      timeNow: this.time.now,
    })

    const touchPassPressed = this.joystickInput.pass && !this.prevTouchButtons.pass
    const touchShootPressed = this.joystickInput.shoot && !this.prevTouchButtons.shoot

    const actionPressed = this.justDown('shoot') || touchShootPressed
    const passPressed = this.justDown('pass') || touchPassPressed
    let switchPressed = false

    const turboHeld = this.isDown('sprint') || !!this.joystickInput.sprint
    if (actionPressed) {
      if (this.ballCarrierId === player.id) this.tryShot(player, turboHeld)
      else if (!(this.isArcade && turboHeld && this.tryCheck(player))) this.tryManualSteal(player)
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
      if (player.team === 'blue' && player.role !== 'goalie' && !autopilot.on) continue
      const hasBall = this.ballCarrierId === player.id

      if (player.team === 'red' || autopilot.on) {
        if (hasBall) {
          if (player.role === 'goalie' && shouldGoaliePass(player, this.time.now)) this.tryPass(player)
          else if (shouldAIShoot(player)) this.tryShot(player, (player.stamina ?? 0) > 45 && Math.random() < 0.45)
          else {
            // Pasa con más frecuencia si hay un compañero libre más cerca del gol
            const passChance = shouldAIPassToOpenMate(player, this.players) ? 0.042 : 0.012
            if (Math.random() < passChance) this.tryPass(player)
          }
        } else if (this.ballCarrierId && findPlayerById(this.players, this.ballCarrierId)?.team !== player.team) {
          const carrier = findPlayerById(this.players, this.ballCarrierId)
          if (carrier && shouldAIAttemptSteal(player, carrier)) {
            const checked = this.isArcade && Math.random() < ARCADE_AI_CHECK_CHANCE && this.tryCheck(player)
            if (!checked) this.tryManualSteal(player)
          }
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
  private tryShot(player: Player, wantsTurbo = false) {
    if (this.ballCarrierId !== player.id) return
    // En arcade el tipo de tiro (normal / turbo / fuego) se decide antes de soltar
    const shot = this.arcade?.prepareShot(player, wantsTurbo) ?? { power: 1, kind: null, beatChance: 0 }
    const result = tryShotAction({
      player,
      ball: this.ball,
      players: this.players,
      ballCarrierId: this.ballCarrierId,
      timeNow: this.time.now,
      powerMultiplier: shot.power,
    })
    if (!result) return
    if (!shot.kind) playShot()
    player.stickSwingUntil = this.time.now + STICK_SWING_MS
    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    this.lastTouch = result.lastTouch
    if (this.arcade) {
      this.arcade.onShotReleased(player, this.players, this.ball, this.ballVelocity, shot, this.time.now)
      this.cameraDirector.punchZoom(shot.kind === 'fire' ? 0.16 : shot.kind === 'turbo' ? 0.09 : 0.04)
      if (shot.kind === 'fire') this.cameras.main.shake(180, 0.005)
    }
  }

  /** Carga arcade; devuelve true si se ejecutó. */
  private tryCheck(player: Player) {
    if (!this.arcade) return false
    const result = this.arcade.tryCheck(player, this.players, this.ball, this.ballCarrierId, this.time.now)
    if (!result) return false
    if (result.ball) this.applyBallChange(result.ball)
    this.cameraDirector.punchZoom(0.06)
    return true
  }

  /** Aplica un cambio de posesión devuelto por el controlador arcade. */
  private applyBallChange(change: { ballCarrierId: string | null, ballVelocity: Vector, lastTouch?: TeamColor }) {
    this.ballCarrierId = change.ballCarrierId
    this.ballVelocity = change.ballVelocity
    if (change.lastTouch) this.lastTouch = change.lastTouch
    this.stuckCarrierStartTime = 0
    this.stuckCarrierOrigin = null
  }

  /** Intensidad del público: sube con la bola cerca de una portería y con rachas. */
  private getCrowdIntensity() {
    const fromGoal = Math.min(this.ball.x - RINK.x, RINK.x + RINK.width - this.ball.x)
    const nearGoal = 1 - Phaser.Math.Clamp(fromGoal / (RINK.width / 2), 0, 1)
    const onFire = this.players.some(p => p.onFire) ? 0.25 : 0
    return Phaser.Math.Clamp(0.2 + nearGoal * 0.6 + onFire, 0, 1)
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
      allowFouls: !this.isArcade,
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
    if (this.isArcade) {
      // Arcade: sin faltas ni bully; la disputa se resuelve con la bola saltando
      this.ruleState.pendingFoul = null
      const bully = this.ruleState.pendingBully
      if (bully) {
        this.ruleState.pendingBully = null
        const angle = Math.random() * Math.PI * 2
        this.ball.x = bully.x
        this.ball.y = bully.y
        this.applyBallChange({ ballCarrierId: null, ballVelocity: { x: Math.cos(angle) * 280, y: Math.sin(angle) * 280 } })
        this.ballIgnoreContactsUntil = this.time.now + 160
        const sp = worldToScreen(bully.x, bully.y)
        this.fx?.burst('white', sp.x, sp.y, 12)
        this.fx?.floatText(sp.x, sp.y - 40, '¡MELÉ!', '#ffffff', 20)
      }
      return
    }
    if (this.ruleState.pendingFoul) {
      const foul = this.ruleState.pendingFoul
      playFoul()
      this.officials.foul(foul, this.players)
      this.centerText.setText(foul.message).setVisible(true)
      this.startFoulRestart(foul)
      this.ruleState.pendingFoul = null
      return
    }

    if (this.ruleState.pendingBully) {
      const bully = this.ruleState.pendingBully
      playWhistle()
      this.officials.bully(bully.x, bully.y)
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
    this.officials.goal()
    celebrateGoal(this.players, next.redScore > this.redScore ? 'red' : 'blue', time)
    this.arena.cheer(time)
    if (this.arcade) this.celebrateArcadeGoal(next.redScore > this.redScore ? 'red' : 'blue', time)
    else this.cameras.main.shake(300, 0.011)
    this.tweens.add({ targets: this.goalFlash, alpha: { from: 0.42, to: 0 }, duration: 460, ease: 'Expo.Out' })
    // Flash de la red atacada: la contraria al lado que defiende el que marca (cambia en el descanso)
    const scorerTeam: TeamColor = next.redScore > this.redScore ? 'red' : 'blue'
    const scoredNet = teamSide(this.players, scorerTeam) === 'left' ? this.rightGoalNet : this.leftGoalNet
    this.tweens.add({ targets: scoredNet, alpha: { from: 0.9, to: 0 }, duration: 700, ease: 'Expo.Out' })
    this.ballVelocity = next.ballVelocity
    this.ballCarrierId = next.ballCarrierId
    this.blueScore = next.blueScore
    this.redScore = next.redScore
    this.restartAt = this.isArcade ? time + ARCADE_GOAL_CELEBRATION_MS : next.restartAt
  }

  /** Celebración arcade: banner, cámara a la red, partículas, público y locutor. */
  private celebrateArcadeGoal(scorer: TeamColor, time: number) {
    if (!this.arcade || !this.fx) return
    const result = this.arcade.onGoal(scorer, this.players, time)
    const netSide = teamSide(this.players, scorer) === 'left' ? 'right' : 'left'
    const net = worldToScreen(getGoalLineX(netSide), RINK.y + RINK.height / 2)
    this.centerText.setVisible(false)
    this.cameraDirector.focusGoal(net.x, net.y, time + ARCADE_GOAL_CELEBRATION_MS - 700)
    this.cameras.main.shake(420, 0.014)
    this.fx.burst(scorer, net.x, net.y, 46)
    this.fx.burst('gold', net.x, net.y, 30)
    if (result.fireGoal) this.fx.burst('fire', net.x, net.y, 36)
    const teamName = scorer === 'blue' ? 'AZUL' : 'ROJO'
    this.fx.showBanner('¡GOOOL!', ArcadeController.teamHex(scorer), result.sub || `GOL ${teamName}`, 1700)
    playCrowdRoar(result.onFireStarted || result.fireGoal ? 1 : 0.65)
    if (!result.onFireStarted) {
      announceOneOf(result.fireGoal
        ? ['¡Gol de fuego!', '¡La red está ardiendo!']
        : ['¡Goool!', '¡Qué golazo!', '¡Gol, gol, gol!', '¡Directo a la red!'], true)
    }
  }

  /** Recoloca a todos los jugadores y reinicia la bola tras gol o al comienzo. */
  private resetKickoff(team: TeamColor) {
    this.aimIndicator.clear()
    for (const player of this.players) {
      player.stunUntil = 0
      player.saveDisabledUntil = 0
    }
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
    this.officials.whistle()
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
      passJustDown: this.justDown('pass') || (this.joystickInput.pass && !this.prevTouchButtons.pass),
      shootJustDown: this.justDown('shoot') || (this.joystickInput.shoot && !this.prevTouchButtons.shoot),
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
        const axis = this.keyboardAxis()
        kx += axis.x
        ky += axis.y
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
    if (this.isArcade) return
    if (this.ruleState.pendingFoul || this.ruleState.pendingBully) return
    const centerY = RINK.y + RINK.height / 2
    const foulRadius = GOALIE_ZONE_RADIUS

    for (const goalie of this.players) {
      if (goalie.role !== 'goalie') continue
      if (this.ballCarrierId !== goalie.id) continue

      const gx = getGoalLineX(goalie.side)
      // Zona protegida: semicírculo pegado a la portería, centrado en la línea de gol
      const rivalTeam = goalie.team === 'blue' ? 'red' : 'blue'

      for (const rival of this.players) {
        if (rival.team !== rivalTeam || rival.role === 'goalie') continue
        if (rival.suspendedUntil && rival.suspendedUntil > time) continue
        const dist = Math.hypot(rival.pos.x - gx, rival.pos.y - centerY)
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
    const hint = `Pulsa ${actionPrompt('shoot')} para continuar`
    if (this.fx) {
      const winner: TeamColor | null = this.blueScore === this.redScore ? null : this.blueScore > this.redScore ? 'blue' : 'red'
      this.fx.showBanner('¡FINAL!', winner ? ArcadeController.teamHex(winner) : '#ffffff', result.toUpperCase(), 2200)
      this.crowd?.setIntensity(0.9)
      announce(winner ? `Final del partido. ${result}` : 'Final del partido. ¡Empate!', true)
      this.time.delayedCall(2600, () => this.centerText.setText(hint).setVisible(true))
      return
    }
    this.centerText.setText(`${result}\n${hint}`).setVisible(true)
  }

  /**
   * Descanso: los equipos cambian de campo, como en el reglamento. Se colocan
   * ya en su nueva mitad mientras dura el cartel del descanso; al terminar,
   * el reinicio pendiente da el saque al rojo (el azul sacó en la 1.ª parte).
   */
  private startSecondHalf() {
    switchSides(this.players)
    this.resetKickoff('red')
    this.lastTouch = 'blue'
    this.cameraDirector.snapTo(this.ball)
  }

  /** Resumen para la cabecera del menú de pausa del shell. */
  getPauseSummary() {
    return {
      mode: this.mode,
      period: this.currentPeriod,
      remainingSeconds: Math.max(0, Math.ceil(this.remainingSeconds)),
      blue: this.blueScore,
      red: this.redScore,
      ended: this.matchEnded,
    }
  }

  /** Refresca marcador, tiempo y ayuda contextual del jugador controlado. */
  private updateHud() {
    updateMatchHud({
      scoreboard: this.scoreboard,
      remainingSeconds: this.remainingSeconds,
      currentPeriod: this.currentPeriod,
      blueScore: this.blueScore,
      redScore: this.redScore,
      ruleState: this.ruleState,
      players: this.players,
      timeNow: this.time.now,
    })
    if (this.arcadeHud && this.arcade) {
      const controlled = getControlledPlayer(this.players, this.controlledPlayerIndex)
      this.arcadeHud.update({
        controlled,
        statusLine: this.arcade.getStatusLine(controlled, this.players, this.time.now),
        timeNow: this.time.now,
      })
    }
  }
}
