import * as Phaser from 'phaser'
import {
  ARCADE_CORNER_FRAC,
  ARCADE_CRAZY_BOUNCE_BOOST,
  ARCADE_CRAZY_BOUNCE_SPREAD,
  ARCADE_CRAZY_MAX_SPEED,
  ARCADE_CURVE_MAX_ANGLE,
  ARCADE_CURVE_MIN_DIST,
  ARCADE_CURVE_MIN_LATERAL,
  ARCADE_CURVE_TURBO_SCALE,
  ARCADE_ONE_TIMER_BUFFER_MS,
  ARCADE_ONE_TIMER_MS,
  ARCADE_SLOWMO,
  ARCADE_SUPER_GAIN,
  ARCADE_SUPER_KEEP_ON_LOSS,
  ARCADE_SUPER_MAX,
  ARCADE_SUPER_SLOWMO,
  GOAL_HALF_H,
  PLAYER_MAX_SPEED,
  RINK,
} from '../constants'
import { worldToScreen } from '../render/viewTransform'
import type { ArcadeFx, TrailKind } from '../render/arcadeFx'
import { announce, announceOneOf } from '../audio/announcer'
import { playBoing, playCrowdRoar, playSuperReady } from '../audio/sounds'
import { ballMods } from './ball'
import { findPlayerById } from './playerHelpers'
import { getGoalLineX } from '../utils'
import type { Ball, Player, TeamColor, Vector } from '../types'

/** Tiro en vuelo y lo que lo hace especial (para cámara lenta, combos y paradones). */
type ShotInfo = {
  team: TeamColor
  shooterId: string
  oneTimer: boolean
  curve: boolean
  super: boolean
  special: boolean
  /** Rebotes en la valla al soltarlo: si sube antes del gol, es de billar. */
  bounces: number
  slowmoChecked: boolean
  slowmoRoll: boolean
}

/** Curva en vuelo: giro por px recorrido hasta cubrir `length`. */
type Curve = { turnPerPx: number, travelled: number, length: number, heading: number }

const GOAL_CENTER_Y = RINK.y + RINK.height / 2
/** Más de este desvío entre la dirección esperada y la real = la bola chocó con algo. */
const CURVE_BREAK_ANGLE = 0.25

function angleDiff(a: number, b: number) {
  return Math.abs(Phaser.Math.Angle.Wrap(a - b))
}

function rotate(v: Vector, angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const x = v.x * c - v.y * s
  v.y = v.x * s + v.y * c
  v.x = x
}

/**
 * Trucos del arcade: remate al primer toque, tiro con efecto, barra de súper por
 * equipo, gol de billar, cámara lenta en remates al límite y combos del gol.
 *
 * Igual que el resto del arcade, no posee la bola: la escena le pasa la velocidad
 * para que la curve y le avisa de pases, tiros, paradas y goles.
 */
export class ArcadeTricks {
  readonly meter: Record<TeamColor, number> = { blue: 0, red: 0 }
  private lastPass: { fromId: string, team: TeamColor, at: number } | null = null
  private lastCarrierId: string | null = null
  private possessionTeam: TeamColor | null = null
  private shot: ShotInfo | null = null
  private curve: Curve | null = null
  private goalsBy = new Map<string, number>()
  private slowmo = { scale: 1, until: 0 }
  private lastSlowmoAt = -Infinity
  private seenBounces = 0
  /** Tiro pulsado sin bola mientras llega un pase (remate al primer toque del humano). */
  private bufferedShot: { playerId: string, at: number, turbo: boolean } | null = null
  /** Receptores de la IA que rematarán al primer toque (tirada hecha al recibir). */
  private aiOneTimers = new Set<string>()

  private readonly fx: ArcadeFx

  constructor(fx: ArcadeFx) {
    this.fx = fx
  }

  reset() {
    this.meter.blue = 0
    this.meter.red = 0
    this.lastPass = null
    this.lastCarrierId = null
    this.possessionTeam = null
    this.shot = null
    this.curve = null
    this.goalsBy.clear()
    this.slowmo = { scale: 1, until: 0 }
    this.lastSlowmoAt = -Infinity
    this.seenBounces = ballMods.wallBounces
    this.bufferedShot = null
    this.aiOneTimers.clear()
  }

  /** Escala del tiempo de simulación (cámara lenta); 1 = normal. */
  timeScale(simNow: number) {
    return simNow < this.slowmo.until ? this.slowmo.scale : 1
  }

  isSlowmo(simNow: number) {
    return simNow < this.slowmo.until
  }

  private startSlowmo(cfg: { scale: number, simMs: number }, simNow: number) {
    this.slowmo = { scale: cfg.scale, until: simNow + cfg.simMs }
    this.lastSlowmoAt = simNow
  }

  // ─── Barra de súper ──────────────────────────────────────────────────────

  superReady(team: TeamColor) {
    return this.meter[team] >= ARCADE_SUPER_MAX
  }

  gain(team: TeamColor, amount: number, near?: Player) {
    const before = this.meter[team]
    if (before >= ARCADE_SUPER_MAX) return
    this.meter[team] = Math.min(ARCADE_SUPER_MAX, before + amount)
    if (this.meter[team] < ARCADE_SUPER_MAX) return
    playSuperReady()
    if (near) {
      const sp = worldToScreen(near.pos.x, near.pos.y)
      this.fx.floatText(sp.x, sp.y - 74, '¡SÚPER LISTO!', '#ffe36a', 22)
    }
    if (team === 'blue') announceOneOf(['¡Súper tiro listo!', '¡Tienes el súper!'])
  }

  // ─── Posesión y pases ────────────────────────────────────────────────────

  onPass(passer: Player, timeNow: number) {
    this.lastPass = { fromId: passer.id, team: passer.team, at: timeNow }
  }

  /**
   * Mira quién lleva la bola al empezar el paso: recepción de pase (abre la ventana
   * del primer toque), robo y pérdida del súper si el rival recupera la bola.
   */
  observePossession(carrierId: string | null, players: Player[], timeNow: number) {
    if (carrierId === this.lastCarrierId) return
    const prev = this.lastCarrierId ? findPlayerById(players, this.lastCarrierId) : null
    this.lastCarrierId = carrierId
    if (!carrierId) return
    const carrier = findPlayerById(players, carrierId)
    if (!carrier) return

    // Cualquier control acaba el tiro en vuelo (la parada del portero ya se contó en onSave)
    this.curve = null
    this.shot = null

    const pass = this.lastPass
    this.lastPass = null
    if (pass && pass.team === carrier.team && pass.fromId !== carrier.id && carrier.role !== 'goalie') {
      carrier.receivedPassAt = timeNow
      this.gain(carrier.team, ARCADE_SUPER_GAIN.pass, carrier)
      this.aiOneTimers.delete(carrier.id)
      if (this.isAttackingClose(carrier) && Math.random() < 0.5) this.aiOneTimers.add(carrier.id)
    }

    if (this.possessionTeam && this.possessionTeam !== carrier.team) {
      const loser = this.possessionTeam
      if (this.meter[loser] >= ARCADE_SUPER_MAX) {
        this.meter[loser] = ARCADE_SUPER_KEEP_ON_LOSS
        if (loser === 'blue') announce('¡Se escapa el súper!')
      }
      if (prev && prev.team !== carrier.team && carrier.role !== 'goalie') this.gain(carrier.team, ARCADE_SUPER_GAIN.steal, carrier)
    }
    this.possessionTeam = carrier.team
  }

  /** Cerca de la portería rival y de cara a ella: la IA remata de primeras. */
  private isAttackingClose(player: Player) {
    const goalX = getGoalLineX(player.side === 'left' ? 'right' : 'left')
    return Math.abs(goalX - player.pos.x) < 420 && Math.abs(player.pos.y - GOAL_CENTER_Y) < 210
  }

  /** La IA que acaba de recibir y tiene tirada de primer toque. */
  aiWantsOneTimer(player: Player, timeNow: number) {
    if (!this.aiOneTimers.has(player.id)) return false
    if (timeNow - (player.receivedPassAt ?? -Infinity) > ARCADE_ONE_TIMER_MS * 0.7) {
      this.aiOneTimers.delete(player.id)
      return false
    }
    this.aiOneTimers.delete(player.id)
    return true
  }

  /** El humano pulsó tiro sin bola: si recibe enseguida un pase, remata al primer toque. */
  bufferShot(player: Player, turbo: boolean, timeNow: number) {
    this.bufferedShot = { playerId: player.id, at: timeNow, turbo }
  }

  /** Tiro guardado que debe salir ya (el jugador acaba de recibir). Lo consume. */
  takeBufferedShot(player: Player, timeNow: number): { turbo: boolean } | null {
    const b = this.bufferedShot
    if (!b || b.playerId !== player.id) return null
    if (timeNow - b.at > ARCADE_ONE_TIMER_BUFFER_MS * 3) {
      this.bufferedShot = null
      return null
    }
    const received = player.receivedPassAt ?? -Infinity
    if (timeNow - received > 40 || received - b.at > ARCADE_ONE_TIMER_BUFFER_MS) return null
    this.bufferedShot = null
    return { turbo: b.turbo }
  }

  // ─── Tiros ───────────────────────────────────────────────────────────────

  /** Decide súper y primer toque antes de soltar; consume la barra si sale el súper. */
  prepareShot(player: Player, timeNow: number) {
    const oneTimer = player.role !== 'goalie' && timeNow - (player.receivedPassAt ?? -Infinity) <= ARCADE_ONE_TIMER_MS
    player.receivedPassAt = undefined
    const isSuper = player.role !== 'goalie' && this.superReady(player.team)
    if (isSuper) this.meter[player.team] = 0
    return { oneTimer, super: isSuper }
  }

  /**
   * Tiro ya soltado: abre la curva si el tirador patinaba de lado, guarda el tiro en
   * vuelo y lanza la cámara lenta del súper. Devuelve si el tiro lleva efecto.
   */
  onShotReleased(player: Player, ball: Ball, ballVelocity: Vector, opts: { turbo: boolean, special: boolean, oneTimer: boolean, super: boolean, slowmoEnabled: boolean }, timeNow: number) {
    this.curve = null
    const curve = player.role !== 'goalie' && this.startCurve(player, ball, ballVelocity, opts.turbo || opts.super)
    this.shot = {
      team: player.team,
      shooterId: player.id,
      oneTimer: opts.oneTimer,
      curve,
      super: opts.super,
      special: opts.special || opts.oneTimer || curve,
      bounces: ballMods.wallBounces,
      slowmoChecked: false,
      slowmoRoll: Math.random() < ARCADE_SLOWMO.plainChance,
    }
    const sp = worldToScreen(ball.x, ball.y)
    if (opts.oneTimer) {
      this.gain(player.team, ARCADE_SUPER_GAIN.oneTimer, player)
      this.fx.floatText(sp.x, sp.y - 46, '¡AL PRIMER TOQUE!', '#b6ff5a', 20)
    }
    if (curve) {
      this.gain(player.team, ARCADE_SUPER_GAIN.curve, player)
      if (!opts.oneTimer) this.fx.floatText(sp.x, sp.y - 46, '¡CON EFECTO!', '#b6ff5a', 18)
    }
    if (opts.super && opts.slowmoEnabled) this.startSlowmo(ARCADE_SUPER_SLOWMO, timeNow)
    return curve
  }

  private startCurve(player: Player, ball: Ball, v: Vector, strong: boolean) {
    const speed = Math.hypot(v.x, v.y)
    if (speed < 1) return false
    const dir = { x: v.x / speed, y: v.y / speed }
    if (Math.abs(dir.x) < 0.3) return false
    const goalX = getGoalLineX(dir.x > 0 ? 'right' : 'left')
    const length = (goalX - ball.x) / dir.x
    if (length < ARCADE_CURVE_MIN_DIST) return false
    const lateral = (player.velocity.x * -dir.y + player.velocity.y * dir.x) / PLAYER_MAX_SPEED
    if (Math.abs(lateral) < ARCADE_CURVE_MIN_LATERAL) return false
    const amount = Phaser.Math.Clamp((Math.abs(lateral) - ARCADE_CURVE_MIN_LATERAL) / (1 - ARCADE_CURVE_MIN_LATERAL), 0, 1)
    const theta = Math.sign(lateral) * (0.4 + 0.6 * amount) * ARCADE_CURVE_MAX_ANGLE * (strong ? ARCADE_CURVE_TURBO_SCALE : 1)
    // Sale abierta hacia el lado al que patinaba y el arco la devuelve al punto apuntado
    rotate(v, theta)
    this.curve = { turnPerPx: (-2 * theta) / length, travelled: 0, length, heading: Math.atan2(v.y, v.x) }
    return true
  }

  /** Curva la bola suelta un paso (antes de moverla). Se corta al chocar o al controlarla alguien. */
  stepCurve(ballVelocity: Vector, carrierId: string | null, dt: number) {
    const c = this.curve
    if (!c) return
    const speed = Math.hypot(ballVelocity.x, ballVelocity.y)
    if (carrierId || speed < 80 || angleDiff(Math.atan2(ballVelocity.y, ballVelocity.x), c.heading) > CURVE_BREAK_ANGLE) {
      this.curve = null
      return
    }
    const step = speed * dt
    const turn = c.turnPerPx * step
    rotate(ballVelocity, turn)
    c.heading = Math.atan2(ballVelocity.y, ballVelocity.x)
    c.travelled += step
    if (c.travelled >= c.length * 1.15) this.curve = null
  }

  /**
   * Tras mover la bola: rebotes de la bola loca y cámara lenta si un remate va a puerta
   * rápido y al límite (siempre con tiros especiales; con los normales, a veces).
   */
  afterBallStep(ball: Ball, ballVelocity: Vector, carrierId: string | null, opts: { crazy: boolean, slowmoEnabled: boolean }, simNow: number) {
    if (ballMods.wallBounces !== this.seenBounces) {
      this.seenBounces = ballMods.wallBounces
      if (opts.crazy && !carrierId) {
        const speed = Math.hypot(ballVelocity.x, ballVelocity.y)
        const target = Math.min(ARCADE_CRAZY_MAX_SPEED, Math.max(speed, 260) * ARCADE_CRAZY_BOUNCE_BOOST)
        rotate(ballVelocity, Phaser.Math.FloatBetween(-ARCADE_CRAZY_BOUNCE_SPREAD, ARCADE_CRAZY_BOUNCE_SPREAD))
        const k = target / (Math.hypot(ballVelocity.x, ballVelocity.y) || 1)
        ballVelocity.x *= k
        ballVelocity.y *= k
        this.curve = null
        playBoing()
        const sp = worldToScreen(ball.x, ball.y)
        this.fx.burst('crazy', sp.x, sp.y, 12)
      }
    }

    const shot = this.shot
    if (!shot || shot.slowmoChecked || carrierId) return
    const speed = Math.hypot(ballVelocity.x, ballVelocity.y)
    if (speed < ARCADE_SLOWMO.minSpeed || Math.abs(ballVelocity.x) < 1) return
    const goalX = getGoalLineX(ballVelocity.x > 0 ? 'right' : 'left')
    const dist = (goalX - ball.x) / Math.sign(ballVelocity.x)
    if (dist < 0 || dist > ARCADE_SLOWMO.range) return
    const yAt = ball.y + ballVelocity.y * (dist / Math.abs(ballVelocity.x))
    if (Math.abs(yAt - GOAL_CENTER_Y) > GOAL_HALF_H * 1.15) return
    shot.slowmoChecked = true
    if (!opts.slowmoEnabled || this.isSlowmo(simNow) || simNow - this.lastSlowmoAt < ARCADE_SLOWMO.cooldownMs) return
    if (shot.special || shot.slowmoRoll) this.startSlowmo(ARCADE_SLOWMO, simNow)
  }

  /** Parada del portero: si el tiro era bueno, «¡PARADÓN!» y algo de barra para el portero. */
  onSave(goalie: Player, ballSpeed: number) {
    const shot = this.shot
    this.shot = null
    this.curve = null
    if (!shot || shot.team === goalie.team) return
    if (!(shot.special || ballSpeed > ARCADE_SLOWMO.minSpeed)) return
    this.gain(goalie.team, ARCADE_SUPER_GAIN.save, goalie)
    const sp = worldToScreen(goalie.pos.x, goalie.pos.y)
    this.fx.floatText(sp.x, sp.y - 70, shot.super ? '¡PARA EL SÚPER!' : '¡PARADÓN!', '#ffffff', 24)
    playCrowdRoar(0.35)
    announceOneOf(shot.super ? ['¡Ha parado el súper tiro!', '¡Increíble!'] : ['¡Paradón!', '¡Qué parada!', '¡Uy, por poco!', '¡Lo saca el portero!'])
  }

  /**
   * Gol: etiquetas del combo para el banner (súper, billar, primer toque, efecto,
   * escuadra, doblete, hat-trick) y bonus de barra por el gol de billar.
   */
  onGoal(scorer: TeamColor, ball: Ball, credit: Player | null) {
    const shot = this.shot && this.shot.team === scorer ? this.shot : null
    this.shot = null
    this.curve = null
    this.lastPass = null
    const tags: string[] = []
    if (shot?.super) tags.push('¡SÚPER GOL!')
    const bank = !!shot && ballMods.wallBounces > shot.bounces
    if (bank) tags.push('¡GOL DE BILLAR!')
    if (shot?.oneTimer) tags.push('¡AL PRIMER TOQUE!')
    if (shot?.curve) tags.push('¡CON EFECTO!')
    if (shot && Math.abs(ball.y - GOAL_CENTER_Y) > GOAL_HALF_H * ARCADE_CORNER_FRAC) tags.push('¡POR LA ESCUADRA!')
    if (credit) {
      const goals = (this.goalsBy.get(credit.id) ?? 0) + 1
      this.goalsBy.set(credit.id, goals)
      if (goals === 2) tags.push('¡DOBLETE!')
      else if (goals === 3) tags.push('¡HAT-TRICK!')
      else if (goals > 3) tags.push(`¡${goals} GOLES!`)
    }
    if (bank) this.gain(scorer, ARCADE_SUPER_GAIN.bank, credit ?? undefined)
    return { tags, bank, super: !!shot?.super }
  }

  /** Estela de la bola que pide el truco en vuelo (null = la del tipo de tiro). */
  trailKind(): TrailKind {
    if (this.shot?.super) return 'super'
    if (this.curve) return 'curve'
    return null
  }
}
