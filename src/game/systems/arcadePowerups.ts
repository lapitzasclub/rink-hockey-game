import * as Phaser from 'phaser'
import {
  ARCADE_CHECK_KNOCKBACK,
  ARCADE_EVENT_RAIN_INTERVAL_MS,
  ARCADE_EVENT_RAIN_MAX_ACTIVE,
  ARCADE_POWERUP_AI_SEEK_RADIUS,
  ARCADE_POWERUP_BOLT_RADIUS,
  ARCADE_POWERUP_BOLT_STUN_MS,
  ARCADE_POWERUP_CRAZY_MS,
  ARCADE_POWERUP_FIRST_DELAY_MS,
  ARCADE_POWERUP_FREEZE_MS,
  ARCADE_POWERUP_FREEZE_TARGETS,
  ARCADE_POWERUP_INTERVAL_MAX_MS,
  ARCADE_POWERUP_INTERVAL_MIN_MS,
  ARCADE_POWERUP_LIFETIME_MS,
  ARCADE_POWERUP_MAGNET_MS,
  ARCADE_POWERUP_MAX_ACTIVE,
  ARCADE_POWERUP_MINI_MS,
  ARCADE_POWERUP_PICKUP_RADIUS,
  ARCADE_POWERUP_SHIELD_MS,
  ARCADE_POWERUP_TURBO_MS,
  ARCADE_POWERUP_WALL_MS,
  ARCADE_POWERUP_WEIGHTS,
  PLAYER_ACCEL,
  RINK,
} from '../constants'
import { worldToScreen } from '../render/viewTransform'
import { getPowerupColor, type ArcadeFx } from '../render/arcadeFx'
import { announce, announceOneOf } from '../audio/announcer'
import { playBolt, playFreeze, playPowerup } from '../audio/sounds'
import type { Ball, Player, PowerupKind, TeamColor, Vector } from '../types'

/** Cambio de posesión que la escena aplica (la escena sigue siendo la dueña de la bola). */
export type BallChange = { ballCarrierId: string | null, ballVelocity: Vector, lastTouch?: TeamColor }

type Powerup = {
  kind: PowerupKind
  pos: Vector
  expiresAt: number
  sprite: Phaser.GameObjects.Image
  glow: Phaser.GameObjects.Image
}

export const POWERUP_NAMES: Record<PowerupKind, string> = {
  fire: 'BOLA DE FUEGO',
  turbo: 'TURBO',
  freeze: 'CONGELAR',
  magnet: 'IMÁN',
  wall: 'MURO',
  bolt: 'RAYO',
  crazy: 'BOLA LOCA',
  shield: 'ESCUDO',
  mini: 'PORTERÍA MINI',
}

export function isActive(player: Player, timeNow: number) {
  return !(player.suspendedUntil && player.suspendedUntil > timeNow)
}

export function isStunned(player: Player, timeNow: number) {
  return (player.stunUntil ?? 0) > timeNow
}

export function isShielded(player: Player, timeNow: number) {
  return (player.shieldUntil ?? 0) > timeNow
}

function pickPowerupKind(): PowerupKind {
  const entries = Object.entries(ARCADE_POWERUP_WEIGHTS) as [PowerupKind, number][]
  let roll = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0)
  for (const [kind, weight] of entries) {
    roll -= weight
    if (roll <= 0) return kind
  }
  return 'fire'
}

/** Suelta la bola de un portador alcanzado por un efecto, en dirección `angle`. */
function knockBallLoose(ball: Ball, target: Player, angle: number, power: number): BallChange {
  ball.x = target.pos.x + Math.cos(angle) * 24
  ball.y = target.pos.y + Math.sin(angle) * 24
  return { ballCarrierId: null, ballVelocity: { x: Math.cos(angle) * power, y: Math.sin(angle) * power } }
}

/**
 * Orbes de powerup del arcade: aparición (más seguida durante la lluvia de powerups),
 * caducidad, recogida, desvío de la IA hacia ellos y su efecto.
 */
export class ArcadePowerups {
  /** Bola loca activa hasta este instante (afecta a la bola, sea quien sea el portador). */
  crazyUntil = 0
  private powerups: Powerup[] = []
  private nextPowerupAt = 0
  private readonly layer: Phaser.GameObjects.Container

  private readonly scene: Phaser.Scene
  private readonly fx: ArcadeFx

  constructor(scene: Phaser.Scene, fx: ArcadeFx) {
    this.scene = scene
    this.fx = fx
    // Capa creada antes que los jugadores para que los orbes queden por debajo
    this.layer = scene.add.container(0, 0)
  }

  start(timeNow: number) {
    this.nextPowerupAt = timeNow + ARCADE_POWERUP_FIRST_DELAY_MS
    this.crazyUntil = 0
  }

  update(options: {
    timeNow: number
    dt: number
    players: Player[]
    ballCarrierId: string | null
    ball: Ball
    controlledId: string
    rain: boolean
  }): BallChange | null {
    const { timeNow, players } = options
    const [rainMin, rainMax] = ARCADE_EVENT_RAIN_INTERVAL_MS
    if (options.rain) this.nextPowerupAt = Math.min(this.nextPowerupAt, timeNow + rainMax)

    if (timeNow >= this.nextPowerupAt) {
      const max = options.rain ? ARCADE_EVENT_RAIN_MAX_ACTIVE : ARCADE_POWERUP_MAX_ACTIVE
      if (this.powerups.length < max) this.spawnPowerup(timeNow)
      this.nextPowerupAt = timeNow + (options.rain
        ? Phaser.Math.Between(rainMin, rainMax)
        : Phaser.Math.Between(ARCADE_POWERUP_INTERVAL_MIN_MS, ARCADE_POWERUP_INTERVAL_MAX_MS))
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
        const result = this.apply(powerup.kind, collector, players, options.ball, options.ballCarrierId, timeNow)
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

  private apply(kind: PowerupKind, player: Player, players: Player[], ball: Ball, ballCarrierId: string | null, timeNow: number): BallChange | null {
    playPowerup()
    const sp = worldToScreen(player.pos.x, player.pos.y)
    this.fx.burst('gold', sp.x, sp.y - 16, 20)
    const color = '#' + getPowerupColor(kind).toString(16).padStart(6, '0')
    this.fx.floatText(sp.x, sp.y - 58, POWERUP_NAMES[kind], color, 20)
    if (player.team === 'blue') announce(POWERUP_NAMES[kind].toLowerCase())

    const rivals = players.filter(p => p.team !== player.team && p.role !== 'goalie' && isActive(p, timeNow) && !isStunned(p, timeNow) && !isShielded(p, timeNow))
    const byDistance = (a: Player, b: Player) => Phaser.Math.Distance.Between(a.pos.x, a.pos.y, player.pos.x, player.pos.y) - Phaser.Math.Distance.Between(b.pos.x, b.pos.y, player.pos.x, player.pos.y)

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
      case 'shield':
        player.shieldUntil = timeNow + ARCADE_POWERUP_SHIELD_MS
        player.ballProtectionUntil = Math.max(player.ballProtectionUntil ?? 0, player.shieldUntil)
        // El escudo también descongela y levanta al instante
        player.stunUntil = 0
        player.stunKind = undefined
        break
      case 'wall': {
        const goalie = players.find(p => p.role === 'goalie' && p.team === player.team)
        if (goalie) goalie.wallUntil = timeNow + ARCADE_POWERUP_WALL_MS
        break
      }
      case 'mini': {
        const goalie = players.find(p => p.role === 'goalie' && p.team !== player.team)
        if (goalie) {
          goalie.miniUntil = timeNow + ARCADE_POWERUP_MINI_MS
          const gp = worldToScreen(goalie.pos.x, goalie.pos.y)
          this.fx.burst('white', gp.x, gp.y - 20, 16)
          this.fx.floatText(gp.x, gp.y - 64, '¡MINI!', color, 22)
        }
        if (player.team === 'blue') announceOneOf(['¡Portería mini!', '¡Que encoja el portero!'])
        break
      }
      case 'crazy':
        this.crazyUntil = timeNow + ARCADE_POWERUP_CRAZY_MS
        announceOneOf(['¡Bola loca!', '¡La bola se ha vuelto loca!'])
        break
      case 'bolt': {
        playBolt()
        let targets = rivals.filter(p => Phaser.Math.Distance.Between(p.pos.x, p.pos.y, player.pos.x, player.pos.y) < ARCADE_POWERUP_BOLT_RADIUS)
        // Sin nadie cerca, el rayo busca al rival más próximo: recogerlo siempre tiene premio
        if (!targets.length) targets = rivals.sort(byDistance).slice(0, 1)
        for (const target of targets) {
          const dx = target.pos.x - player.pos.x
          const dy = target.pos.y - player.pos.y
          const len = Math.hypot(dx, dy) || 1
          target.velocity.x = (dx / len) * ARCADE_CHECK_KNOCKBACK * 0.6
          target.velocity.y = (dy / len) * ARCADE_CHECK_KNOCKBACK * 0.6
          target.stunUntil = timeNow + ARCADE_POWERUP_BOLT_STUN_MS
          target.stunKind = 'check'
          target.ignoreBallUntil = timeNow + ARCADE_POWERUP_BOLT_STUN_MS
          target.container.setData('tumbleDir', Math.sign(dx) || 1)
          const tp = worldToScreen(target.pos.x, target.pos.y)
          this.fx.lightning(tp.x, tp.y)
          this.fx.floatText(tp.x, tp.y - 60, '¡ZZZAP!', color, 22)
          if (ballCarrierId === target.id) change = knockBallLoose(ball, target, Math.atan2(dy, dx), 200)
        }
        this.fx.shockwave(sp.x, sp.y, getPowerupColor('bolt'), (ARCADE_POWERUP_BOLT_RADIUS / 64) * 2)
        this.scene.cameras.main.shake(180, 0.008)
        if (targets.length > 1) announceOneOf(['¡Rayo múltiple!', '¡Electrocutados!'])
        break
      }
      case 'freeze': {
        playFreeze()
        const targets = rivals.sort(byDistance).slice(0, ARCADE_POWERUP_FREEZE_TARGETS)
        for (const target of targets) {
          target.stunUntil = timeNow + ARCADE_POWERUP_FREEZE_MS
          target.stunKind = 'freeze'
          target.velocity = { x: 0, y: 0 }
          target.ignoreBallUntil = timeNow + ARCADE_POWERUP_FREEZE_MS
          const tp = worldToScreen(target.pos.x, target.pos.y)
          this.fx.burst('ice', tp.x, tp.y - 16, 18)
          if (ballCarrierId === target.id) change = knockBallLoose(ball, target, Math.random() * Math.PI * 2, 140)
        }
        break
      }
    }
    return change
  }

  destroy() {
    for (const powerup of this.powerups) {
      powerup.sprite.destroy()
      powerup.glow.destroy()
    }
    this.powerups = []
  }
}
