import * as Phaser from 'phaser'
import { PLAYER_MAX_SPEED } from '../../game/constants'
import { createBall } from '../../game/entities/createBall'
import { createPlayer } from '../../game/entities/createPlayer'
import { updateVisuals } from '../../game/systems/visuals'
import type { Ball, Player, Role, TeamColor } from '../../game/types'

/** Figura del lab: jugador + pose fija (fase de patinaje en radianes o parado). */
export interface LabFigure {
  player: Player
  ball: Ball
  carrying: boolean
  /** true: la bola de la figura es un proxy delante del jugador (el stick apunta a ella). */
  aimAhead: boolean
  /** null = parado; si no, fase del ciclo de patinaje en radianes. */
  phase: number | null
}

export interface FigureSpec {
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
}

const DUMMY_CONTROLLED = { id: '__none__' } as Player

/** Crea una figura con el constructor real del juego y la deja posada. */
export function createFigure(scene: Phaser.Scene, id: string, spec: FigureSpec, sharedBall: Ball): LabFigure {
  const side = spec.team === 'blue' ? 'left' : 'right'
  const player = createPlayer(scene, id, spec.team, side, spec.role, spec.x, spec.y, 0, false)
  const angle = spec.angle ?? (side === 'left' ? 0 : Math.PI)
  player.facing = { x: Math.cos(angle), y: Math.sin(angle) }
  const carrying = !!spec.carrying
  const aimAhead = carrying || !!spec.aimAhead
  const ball: Ball = carrying
    ? createBall(scene)
    : aimAhead ? { x: spec.x, y: spec.y, visual: sharedBall.visual } : sharedBall
  return { player, ball, carrying, aimAhead, phase: spec.phase ?? null }
}

/** Aplica la pose de la figura para el instante `t` (determinista: dt de animación = 0). */
export function poseFigure(fig: LabFigure, t: number, phaseOffset = 0) {
  const { player } = fig
  const moving = fig.phase !== null
  const speed = moving ? PLAYER_MAX_SPEED : 0
  player.velocity = { x: player.facing.x * speed, y: player.facing.y * speed }
  const c = player.container
  c.setData('ab', moving ? 1 : 0)
  c.setData('sp', (fig.phase ?? 0) + phaseOffset)
  c.setData('pt', t)
  if (fig.aimAhead) {
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
