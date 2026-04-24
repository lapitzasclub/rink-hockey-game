import './style.css'
import * as Phaser from 'phaser'

const GAME_WIDTH = 1280
const GAME_HEIGHT = 720
const MATCH_DURATION = 120
const PLAYER_RADIUS = 18
const GOALIE_RADIUS = 20
const BALL_RADIUS = 9
const GOAL_WIDTH = 28
const GOAL_HEIGHT = 150
const PLAYER_MAX_SPEED = 310
const PLAYER_ACCEL = 820
const PLAYER_FRICTION = 0.9
const BALL_FRICTION = 0.992

const RINK = {
  x: 70,
  y: 60,
  width: 1140,
  height: 600,
}

type TeamSide = 'left' | 'right'
type TeamColor = 'blue' | 'red'
type Role = 'goalie' | 'defender' | 'wing' | 'pivot'

type Vector = { x: number, y: number }

type Player = {
  id: string
  team: TeamColor
  side: TeamSide
  role: Role
  color: number
  body: Phaser.GameObjects.Arc
  stick: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  pos: Vector
  velocity: Vector
  home: Vector
  controllable: boolean
}

class MatchScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private shootKey!: Phaser.Input.Keyboard.Key
  private switchKey!: Phaser.Input.Keyboard.Key
  private ball!: Phaser.GameObjects.Arc
  private ballVelocity: Vector = { x: 0, y: 0 }
  private players: Player[] = []
  private controlledPlayerIndex = 1
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
    this.drawRink()
    this.createInput()
    this.createTeams()
    this.createBall()
    this.createHud()
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
      this.switchControlledPlayer()
    }

    this.updateControlledPlayer(dt)
    this.updateTeamAI(dt)
    this.resolvePlayerSpacing()
    this.updateBall(dt)
    this.handleInteractions()
    this.updateVisuals()
    this.checkGoal(time)
    this.updateHud()
  }

  private createInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.switchKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
  }

  private createHud() {
    this.hudText = this.add.text(24, 18, '', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#f7fbff',
      fontStyle: 'bold',
    })

    this.subHudText = this.add.text(GAME_WIDTH / 2, 20, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#bfd2eb',
      align: 'center',
    }).setOrigin(0.5, 0)

    this.centerText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontFamily: 'Arial',
      fontSize: '42px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      backgroundColor: '#00000088',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setVisible(false)
  }

  private createBall() {
    this.ball = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, BALL_RADIUS, 0xf8efcf)
    this.ball.setStrokeStyle(2, 0xa48d63)
  }

  private createTeams() {
    const blueLayout = this.getFormation('left')
    const redLayout = this.getFormation('right')

    this.players = [
      ...blueLayout.map((slot, index) => this.createPlayer(`blue-${index}`, 'blue', 'left', slot.role, slot.x, slot.y, 0x4da3ff, index !== 0)),
      ...redLayout.map((slot, index) => this.createPlayer(`red-${index}`, 'red', 'right', slot.role, slot.x, slot.y, 0xff5d6c, false)),
    ]
  }

  private createPlayer(id: string, team: TeamColor, side: TeamSide, role: Role, x: number, y: number, color: number, controllable: boolean) {
    const radius = role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
    const body = this.add.circle(x, y, radius, color)
    body.setStrokeStyle(controllable ? 4 : 2, 0xeaf4ff)
    const stick = this.add.rectangle(x + (side === 'left' ? 18 : -18), y, 28, 5, 0xd6a05f)
    const label = this.add.text(x, y - 30, this.getRoleShort(role), {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#e9f2ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    return {
      id,
      team,
      side,
      role,
      color,
      body,
      stick,
      label,
      pos: { x, y },
      velocity: { x: 0, y: 0 },
      home: { x, y },
      controllable,
    } satisfies Player
  }

  private getFormation(side: TeamSide) {
    const left = side === 'left'
    const baseX = left ? RINK.x + 110 : RINK.x + RINK.width - 110
    const defenseX = left ? RINK.x + 280 : RINK.x + RINK.width - 280
    const wingX = left ? RINK.x + 470 : RINK.x + RINK.width - 470
    const pivotX = left ? RINK.x + 620 : RINK.x + RINK.width - 620

    return [
      { role: 'goalie' as Role, x: baseX, y: GAME_HEIGHT / 2 },
      { role: 'defender' as Role, x: defenseX, y: GAME_HEIGHT / 2 - 120 },
      { role: 'defender' as Role, x: defenseX, y: GAME_HEIGHT / 2 + 120 },
      { role: 'wing' as Role, x: wingX, y: GAME_HEIGHT / 2 - 150 },
      { role: 'pivot' as Role, x: pivotX, y: GAME_HEIGHT / 2 + 70 },
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
    }

    this.applySkating(player, dt)

    if (Phaser.Input.Keyboard.JustDown(this.shootKey)) {
      this.tryStrike(player, 620)
    }
  }

  private updateTeamAI(dt: number) {
    const controlled = this.getControlledPlayer()

    for (const player of this.players) {
      if (player.id === controlled.id) continue

      if (player.role === 'goalie') {
        this.updateGoalie(player, dt)
      } else {
        this.updateFieldPlayerAI(player, dt)
      }

      this.applySkating(player, dt)

      const distToBall = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
      const attackBias = player.side === 'left' ? 1 : -1
      const ballAhead = attackBias * (this.ball.x - player.pos.x)

      if (distToBall < 44 && ballAhead > -30) {
        this.tryStrike(player, 520)
      }
    }
  }

  private updateGoalie(player: Player, dt: number) {
    const homeX = player.home.x
    const targetY = Phaser.Math.Clamp(this.ball.y, GAME_HEIGHT / 2 - 120, GAME_HEIGHT / 2 + 120)
    const targetX = homeX + (player.side === 'left' ? 12 : -12)
    this.seek(player, { x: targetX, y: targetY }, 0.75, dt)
  }

  private updateFieldPlayerAI(player: Player, dt: number) {
    const teamAttackingRight = player.side === 'left'
    const teamOwnsBall = this.lastTouch === player.team && Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y) < 120
    const nearest = this.getClosestPlayerToBall(player.team)

    let target = { ...player.home }

    if (nearest?.id === player.id) {
      target = { x: this.ball.x, y: this.ball.y }
    } else if (teamOwnsBall) {
      target = {
        x: player.home.x + (teamAttackingRight ? 60 : -60),
        y: player.home.y + Phaser.Math.Clamp(this.ball.y - player.home.y, -70, 70),
      }
    } else {
      target = {
        x: player.home.x + Phaser.Math.Clamp(this.ball.x - player.home.x, -120, 120),
        y: player.home.y + Phaser.Math.Clamp(this.ball.y - player.home.y, -90, 90),
      }
    }

    this.seek(player, target, 1, dt)
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
        const minDist = ar + br + 10

        if (dist < minDist) {
          const push = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          a.pos.x -= nx * push
          a.pos.y -= ny * push
          b.pos.x += nx * push
          b.pos.y += ny * push
        }
      }
    }
  }

  private updateBall(dt: number) {
    this.ballVelocity.x *= BALL_FRICTION
    this.ballVelocity.y *= BALL_FRICTION
    this.ball.x += this.ballVelocity.x * dt
    this.ball.y += this.ballVelocity.y * dt

    const top = RINK.y + BALL_RADIUS
    const bottom = RINK.y + RINK.height - BALL_RADIUS
    const left = RINK.x + BALL_RADIUS
    const right = RINK.x + RINK.width - BALL_RADIUS
    const inGoalMouth = this.ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && this.ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2

    if (this.ball.y <= top || this.ball.y >= bottom) {
      this.ballVelocity.y *= -0.92
      this.ball.y = Phaser.Math.Clamp(this.ball.y, top, bottom)
    }

    if (this.ball.x <= left && !inGoalMouth) {
      this.ballVelocity.x *= -0.92
      this.ball.x = left
    }

    if (this.ball.x >= right && !inGoalMouth) {
      this.ballVelocity.x *= -0.92
      this.ball.x = right
    }
  }

  private handleInteractions() {
    for (const player of this.players) {
      const radius = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      const bodyDistance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
      const stickTip = this.getStickTip(player)
      const stickDistance = Phaser.Math.Distance.Between(stickTip.x, stickTip.y, this.ball.x, this.ball.y)

      if (bodyDistance < radius + BALL_RADIUS + 4) {
        const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
        this.kickBall(angle, player.role === 'goalie' ? 110 : 150)
        this.lastTouch = player.team
      }

      if (stickDistance < 18) {
        const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
        this.kickBall(angle, player.role === 'goalie' ? 90 : 125)
        this.lastTouch = player.team
      }
    }
  }

  private tryStrike(player: Player, power: number) {
    const distance = Phaser.Math.Distance.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
    if (distance > 86) return

    const goalX = player.side === 'left' ? RINK.x + RINK.width + 40 : RINK.x - 40
    const angleToGoal = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, goalX, GAME_HEIGHT / 2)
    const angleToBall = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
    const finalAngle = Phaser.Math.Angle.RotateTo(angleToBall, angleToGoal, 0.65)

    this.kickBall(finalAngle, power)
    this.lastTouch = player.team
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

  private updateVisuals() {
    const controlled = this.getControlledPlayer()

    for (const player of this.players) {
      player.body.setPosition(player.pos.x, player.pos.y)
      player.label.setPosition(player.pos.x, player.pos.y - 30)

      const angle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, this.ball.x, this.ball.y)
      const offset = player.side === 'left' ? 18 : -18
      player.stick.setPosition(
        player.pos.x + Math.cos(angle) * Math.abs(offset),
        player.pos.y + Math.sin(angle) * Math.abs(offset),
      )
      player.stick.rotation = angle

      const active = controlled.id === player.id
      player.body.setStrokeStyle(active ? 5 : player.controllable ? 4 : 2, active ? 0xfff27a : 0xeaf4ff)
      player.label.setText(active ? `${this.getRoleShort(player.role)}★` : this.getRoleShort(player.role))
    }
  }

  private getStickTip(player: Player) {
    const angle = player.stick.rotation
    return {
      x: player.stick.x + Math.cos(angle) * 14,
      y: player.stick.y + Math.sin(angle) * 14,
    }
  }

  private getControlledPlayer() {
    const controllables = this.players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
    return controllables[this.controlledPlayerIndex % controllables.length]
  }

  private switchControlledPlayer() {
    const options = this.players.filter((player) => player.team === 'blue' && player.role !== 'goalie')
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
    this.ballVelocity = { x: 0, y: 0 }
    for (const player of this.players) {
      player.velocity = { x: 0, y: 0 }
    }
  }

  private resetKickoff(team: TeamColor) {
    const blue = this.getFormation('left')
    const red = this.getFormation('right')

    for (const player of this.players) {
      const index = Number(player.id.split('-')[1])
      const formation = player.team === 'blue' ? blue[index] : red[index]
      player.home = { x: formation.x, y: formation.y }
      player.pos = { x: formation.x, y: formation.y }
      player.velocity = { x: 0, y: 0 }
    }

    this.ball.setPosition(GAME_WIDTH / 2 + (team === 'blue' ? -22 : 22), GAME_HEIGHT / 2)
    this.ballVelocity = { x: 0, y: 0 }
    this.lastTouch = team
    this.controlledPlayerIndex = 3
    this.updateVisuals()
  }

  private finishMatch() {
    this.matchEnded = true
    const result = this.blueScore === this.redScore
      ? 'Empate'
      : this.blueScore > this.redScore
        ? 'Gana azul'
        : 'Gana rojo'
    this.centerText.setText(`${result}\nPulsa ESPACIO para reiniciar`).setVisible(true)
  }

  private updateHud() {
    const minutes = Math.floor(this.remainingSeconds / 60)
    const seconds = this.remainingSeconds % 60
    this.hudText.setText(`Azul ${this.blueScore}  -  ${this.redScore} Rojo   |   ${minutes}:${seconds.toString().padStart(2, '0')}`)
    const controlled = this.getControlledPlayer()
    this.subHudText.setText(`Controlas: ${this.getRoleName(controlled.role)} azul | WASD/Flechas mover | ESPACIO tirar | SHIFT cambia jugador`)
  }

  private getRoleShort(role: Role) {
    switch (role) {
      case 'goalie': return 'POR'
      case 'defender': return 'DEF'
      case 'wing': return 'ALA'
      case 'pivot': return 'PIV'
    }
  }

  private getRoleName(role: Role) {
    switch (role) {
      case 'goalie': return 'portero'
      case 'defender': return 'defensa'
      case 'wing': return 'ala'
      case 'pivot': return 'pivote'
    }
  }

  private drawRink() {
    const g = this.add.graphics()
    g.fillStyle(0xf4f8ff, 1)
    g.fillRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 32)
    g.lineStyle(6, 0x18365d, 1)
    g.strokeRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 32)

    g.lineStyle(4, 0xc62c42, 1)
    g.strokeLineShape(new Phaser.Geom.Line(GAME_WIDTH / 2, RINK.y, GAME_WIDTH / 2, RINK.y + RINK.height))
    g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 80)

    g.lineStyle(3, 0x5194d1, 1)
    g.strokeRect(RINK.x - 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)
    g.strokeRect(RINK.x + RINK.width - GOAL_WIDTH + 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)

    g.fillStyle(0xdcecff, 1)
    g.fillRect(RINK.x - 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)
    g.fillRect(RINK.x + RINK.width - GOAL_WIDTH + 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)

    g.lineStyle(2, 0x8db8e0, 1)
    g.strokeCircle(RINK.x + 170, GAME_HEIGHT / 2, 60)
    g.strokeCircle(RINK.x + RINK.width - 170, GAME_HEIGHT / 2, 60)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Prototype build 0.2  •  5v5 simplificado', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#99aec8',
    }).setOrigin(0.5)
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'app',
  backgroundColor: '#08111b',
  scene: [MatchScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})

window.addEventListener('resize', () => game.scale.refresh())
