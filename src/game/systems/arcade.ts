import * as Phaser from 'phaser'
import {
  ARCADE_CHECK_BALL_POWER,
  ARCADE_CHECK_COOLDOWN_MS,
  ARCADE_CHECK_COST,
  ARCADE_CHECK_KNOCKBACK,
  ARCADE_CHECK_LUNGE,
  ARCADE_CHECK_RANGE,
  ARCADE_CHECK_STUN_MS,
  ARCADE_FIRE_SHOT_BEAT_GOALIE,
  ARCADE_FIRE_SHOT_POWER,
  ARCADE_ON_FIRE_GOALS,
  ARCADE_POWERUP_AI_SEEK_RADIUS,
  ARCADE_POWERUP_FIRE_BEAT_GOALIE,
  ARCADE_POWERUP_FIRST_DELAY_MS,
  ARCADE_POWERUP_FREEZE_MS,
  ARCADE_POWERUP_FREEZE_TARGETS,
  ARCADE_POWERUP_INTERVAL_MAX_MS,
  ARCADE_POWERUP_INTERVAL_MIN_MS,
  ARCADE_POWERUP_LIFETIME_MS,
  ARCADE_POWERUP_MAGNET_MS,
  ARCADE_POWERUP_MAX_ACTIVE,
  ARCADE_POWERUP_PICKUP_RADIUS,
  ARCADE_POWERUP_TURBO_MS,
  ARCADE_POWERUP_TURBO_SPEED,
  ARCADE_POWERUP_WALL_MS,
  ARCADE_POWERUP_WALL_SAVE_SCALE,
  ARCADE_RUBBER_BAND_MAX,
  ARCADE_RUBBER_BAND_PER_GOAL,
  ARCADE_SHOOTER_CREDIT_MS,
  ARCADE_SHOT_FX_MS,
  ARCADE_TURBO_SHOT_BEAT_GOALIE,
  ARCADE_TURBO_SHOT_COST,
  ARCADE_TURBO_SHOT_POWER,
  ARCADE_TURBO_SPEED_BONUS,
  PLAYER_ACCEL,
  RINK,
  STAMINA_MAX,
} from '../constants'
import { worldToScreen } from '../render/viewTransform'
import { getPowerupColor, type ArcadeFx } from '../render/arcadeFx'
import { announce, announceOneOf } from '../audio/announcer'
import { playCheck, playFireShot, playFreeze, playOnFire, playPowerup, playTurboShot } from '../audio/sounds'
import { findPlayerById } from './playerHelpers'
import type { Ball, Player, PowerupKind, TeamColor, Vector } from '../types'

export type ShotKind = 'turbo' | 'fire'

type Powerup = {
  kind: PowerupKind
  pos: Vector
  expiresAt: number
  sprite: Phaser.GameObjects.Image
  glow: Phaser.GameObjects.Image
}

type BallChange = { ballCarrierId: string | null, ballVelocity: Vector, lastTouch?: TeamColor }

const POWERUP_WEIGHTS: [PowerupKind, number][] = [
  ['fire', 0.24],
  ['turbo', 0.24],
  ['freeze', 0.18],
  ['magnet', 0.16],
  ['wall', 0.18],
]

const POWERUP_NAMES: Record<PowerupKind, string> = {
  fire: 'BOLA DE FUEGO',
  turbo: 'TURBO',
  freeze: 'CONGELAR',
  magnet: 'IMÁN',
  wall: 'MURO',
}

const TEAM_HEX: Record<TeamColor, string> = { blue: '#4da3ff', red: '#ff5d6c' }

function isActive(player: Player, timeNow: number) {
  return !(player.suspendedUntil && player.suspendedUntil > timeNow)
}

function isStunned(player: Player, timeNow: number) {
  return (player.stunUntil ?? 0) > timeNow
}

function pickPowerupKind(): PowerupKind {
  let roll = Math.random()
  for (const [kind, weight] of POWERUP_WEIGHTS) {
    roll -= weight
    if (roll <= 0) return kind
  }
  return 'fire'
}

/**
 * Estado y reglas del modo arcade (estilo NBA Jam).
 *
 * La escena sigue siendo la dueña de la bola y la posesión: los métodos que
 * la alteran devuelven un BallChange para que la escena lo aplique, igual que
 * las acciones de matchActions.
 */
export class ArcadeController {
  private powerups: Powerup[] = []
  private nextPowerupAt = 0
  private layer: Phaser.GameObjects.Container
  private shotFx: { kind: ShotKind, shooterId: string, until: number } | null = null
  private lastShooter: { id: string, team: TeamColor, at: number } | null = null
  private streaks = new Map<string, number>()

  private readonly scene: Phaser.Scene
  private readonly fx: ArcadeFx

  constructor(scene: Phaser.Scene, fx: ArcadeFx) {
    this.scene = scene
    this.fx = fx
    // Capa creada antes que los jugadores para que los orbes queden por debajo
    this.layer = scene.add.container(0, 0)
  }

  /** Reinicia el estado por jugador al empezar el partido. */
  start(players: Player[], timeNow: number) {
    for (const player of players) {
      player.speedMultiplier = 1
      player.saveRadiusScale = 1
      player.onFire = false
      player.fireShotReady = false
    }
    this.nextPowerupAt = timeNow + ARCADE_POWERUP_FIRST_DELAY_MS
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
   * Fuego (racha o powerup) tiene prioridad y es gratis; turbo cuesta stamina.
   */
  prepareShot(player: Player, wantsTurbo: boolean): { power: number, kind: ShotKind | null, beatChance: number } {
    if (player.role === 'goalie') return { power: 1, kind: null, beatChance: 0 }
    if (player.fireShotReady) {
      player.fireShotReady = false
      return { power: ARCADE_FIRE_SHOT_POWER, kind: 'fire', beatChance: ARCADE_POWERUP_FIRE_BEAT_GOALIE }
    }
    if (player.onFire) return { power: ARCADE_FIRE_SHOT_POWER, kind: 'fire', beatChance: ARCADE_FIRE_SHOT_BEAT_GOALIE }
    if (wantsTurbo && (player.stamina ?? STAMINA_MAX) >= ARCADE_TURBO_SHOT_COST) {
      player.stamina = (player.stamina ?? STAMINA_MAX) - ARCADE_TURBO_SHOT_COST
      return { power: ARCADE_TURBO_SHOT_POWER, kind: 'turbo', beatChance: ARCADE_TURBO_SHOT_BEAT_GOALIE }
    }
    return { power: 1, kind: null, beatChance: 0 }
  }

  /**
   * Registra el tiro ya soltado: crédito para la racha, efectos y, si sale la
   * tirada, desactiva al portero rival durante el vuelo de la bola.
   * Devuelve true si el tiro supera al portero.
   */
  onShotReleased(player: Player, players: Player[], ball: Ball, ballVelocity: Vector, shot: { kind: ShotKind | null, beatChance: number }, timeNow: number) {
    this.lastShooter = { id: player.id, team: player.team, at: timeNow }
    if (!shot.kind) return false

    this.shotFx = { kind: shot.kind, shooterId: player.id, until: timeNow + ARCADE_SHOT_FX_MS }
    const sp = worldToScreen(ball.x, ball.y)
    if (shot.kind === 'fire') {
      playFireShot()
      this.fx.burst('fire', sp.x, sp.y, 18)
      announceOneOf(['¡Bola de fuego!', '¡Está ardiendo!', '¡Fuego!'])
    } else {
      playTurboShot()
      this.fx.burst('white', sp.x, sp.y, 10)
    }

    if (Math.random() >= shot.beatChance) return false
    const goalie = players.find(p => p.role === 'goalie' && p.team !== player.team)
    if (!goalie) return false
    const speed = Math.hypot(ballVelocity.x, ballVelocity.y) || 1
    const distance = Phaser.Math.Distance.Between(ball.x, ball.y, goalie.pos.x, goalie.pos.y)
    goalie.saveDisabledUntil = timeNow + Math.min(ARCADE_SHOT_FX_MS, (distance / speed) * 1000 + 350)
    return true
  }

  // ─── Cargas ───────────────────────────────────────────────────────────────

  /**
   * Carga con el cuerpo al rival más cercano (no portero). Lo aturde, lo
   * empuja y, si llevaba la bola, la suelta. Nunca es falta en arcade.
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
      if (!isActive(rival, timeNow) || isStunned(rival, timeNow)) continue
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
   * Actualiza rachas tras un gol. El tirador acreditado suma; el equipo que
   * encaja pierde todas sus rachas (y el fuego).
   * Devuelve el texto secundario para el banner.
   */
  onGoal(scorer: TeamColor, players: Player[], timeNow: number): { sub: string, onFireStarted: boolean, fireGoal: boolean } {
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
    if (!credit) return { sub: '', onFireStarted: false, fireGoal }

    const streak = (this.streaks.get(credit.id) ?? 0) + 1
    this.streaks.set(credit.id, streak)
    if (streak >= ARCADE_ON_FIRE_GOALS && !credit.onFire) {
      credit.onFire = true
      playOnFire()
      this.scene.time.delayedCall(900, () => announce('¡Está en llamas!', true))
      return { sub: '¡EN LLAMAS!', onFireStarted: true, fireGoal }
    }
    if (streak === ARCADE_ON_FIRE_GOALS - 1) return { sub: '¡SE ESTÁ CALENTANDO!', onFireStarted: false, fireGoal }
    return { sub: credit.onFire ? '¡IMPARABLE!' : '', onFireStarted: false, fireGoal }
  }

  private clearShotFx(players: Player[]) {
    this.shotFx = null
    for (const player of players) player.saveDisabledUntil = 0
  }

  // ─── Tick ─────────────────────────────────────────────────────────────────

  /**
   * Tick arcade: estados temporales, velocidad por rubber-banding y turbo,
   * powerups (aparición, caducidad, recogida, IA) y fin del efecto de tiro.
   * Devuelve un cambio de bola si un congelado soltó la posesión.
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

    if (this.shotFx && (timeNow > this.shotFx.until || options.ballCarrierId)) this.clearShotFx(players)

    const diff = options.blueScore - options.redScore
    const rubber = (team: TeamColor) => {
      const behind = team === 'blue' ? -diff : diff
      return behind > 0 ? 1 + Math.min(ARCADE_RUBBER_BAND_MAX, behind * ARCADE_RUBBER_BAND_PER_GOAL) : 1
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
        const wall = (player.wallUntil ?? 0) > timeNow
        player.saveRadiusScale = wall ? ARCADE_POWERUP_WALL_SAVE_SCALE : 1
      }
    }

    return this.updatePowerups(options)
  }

  private updatePowerups(options: {
    timeNow: number
    dt: number
    players: Player[]
    ballCarrierId: string | null
    ball: Ball
    controlledId: string
  }): BallChange | null {
    const { timeNow, players } = options

    if (timeNow >= this.nextPowerupAt) {
      if (this.powerups.length < ARCADE_POWERUP_MAX_ACTIVE) this.spawnPowerup(timeNow)
      this.nextPowerupAt = timeNow + Phaser.Math.Between(ARCADE_POWERUP_INTERVAL_MIN_MS, ARCADE_POWERUP_INTERVAL_MAX_MS)
    }

    let change: BallChange | null = null
    for (const powerup of [...this.powerups]) {
      if (timeNow >= powerup.expiresAt) {
        this.removePowerup(powerup)
        continue
      }

      // Bote y parpadeo antes de caducar
      const sp = worldToScreen(powerup.pos.x, powerup.pos.y)
      const bob = Math.sin(timeNow * 0.006) * 4
      const remaining = powerup.expiresAt - timeNow
      const blink = remaining < 2500 && Math.floor(timeNow / 120) % 2 === 0 ? 0.35 : 1
      powerup.sprite.setPosition(sp.x, sp.y - 16 + bob).setAlpha(blink)
      powerup.glow.setPosition(sp.x, sp.y - 16 + bob).setScale(1.1 + Math.sin(timeNow * 0.01) * 0.12)

      let collector: Player | null = null
      let best = ARCADE_POWERUP_PICKUP_RADIUS
      for (const player of players) {
        if (player.role === 'goalie' || !isActive(player, timeNow) || isStunned(player, timeNow)) continue
        const d = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, powerup.pos.x, powerup.pos.y)
        if (d < best) {
          best = d
          collector = player
        }
      }
      if (collector) {
        const result = this.applyPowerup(powerup.kind, collector, players, options.ball, options.ballCarrierId, timeNow)
        if (result) change = result
        this.removePowerup(powerup)
        continue
      }

      this.nudgeAiTowards(powerup, players, options.ballCarrierId, options.controlledId, options.dt, timeNow)
    }
    return change
  }

  /** La IA libre más cercana se desvía un poco hacia un powerup cercano. */
  private nudgeAiTowards(powerup: Powerup, players: Player[], ballCarrierId: string | null, controlledId: string, dt: number, timeNow: number) {
    let seeker: Player | null = null
    let best = ARCADE_POWERUP_AI_SEEK_RADIUS
    for (const player of players) {
      if (player.role === 'goalie' || player.id === controlledId || player.id === ballCarrierId) continue
      if (!isActive(player, timeNow) || isStunned(player, timeNow)) continue
      const d = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, powerup.pos.x, powerup.pos.y)
      if (d < best) {
        best = d
        seeker = player
      }
    }
    if (!seeker) return
    const dx = powerup.pos.x - seeker.pos.x
    const dy = powerup.pos.y - seeker.pos.y
    const len = Math.hypot(dx, dy) || 1
    seeker.velocity.x += (dx / len) * PLAYER_ACCEL * 0.7 * dt
    seeker.velocity.y += (dy / len) * PLAYER_ACCEL * 0.7 * dt
  }

  private spawnPowerup(timeNow: number) {
    const kind = pickPowerupKind()
    const pos = {
      x: Phaser.Math.Between(RINK.x + 220, RINK.x + RINK.width - 220),
      y: Phaser.Math.Between(RINK.y + 90, RINK.y + RINK.height - 110),
    }
    const sp = worldToScreen(pos.x, pos.y)
    const glow = this.scene.add.image(sp.x, sp.y, 'fx-dot').setTint(getPowerupColor(kind)).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setAlpha(0.7)
    const sprite = this.scene.add.image(sp.x, sp.y, `pu-${kind}`)
    this.layer.add([glow, sprite])
    sprite.setScale(0)
    this.scene.tweens.add({ targets: sprite, scale: 1, duration: 320, ease: 'Back.Out' })
    this.powerups.push({ kind, pos, expiresAt: timeNow + ARCADE_POWERUP_LIFETIME_MS, sprite, glow })
  }

  private removePowerup(powerup: Powerup) {
    this.powerups = this.powerups.filter(p => p !== powerup)
    powerup.sprite.destroy()
    powerup.glow.destroy()
  }

  private applyPowerup(kind: PowerupKind, player: Player, players: Player[], ball: Ball, ballCarrierId: string | null, timeNow: number): BallChange | null {
    playPowerup()
    const sp = worldToScreen(player.pos.x, player.pos.y)
    this.fx.burst('gold', sp.x, sp.y - 16, 20)
    const color = '#' + getPowerupColor(kind).toString(16).padStart(6, '0')
    this.fx.floatText(sp.x, sp.y - 58, POWERUP_NAMES[kind], color, 20)
    if (player.team === 'blue') announce(POWERUP_NAMES[kind].toLowerCase())

    let change: BallChange | null = null
    switch (kind) {
      case 'fire':
        player.fireShotReady = true
        break
      case 'turbo':
        player.turboUntil = timeNow + ARCADE_POWERUP_TURBO_MS
        break
      case 'magnet':
        player.magnetUntil = timeNow + ARCADE_POWERUP_MAGNET_MS
        player.ballProtectionUntil = Math.max(player.ballProtectionUntil ?? 0, timeNow + ARCADE_POWERUP_MAGNET_MS)
        break
      case 'wall': {
        const goalie = players.find(p => p.role === 'goalie' && p.team === player.team)
        if (goalie) goalie.wallUntil = timeNow + ARCADE_POWERUP_WALL_MS
        break
      }
      case 'freeze': {
        playFreeze()
        const targets = players
          .filter(p => p.team !== player.team && p.role !== 'goalie' && isActive(p, timeNow) && !isStunned(p, timeNow))
          .sort((a, b) => Phaser.Math.Distance.Between(a.pos.x, a.pos.y, player.pos.x, player.pos.y) - Phaser.Math.Distance.Between(b.pos.x, b.pos.y, player.pos.x, player.pos.y))
          .slice(0, ARCADE_POWERUP_FREEZE_TARGETS)
        for (const target of targets) {
          target.stunUntil = timeNow + ARCADE_POWERUP_FREEZE_MS
          target.stunKind = 'freeze'
          target.velocity = { x: 0, y: 0 }
          target.ignoreBallUntil = timeNow + ARCADE_POWERUP_FREEZE_MS
          const tp = worldToScreen(target.pos.x, target.pos.y)
          this.fx.burst('ice', tp.x, tp.y - 16, 18)
          if (ballCarrierId === target.id) {
            const angle = Math.random() * Math.PI * 2
            ball.x = target.pos.x + Math.cos(angle) * 24
            ball.y = target.pos.y + Math.sin(angle) * 24
            change = { ballCarrierId: null, ballVelocity: { x: Math.cos(angle) * 140, y: Math.sin(angle) * 140 } }
          }
        }
        break
      }
    }
    return change
  }

  // ─── Visuales post-puppet ─────────────────────────────────────────────────

  /**
   * Retoques visuales que se aplican después de updateVisuals: volteretas de
   * carga, bloques de hielo, auras de fuego/turbo/imán, portero muro y estela.
   */
  /**
   * Retoques visuales tras la pose (tambaleo, hielo, muro) y partículas. `emitSteps`
   * son los pasos de simulación del fotograma: se emite por paso y no por fotograma,
   * así estelas y auras tienen la misma densidad a 30, 60 o 144 fps.
   */
  postVisuals(players: Player[], ball: Ball, ballVelocity: Vector, timeNow: number, emitSteps: number) {
    for (const player of players) {
      const c = player.container
      const suspended = !isActive(player, timeNow)
      const stunned = isStunned(player, timeNow)

      if (stunned && player.stunKind === 'check' && !suspended) {
        const left = (player.stunUntil! - timeNow) / ARCADE_CHECK_STUN_MS
        const dir = (c.getData('tumbleDir') as number | undefined) ?? 1
        // La caída la anima el rig (fallGait); aquí solo un tambaleo leve hacia el lado del golpe
        c.setRotation(dir * Math.sin(timeNow * 0.03) * 0.12 * left)
      }
      this.fx.setFrozen(player.id, stunned && player.stunKind === 'freeze' && !suspended, c.x, c.y)

      if (suspended) continue
      if (player.role === 'goalie' && (player.wallUntil ?? 0) > timeNow) {
        c.setScale(c.scaleX * 1.28, c.scaleY * 1.28)
      }
      if (!emitSteps) continue
      if (player.onFire || player.fireShotReady) this.fx.aura('fire', c.x, c.y - 20, emitSteps)
      else if ((player.turboUntil ?? 0) > timeNow && Math.hypot(player.velocity.x, player.velocity.y) > 60) this.fx.aura('turbo', c.x, c.y, emitSteps)
      if ((player.magnetUntil ?? 0) > timeNow) this.fx.aura('magnet', c.x, c.y, emitSteps)
    }

    if (!emitSteps) return
    const bs = ball.visual
    this.fx.ballTrail(bs.x, bs.y, Math.hypot(ballVelocity.x, ballVelocity.y), this.shotFx?.kind ?? null, emitSteps)
  }

  /** Texto de estado del jugador controlado para el HUD arcade. */
  getStatusLine(player: Player, players: Player[], timeNow: number) {
    const secs = (until?: number) => Math.ceil(((until ?? 0) - timeNow) / 1000)
    const parts: string[] = []
    if (player.onFire) parts.push('EN LLAMAS')
    else if (player.fireShotReady) parts.push('BOLA DE FUEGO LISTA')
    if ((player.turboUntil ?? 0) > timeNow) parts.push(`TURBO ${secs(player.turboUntil)}s`)
    if ((player.magnetUntil ?? 0) > timeNow) parts.push(`IMÁN ${secs(player.magnetUntil)}s`)
    const goalie = players.find(p => p.role === 'goalie' && p.team === player.team)
    if (goalie && (goalie.wallUntil ?? 0) > timeNow) parts.push(`MURO ${secs(goalie.wallUntil)}s`)
    return parts.join('  ·  ')
  }

  /** Color de equipo en hex CSS para textos. */
  static teamHex(team: TeamColor) {
    return TEAM_HEX[team]
  }

  destroy() {
    for (const powerup of this.powerups) {
      powerup.sprite.destroy()
      powerup.glow.destroy()
    }
    this.powerups = []
  }
}
