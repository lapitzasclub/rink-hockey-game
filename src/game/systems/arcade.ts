import * as Phaser from 'phaser'
import {
  ARCADE_CHECK_BALL_POWER,
  ARCADE_CHECK_COOLDOWN_MS,
  ARCADE_CHECK_COST,
  ARCADE_CHECK_KNOCKBACK,
  ARCADE_CHECK_LUNGE,
  ARCADE_CHECK_RANGE,
  ARCADE_CHECK_STUN_MS,
  ARCADE_CURVE_BEAT_BONUS,
  ARCADE_FIRE_SHOT_BEAT_GOALIE,
  ARCADE_FIRE_SHOT_POWER,
  ARCADE_ON_FIRE_GOALS,
  ARCADE_ONE_TIMER_BEAT_GOALIE,
  ARCADE_ONE_TIMER_POWER,
  ARCADE_POWERUP_FIRE_BEAT_GOALIE,
  ARCADE_POWERUP_MINI_SAVE_SCALE,
  ARCADE_POWERUP_MINI_VISUAL,
  ARCADE_POWERUP_TURBO_SPEED,
  ARCADE_POWERUP_WALL_SAVE_SCALE,
  ARCADE_RUBBER_BAND_MAX,
  ARCADE_RUBBER_BAND_PER_GOAL,
  ARCADE_SHOOTER_CREDIT_MS,
  ARCADE_SHOT_FX_MS,
  ARCADE_SUPER_BEAT_GOALIE,
  ARCADE_SUPER_GAIN,
  ARCADE_SUPER_POWER,
  ARCADE_TURBO_SHOT_BEAT_GOALIE,
  ARCADE_TURBO_SHOT_COST,
  ARCADE_TURBO_SHOT_POWER,
  ARCADE_TURBO_SPEED_BONUS,
  STAMINA_MAX,
} from '../constants'
import { worldToScreen } from '../render/viewTransform'
import type { ArcadeFx } from '../render/arcadeFx'
import { announce, announceOneOf } from '../audio/announcer'
import { playCheck, playFireShot, playOnFire, playSuperShot, playTurboShot } from '../audio/sounds'
import { findPlayerById } from './playerHelpers'
import { rubberBandFor } from './difficulty'
import { ArcadePowerups, isActive, isShielded, isStunned, type BallChange } from './arcadePowerups'
import { ArcadeTricks } from './arcadeTricks'
import { ArcadeEvents } from './arcadeEvents'
import type { Ball, Player, TeamColor, Vector } from '../types'

export type ShotKind = 'turbo' | 'fire' | 'super'
export type PreparedShot = { power: number, kind: ShotKind | null, beatChance: number, oneTimer: boolean, super: boolean }

const TEAM_HEX: Record<TeamColor, string> = { blue: '#4da3ff', red: '#ff5d6c' }

/**
 * Estado y reglas del modo arcade (estilo NBA Jam): tiros especiales, cargas, rachas
 * y el tick por jugador. Los powerups, los trucos (primer toque, efecto, súper) y los
 * eventos de partido viven en sus propios sistemas y este los coordina.
 *
 * La escena sigue siendo la dueña de la bola y la posesión: los métodos que
 * la alteran devuelven un BallChange para que la escena lo aplique, igual que
 * las acciones de matchActions.
 */
export class ArcadeController {
  readonly tricks: ArcadeTricks
  readonly events: ArcadeEvents
  private readonly powerups: ArcadePowerups
  private shotFx: { kind: ShotKind, shooterId: string, until: number } | null = null
  private lastShooter: { id: string, team: TeamColor, at: number } | null = null
  private streaks = new Map<string, number>()

  private readonly scene: Phaser.Scene
  private readonly fx: ArcadeFx

  constructor(scene: Phaser.Scene, fx: ArcadeFx, announcerOn = true) {
    this.scene = scene
    this.fx = fx
    this.powerups = new ArcadePowerups(scene, fx)
    this.tricks = new ArcadeTricks(fx)
    this.events = new ArcadeEvents(fx, announcerOn)
  }

  /** Reinicia el estado por jugador al empezar el partido. */
  start(players: Player[], timeNow: number) {
    for (const player of players) {
      player.speedMultiplier = 1
      player.saveRadiusScale = 1
      player.onFire = false
      player.fireShotReady = false
    }
    this.powerups.start(timeNow)
    this.tricks.reset()
    this.events.reset()
  }

  get activeShotKind(): ShotKind | null {
    return this.shotFx?.kind ?? null
  }

  getStreak(player: Player) {
    return this.streaks.get(player.id) ?? 0
  }

  // ─── Tiros especiales ─────────────────────────────────────────────────────

  /**
   * Decide el tipo de tiro antes de soltarlo y cobra su coste.
   * Súper (barra llena) manda; después fuego (racha o powerup, gratis) y turbo
   * (cuesta stamina). El primer toque se suma a cualquiera de ellos.
   */
  prepareShot(player: Player, wantsTurbo: boolean, timeNow: number): PreparedShot {
    if (player.role === 'goalie') return { power: 1, kind: null, beatChance: 0, oneTimer: false, super: false }
    const trick = this.tricks.prepareShot(player, timeNow)
    let shot: PreparedShot
    if (trick.super) {
      shot = { power: ARCADE_SUPER_POWER, kind: 'super', beatChance: ARCADE_SUPER_BEAT_GOALIE, oneTimer: trick.oneTimer, super: true }
    } else if (player.fireShotReady) {
      player.fireShotReady = false
      shot = { power: ARCADE_FIRE_SHOT_POWER, kind: 'fire', beatChance: ARCADE_POWERUP_FIRE_BEAT_GOALIE, oneTimer: trick.oneTimer, super: false }
    } else if (player.onFire) {
      shot = { power: ARCADE_FIRE_SHOT_POWER, kind: 'fire', beatChance: ARCADE_FIRE_SHOT_BEAT_GOALIE, oneTimer: trick.oneTimer, super: false }
    } else if (wantsTurbo && (player.stamina ?? STAMINA_MAX) >= ARCADE_TURBO_SHOT_COST) {
      player.stamina = (player.stamina ?? STAMINA_MAX) - ARCADE_TURBO_SHOT_COST
      shot = { power: ARCADE_TURBO_SHOT_POWER, kind: 'turbo', beatChance: ARCADE_TURBO_SHOT_BEAT_GOALIE, oneTimer: trick.oneTimer, super: false }
    } else {
      shot = { power: 1, kind: null, beatChance: 0, oneTimer: trick.oneTimer, super: false }
    }
    if (shot.oneTimer) {
      shot.power *= ARCADE_ONE_TIMER_POWER
      shot.beatChance = Math.max(shot.beatChance, ARCADE_ONE_TIMER_BEAT_GOALIE)
    }
    return shot
  }

  /**
   * Registra el tiro ya soltado: crédito para la racha, curva, efectos y, si sale la
   * tirada, desactiva al portero rival durante el vuelo de la bola.
   * Devuelve true si el tiro supera al portero.
   */
  onShotReleased(player: Player, players: Player[], ball: Ball, ballVelocity: Vector, shot: PreparedShot, timeNow: number, slowmoEnabled = true) {
    this.lastShooter = { id: player.id, team: player.team, at: timeNow }
    const curve = this.tricks.onShotReleased(player, ball, ballVelocity, {
      turbo: shot.kind === 'turbo',
      special: !!shot.kind,
      oneTimer: shot.oneTimer,
      super: shot.super,
      slowmoEnabled,
    }, timeNow)

    const sp = worldToScreen(ball.x, ball.y)
    if (shot.kind) this.shotFx = { kind: shot.kind, shooterId: player.id, until: timeNow + ARCADE_SHOT_FX_MS }
    if (shot.kind === 'super') {
      playSuperShot()
      this.fx.shockwave(sp.x, sp.y, 0xffe36a, 3)
      this.fx.burst('gold', sp.x, sp.y, 26)
      this.fx.burst('crazy', sp.x, sp.y, 18)
      this.fx.floatText(sp.x, sp.y - 56, '¡SÚPER TIRO!', '#ffe36a', 30)
      this.scene.cameras.main.shake(260, 0.009)
      announceOneOf(['¡Súper tiro!', '¡Ahí va el súper!', '¡Tiro definitivo!'], true)
    } else if (shot.kind === 'fire') {
      playFireShot()
      this.fx.burst('fire', sp.x, sp.y, 18)
      announceOneOf(['¡Bola de fuego!', '¡Está ardiendo!', '¡Fuego!'])
    } else if (shot.kind === 'turbo') {
      playTurboShot()
      this.fx.burst('white', sp.x, sp.y, 10)
    }

    const beatChance = shot.beatChance + (curve ? ARCADE_CURVE_BEAT_BONUS : 0)
    if (beatChance <= 0 || Math.random() >= beatChance) return false
    const goalie = players.find(p => p.role === 'goalie' && p.team !== player.team)
    if (!goalie) return false
    const speed = Math.hypot(ballVelocity.x, ballVelocity.y) || 1
    const distance = Phaser.Math.Distance.Between(ball.x, ball.y, goalie.pos.x, goalie.pos.y)
    goalie.saveDisabledUntil = timeNow + Math.min(ARCADE_SHOT_FX_MS, (distance / speed) * 1000 + 350)
    return true
  }

  onPass(passer: Player, timeNow: number) {
    this.tricks.onPass(passer, timeNow)
  }

  onSave(goalie: Player, ballVelocity: Vector) {
    this.tricks.onSave(goalie, Math.hypot(ballVelocity.x, ballVelocity.y))
  }

  /** Antes de mover la bola: curva del tiro con efecto. */
  beforeBallStep(ballVelocity: Vector, carrierId: string | null, dt: number) {
    this.tricks.stepCurve(ballVelocity, carrierId, dt)
  }

  /** Después de moverla: bola loca y cámara lenta en remates al límite. */
  afterBallStep(ball: Ball, ballVelocity: Vector, carrierId: string | null, timeNow: number, slowmoEnabled: boolean) {
    this.tricks.afterBallStep(ball, ballVelocity, carrierId, { crazy: this.powerups.crazyUntil > timeNow, slowmoEnabled }, timeNow)
  }

  /** Escala del tiempo de simulación (cámara lenta). */
  timeScale(simNow: number) {
    return this.tricks.timeScale(simNow)
  }

  // ─── Cargas ───────────────────────────────────────────────────────────────

  /**
   * Carga con el cuerpo al rival más cercano (no portero ni con escudo). Lo aturde,
   * lo empuja y, si llevaba la bola, la suelta. Nunca es falta en arcade.
   * Devuelve null si no hay objetivo o no se puede cargar.
   */
  tryCheck(player: Player, players: Player[], ball: Ball, ballCarrierId: string | null, timeNow: number): { ball: BallChange | null } | null {
    if (player.role === 'goalie' || ballCarrierId === player.id) return null
    if ((player.checkCooldownUntil ?? 0) > timeNow || isStunned(player, timeNow)) return null
    if ((player.stamina ?? STAMINA_MAX) < ARCADE_CHECK_COST) return null

    let target: Player | null = null
    let best = ARCADE_CHECK_RANGE
    for (const rival of players) {
      if (rival.team === player.team || rival.role === 'goalie') continue
      if (!isActive(rival, timeNow) || isStunned(rival, timeNow) || isShielded(rival, timeNow)) continue
      if ((rival.magnetUntil ?? 0) > timeNow) continue
      const d = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, rival.pos.x, rival.pos.y)
      if (d < best) {
        best = d
        target = rival
      }
    }
    if (!target) return null

    player.stamina = (player.stamina ?? STAMINA_MAX) - ARCADE_CHECK_COST
    player.checkCooldownUntil = timeNow + ARCADE_CHECK_COOLDOWN_MS
    const dx = target.pos.x - player.pos.x
    const dy = target.pos.y - player.pos.y
    const len = Math.hypot(dx, dy) || 1
    const dir = { x: dx / len, y: dy / len }

    player.velocity.x += dir.x * ARCADE_CHECK_LUNGE
    player.velocity.y += dir.y * ARCADE_CHECK_LUNGE
    player.facing = dir
    target.velocity.x = dir.x * ARCADE_CHECK_KNOCKBACK
    target.velocity.y = dir.y * ARCADE_CHECK_KNOCKBACK
    target.stunUntil = timeNow + ARCADE_CHECK_STUN_MS
    target.stunKind = 'check'
    target.ignoreBallUntil = timeNow + ARCADE_CHECK_STUN_MS
    target.container.setData('tumbleDir', Math.sign(dir.x) || 1)
    this.tricks.gain(player.team, ARCADE_SUPER_GAIN.check, player)

    playCheck()
    const sp = worldToScreen(target.pos.x, target.pos.y)
    this.fx.burst('white', sp.x, sp.y - 10, 16)
    this.fx.floatText(sp.x, sp.y - 50, Phaser.Utils.Array.GetRandom(['¡PUM!', '¡ZAS!', '¡CRASH!']), '#ffe36a', 26)
    this.scene.cameras.main.shake(140, 0.006)

    let change: BallChange | null = null
    if (ballCarrierId === target.id) {
      // La bola sale despedida hacia delante con algo de dispersión
      const angle = Math.atan2(dir.y, dir.x) + Phaser.Math.FloatBetween(-0.7, 0.7)
      ball.x = target.pos.x + Math.cos(angle) * 22
      ball.y = target.pos.y + Math.sin(angle) * 22
      change = {
        ballCarrierId: null,
        ballVelocity: { x: Math.cos(angle) * ARCADE_CHECK_BALL_POWER, y: Math.sin(angle) * ARCADE_CHECK_BALL_POWER },
        lastTouch: player.team,
      }
      announceOneOf(['¡Qué carga!', '¡Al suelo!', '¡Sin piedad!'])
    }
    return { ball: change }
  }

  // ─── Goles y racha ────────────────────────────────────────────────────────

  /**
   * Actualiza rachas y combos tras un gol. El tirador acreditado suma; el equipo que
   * encaja pierde todas sus rachas (y el fuego). Devuelve el texto secundario del
   * banner, si el gol vale doble (evento) y qué lo hizo especial.
   */
  onGoal(scorer: TeamColor, players: Player[], ball: Ball, timeNow: number) {
    const fireGoal = this.shotFx?.kind === 'fire'
    this.clearShotFx(players)
    for (const player of players) {
      if (player.team === scorer) continue
      this.streaks.set(player.id, 0)
      if (player.onFire) {
        player.onFire = false
        announce('¡Se acabó el fuego!')
      }
    }

    const credit = this.lastShooter && this.lastShooter.team === scorer && timeNow - this.lastShooter.at < ARCADE_SHOOTER_CREDIT_MS
      ? findPlayerById(players, this.lastShooter.id)
      : null
    this.lastShooter = null
    const combo = this.tricks.onGoal(scorer, ball, credit)
    const doubleGoal = this.events.is('double')
    let streakSub = ''
    let onFireStarted = false

    if (credit) {
      const streak = (this.streaks.get(credit.id) ?? 0) + 1
      this.streaks.set(credit.id, streak)
      if (streak >= ARCADE_ON_FIRE_GOALS && !credit.onFire) {
        credit.onFire = true
        onFireStarted = true
        playOnFire()
        this.scene.time.delayedCall(900, () => announce('¡Está en llamas!', true))
        streakSub = '¡EN LLAMAS!'
      } else if (streak === ARCADE_ON_FIRE_GOALS - 1 && !combo.tags.length) streakSub = '¡SE ESTÁ CALENTANDO!'
      else if (credit.onFire) streakSub = '¡IMPARABLE!'
    }
    const parts = [...combo.tags, streakSub].filter(Boolean).slice(0, 2)
    if (doubleGoal) parts.unshift('×2')
    return { sub: parts.join('  '), onFireStarted, fireGoal, superGoal: combo.super, bankGoal: combo.bank, comboCount: combo.tags.length, doubleGoal }
  }

  private clearShotFx(players: Player[]) {
    this.shotFx = null
    for (const player of players) player.saveDisabledUntil = 0
  }

  // ─── Tick ─────────────────────────────────────────────────────────────────

  /**
   * Tick arcade (solo con la bola en juego): posesión para los trucos, evento de partido,
   * estados temporales, velocidad por rubber-banding y turbo, porteros (muro / mini),
   * powerups y fin del efecto de tiro. Devuelve un cambio de bola si un efecto soltó la posesión.
   */
  update(options: {
    timeNow: number
    dt: number
    players: Player[]
    ballCarrierId: string | null
    ball: Ball
    blueScore: number
    redScore: number
    controlledId: string
  }): BallChange | null {
    const { timeNow, players } = options

    this.tricks.observePossession(options.ballCarrierId, players, timeNow)
    this.events.step(options.dt * 1000)
    if (this.shotFx && (timeNow > this.shotFx.until || options.ballCarrierId)) this.clearShotFx(players)

    const diff = options.blueScore - options.redScore
    const rubber = (team: TeamColor) => {
      const behind = team === 'blue' ? -diff : diff
      // B-04: la persona siempre; la IA solo en FÁCIL y NORMAL
      return behind > 0 && rubberBandFor(team) ? 1 + Math.min(ARCADE_RUBBER_BAND_MAX, behind * ARCADE_RUBBER_BAND_PER_GOAL) : 1
    }

    for (const player of players) {
      if (player.stunUntil && timeNow >= player.stunUntil) {
        player.stunUntil = 0
        player.stunKind = undefined
      }
      const turbo = (player.turboUntil ?? 0) > timeNow
      if (turbo || player.onFire) player.stamina = STAMINA_MAX
      player.speedMultiplier = rubber(player.team)
        * (turbo ? ARCADE_POWERUP_TURBO_SPEED : 1)
        * (player.sprinting ? ARCADE_TURBO_SPEED_BONUS : 1)

      if (player.role === 'goalie') {
        const wall = (player.wallUntil ?? 0) > timeNow ? ARCADE_POWERUP_WALL_SAVE_SCALE : 1
        const mini = (player.miniUntil ?? 0) > timeNow ? ARCADE_POWERUP_MINI_SAVE_SCALE : 1
        player.saveRadiusScale = wall * mini
      }
    }

    return this.powerups.update({ ...options, rain: this.events.is('rain') })
  }

  // ─── Visuales post-puppet ─────────────────────────────────────────────────

  /**
   * Retoques visuales tras la pose (tambaleo, hielo, escudo, muro, mini) y partículas.
   * `emitSteps` son los pasos de simulación del fotograma: se emite por paso y no por
   * fotograma, así estelas y auras tienen la misma densidad a 30, 60 o 144 fps.
   */
  postVisuals(players: Player[], ball: Ball, ballVelocity: Vector, timeNow: number, emitSteps: number) {
    for (const player of players) {
      const c = player.container
      const suspended = !isActive(player, timeNow)
      const stunned = isStunned(player, timeNow)

      if (stunned && player.stunKind === 'check' && !suspended) {
        const left = Math.min(1, (player.stunUntil! - timeNow) / ARCADE_CHECK_STUN_MS)
        const dir = (c.getData('tumbleDir') as number | undefined) ?? 1
        // La caída la anima el rig (fallGait); aquí solo un tambaleo leve hacia el lado del golpe
        c.setRotation(dir * Math.sin(timeNow * 0.03) * 0.12 * left)
      }
      this.fx.setFrozen(player.id, stunned && player.stunKind === 'freeze' && !suspended, c.x, c.y)
      this.fx.setShielded(player.id, isShielded(player, timeNow) && !suspended, c.x, c.y, timeNow)

      if (suspended) continue
      if (player.role === 'goalie') {
        let scale = (player.wallUntil ?? 0) > timeNow ? 1.28 : 1
        if ((player.miniUntil ?? 0) > timeNow) scale *= ARCADE_POWERUP_MINI_VISUAL
        if (scale !== 1) c.setScale(c.scaleX * scale, c.scaleY * scale)
      }
      if (!emitSteps) continue
      if (player.onFire || player.fireShotReady) this.fx.aura('fire', c.x, c.y - 20, emitSteps)
      else if ((player.turboUntil ?? 0) > timeNow && Math.hypot(player.velocity.x, player.velocity.y) > 60) this.fx.aura('turbo', c.x, c.y, emitSteps)
      if ((player.magnetUntil ?? 0) > timeNow) this.fx.aura('magnet', c.x, c.y, emitSteps)
      if (isShielded(player, timeNow)) this.fx.aura('shield', c.x, c.y, emitSteps)
    }

    if (!emitSteps) return
    const bs = ball.visual
    const trail = this.tricks.trailKind() ?? (this.shotFx?.kind ?? null)
    this.fx.ballTrail(bs.x, bs.y, Math.hypot(ballVelocity.x, ballVelocity.y), trail, emitSteps)
  }

  /** Texto de estado del jugador controlado (y del evento en curso) para el HUD arcade. */
  getStatusLine(player: Player, players: Player[], timeNow: number) {
    const secs = (until?: number) => Math.ceil(((until ?? 0) - timeNow) / 1000)
    const parts: string[] = []
    const event = this.events.statusLine()
    if (event) parts.push(event)
    if (this.tricks.superReady(player.team)) parts.push('SÚPER LISTO')
    if (player.onFire) parts.push('EN LLAMAS')
    else if (player.fireShotReady) parts.push('BOLA DE FUEGO LISTA')
    if ((player.turboUntil ?? 0) > timeNow) parts.push(`TURBO ${secs(player.turboUntil)}s`)
    if ((player.magnetUntil ?? 0) > timeNow) parts.push(`IMÁN ${secs(player.magnetUntil)}s`)
    if (isShielded(player, timeNow)) parts.push(`ESCUDO ${secs(player.shieldUntil)}s`)
    if (this.powerups.crazyUntil > timeNow) parts.push(`BOLA LOCA ${secs(this.powerups.crazyUntil)}s`)
    const goalie = players.find(p => p.role === 'goalie' && p.team === player.team)
    if (goalie && (goalie.wallUntil ?? 0) > timeNow) parts.push(`MURO ${secs(goalie.wallUntil)}s`)
    const rivalGoalie = players.find(p => p.role === 'goalie' && p.team !== player.team)
    if (rivalGoalie && (rivalGoalie.miniUntil ?? 0) > timeNow) parts.push(`MINI ${secs(rivalGoalie.miniUntil)}s`)
    if (goalie && (goalie.miniUntil ?? 0) > timeNow) parts.push(`¡TU PORTERO MINI! ${secs(goalie.miniUntil)}s`)
    return parts.join('  ·  ')
  }

  /** Color de equipo en hex CSS para textos. */
  static teamHex(team: TeamColor) {
    return TEAM_HEX[team]
  }

  destroy() {
    this.powerups.destroy()
    this.events.reset()
  }
}
