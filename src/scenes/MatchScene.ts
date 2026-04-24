import * as Phaser from 'phaser'
import {
  BALL_CONTROL_DISTANCE,
  BALL_FRICTION,
  BALL_PICKUP_DISTANCE,
  GAME_HEIGHT,
  GAME_WIDTH,
  GOAL_HEIGHT,
  GOALIE_RADIUS,
  MATCH_DURATION,
  PASS_POWER,
  PLAYER_ACCEL,
  PLAYER_FRICTION,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  RINK,
  SHOT_POWER,
} from '../game/constants'
import { createBall } from '../game/entities/createBall'
import { createPlayer } from '../game/entities/createPlayer'
import { getFormation } from '../game/formation'
import { drawRink } from '../game/render/drawRink'
import type { Player, TeamColor, Vector } from '../game/types'
import { createHud } from '../game/ui/createHud'
import { getRoleName, getRoleShort, normalizedVector } from '../game/utils'

export class MatchScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private shootKey!: Phaser.Input.Keyboard.Key
  private passKey!: Phaser.Input.Keyboard.Key
  private switchKey!: Phaser.Input.Keyboard.Key
  private ball!: Phaser.GameObjects.Arc
  private ballVelocity: Vector = { x: 0, y: 0 }
  private ballCarrierId: string | null = null
  private players: Player[] = []
  private controlledPlayerIndex = 0
  private hudText!: Phaser.GameObjects.Text
  private subHudText!: Phaser.GameObjects.Text
  private centerText!: Phaser.GameObjects.Text
  private blueScore = 0
  private redScore = 0
  private remainingSeconds = MATCH_DURATION
  private matchEnded = false
  private restartAt = 0
  private lastTouch: TeamColor = 'blue'

  constructor() {
    super('match')
  }

  create() {
    this.cameras.main.setBackgroundColor('#08111b')
    drawRink(this)
    this.createInput()
    this.createTeams()
    this.ball = createBall(this)
    const hud = createHud(this)
    this.hudText = hud.hudText
    this.subHudText = hud.subHudText
    this.centerText = hud.centerText
    this.resetKickoff('blue')

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.matchEnded || this.restartAt > 0) return
        this.remainingSeconds = Math.max(0, this.remainingSeconds - 1)
        if (this.remainingSeconds === 0) this.finishMatch()
      },
    })

    this.updateHud()
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.033)

    if (this.matchEnded) {
      if (Phaser.Input.Keyboard.JustDown(this.shootKey)) this.scene.restart()
      return
    }

    if (this.restartAt > 0 && time >= this.restartAt) {
      this.restartAt = 0
      this.centerText.setVisible(false)
      this.resetKickoff(this.lastTouch === 'blue' ? 'red' : 'blue')
    }

    if (this.restartAt > 0) return

    if (Phaser.Input.Keyboard.JustDown(this.switchKey)) {
      this.selectBestControlledPlayer()
    }

    this.updateControlledPlayer(dt)
    this.updateTeamAI(dt)
    this.resolvePlayerSpacing()
    this.updateBall(dt)
    this.handleBallControl()
    this.handleLooseBallContacts()
    this.updateVisuals()
    this.checkGoal(time)
    this.updateHud()
  }

  private createInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.passKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.switchKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
  }

  private createTeams() {
    const blueLayout = getFormation('left')
    const redLayout = getFormation('right')

    this.players = [
      ...blueLayout.map((slot, index) => createPlayer(this, `blue-${index}`, 'blue', 'left', slot.role, slot.x, slot.y, 0x4da3ff, index !== 0)),
      ...redLayout.map((slot, index) => createPlayer(this, `red-${index}`, 'red', 'right', slot.role, slot.x, slot.y, 0xff5d6c, false)),
    ]
  }

  private updateControlledPlayer(dt: number) {
    const player = this.getControlledPlayer()
    let inputX = 0
    let inputY = 0

    if (this.cursors.left.isDown || this.wasd.A.isDown) inputX -= 1
    if (this.cursors.right.isDown || this.wasd.D.isDown) inputX += 1
    if (this.cursors.up.isDown || this.wasd.W.isDown) inputY -= 1
    if (this.cursors.down.isDown || this.wasd.S.isDown) inputY += 1

    const len = Math.hypot(inputX, inputY)
    if (len > 0) {
      player.velocity.x += (inputX / len) * PLAYER_ACCEL * dt
      player.velocity.y += (inputY / len) * PLAYER_ACCEL * dt
      player.facing = { x: inputX / len, y: inputY / len }
    }

    this.applySkating(player, dt)

    if (Phaser.Input.Keyboard.JustDown(this.passKey)) this.tryPass(player)
    if (Phaser.Input.Keyboard.JustDown(this.shootKey)) this.tryShot(player)
  }

  private updateTeamAI(dt: number) {
    const controlled = this.getControlledPlayer()

    for (const player of this.players) {
      if (player.id === controlled.id) continue

      if (player.role === 'goalie') this.updateGoalie(player, dt)
      else this.updateFieldPlayerAI(player, dt)

      this.applySkating(player, dt)

      const hasBall = this.ballCarrierId === player.id
      const distToBall = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)

      if (player.team === 'red') {
        if (hasBall) {
          const shootingLane = player.side === 'right' ? player.pos.x < RINK.x + 380 : player.pos.x > RINK.x + RINK.width - 380
          if (shootingLane) this.tryShot(player)
          else if (Math.random() < 0.015) this.tryPass(player)
        } else if (distToBall < 34 && this.ballCarrierId === null) {
          this.tryClaimBall(player)
        }
      } else if (!hasBall && distToBall < 34 && this.ballCarrierId === null) {
        this.tryClaimBall(player)
      }
    }
  }

  private updateGoalie(player: Player, dt: number) {
    const targetY = Phaser.Math.Clamp(this.ball.y, GAME_HEIGHT / 2 - 120, GAME_HEIGHT / 2 + 120)
    const targetX = player.home.x + (player.side === 'left' ? 12 : -12)
    this.seek(player, { x: targetX, y: targetY }, 0.75, dt)
    player.facing = normalizedVector(this.ball.x - player.pos.x, this.ball.y - player.pos.y, player.facing)
  }

  private updateFieldPlayerAI(player: Player, dt: number) {
    const nearest = this.getClosestPlayerToBall(player.team)
    const hasBall = this.ballCarrierId === player.id
    const sameTeamHasBall = this.ballCarrierId !== null && this.findPlayerById(this.ballCarrierId)?.team === player.team

    let target = { ...player.home }

    if (hasBall) {
      const advance = player.side === 'left' ? 1 : -1
      target = {
        x: player.pos.x + 70 * advance,
        y: GAME_HEIGHT / 2 + Phaser.Math.Clamp(this.ball.y - GAME_HEIGHT / 2, -140, 140),
      }
    } else if (this.ballCarrierId === null && nearest?.id === player.id) {
      target = { x: this.ball.x, y: this.ball.y }
    } else if (sameTeamHasBall) {
      const attackShift = player.side === 'left' ? 80 : -80
      target = {
        x: player.home.x + attackShift,
        y: player.home.y + Phaser.Math.Clamp(this.ball.y - player.home.y, -90, 90),
      }
    } else {
      target = {
        x: player.home.x + Phaser.Math.Clamp(this.ball.x - player.home.x, -140, 140),
        y: player.home.y + Phaser.Math.Clamp(this.ball.y - player.home.y, -110, 110),
      }
    }

    this.seek(player, target, 1, dt)
    player.facing = normalizedVector(target.x - player.pos.x, target.y - player.pos.y, player.facing)
  }

  private seek(player: Player, target: Vector, intensity: number, dt: number) {
    const dx = target.x - player.pos.x
    const dy = target.y - player.pos.y
    const len = Math.hypot(dx, dy)
    if (len < 6) return

    player.velocity.x += (dx / len) * PLAYER_ACCEL * intensity * dt
    player.velocity.y += (dy / len) * PLAYER_ACCEL * intensity * dt
  }

  private applySkating(player: Player, dt: number) {
    player.velocity.x *= PLAYER_FRICTION
    player.velocity.y *= PLAYER_FRICTION

    const speed = Math.hypot(player.velocity.x, player.velocity.y)
    if (speed > PLAYER_MAX_SPEED) {
      player.velocity.x = (player.velocity.x / speed) * PLAYER_MAX_SPEED
      player.velocity.y = (player.velocity.y / speed) * PLAYER_MAX_SPEED
    }

    player.pos.x += player.velocity.x * dt
    player.pos.y += player.velocity.y * dt

    const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
    player.pos.x = Phaser.Math.Clamp(player.pos.x, RINK.x + radius, RINK.x + RINK.width - radius)
    player.pos.y = Phaser.Math.Clamp(player.pos.y, RINK.y + radius, RINK.y + RINK.height - radius)

    if (player.role === 'goalie') {
      const minX = player.side === 'left' ? RINK.x + 28 : RINK.x + RINK.width - 90
      const maxX = player.side === 'left' ? RINK.x + 90 : RINK.x + RINK.width - 28
      player.pos.x = Phaser.Math.Clamp(player.pos.x, minX, maxX)
    }
  }

  private resolvePlayerSpacing() {
    for (let i = 0; i < this.players.length; i += 1) {
      for (let j = i + 1; j < this.players.length; j += 1) {
        const a = this.players[i]
        const b = this.players[j]
        const ar = a.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
        const br = b.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        const dist = Math.hypot(dx, dy) || 1
        const minDist = ar + br + 8

        if (dist < minDist) {
          const push = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          a.pos.x -= nx * push
          a.pos.y -= ny * push
          b.pos.x += nx * push
          b.pos.y += ny * push
          a.velocity.x -= nx * 25
          a.velocity.y -= ny * 25
          b.velocity.x += nx * 25
          b.velocity.y += ny * 25
        }
      }
    }
  }

  private updateBall(dt: number) {
    const carrier = this.ballCarrierId ? this.findPlayerById(this.ballCarrierId) : null

    if (carrier) {
      const carryOffset = carrier.role === 'goalie' ? GOALIE_RADIUS + 8 : PLAYER_RADIUS + 8
      this.ball.x = carrier.pos.x + carrier.facing.x * carryOffset
      this.ball.y = carrier.pos.y + carrier.facing.y * carryOffset
      this.ballVelocity = { x: carrier.velocity.x * 0.35, y: carrier.velocity.y * 0.35 }
      return
    }

    this.ballVelocity.x *= BALL_FRICTION
    this.ballVelocity.y *= BALL_FRICTION
    this.ball.x += this.ballVelocity.x * dt
    this.ball.y += this.ballVelocity.y * dt

    const top = RINK.y + 9
    const bottom = RINK.y + RINK.height - 9
    const left = RINK.x + 9
    const right = RINK.x + RINK.width - 9
    const inGoalMouth = this.ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && this.ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2

    if (this.ball.y <= top || this.ball.y >= bottom) {
      this.ballVelocity.y *= -0.88
      this.ball.y = Phaser.Math.Clamp(this.ball.y, top, bottom)
    }

    if (this.ball.x <= left && !inGoalMouth) {
      this.ballVelocity.x *= -0.88
      this.ball.x = left
    }

    if (this.ball.x >= right && !inGoalMouth) {
      this.ballVelocity.x *= -0.88
      this.ball.x = right
    }
  }

  private handleBallControl() {
    if (this.ballCarrierId) {
      const carrier = this.findPlayerById(this.ballCarrierId)
      if (!carrier) {
        this.ballCarrierId = null
        return
      }

      for (const rival of this.players) {
        if (rival.team === carrier.team) continue
        const tackleDistance = Phaser.Math.Distance.Between(rival.pos.x, rival.pos.y, carrier.pos.x, carrier.pos.y)
        if (tackleDistance < PLAYER_RADIUS + 10) {
          this.releaseBall(carrier.facing, 140)
          break
        }
      }
      return
    }

    const candidates = [...this.players].sort((a, b) => {
      const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, this.ball.x, this.ball.y)
      const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, this.ball.x, this.ball.y)
      return da - db
    })

    for (const player of candidates) {
      if (this.tryClaimBall(player)) break
    }
  }

  private handleLooseBallContacts() {
    if (this.ballCarrierId) return

    for (const player of this.players) {
      const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      const bodyDistance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
      const stickTip = this.getStickTip(player)
      const stickDistance = Phaser.Math.Distance.Between(stickTip.x, stickTip.y, this.ball.x, this.ball.y)

      if (bodyDistance < radius + 9 + 3) {
        const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
        this.kickBall(angle, player.role === 'goalie' ? 70 : 90)
        this.lastTouch = player.team
      }

      if (stickDistance < 14) {
        const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
        this.kickBall(angle, player.role === 'goalie' ? 55 : 70)
        this.lastTouch = player.team
      }
    }
  }

  private tryClaimBall(player: Player) {
    if (this.ballCarrierId) return false
    const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
    if (distance > BALL_PICKUP_DISTANCE) return false

    this.ballCarrierId = player.id
    this.ballVelocity = { x: 0, y: 0 }
    this.lastTouch = player.team
    if (player.team === 'blue' && player.role !== 'goalie') {
      const options = this.getControllablePlayers()
      const index = options.findIndex((candidate) => candidate.id === player.id)
      if (index >= 0) this.controlledPlayerIndex = index
    }
    return true
  }

  private tryPass(player: Player) {
    if (this.ballCarrierId !== player.id) return
    const mate = this.getBestPassTarget(player)
    if (!mate) return

    const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, mate.pos.x, mate.pos.y)
    this.releaseBall({ x: Math.cos(angle), y: Math.sin(angle) }, PASS_POWER)
    this.lastTouch = player.team
  }

  private tryShot(player: Player) {
    if (this.ballCarrierId !== player.id) return

    const goalX = player.side === 'left' ? RINK.x + RINK.width + 30 : RINK.x - 30
    const targetY = GAME_HEIGHT / 2 + Phaser.Math.Between(-40, 40)
    const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, goalX, targetY)
    this.releaseBall({ x: Math.cos(angle), y: Math.sin(angle) }, SHOT_POWER)
    this.lastTouch = player.team
  }

  private releaseBall(direction: Vector, power: number) {
    const carrier = this.ballCarrierId ? this.findPlayerById(this.ballCarrierId) : null
    if (carrier) {
      this.ball.x = carrier.pos.x + direction.x * BALL_CONTROL_DISTANCE
      this.ball.y = carrier.pos.y + direction.y * BALL_CONTROL_DISTANCE
    }

    this.ballCarrierId = null
    this.ballVelocity = { x: direction.x * power, y: direction.y * power }
  }

  private kickBall(angle: number, power: number) {
    this.ballVelocity.x += Math.cos(angle) * power
    this.ballVelocity.y += Math.sin(angle) * power
    const speed = Math.hypot(this.ballVelocity.x, this.ballVelocity.y)
    const maxSpeed = 760
    if (speed > maxSpeed) {
      this.ballVelocity.x = (this.ballVelocity.x / speed) * maxSpeed
      this.ballVelocity.y = (this.ballVelocity.y / speed) * maxSpeed
    }
  }

  private getBestPassTarget(player: Player) {
    const teammates = this.players.filter((candidate) => candidate.team === player.team && candidate.id !== player.id && candidate.role !== 'goalie')
    const attackDirection = player.side === 'left' ? 1 : -1

    return teammates
      .map((candidate) => {
        const dx = candidate.pos.x - player.pos.x
        const dy = candidate.pos.y - player.pos.y
        const forwardness = dx * attackDirection
        const distance = Math.hypot(dx, dy)
        return { candidate, score: forwardness - distance * 0.25 }
      })
      .sort((a, b) => b.score - a.score)[0]?.candidate ?? null
  }

  private updateVisuals() {
    const controlled = this.getControlledPlayer()

    for (const player of this.players) {
      player.body.setPosition(player.pos.x, player.pos.y)
      player.label.setPosition(player.pos.x, player.pos.y - 30)

      const aimX = this.ballCarrierId === player.id ? player.pos.x + player.facing.x * 40 : this.ball.x
      const aimY = this.ballCarrierId === player.id ? player.pos.y + player.facing.y * 40 : this.ball.y
      const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, aimX, aimY)
      player.stick.setPosition(player.pos.x + Math.cos(angle) * 18, player.pos.y + Math.sin(angle) * 18)
      player.stick.rotation = angle

      const active = controlled.id === player.id
      const carrying = this.ballCarrierId === player.id
      player.body.setStrokeStyle(active ? 5 : player.controllable ? 4 : 2, carrying ? 0x9cff7a : active ? 0xfff27a : 0xeaf4ff)
      player.label.setText(`${getRoleShort(player.role)}${active ? '★' : ''}${carrying ? '●' : ''}`)
    }
  }

  private getStickTip(player: Player) {
    const angle = player.stick.rotation
    return { x: player.stick.x + Math.cos(angle) * 14, y: player.stick.y + Math.sin(angle) * 14 }
  }

  private getControllablePlayers() {
    return this.players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
  }

  private getControlledPlayer() {
    const controllables = this.getControllablePlayers()
    return controllables[this.controlledPlayerIndex % controllables.length]
  }

  private selectBestControlledPlayer() {
    const options = this.getControllablePlayers()
    const ballCarrier = this.ballCarrierId ? this.findPlayerById(this.ballCarrierId) : null

    if (ballCarrier?.team === 'blue' && ballCarrier.role !== 'goalie') {
      const index = options.findIndex((player) => player.id === ballCarrier.id)
      if (index >= 0) {
        this.controlledPlayerIndex = index
        return
      }
    }

    const nearestToBall = [...options].sort((a, b) => {
      const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, this.ball.x, this.ball.y)
      const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, this.ball.x, this.ball.y)
      return da - db
    })[0]

    const index = options.findIndex((player) => player.id === nearestToBall.id)
    this.controlledPlayerIndex = index >= 0 ? index : (this.controlledPlayerIndex + 1) % options.length
  }

  private getClosestPlayerToBall(team: TeamColor) {
    const teamPlayers = this.players.filter((player) => player.team === team && player.role !== 'goalie')
    return [...teamPlayers].sort((a, b) => {
      const da = Phaser.Math.Distance.Between(a.pos.x, a.pos.y, this.ball.x, this.ball.y)
      const db = Phaser.Math.Distance.Between(b.pos.x, b.pos.y, this.ball.x, this.ball.y)
      return da - db
    })[0]
  }

  private findPlayerById(id: string) {
    return this.players.find((player) => player.id === id) ?? null
  }

  private checkGoal(time: number) {
    const inGoalY = this.ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && this.ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2
    if (!inGoalY) return

    if (this.ball.x < RINK.x - 10) {
      this.redScore += 1
      this.onGoal('¡Gol rojo!', time)
    } else if (this.ball.x > RINK.x + RINK.width + 10) {
      this.blueScore += 1
      this.onGoal('¡Gol azul!', time)
    }
  }

  private onGoal(message: string, time: number) {
    this.centerText.setText(message).setVisible(true)
    this.restartAt = time + 1800
    this.ballCarrierId = null
    this.ballVelocity = { x: 0, y: 0 }
    for (const player of this.players) {
      player.velocity = { x: 0, y: 0 }
    }
  }

  private resetKickoff(team: TeamColor) {
    const blue = getFormation('left')
    const red = getFormation('right')

    for (const player of this.players) {
      const index = Number(player.id.split('-')[1])
      const formation = player.team === 'blue' ? blue[index] : red[index]
      player.home = { x: formation.x, y: formation.y }
      player.pos = { x: formation.x, y: formation.y }
      player.velocity = { x: 0, y: 0 }
      player.facing = { x: player.side === 'left' ? 1 : -1, y: 0 }
    }

    this.ball.setPosition(GAME_WIDTH / 2 + (team === 'blue' ? -22 : 22), GAME_HEIGHT / 2)
    this.ballCarrierId = null
    this.ballVelocity = { x: 0, y: 0 }
    this.lastTouch = team
    this.controlledPlayerIndex = 0
    this.updateVisuals()
  }

  private finishMatch() {
    this.matchEnded = true
    const result = this.blueScore === this.redScore ? 'Empate' : this.blueScore > this.redScore ? 'Gana azul' : 'Gana rojo'
    this.centerText.setText(`${result}\nPulsa ESPACIO para reiniciar`).setVisible(true)
  }

  private updateHud() {
    const minutes = Math.floor(this.remainingSeconds / 60)
    const seconds = this.remainingSeconds % 60
    this.hudText.setText(`Azul ${this.blueScore}  -  ${this.redScore} Rojo   |   ${minutes}:${seconds.toString().padStart(2, '0')}`)
    const controlled = this.getControlledPlayer()
    this.subHudText.setText(`Controlas: ${getRoleName(controlled.role)} azul | WASD mover | X pase | ESPACIO tiro | SHIFT cambia jugador`)
  }
}
