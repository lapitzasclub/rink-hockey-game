import * as Phaser from 'phaser'
import { ARCADE_CHECK_STUN_MS, PLAYER_MAX_SPEED, PLAYER_SPRINT_MAX_SPEED } from '../../game/constants'
import { createBall } from '../../game/entities/createBall'
import { createPlayer } from '../../game/entities/createPlayer'
import { setLocoState } from '../../game/render/puppet/locomotion'
import { updateVisuals } from '../../game/systems/visuals'
import { updateBallPosition } from '../../game/systems/ball'
import { ACTION_CLIP_MS } from '../../game/render/artSpec'
import { lookFor } from '../../game/render/puppet/kit'
import type { ActionType } from '../../game/render/puppet/pose'
import type { Ball, Player, Role, TeamColor } from '../../game/types'

/** Figura del lab: jugador + pose fija (fase de patinaje en radianes o parado). */
export interface LabFigure {
  /** Acción con progreso fijo 0..1 (hojas de WP-32). */
  action?: { type: ActionType; t: number }
  player: Player
  ball: Ball
  carrying: boolean
  /** true: la bola de la figura es un proxy delante del jugador (el stick apunta a ella). */
  aimAhead: boolean
  /** null = parado; si no, fase del ciclo de patinaje en radianes. */
  phase: number | null
  loco: LabLoco | null
}

/** Movimiento forzado para las hojas de locomoción (WP-31). */
export interface LabLoco {
  /** Fracción de la velocidad máxima (por defecto 1 si hay fase, 0 si no). */
  speed?: number
  /** Rumbo de la velocidad respecto a donde mira (rad; π = hacia atrás, > 0 hacia su derecha). */
  moveAngle?: number
  /** Aceleración normalizada: < 0 frena, 0 crucero, 1 arrancada. */
  accel?: number
  /** Giro de la trayectoria (rad/s, > 0 hacia la derecha del jugador). */
  turn?: number
  sprint?: boolean
  brake?: 'wedge' | 'T'
  /** Progreso 0..1 de la caída por carga. */
  fall?: number
}

export interface FigureSpec {
  /** Mano del stick forzada (busca un id con esa mano); acción y su progreso 0..1. */
  hand?: 'L' | 'R'
  action?: ActionType
  actionT?: number
  team: TeamColor
  role: Role
  x: number
  y: number
  /** Ángulo de orientación en mundo (0 = +x, π/2 = hacia cámara). */
  angle?: number
  phase?: number | null
  carrying?: boolean
  /** Sin bola real: el stick apunta hacia delante. */
  aimAhead?: boolean
  loco?: LabLoco
}

const DUMMY_CONTROLLED = { id: '__none__' } as Player

/** Crea una figura con el constructor real del juego y la deja posada. */
export function createFigure(scene: Phaser.Scene, id: string, spec: FigureSpec, sharedBall: Ball): LabFigure {
  const side = spec.team === 'blue' ? 'left' : 'right'
  let pid = id
  for (let k = 0; spec.hand && lookFor(pid, spec.team, spec.role).hand !== spec.hand; k++) pid = `${id}-${k}`
  const player = createPlayer(scene, pid, spec.team, side, spec.role, spec.x, spec.y, 0, false)
  const angle = spec.angle ?? (side === 'left' ? 0 : Math.PI)
  player.facing = { x: Math.cos(angle), y: Math.sin(angle) }
  const carrying = !!spec.carrying
  const aimAhead = carrying || !!spec.aimAhead
  const ball: Ball = carrying
    ? createBall(scene)
    : aimAhead ? { x: spec.x, y: spec.y, visual: sharedBall.visual } : sharedBall
  const action = spec.action ? { type: spec.action, t: spec.actionT ?? 0 } : undefined
  return { action, player, ball, carrying, aimAhead, phase: spec.phase ?? null, loco: spec.loco ?? null }
}

/** Aplica la pose de la figura para el instante `t` (determinista: dt de animación = 0). */
export function poseFigure(fig: LabFigure, t: number, phaseOffset = 0) {
  const { player } = fig
  const loco = fig.loco
  const ratio = loco?.speed ?? (fig.phase !== null ? 1 : 0)
  const speed = ratio * (loco?.sprint ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED)
  const heading = Math.atan2(player.facing.y, player.facing.x) + (loco?.moveAngle ?? 0)
  player.velocity = { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed }
  player.sprinting = !!loco?.sprint
  if (loco) {
    setLocoState(player, loco.accel ?? 0.6, loco.turn ?? 0, loco.brake ? loco.brake === 'T' : undefined)
    player.stunKind = loco.fall !== undefined ? 'check' : undefined
    player.stunUntil = loco.fall !== undefined ? t + (1 - loco.fall) * ARCADE_CHECK_STUN_MS : 0
  }
  const c = player.container
  c.setData('ab', ratio)
  c.setData('sp', (fig.phase ?? 0) + phaseOffset)
  c.setData('pt', t)
  if (fig.action) player.anim = { type: fig.action.type, at: t - fig.action.t * ACTION_CLIP_MS[fig.action.type as keyof typeof ACTION_CLIP_MS] }
  // Con bola, donde la pone la física (con su adelanto por velocidad); sin ella, un proxy delante
  if (fig.carrying) updateBallPosition(fig.ball, { x: 0, y: 0 }, player.id, [player], 0)
  else if (fig.aimAhead) {
    fig.ball.x = player.pos.x + player.facing.x * 40
    fig.ball.y = player.pos.y + player.facing.y * 40
  }
  updateVisuals([player], DUMMY_CONTROLLED, fig.ball, fig.carrying ? player.id : null, t)
}

/** Bola compartida y oculta para figuras que no la llevan. */
export function createHiddenBall(scene: Phaser.Scene): Ball {
  const ball = createBall(scene)
  ball.visual.setVisible(false)
  return ball
}
