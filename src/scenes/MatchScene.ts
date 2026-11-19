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
  SIM_MAX_FRAME_MS,
  SIM_MAX_STEPS,
  SIM_SNAP_DIST,
  SIM_STEP_MS,
  STICK_SWING_MS,
} from '../game/constants'
import { createBall } from '../game/entities/createBall'
import { createPlayer } from '../game/entities/createPlayer'
import { getFormation, switchSides, teamSide } from '../game/formation'
import { drawRink, createGoalNetFlash } from '../game/render/drawRink'
import { bakeGraphics } from '../game/render/bake'
import { createArena, type Arena } from '../game/render/arena'
import { createBenchPlayers, updateBenchPlayers, type BenchPlayer } from '../game/render/benchPlayers'
import {
  updateBallPosition,
} from '../game/systems/ball'
import { shouldGoaliePass, updateFieldPlayerAI, updateGoalieAI, shouldAIShoot, shouldAIPassToOpenMate, shouldAIAttemptSteal } from '../game/systems/ai'
import { applySkating, resolvePlayerSpacing, updateSuspendedPlayers } from '../game/systems/movement'
import {
  findPlayerById,
  getControlledPlayer,
} from '../game/systems/playerHelpers'
import { setVisualHeadScale, updateStickAngles, updateVisuals } from '../game/systems/visuals'
import type { ActiveBully, ActiveFoulRestart, Ball, GameMode, Player, TeamColor, Vector } from '../game/types'
import { worldToScreen } from '../game/render/viewTransform'
import { createHud } from '../game/ui/createHud'
import type { Scoreboard } from '../game/ui/scoreboard'
import { updateMatchHud } from '../game/ui/matchHud'
import { createMobileJoystick } from '../game/input/mobileJoystick'
import { createRuleState, registerGoalieZoneFoul, type RuleState } from '../game/systems/rules'
import { getGoalLineX } from '../game/utils'
import {
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
import { actionPrompt, getInputMode, onInputModeChange } from '../game/input/inputMode'
import { checkAndApplyGoal, handlePendingRestart, maybeSwitchControlledPlayer } from '../game/systems/sceneFlow'
import { playCrowdRoar, playFoul, playGoal, playPass, playPickup, playSave, playShot, playSteal, playWhistle, startCrowdAmbience } from '../game/audio/sounds'
import { announce, announceOneOf, stopAnnouncer } from '../game/audio/announcer'
import { equipoDeHueco, nombreDeHueco } from '../game/externalMatch'
import { ArcadeController } from '../game/systems/arcade'
import { celebrateGoal } from '../game/render/puppet/actions'
import { CameraDirector } from '../game/systems/cameraDirector'
import { createOfficials, type Officials } from '../game/systems/officials'
import { ArcadeFx } from '../game/render/arcadeFx'
import { ARCADE_HUD_TOUCH_DY, createArcadeHud, type ArcadeHud } from '../game/ui/arcadeHud'
import { HudLayout, safeAreaInsetsCss } from '../game/ui/hudLayout'
import { QUALITY_WATCH, crowdAnimated, downgradeAutoQuality, onQualityChange, particleDensity, qualityWatchEnabled } from '../game/render/quality'

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
  private leftGoalNet!: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
  private rightGoalNet!: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics
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
  private hudLayout = new HudLayout()
  /** Regulador de calidad: calentamiento, ventana en curso (intervalos, trabajo en ms) y ventanas lentas seguidas. */
  private qualityWatch = { warm: 0, acc: 0, frames: 0, busy: 0, slow: 0, intervals: new Float32Array(512) }
  private cameraDirector!: CameraDirector
  /** Solo lab (WP-66): si es true, la cámara principal no sigue ni cambia de zoom. */
  labCameraLock = false
  private arcade: ArcadeController | null = null
  private fx: ArcadeFx | null = null
  private arcadeHud: ArcadeHud | null = null
  private crowd: { setIntensity(v: number): void, stop(): void } | null = null
  private arena!: Arena
  /**
   * Reloj de la simulación (ms): avanza solo en pasos fijos de SIM_STEP_MS. Todas las
   * marcas de tiempo del partido (sanciones, saques, animaciones) se miden con él.
   */
  simNow = 0
  /** Tiempo real pendiente de simular (< SIM_STEP_MS tras cada fotograma). */
  private simAcc = 0
  /** Marca de rAF del fotograma anterior; 0 = no contar el hueco (inicio o vuelta de una pausa). */
  private lastFrameTime = 0
  /** Tiempo de simulación acumulado para el tick de 1 s de juego del marcador. */
  private clockAcc = 0
  /** Tiempo visual del último fotograma: da el dt de las animaciones, continuo entre pasos. */
  private visualNow = 0
  /**
   * Posiciones y velocidades (x, y, vx, vy) de jugadores y bola al empezar el último
   * paso; el último bloque es la bola. La velocidad también se interpola: la
   * locomoción saca de ella aceleración y giro, que a 120/144 Hz darían saltos.
   */
  private prevPos = new Float64Array(0)
  private curPos = new Float64Array(0)

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
    this.simAcc = 0
    this.clockAcc = 0
    this.lastFrameTime = 0
    this.hudLayout = new HudLayout()
    this.qualityWatch = { warm: 0, acc: 0, frames: 0, busy: 0, slow: 0, intervals: new Float32Array(512) }
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

  /**
   * Con Scale.EXPAND el lienzo cambia de tamaño: la cámara de UI sigue centrada en el
   * área 16:9 y el HUD se ancla a las esquinas de lo que se ve, fuera de las zonas seguras.
   */
  private fitCameras() {
    const { width, height } = this.scale.gameSize
    this.cameras.main.setSize(width, height)
    this.uiCamera.setSize(width, height)
    this.uiCamera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
    this.cameraDirector?.setTouchControls(getInputMode() === 'touch')
    if (!this.labCameraLock) this.cameraDirector?.refit()
    const css = safeAreaInsetsCss()
    const k = width / Math.max(1, this.scale.displaySize.width)   // px de juego por px CSS
    this.hudLayout.fit(
      { x: GAME_WIDTH / 2 - width / 2, y: GAME_HEIGHT / 2 - height / 2, width, height },
      { left: css.left * k, top: css.top * k, right: css.right * k, bottom: css.bottom * k },
      getInputMode() === 'touch',
    )
  }

  /** Inicializa escena, entidades, HUD y estado de saque inicial. */
  create() {
    this.simNow = this.time.now
    this.visualNow = this.simNow
    this.setupCameras()
    setVisualHeadScale(this.isArcade ? ARCADE_HEAD_SCALE : 1)
    this.arena = createArena(this)
    drawRink(this)
    this.benchPlayers = createBenchPlayers(this)
    this.events.emit('match:clock', { seconds: this.remainingSeconds })
    const nets = createGoalNetFlash(this)
    this.leftGoalNet  = bakeGraphics(nets.left, 'net-left', true)
    this.rightGoalNet = bakeGraphics(nets.right, 'net-right', true)
    this.createInput()
    if (this.isArcade) {
      this.fx = new ArcadeFx(this, (build) => this.withUi(build), particleDensity())
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
      const hudStart = this.sys.displayList.length
      const hud = createHud(this, !this.isArcade)
      this.scoreboard = hud.scoreboard
      this.centerText = hud.centerText.setDepth(55)
      this.hudLayout.capture(this, hudStart, 'top-left', { exclude: [hud.centerText] })
      if (this.isArcade) {
        const arcadeStart = this.sys.displayList.length
        this.arcadeHud = createArcadeHud(this)
        // En táctil, bajo el marcador: abajo a la izquierda quedaría debajo del joystick
        this.hudLayout.capture(this, arcadeStart, 'bottom-left', { touch: { anchor: 'top-left', dy: ARCADE_HUD_TOUCH_DY } })
      }
    })
    const offInputMode = onInputModeChange(() => this.fitCameras())
    const offQuality = onQualityChange(() => this.applyQuality())
    // El regulador suma también lo que cuesta enviar el pintado a la GPU (después de update)
    let renderStart = 0
    const onPreRender = () => { renderStart = performance.now() }
    const onPostRender = () => { if (renderStart) this.qualityWatch.busy += performance.now() - renderStart }
    this.game.events.on(Phaser.Core.Events.PRE_RENDER, onPreRender)
    this.game.events.on(Phaser.Core.Events.POST_RENDER, onPostRender)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offInputMode()
      offQuality()
      this.game.events.off(Phaser.Core.Events.PRE_RENDER, onPreRender)
      this.game.events.off(Phaser.Core.Events.POST_RENDER, onPostRender)
    })
    this.applyQuality()
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
      this.arcade.start(this.players, this.simNow)
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
      // El tiempo en pausa no se simula ni cuenta para el regulador de calidad
      this.lastFrameTime = 0
      this.qualityWatch.busy = 0
      this.input.keyboard?.resetKeys()
      this.crowd?.setIntensity(this.getCrowdIntensity())
    }
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause)
    this.events.on(Phaser.Scenes.Events.RESUME, onResume)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause)
      this.events.off(Phaser.Scenes.Events.RESUME, onResume)
    })

    this.savePrevPositions()
    this.updateHud()
  }

  /**
   * Fotograma: la simulación avanza a paso fijo (SIM_STEP_MS) tantas veces como
   * tiempo real haya pasado y después se pinta una vez, interpolando jugadores y
   * bola entre los dos últimos pasos. Así la velocidad del juego no depende del
   * refresco de la pantalla ni de lo que tarde en pintarse el lienzo.
   */
  update(time: number, delta: number) {
    const frameStart = performance.now()
    if (this.matchEnded && this.handleEndOfMatchInput()) return
    // Tiempo real entre fotogramas (marca de rAF). El delta de Phaser no sirve: se suaviza
    // y se recorta a 16,7 ms con la ventana sin foco, y el juego iría a cámara lenta.
    const frameMs = this.lastFrameTime > 0 ? time - this.lastFrameTime : delta
    this.lastFrameTime = time
    this.watchQuality(frameMs)
    this.simAcc += Math.min(Math.max(0, frameMs), SIM_MAX_FRAME_MS)
    let steps = 0
    // La tolerancia absorbe el redondeo de `now += STEP` en el paso manual del laboratorio
    while (this.simAcc >= SIM_STEP_MS - 1e-3 && steps < SIM_MAX_STEPS) {
      this.savePrevPositions()
      this.simNow += SIM_STEP_MS
      this.stepSimulation(this.simNow, SIM_STEP_MS / 1000)
      this.simAcc -= SIM_STEP_MS
      steps++
    }
    // Dispositivo demasiado lento: se descarta el atraso en vez de encadenar pasos (espiral de la muerte)
    if (steps === SIM_MAX_STEPS) this.simAcc = Math.min(this.simAcc, SIM_STEP_MS * 0.5)
    this.renderFrame(Math.max(0, this.simAcc) / SIM_STEP_MS, steps)
    this.qualityWatch.busy += performance.now() - frameStart
  }

  /**
   * Regulador de calidad en auto: si el partido no llega a ~45 fps durante dos
   * ventanas seguidas, baja un nivel (menos partículas ya; pista y público más
   * ligeros desde el próximo partido). Los huecos largos (pestaña oculta) no cuentan.
   */
  private watchQuality(frameMs: number) {
    const q = this.qualityWatch
    if (!qualityWatchEnabled || frameMs <= 0 || frameMs > SIM_MAX_FRAME_MS) return
    if (q.warm < QUALITY_WATCH.warmupMs) {
      q.warm += frameMs
      q.busy = 0
      return
    }
    if (q.frames < q.intervals.length) q.intervals[q.frames] = frameMs
    q.acc += frameMs
    q.frames++
    if (q.acc < QUALITY_WATCH.windowMs) return
    const n = Math.min(q.frames, q.intervals.length)
    const avg = q.acc / q.frames
    const busy = q.busy / q.frames
    const sorted = Array.from(q.intervals.subarray(0, n)).sort((a, b) => a - b)
    const median = sorted[n >> 1]
    const jank = sorted.filter(v => v > median * 1.5).length / n
    q.acc = 0
    q.frames = 0
    q.busy = 0
    const loaded = busy > avg * QUALITY_WATCH.busyShare || jank > QUALITY_WATCH.jankShare
    q.slow = avg > QUALITY_WATCH.slowFrameMs && loaded ? q.slow + 1 : 0
    if (q.slow >= QUALITY_WATCH.slowWindows) {
      q.slow = 0
      downgradeAutoQuality()
    }
  }

  /** Aplica lo que se puede cambiar en caliente al cambiar la calidad (Ajustes o regulador). */
  private applyQuality() {
    this.fx?.setDensity(particleDensity())
    this.arena.setCrowdAnimated(crowdAnimated())
  }

  /** Con el partido acabado, tiro/A vuelve al menú con el resultado. Devuelve true si sale. */
  private handleEndOfMatchInput() {
    const touchReturn = this.joystickInput.shoot && !this.prevTouchButtons.shoot
    this.prevTouchButtons = { pass: !!this.joystickInput.pass, shoot: !!this.joystickInput.shoot, switch: !!this.joystickInput.switch }
    if (!(this.justDown('shoot') || touchReturn)) return false
    this.scene.start('menu', {
      blueScore: this.blueScore,
      redScore: this.redScore,
      blueFouls: this.ruleState.teamFouls.blue,
      redFouls: this.ruleState.teamFouls.red,
      mode: this.mode,
    })
    return true
  }

  /** Un segundo de juego del marcador cada `1000 / matchTime.scale` ms de simulación. */
  private advanceMatchClock() {
    this.clockAcc += SIM_STEP_MS
    const tickMs = 1000 / matchTime.scale
    while (this.clockAcc >= tickMs) {
      this.clockAcc -= tickMs
      this.tickClock()
    }
  }

  private tickClock() {
    const next = tickMatchClock({
      matchEnded: this.matchEnded,
      restartAt: this.restartAt,
      remainingSeconds: this.remainingSeconds,
      currentPeriod: this.currentPeriod,
      ruleState: this.ruleState,
      centerText: this.centerText,
      timeNow: this.simNow,
      matchDuration: this.periodDuration,
      finishMatch: () => this.finishMatch(),
    })
    // Marcador LED de la mesa (WP-69): solo lo pinta el render, no afecta al juego
    if (Math.ceil(next.remainingSeconds) !== Math.ceil(this.remainingSeconds)) this.events.emit('match:clock', { seconds: next.remainingSeconds })
    this.remainingSeconds = next.remainingSeconds
    const newHalf = next.currentPeriod !== this.currentPeriod
    if (newHalf) this.startSecondHalf()
    this.currentPeriod = next.currentPeriod
    this.ruleState = next.ruleState
    if (typeof next.restartAt === 'number') this.restartAt = next.restartAt
  }

  /** Guarda dónde empiezan jugadores y bola el paso que va a simularse (para interpolar al pintar). */
  private savePrevPositions() {
    const n = this.players.length
    if (this.prevPos.length !== (n + 1) * 4) {
      this.prevPos = new Float64Array((n + 1) * 4)
      this.curPos = new Float64Array((n + 1) * 4)
    }
    const prev = this.prevPos
    for (let i = 0; i < n; i++) {
      const p = this.players[i]
      prev[i * 4] = p.pos.x
      prev[i * 4 + 1] = p.pos.y
      prev[i * 4 + 2] = p.velocity.x
      prev[i * 4 + 3] = p.velocity.y
    }
    prev[n * 4] = this.ball.x
    prev[n * 4 + 1] = this.ball.y
    prev[n * 4 + 2] = this.ballVelocity.x
    prev[n * 4 + 3] = this.ballVelocity.y
  }

  /** Mueve jugadores y bola a su posición interpolada (alpha 0..1 entre los dos últimos pasos). */
  private applyInterpolation(alpha: number) {
    const n = this.players.length
    const prev = this.prevPos
    const cur = this.curPos
    const lerp = (i: number, o: { x: number, y: number }, v: { x: number, y: number }) => {
      const k = i * 4
      cur[k] = o.x
      cur[k + 1] = o.y
      cur[k + 2] = v.x
      cur[k + 3] = v.y
      v.x = prev[k + 2] + (v.x - prev[k + 2]) * alpha
      v.y = prev[k + 3] + (v.y - prev[k + 3]) * alpha
      if (Math.abs(o.x - prev[k]) + Math.abs(o.y - prev[k + 1]) > SIM_SNAP_DIST) return
      o.x = prev[k] + (o.x - prev[k]) * alpha
      o.y = prev[k + 1] + (o.y - prev[k + 1]) * alpha
    }
    for (let i = 0; i < n; i++) lerp(i, this.players[i].pos, this.players[i].velocity)
    lerp(n, this.ball, this.ballVelocity)
  }

  /** Devuelve jugadores y bola a su estado de simulación tras pintar. */
  private restoreInterpolation() {
    const n = this.players.length
    const cur = this.curPos
    const put = (i: number, o: { x: number, y: number }, v: { x: number, y: number }) => {
      o.x = cur[i * 4]
      o.y = cur[i * 4 + 1]
      v.x = cur[i * 4 + 2]
      v.y = cur[i * 4 + 3]
    }
    for (let i = 0; i < n; i++) put(i, this.players[i].pos, this.players[i].velocity)
    put(n, this.ball, this.ballVelocity)
  }

  /**
   * Pinta un fotograma: pabellón, árbitros, cámara, jugadores, efectos y HUD con las
   * posiciones interpoladas. El tiempo visual va un paso por detrás de la simulación y
   * avanza de forma continua aunque en este fotograma no haya habido paso.
   */
  private renderFrame(alpha: number, steps: number) {
    const vt = this.simNow - (1 - alpha) * SIM_STEP_MS
    const visualDt = Math.min(Math.max(0, vt - this.visualNow), 100) / 1000
    this.visualNow = vt
    const controlled = this.players.length ? getControlledPlayer(this.players, this.controlledPlayerIndex) : null
    this.applyInterpolation(alpha)
    try {
      updateBenchPlayers(this.benchPlayers, vt, this.ball)
      this.officials.update(vt, visualDt, this.ball, this.players)
      this.arena.update(vt, this.matchEnded ? 0.9 : this.getCrowdIntensity())
      if (!this.labCameraLock) this.cameraDirector.update({
        dt: visualDt,
        timeNow: vt,
        ball: this.ball,
        ballVelocity: this.ballVelocity,
        controlled,
      })
      if (controlled) updateVisuals(this.players, controlled, this.ball, this.ballCarrierId, vt)
      // Partículas: tantas emisiones como pasos de simulación, para que la densidad no dependa de los fps
      this.arcade?.postVisuals(this.players, this.ball, this.ballVelocity, vt, this.restartAt > 0 || this.matchEnded ? 0 : steps)
    } finally {
      this.restoreInterpolation()
    }
    this.updateHud()
  }

  /**
   * Celebraciones, descanso y final: la lógica del partido está parada, pero los
   * jugadores se deslizan hasta frenar en vez de quedarse congelados a media zancada.
   */
  private coastPlayers(dt: number) {
    for (const player of this.players) {
      if (player.suspendedUntil && player.suspendedUntil > this.simNow) continue
      player.sprinting = false
      applySkating(player, dt)
    }
  }

  /**
   * Paso fijo de la simulación (SIM_STEP_MS).
   *
   * Orden importante:
   * 1. input y decisiones,
   * 2. movimiento,
   * 3. balón/posesión/contactos,
   * 4. ángulo del stick (lo usan los contactos del paso siguiente),
   * 5. reglas de gol.
   * Lo visual (pose, cámara, HUD) se hace en renderFrame, una vez por fotograma.
   */
  private stepSimulation(time: number, dt: number) {
    // Los gestos que dispara este paso (falta, bully, gol) empiezan en su tiempo, no en el del último fotograma
    this.officials.syncTime(time)
    this.advanceMatchClock()
    if (this.matchEnded) {
      this.coastPlayers(dt)
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
      this.coastPlayers(dt)
      return
    }

    // Bully o saque de falta: solo avanza su ritual (colocación, cuenta atrás, ejecución)
    if (this.activeBully || this.activeFoulRestart) {
      if (this.activeBully) this.updateBullyState(time, dt)
      else this.updateFoulRestartState(time, dt)
      updateStickAngles(this.players, this.ball, this.ballCarrierId, time)
      return
    }

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
    // La punta del stick (contactos con la bola) sale de su ángulo, que se fija aquí y no al pintar
    updateStickAngles(this.players, this.ball, this.ballCarrierId, time)
    this.checkGoalState(time)
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
      timeNow: this.simNow,
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
      timeNow: this.simNow,
      updateGoalieAI,
      updateFieldPlayerAI,
    })

    for (const player of this.players) {
      if (player.suspendedUntil && player.suspendedUntil > this.simNow) continue
      if (player.team === 'blue' && player.role !== 'goalie' && !autopilot.on) continue
      const hasBall = this.ballCarrierId === player.id

      if (player.team === 'red' || autopilot.on) {
        if (hasBall) {
          if (player.role === 'goalie' && shouldGoaliePass(player, this.simNow)) this.tryPass(player)
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
      } else if (player.role === 'goalie' && hasBall && shouldGoaliePass(player, this.simNow)) {
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
      timeNow: this.simNow,
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
      timeNow: this.simNow,
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
      timeNow: this.simNow,
    })
    if (!result) return
    playPass()
    player.stickSwingUntil = this.simNow + STICK_SWING_MS
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
      timeNow: this.simNow,
      powerMultiplier: shot.power,
    })
    if (!result) return
    if (!shot.kind) playShot()
    player.stickSwingUntil = this.simNow + STICK_SWING_MS
    this.ballCarrierId = result.ballCarrierId
    this.ballVelocity = result.ballVelocity
    this.lastTouch = result.lastTouch
    if (this.arcade) {
      this.arcade.onShotReleased(player, this.players, this.ball, this.ballVelocity, shot, this.simNow)
      this.cameraDirector.punchZoom(shot.kind === 'fire' ? 0.16 : shot.kind === 'turbo' ? 0.09 : 0.04)
      if (shot.kind === 'fire') this.cameras.main.shake(180, 0.005)
    }
  }

  /** Carga arcade; devuelve true si se ejecutó. */
  private tryCheck(player: Player) {
    if (!this.arcade) return false
    const result = this.arcade.tryCheck(player, this.players, this.ball, this.ballCarrierId, this.simNow)
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
      timeNow: this.simNow,
      ruleState: this.ruleState,
      allowFouls: !this.isArcade,
    })
    if (!result) return
    if (result.lastTouch) {
      playSteal()
      player.stickSwingUntil = this.simNow + STICK_SWING_MS
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
        this.ballIgnoreContactsUntil = this.simNow + 160
        const sp = worldToScreen(bully.x, bully.y)
        this.fx?.burst('white', sp.x, sp.y, 12)
        this.fx?.floatText(sp.x, sp.y - 40, '¡MELÉ!', '#ffffff', 20)
      }
      return
    }
    if (this.ruleState.pendingFoul) {
      const foul = this.ruleState.pendingFoul
      // Hechos para el lado lejano (WP-69): banquillo y mesa reaccionan en el render
      this.events.emit('match:foul', { against: foul.againstTeam, x: foul.restartX, y: foul.restartY, sanction: foul.sanction, time: this.simNow })
      const offender = this.players.find(p => p.id === foul.byPlayerId)
      if (offender?.suspendedUntil && offender.suspendedUntil > this.simNow) {
        this.events.emit('match:card', { team: offender.team, playerId: offender.id, time: this.simNow })
      }
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
    this.events.emit('match:goal', { team: next.redScore > this.redScore ? 'red' : 'blue', blue: next.blueScore, red: next.redScore, time })
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
    const external = equipoDeHueco(scorer)
    const teamName = external?.abrev ?? (scorer === 'blue' ? 'AZUL' : 'ROJO')
    this.fx.showBanner('¡GOOOL!', ArcadeController.teamHex(scorer), result.sub || `GOL ${teamName}`, 1700)
    playCrowdRoar(result.onFireStarted || result.fireGoal ? 1 : 0.65)
    if (!result.onFireStarted) {
      announceOneOf(result.fireGoal
        ? ['¡Gol de fuego!', '¡La red está ardiendo!']
        : external
          ? [`¡Gol de ${external.nombre}!`, '¡Goool!', `¡${external.nombre} marca!`, '¡Gol, gol, gol!']
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
    updateStickAngles(this.players, this.ball, this.ballCarrierId, this.simNow)
    this.officials.whistle()
    this.events.emit('match:kickoff', { team, period: this.currentPeriod, time: this.simNow })
    playWhistle()
  }

  /** Inicia el estado de ejecución de falta delegando a matchFlow. */
  private startFoulRestart(foul: RuleState['pendingFoul'] extends infer T ? Exclude<T, null> : never) {
    const nextState = startFoulRestartState({
      foul,
      players: this.players,
      ball: this.ball,
      timeNow: this.simNow,
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
      timeNow: this.simNow,
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
      : this.blueScore > this.redScore ? `¡Gana ${nombreDeHueco('blue', 'el azul')}!`
      : `¡Gana ${nombreDeHueco('red', 'el rojo')}!`
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
      timeNow: this.simNow,
    })
    if (this.arcadeHud && this.arcade) {
      const controlled = getControlledPlayer(this.players, this.controlledPlayerIndex)
      this.arcadeHud.update({
        controlled,
        statusLine: this.arcade.getStatusLine(controlled, this.players, this.simNow),
        timeNow: this.simNow,
      })
    }
  }
}
