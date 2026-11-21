import * as Phaser from 'phaser'
import { ARCADE_CHECK_STUN_MS, PLAYER_ACCEL, REACTION, PLAYER_MAX_SPEED, PLAYER_SPRINT_MAX_SPEED } from '../../game/constants'
import { createBall } from '../../game/entities/createBall'
import { createPlayer } from '../../game/entities/createPlayer'
import { resetLoco, setLocoState } from '../../game/render/puppet/locomotion'
import { updateVisuals } from '../../game/systems/visuals'
import { updateBallPosition } from '../../game/systems/ball'
import { ACTION_CLIP_MS, GOALIE_CLIP_MS } from '../../game/render/artSpec'
import { lookFor } from '../../game/render/puppet/kit'
import type { SaveKind } from '../../game/render/puppet/goalieClips'
import type { ActionType } from '../../game/render/puppet/pose'
import type { Ball, MoodKind, Player, ReactionKind, Role, TeamColor } from '../../game/types'

/** Figura del lab: jugador + pose fija (fase de patinaje en radianes o parado). */
export interface LabFigure {
  /** Acción con progreso fijo 0..1 (hojas de WP-32). */
  action?: { type: ActionType; t: number }
  gk?: FigureSpec['gk']
  mood?: LabMood
  reaction?: LabReaction
  player: Player
  ball: Ball
  carrying: boolean
  /** true: la bola de la figura es un proxy delante del jugador (el stick apunta a ella). */
  aimAhead: boolean
  /** null = parado; si no, fase del ciclo de patinaje en radianes. */
  phase: number | null
  loco: LabLoco | null
  /** Orientación inicial en mundo (rad) y último instante simulado de una tira dinámica. */
  angle0: number
  simT?: number
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
  /** Tira dinámica (E-17): en vez de fijar el estado, simula la historia hasta el instante pedido. */
  script?: LabScript
}

/**
 * Historia de movimiento de las tiras dinámicas (E-17). La figura no se desplaza: solo
 * cambian su velocidad y su orientación, a pasos de 60 Hz, y se pinta como en el juego.
 */
export interface LabScript {
  /** Arranque, frenada, curva (mirando a la marcha), deriva (mirando por dentro) o choque. */
  kind: 'start' | 'stop' | 'curve' | 'drift' | 'bump'
  /** Instante mostrado, en ms desde que empieza el perfil (antes hay 400 ms de asiento). */
  ms: number
  sprint?: boolean
  /** Frenada: constante de tiempo (ms) del frenado exponencial. */
  tau?: number
  /** Curva y deriva: giro (rad/s, > 0 hacia la derecha del jugador). */
  turn?: number
  /** Choque: dirección del impulso respecto a donde mira (rad, > 0 hacia su derecha) y px/s. */
  bumpAngle?: number
  bumpMag?: number
}

/** Gesto de parón forzado (E-19): `ms` desde que empieza y `hit` ms desde su momento (null = aún no). */
export interface LabMood {
  kind: MoodKind
  style: number
  ms: number
  hit?: number | null
  side?: 1 | -1
}

/** Reacción en juego forzada (E-20): ms desde que empieza; pen = sancionado saliendo. */
export interface LabReaction { kind: ReactionKind; ms: number; side?: 1 | -1; pen?: boolean }

export interface FigureSpec {
  mood?: LabMood
  reaction?: LabReaction
  /** Mano del stick forzada (busca un id con esa mano); acción y su progreso 0..1. */
  hand?: 'L' | 'R'
  action?: ActionType
  /** Portero (WP-33): postura y parada forzadas. */
  gk?: { kneel?: boolean; save?: SaveKind; side?: 1 | -1 }
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
  return { action, gk: spec.gk, mood: spec.mood, reaction: spec.reaction, player, ball, carrying, aimAhead, phase: spec.phase ?? null, loco: spec.loco ?? null, angle0: angle }
}

/** Aplica la pose de la figura para el instante `t` (determinista: dt de animación = 0). */
export function poseFigure(fig: LabFigure, t: number, phaseOffset = 0) {
  const { player } = fig
  const loco = fig.loco
  if (loco?.script) { simulateScript(fig, loco.script, t); return }
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
  c.setData('kneel', fig.gk?.kneel)
  if (fig.action) {
    const ms = fig.action.type === 'save' ? GOALIE_CLIP_MS.save : ACTION_CLIP_MS[fig.action.type as keyof typeof ACTION_CLIP_MS]
    player.anim = { type: fig.action.type, at: t - fig.action.t * ms, save: fig.gk?.save, side: fig.gk?.side }
  }
  const fm = fig.mood
  if (fm) {
    const hit = fm.hit === undefined || fm.hit === null ? Infinity : t - fm.hit
    const m = player.mood ?? (player.mood = { kind: fm.kind, style: 0, at: 0, until: Infinity, hit, side: 1 })
    m.kind = fm.kind; m.style = fm.style; m.at = t - fm.ms; m.until = Infinity; m.hit = hit; m.side = fm.side ?? 1
  }
  const fr = fig.reaction
  if (fr) {
    player.reaction = { kind: fr.kind, at: t - fr.ms, until: t - fr.ms + REACTION.ms[fr.kind], side: fr.side ?? 1 }
    player.penPhase = fr.pen ? 'out' : undefined
    player.penPhaseAt = t - 1000
  }
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

/** Paso de la historia simulada (el de la simulación del juego) y asiento previo. */
const SIM_STEP = 1000 / 60
const SETTLE_MS = 400

/**
 * Tira dinámica: reinicia el estado de locomoción y muelles y pinta cada paso de la
 * historia hasta `sc.ms` con el pintado real (dt > 0), así se ve lo que pasa en el
 * juego: retardo, rebote y choque. Con la escena quieta solo se simula una vez.
 */
function simulateScript(fig: LabFigure, sc: LabScript, t: number) {
  if (fig.simT === t) return
  fig.simT = t
  const p = fig.player
  resetLoco(p)
  p.bump = undefined
  p.stunKind = undefined
  p.stunUntil = 0
  const t0 = t - sc.ms
  for (let k = 0; ; k++) {
    const at = -SETTLE_MS + k * SIM_STEP
    if (at >= sc.ms - 1) break
    scriptStep(fig, sc, at, t0)
  }
  scriptStep(fig, sc, sc.ms, t0)
}

/** Velocidad, orientación y choque de la historia en el instante `at` (ms desde el inicio). */
function scriptStep(fig: LabFigure, sc: LabScript, at: number, t0: number) {
  const p = fig.player
  const vmax = sc.sprint ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED
  const u = Math.max(0, at)
  let speed = vmax
  let heading = fig.angle0
  let facing = fig.angle0
  if (sc.kind === 'start') {
    speed = at < 0 ? 0 : vmax * (1 - Math.exp(-u / ((vmax / (1.1 * PLAYER_ACCEL)) * 1000)))
  } else if (sc.kind === 'stop') {
    speed = vmax * Math.exp(-u / (sc.tau ?? 250))
    if (speed < 8) speed = 0
  } else if (sc.kind === 'curve' || sc.kind === 'drift') {
    speed = vmax * 0.85
    heading += (sc.turn ?? 2) * u / 1000
    // Deriva: el cuerpo ya apunta por dentro de la curva y la velocidad va por fuera
    facing = heading + (sc.kind === 'drift' ? Math.sign(sc.turn ?? 2) * 0.45 * (1 - Math.exp(-u / 150)) : 0)
  } else {
    speed = vmax * 0.6
  }
  let vx = Math.cos(heading) * speed
  let vy = Math.sin(heading) * speed
  if (sc.kind === 'bump' && at >= 0) {
    // El impulso entra en la velocidad (como en la física) y el rozamiento lo apaga
    const a = fig.angle0 + (sc.bumpAngle ?? Math.PI / 2)
    const mag = sc.bumpMag ?? 320
    if (!p.bump) p.bump = { x: Math.cos(a) * mag, y: Math.sin(a) * mag, at: t0 }
    const k = Math.exp(-u / 250)
    vx += p.bump.x * k
    vy += p.bump.y * k
  }
  p.facing = { x: Math.cos(facing), y: Math.sin(facing) }
  p.velocity = { x: vx, y: vy }
  p.sprinting = !!sc.sprint
  fig.ball.x = p.pos.x + p.facing.x * 40
  fig.ball.y = p.pos.y + p.facing.y * 40
  updateVisuals([p], DUMMY_CONTROLLED, fig.ball, null, t0 + at)
}