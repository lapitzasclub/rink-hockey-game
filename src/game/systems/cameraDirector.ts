import * as Phaser from 'phaser'
import {
  ARCADE_CAMERA_LOOKAHEAD_S,
  ARCADE_CAMERA_ZOOM,
  ARCADE_CAMERA_ZOOM_ATTACK,
  ARCADE_CAMERA_ZOOM_FAST,
  ARCADE_CAMERA_ZOOM_GOAL,
  GAME_HEIGHT,
  GAME_WIDTH,
  RINK,
} from '../constants'
import { ARENA_BOUNDS } from '../render/arena'
import { worldToScreen } from '../render/viewTransform'
import type { Ball, Player, Vector } from '../types'

const ATTACK_ZONE = 300
const FAST_BALL_SPEED = 450
const FOLLOW_RATE = 4.2
const ZOOM_RATE = 2.6

/**
 * Cámara dinámica estilo arcade: sigue la bola con anticipación, mezcla la
 * posición del jugador controlado, abre plano con bola rápida, cierra en zona
 * de ataque y hace un "punch" de zoom en tiros y goles.
 *
 * La cámara trabaja en coordenadas de pantalla (ya proyectadas); la física
 * sigue en mundo. Desactivada deja la vista estática del reglamento.
 */
export class CameraDirector {
  private focus: Vector = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }
  private zoom = ARCADE_CAMERA_ZOOM
  private punch = 0
  private goalFocus: { x: number, y: number, until: number } | null = null

  private readonly camera: Phaser.Cameras.Scene2D.Camera
  private readonly enabled: boolean

  constructor(camera: Phaser.Cameras.Scene2D.Camera, enabled: boolean) {
    this.camera = camera
    this.enabled = enabled
    this.fitBounds()
    camera.setZoom(enabled ? this.zoom : 1)
    camera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
  }

  /** Tras cambiar el tamaño de la ventana: la vista estática vuelve a centrarse. */
  refit() {
    this.fitBounds()
    if (this.enabled) this.apply()
    else this.camera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
  }

  /** Empuje momentáneo de zoom (tiros, cargas). Se acumula hasta un tope. */
  punchZoom(amount: number) {
    this.punch = Math.min(0.35, this.punch + amount)
  }

  /** Encuadra la portería durante la celebración del gol. */
  focusGoal(screenX: number, screenY: number, until: number) {
    this.goalFocus = { x: screenX, y: screenY, until }
  }

  /** Recoloca la cámara sin suavizado (saques). */
  snapTo(ball: Ball) {
    if (!this.enabled) return
    this.goalFocus = null
    this.focus = worldToScreen(ball.x, ball.y)
    this.zoom = ARCADE_CAMERA_ZOOM
    this.apply()
  }

  update(options: {
    dt: number
    timeNow: number
    ball: Ball
    ballVelocity: Vector
    controlled: Player | null
  }) {
    if (!this.enabled) return
    const { dt, ball, ballVelocity } = options

    if (this.goalFocus && options.timeNow > this.goalFocus.until) this.goalFocus = null

    let target: Vector
    let targetZoom: number
    if (this.goalFocus) {
      target = { x: this.goalFocus.x, y: this.goalFocus.y }
      targetZoom = ARCADE_CAMERA_ZOOM_GOAL
    } else {
      const ballSpeed = Math.hypot(ballVelocity.x, ballVelocity.y)
      const lead = worldToScreen(
        Phaser.Math.Clamp(ball.x + ballVelocity.x * ARCADE_CAMERA_LOOKAHEAD_S, RINK.x, RINK.x + RINK.width),
        Phaser.Math.Clamp(ball.y + ballVelocity.y * ARCADE_CAMERA_LOOKAHEAD_S, RINK.y, RINK.y + RINK.height),
      )
      const mate = options.controlled ? worldToScreen(options.controlled.pos.x, options.controlled.pos.y) : lead
      target = { x: lead.x * 0.72 + mate.x * 0.28, y: lead.y * 0.72 + mate.y * 0.28 }

      const nearGoal = ball.x < RINK.x + ATTACK_ZONE || ball.x > RINK.x + RINK.width - ATTACK_ZONE
      targetZoom = ballSpeed > FAST_BALL_SPEED ? ARCADE_CAMERA_ZOOM_FAST
        : nearGoal ? ARCADE_CAMERA_ZOOM_ATTACK
        : ARCADE_CAMERA_ZOOM
    }

    const followK = 1 - Math.exp(-FOLLOW_RATE * dt * (this.goalFocus ? 1.6 : 1))
    const zoomK = 1 - Math.exp(-ZOOM_RATE * dt)
    this.focus.x += (target.x - this.focus.x) * followK
    this.focus.y += (target.y - this.focus.y) * followK
    this.zoom += (targetZoom - this.zoom) * zoomK
    this.punch *= Math.exp(-6 * dt)
    this.apply()
  }

  /**
   * Límites = pabellón pintado; si la ventana es aún más ancha/alta se amplían
   * centrados, para que la pista no quede pegada a un lado.
   */
  private fitBounds() {
    const B = ARENA_BOUNDS
    const w = Math.max(B.width, this.camera.width)
    const h = Math.max(B.height, this.camera.height)
    this.camera.setBounds(B.x + (B.width - w) / 2, B.y + (B.height - h) / 2, w, h)
  }

  private apply() {
    this.camera.setZoom(this.zoom + this.punch)
    this.camera.centerOn(this.focus.x, this.focus.y)
  }
}
