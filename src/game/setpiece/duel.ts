import { GAME_HEIGHT, SETPIECE_DUEL as D, SETPIECE_GOAL as G, SETPIECE_MATCH as M, RINK_WIDTH_M, type DifficultyLevel } from '../constants'
import { PX_PER_M } from '../render/artSpec'
import type { Ball, Player, TeamSide, Vector } from '../types'
import { getGoalLineX } from '../utils'
import { AiGoalie, AiShooter, SetPieceRng } from './ai'
import { DIVE_DX, DIVE_DZ, SETPIECE_DT, SetPieceSim } from './sim'
import type { DrivePlan, SetPieceKind, SetPieceOutcome, ShotInput } from './types'

/**
 * Duelo de lanzamiento dentro del partido (L-02), sin Phaser. Al pitido convierte
 * lanzador, portero defensor y bola del mundo del partido (px) al marco de la
 * simulación (m: x lateral mirando a la portería, y desde la línea de gol) y, en
 * cada paso fijo, avanza `SetPieceSim` y escribe de vuelta posiciones y velocidades
 * en esos dos `Player` y en la bola. El resto de jugadores siguen en el partido.
 * Termina con el resultado de la simulación o cuando otro jugador llega a
 * `SETPIECE_MATCH.breakInM` de la bola; entonces la bola sigue viva en el partido.
 */

/** Cómo vuelve la bola al partido. */
export type DuelEnd = 'goal' | 'rebound' | 'held' | 'loose' | 'carried'

export interface DuelStart {
  kind: SetPieceKind
  finalShot: boolean
  taker: Player
  goalie: Player
  ball: Ball
  /** Lado de la portería atacada. */
  goalSide: TeamSide
  /** La persona lleva al lanzador (conduce y tira con su carga). */
  human: boolean
  shooterLevel: DifficultyLevel
  goalieLevel: DifficultyLevel
  seed: number
  now: number
}

const CY = GAME_HEIGHT / 2
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export class MatchDuel {
  readonly sim = new SetPieceSim()
  active = false
  kind: SetPieceKind = 'penalty'
  finalShot = false
  human = false
  taker: Player | null = null
  goalie: Player | null = null
  /** +1 si la portería atacada está a la derecha (x de mundo creciente). */
  dir = 1
  /** x de mundo de la línea de gol atacada. */
  gx = 0
  /** Altura de la bola (m) tras el paso actual y el anterior (el pintado interpola). */
  z = 0
  prevZ = 0
  /** Bola pegada al stick del lanzador (conduce, arma o apunta). */
  carrying = false
  /** Velocidad de la bola en px/s, reutilizada. */
  readonly ballVel: Vector = { x: 0, y: 0 }
  startedAt = 0
  endedAt = -Infinity
  end: DuelEnd | null = null
  outcome: SetPieceOutcome | null = null
  /** Este paso salió el tiro (para el sonido y el gesto del stick). */
  justShot = false
  private readonly shooterAi = new AiShooter()
  private readonly goalieAi = new AiGoalie()
  private rng = new SetPieceRng(1)
  private readonly plan: DrivePlan = { drive: false, tx: 0, ty: 0, runUpM: 0 }
  private readonly shot: ShotInput = { aimX: 0, aimZ: 0, power: 0, curve: 0 }
  /** Stick de la persona en ejes de la escena (x derecha, y alejándose de la portería) y carga al soltar (−1 = nada). */
  private stickX = 0
  private stickY = 0
  private fire = -1
  private dived = false
  private ball: Ball | null = null

  // ─── Conversión mundo ↔ escena ─────────────────────────────────────────────

  private simX(wy: number) { return ((wy - CY) * this.dir) / PX_PER_M }
  private simY(wx: number) { return ((this.gx - wx) * this.dir) / PX_PER_M }
  private worldX(y: number) { return this.gx - this.dir * y * PX_PER_M }
  private worldY(x: number) { return CY + this.dir * x * PX_PER_M }

  /** Escribe en `out` (px/s de mundo) un vector de la escena dado en m/s. */
  private toWorldVel(vx: number, vy: number, out: Vector) {
    out.x = -this.dir * vy * PX_PER_M
    out.y = this.dir * vx * PX_PER_M
  }

  /** Mundo del partido (px) de un punto de la escena (m). */
  worldXOf(_x: number, y: number) { return this.worldX(y) }
  worldYOf(x: number, _y: number) { return this.worldY(x) }

  /** Coordenadas de la escena (m) de un punto del mundo. */
  toScene(wx: number, wy: number, out: { x: number; y: number }) {
    out.x = this.simX(wy)
    out.y = this.simY(wx)
    return out
  }

  /** Rota un vector del mundo a los ejes de la escena (misma magnitud). */
  dirToScene(ux: number, uy: number, out: { x: number; y: number }) {
    out.x = this.dir * uy
    out.y = -this.dir * ux
    return out
  }

  /** Arranca el duelo al pitido; las posiciones del partido pasan a la simulación. */
  begin(o: DuelStart) {
    this.active = true
    this.kind = o.kind
    this.finalShot = o.finalShot
    this.human = o.human
    this.taker = o.taker
    this.goalie = o.goalie
    this.ball = o.ball
    this.dir = o.goalSide === 'right' ? 1 : -1
    this.gx = getGoalLineX(o.goalSide)
    this.rng = new SetPieceRng(o.seed)
    this.shooterAi.level = o.shooterLevel
    this.goalieAi.level = o.goalieLevel
    if (o.human) {
      // La persona conduce a mano desde donde está (sin carrerilla automática)
      this.plan.drive = true; this.plan.tx = 0; this.plan.ty = D.minDriveYM; this.plan.runUpM = 0
    } else {
      this.shooterAi.plan(o.kind, o.finalShot, this.rng, this.plan)
    }
    const s = this.sim
    s.reset(o.kind, o.finalShot, this.plan)
    s.manual = o.human && s.drive
    s.bx = this.simX(o.ball.y)
    s.by = this.simY(o.ball.x)
    s.sx = this.simX(o.taker.pos.y)
    s.sy = this.simY(o.taker.pos.x)
    // Si no está ya pegado a la bola, se acerca primero (fase de carrerilla de la simulación)
    if (Math.hypot(s.sx, s.sy - (s.by + D.ballLeadM)) > 0.08) s.phase = 'runup'
    s.gx = this.simX(o.goalie.pos.y)
    this.goalieAi.begin(s, this.rng)
    this.z = s.bz
    this.prevZ = s.bz
    this.carrying = false
    this.startedAt = o.now
    this.end = null
    this.outcome = null
    this.justShot = false
    this.fire = -1
    this.stickX = 0
    this.stickY = 0
    this.dived = false
  }

  /** Entrada de la persona: stick en ejes de la escena (con la cámara cercana, los de pantalla) y, al soltar el tiro, su carga 0..1. */
  input(sx: number, sy: number, release: number | null) {
    this.stickX = sx
    this.stickY = sy
    if (release !== null) this.fire = release
  }

  /** Tiro de la persona: el rumbo del stick proyectado a la línea de gol da el punto de la boca; la carga, la fuerza. */
  private humanShot(power: number) {
    const s = this.sim
    let x = 0
    const up = -this.stickY
    if (Math.hypot(this.stickX, this.stickY) > 0.15) x = s.bx + this.stickX * (s.by / Math.max(M.aimMinUpM, up))
    const sh = this.shot
    sh.aimX = clamp(x / G.mouthHalfW, -1.3, 1.3)
    sh.aimZ = M.humanAimZ
    sh.power = clamp(power, 0, 1)
    sh.curve = 0
    s.spinInput = 0
  }

  /**
   * Un paso fijo del duelo (60 Hz). Devuelve cómo acaba si acaba en este paso.
   * `players` son todos; los que no son lanzador ni portero cortan el duelo al llegar a la bola.
   */
  step(now: number, players: readonly Player[]): DuelEnd | null {
    const s = this.sim
    const taker = this.taker!
    const goalie = this.goalie!
    const ball = this.ball!
    this.justShot = false
    if (this.human && s.manual && s.phase === 'drive') {
      const len = Math.hypot(this.stickX, this.stickY)
      const k = len > 0.15 ? Math.min(1, len) / len : 0
      s.wantVx = this.stickX * k
      s.wantVy = this.stickY * k
      // Sin salirse por los lados
      const lim = RINK_WIDTH_M / 2 - M.wallMarginM
      if ((s.sx > lim && s.wantVx > 0) || (s.sx < -lim && s.wantVx < 0)) s.wantVx = 0
      if (this.fire >= 0) s.release()
    }
    this.goalieAi.update(s, this.rng)
    s.step(SETPIECE_DT)
    if (s.phase === 'aim') {
      if (!this.human) {
        // La IA no golpea antes de que la cámara haya entrado (mismo plazo con o sin escena cercana)
        if (now - this.startedAt >= M.aiShotDelayMs) {
          this.shooterAi.shoot(s, this.rng, this.shot)
          this.fireShot(now)
        }
      } else if (this.fire >= 0 || s.t - s.windupEndT > M.humanAimWaitS) {
        // Si se agota la conducción sin soltar, tira solo con una carga media
        this.humanShot(this.fire >= 0 ? this.fire : M.humanAutoPower)
        this.fireShot(now)
      }
    }
    if (s.phase === 'windup' && !taker.anim) taker.anim = { type: 'shot', at: now }
    this.writeBack(now, taker, goalie, ball)

    if (s.outcome !== null) {
      this.outcome = s.outcome
      return this.finish(now, s.outcome === 'goal' ? 'goal' : s.outcome === 'held' ? 'held' : s.outcome === 'wide' ? 'loose' : 'rebound')
    }
    const r = M.breakInM * PX_PER_M
    for (const p of players) {
      if (p === taker || p === goalie || (p.suspendedUntil ?? 0) > now) continue
      if (Math.hypot(p.pos.x - ball.x, p.pos.y - ball.y) <= r) return this.finish(now, this.carrying ? 'carried' : 'loose')
    }
    return null
  }

  private fireShot(now: number) {
    const s = this.sim
    s.launch(this.shot)
    this.fire = -1
    this.justShot = true
    const taker = this.taker!
    if (!taker.anim || taker.anim.type !== 'shot' || now - taker.anim.at > 400) taker.anim = { type: 'shot', at: now - D.windupS * 1000 }
  }

  private finish(now: number, end: DuelEnd): DuelEnd {
    this.active = false
    this.end = end
    this.endedAt = now
    return end
  }

  /** Lanzador, portero y bola de vuelta al mundo del partido (sin asignar). */
  private writeBack(now: number, taker: Player, goalie: Player, ball: Ball) {
    const s = this.sim
    taker.pos.x = this.worldX(s.sy)
    taker.pos.y = this.worldY(s.sx)
    this.toWorldVel(s.svx, s.svy, taker.velocity)
    this.carrying = s.phase === 'drive' || s.phase === 'windup' || s.phase === 'aim'
    if (s.phase !== 'flight' && s.phase !== 'done') {
      const d = Math.hypot(s.sx, s.sy) || 1
      this.toWorldVel(-s.sx / d / PX_PER_M, -s.sy / d / PX_PER_M, taker.facing)
    }
    taker.sprinting = false

    goalie.pos.x = this.worldX(s.gy)
    goalie.pos.y = this.worldY(s.gx)
    this.toWorldVel(s.gvx, s.gvy, goalie.velocity)
    const fx = s.bx - s.gx, fy = Math.max(0.5, s.by - s.gy)
    const fl = Math.hypot(fx, fy)
    this.toWorldVel(fx / fl / PX_PER_M, fy / fl / PX_PER_M, goalie.facing)
    if (s.diveDir > 0 && !this.dived) {
      this.dived = true
      const dx = DIVE_DX[s.diveDir], dz = DIVE_DZ[s.diveDir]
      const save = dz < 0 || (dx !== 0 && dz === 0) ? 'split' : dx === 0 ? 'body' : 'glove'
      goalie.anim = { type: 'save', at: now, save, side: dx > 0 ? -1 : 1 }
    }

    ball.x = this.worldX(s.by)
    ball.y = this.worldY(s.bx)
    this.toWorldVel(s.vx, s.vy, this.ballVel)
    this.prevZ = this.z
    this.z = s.bz
  }
}
