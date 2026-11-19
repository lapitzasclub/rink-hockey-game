import * as Phaser from 'phaser'
import { createBall } from '../game/entities/createBall'
import { createArena, type Arena } from '../game/render/arena'
import { createBenchPlayers, updateBenchPlayers, type BenchPlayer } from '../game/render/benchPlayers'
import { drawRink } from '../game/render/drawRink'
import { worldToScreen } from '../game/render/viewTransform'
import { setVisualHeadScale } from '../game/systems/visuals'
import { poseFigure, type LabFigure } from './lab/labFigures'
import { readLabParams, seedMathRandom, type LabParams } from './lab/labParams'
import { driveBlueRestarts, startSmoke } from './lab/labSmoke'
import { startGoalieKeyTest } from './lab/labGoalieKeys'
import { startGoalieTrace } from './lab/labGoalieTrace'
import { autopilot } from '../game/systems/playerControl'
import { atHooks, freezeMatch, lockMatchCamera, wantsCameraLock } from './lab/labAt'
import { buildLabScene, WORLD_SCENES, type LabFrame } from './lab/labScenes'

/**
 * Laboratorio gráfico (solo DEV, `?lab=<escena>`): escenas estáticas y deterministas
 * que reutilizan los constructores reales del juego, para capturas headless.
 * Escenas: rink, scale, goal, players (&strip=), officials, style, match (&mode=, &freeze=).
 * Parámetros comunes: zoom, cx, cy (centro en mundo), t (ms), anim=1, hud=0.
 * En match, zoom/cx/cy bloquean la cámara; follow= y at=<evento>&auto=1&after= (ver WORKFLOW §8).
 * `ai=1`: IA contra IA en tiempo real y con render (banco de rendimiento, docs/perf/WORKFLOW.md).
 */
export class LabScene extends Phaser.Scene {
  private params!: LabParams
  private figures: LabFigure[] = []
  private arena: Arena | null = null
  private bench: BenchPlayer[] = []
  private frame: LabFrame = { sx: 640, sy: 360, zoom: 1 }
  private t = 0
  private frozen = false

  constructor() {
    super('lab')
  }

  init() {
    this.params = readLabParams(window.location.search)
    if (!this.params.auto || this.params.at) seedMathRandom(this.params.seed ?? undefined) // el humo necesita variar entre corridas
    this.figures = []
    this.arena = null
    this.bench = []
    this.frozen = false
    this.t = this.params.t
  }

  create() {
    this.installHook()
    if (this.params.scene === 'match') {
      this.startMatch()
      return
    }

    this.cameras.main.setBackgroundColor('#08111b')
    setVisualHeadScale(1)
    if (WORLD_SCENES.has(this.params.scene)) {
      this.arena = createArena(this)
      drawRink(this)
      this.bench = createBenchPlayers(this)
    }
    const shared = createBall(this)
    if (this.params.scene !== 'rink') shared.visual.setVisible(false)
    const built = buildLabScene({ scene: this, params: this.params, ball: shared })
    this.figures = built.figures
    this.frame = this.resolveFrame(built.frame)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this))
    this.fitCamera()
    this.render(this.t)
  }

  update(time: number) {
    if (this.frozen || this.params.scene === 'match') return
    this.render(this.params.anim ? this.params.t + time : this.t)
  }

  /** Los parámetros zoom/cx/cy mandan sobre el encuadre por defecto de cada escena. */
  private resolveFrame(base: LabFrame): LabFrame {
    const { zoom, cx, cy } = this.params
    const frame = { ...base }
    if (zoom !== null) frame.zoom = zoom
    if (cx !== null || cy !== null) {
      const p = worldToScreen(cx ?? 640, cy ?? 360)
      if (cx !== null) frame.sx = p.x
      if (cy !== null) frame.sy = p.y
    }
    return frame
  }

  private fitCamera() {
    const cam = this.cameras.main
    cam.setSize(this.scale.gameSize.width, this.scale.gameSize.height)
    cam.setZoom(this.frame.zoom)
    cam.centerOn(this.frame.sx, this.frame.sy)
  }

  /** Reaplica poses y animaciones ambientales para el instante `t`. */
  private render(t: number) {
    const phaseOffset = this.params.anim ? t * 0.0046 : 0
    for (const fig of this.figures) poseFigure(fig, t, phaseOffset)
    this.arena?.update(t, 0)
    if (this.bench.length) updateBenchPlayers(this.bench, t)
  }

  /** Arranca el partido real como lo hace el menú, y lo congela desde fuera si se pide. */
  private startMatch() {
    const { mode, freeze, hud } = this.params
    const match = this.game.scene.getScene('match')
    if (!hud) {
      match.events.once(Phaser.Scenes.Events.CREATE, () => {
        const cams = match.cameras.cameras
        if (cams.length > 1) cams[cams.length - 1].setVisible(false)
      })
    }
    if (wantsCameraLock(this.params)) lockMatchCamera(match, this.params)
    this.scene.start('match', { mode })
    if (this.params.at && !this.params.auto) console.warn('[at] requiere auto=1; se ignora')
    if (this.params.auto && this.params.at) startSmoke(match, mode, 1e9, atHooks(match, this.params))
    else if (this.params.auto) startSmoke(match, mode, this.params.smokeMs)
    else if (this.params.ai) {
      autopilot.on = true
      match.events.once(Phaser.Scenes.Events.CREATE, () => {
        const stop = driveBlueRestarts(match)
        match.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { stop(); autopilot.on = false })
      })
    }
    // Herramientas del portero (E-03): traza de rareza y prueba de control con teclado
    const q = new URLSearchParams(window.location.search)
    if (q.get('goalieTrace') === '1') startGoalieTrace(match)
    if (q.get('goalieKeys') === '1') startGoalieKeyTest(match)
    if (freeze !== null && !(this.params.auto && this.params.at)) window.setTimeout(() => freezeMatch(match, this.params), freeze)
  }

  private installHook() {
    const isMatch = this.params.scene === 'match'
    ;(window as unknown as { __lab: unknown }).__lab = {
      setTime: (ms: number) => { this.t = ms; if (!isMatch) this.render(ms) },
      freeze: () => { if (isMatch) this.game.scene.pause('match'); else this.frozen = true },
      resume: () => { if (isMatch) this.game.scene.resume('match'); else this.frozen = false },
    }
  }
}
