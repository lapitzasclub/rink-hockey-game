import './style.css'
import * as Phaser from 'phaser'

const GAME_WIDTH = 1280
const GAME_HEIGHT = 720
const RINK = {
  x: 90,
  y: 80,
  width: 1100,
  height: 560,
}
const GOAL_WIDTH = 28
const GOAL_HEIGHT = 150
const PLAYER_RADIUS = 24
const BALL_RADIUS = 11
const MATCH_DURATION = 90

type Team = 'blue' | 'red'

class MatchScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private shootKey!: Phaser.Input.Keyboard.Key
  private bluePlayer!: Phaser.GameObjects.Arc
  private redPlayer!: Phaser.GameObjects.Arc
  private ball!: Phaser.GameObjects.Arc
  private blueStick!: Phaser.GameObjects.Rectangle
  private redStick!: Phaser.GameObjects.Rectangle
  private hudText!: Phaser.GameObjects.Text
  private centerText!: Phaser.GameObjects.Text
  private blueScore = 0
  private redScore = 0
  private remainingSeconds = MATCH_DURATION
  private matchEnded = false
  private restartAt = 0
  private lastShooter: Team = 'blue'

  constructor() {
    super('match')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0a1220')
    this.drawRink()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.shootKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.bluePlayer = this.add.circle(RINK.x + 220, GAME_HEIGHT / 2, PLAYER_RADIUS, 0x4da3ff)
    this.redPlayer = this.add.circle(RINK.x + RINK.width - 220, GAME_HEIGHT / 2, PLAYER_RADIUS, 0xff5c6c)
    this.ball = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, BALL_RADIUS, 0xf7f1d5)

    this.blueStick = this.add.rectangle(this.bluePlayer.x + 24, this.bluePlayer.y, 34, 6, 0xd8a15b)
    this.redStick = this.add.rectangle(this.redPlayer.x - 24, this.redPlayer.y, 34, 6, 0xd8a15b)

    this.hudText = this.add.text(34, 22, '', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#f8fbff',
      fontStyle: 'bold',
    })

    this.add.text(GAME_WIDTH / 2, 26, 'WASD o flechas para moverte, ESPACIO para tirar', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#bfd2eb',
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

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.matchEnded) return
        this.remainingSeconds = Math.max(0, this.remainingSeconds - 1)
        if (this.remainingSeconds === 0) {
          this.finishMatch()
        }
      },
    })

    this.resetPositions('blue')
    this.updateHud()
  }

  update(time: number, delta: number) {
    const dt = delta / 1000

    if (this.matchEnded) {
      if (Phaser.Input.Keyboard.JustDown(this.shootKey)) {
        this.scene.restart()
      }
      return
    }

    if (this.restartAt > 0 && time >= this.restartAt) {
      this.restartAt = 0
      this.centerText.setVisible(false)
      this.resetPositions(this.lastShooter === 'blue' ? 'red' : 'blue')
    }

    if (this.restartAt > 0) return

    this.handlePlayerInput(dt)
    this.handleAI(dt)
    this.handleBallPhysics(dt)
    this.handleStick(this.bluePlayer, this.blueStick, true)
    this.handleStick(this.redPlayer, this.redStick, false)
    this.handlePlayerBallContact(this.bluePlayer, this.blueStick, 'blue')
    this.handlePlayerBallContact(this.redPlayer, this.redStick, 'red')
    this.checkGoal(time)
    this.updateHud()
  }

  private drawRink() {
    const g = this.add.graphics()
    g.fillStyle(0xf2f7ff, 1)
    g.fillRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 28)
    g.lineStyle(6, 0x1a3358, 1)
    g.strokeRoundedRect(RINK.x, RINK.y, RINK.width, RINK.height, 28)
    g.lineStyle(4, 0xcc2b3b, 1)
    g.strokeLineShape(new Phaser.Geom.Line(GAME_WIDTH / 2, RINK.y, GAME_WIDTH / 2, RINK.y + RINK.height))
    g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 72)

    g.fillStyle(0xd9ecff, 1)
    g.fillRect(RINK.x - 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)
    g.fillRect(RINK.x + RINK.width - GOAL_WIDTH + 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)

    g.lineStyle(3, 0x6aa3d8, 1)
    g.strokeRect(RINK.x - 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)
    g.strokeRect(RINK.x + RINK.width - GOAL_WIDTH + 8, GAME_HEIGHT / 2 - GOAL_HEIGHT / 2, GOAL_WIDTH, GOAL_HEIGHT)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'Prototype build 0.1', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#99aec8',
    }).setOrigin(0.5)
  }

  private handlePlayerInput(dt: number) {
    let dx = 0
    let dy = 0

    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1

    const speed = 290
    const length = Math.hypot(dx, dy) || 1
    this.bluePlayer.x += (dx / length) * speed * dt
    this.bluePlayer.y += (dy / length) * speed * dt

    if (Phaser.Input.Keyboard.JustDown(this.shootKey)) {
      this.strikeBall(this.bluePlayer, 'blue', 540)
    }

    this.constrainPlayer(this.bluePlayer, true)
  }

  private handleAI(dt: number) {
    const targetX = this.ball.x
    const targetY = this.ball.y
    const dx = targetX - this.redPlayer.x
    const dy = targetY - this.redPlayer.y
    const distance = Math.hypot(dx, dy) || 1
    const speed = distance > 90 ? 255 : 180

    this.redPlayer.x += (dx / distance) * speed * dt
    this.redPlayer.y += (dy / distance) * speed * dt

    if (distance < 75 && this.ball.x > GAME_WIDTH / 2 - 60) {
      this.strikeBall(this.redPlayer, 'red', 500)
    }

    this.constrainPlayer(this.redPlayer, false)
  }

  private handleBallPhysics(dt: number) {
    const velocity = (this.ball as any).velocity ?? { x: 0, y: 0 }
    velocity.x *= 0.992
    velocity.y *= 0.992

    this.ball.x += velocity.x * dt
    this.ball.y += velocity.y * dt

    const top = RINK.y + BALL_RADIUS
    const bottom = RINK.y + RINK.height - BALL_RADIUS
    const left = RINK.x + BALL_RADIUS
    const right = RINK.x + RINK.width - BALL_RADIUS
    const inGoalMouth = this.ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && this.ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2

    if (this.ball.y <= top || this.ball.y >= bottom) {
      velocity.y *= -0.9
      this.ball.y = Phaser.Math.Clamp(this.ball.y, top, bottom)
    }

    if (this.ball.x <= left && !inGoalMouth) {
      velocity.x *= -0.9
      this.ball.x = left
    }

    if (this.ball.x >= right && !inGoalMouth) {
      velocity.x *= -0.9
      this.ball.x = right
    }

    ;(this.ball as any).velocity = velocity
  }

  private handleStick(player: Phaser.GameObjects.Arc, stick: Phaser.GameObjects.Rectangle, facingRight: boolean) {
    const offset = facingRight ? 24 : -24
    stick.x = player.x + offset
    stick.y = player.y
    const angle = Phaser.Math.Angle.Between(player.x, player.y, this.ball.x, this.ball.y)
    stick.rotation = angle + (facingRight ? 0 : Math.PI)
  }

  private handlePlayerBallContact(player: Phaser.GameObjects.Arc, stick: Phaser.GameObjects.Rectangle, team: Team) {
    const playerDistance = Phaser.Math.Distance.Between(player.x, player.y, this.ball.x, this.ball.y)
    const stickDistance = Phaser.Math.Distance.Between(stick.x, stick.y, this.ball.x, this.ball.y)

    if (playerDistance < PLAYER_RADIUS + BALL_RADIUS + 4) {
      const pushAngle = Phaser.Math.Angle.Between(player.x, player.y, this.ball.x, this.ball.y)
      this.kickBall(pushAngle, 180)
      this.lastShooter = team
    }

    if (stickDistance < 26) {
      const pushAngle = Phaser.Math.Angle.Between(stick.x, stick.y, this.ball.x, this.ball.y)
      this.kickBall(pushAngle, 130)
      this.lastShooter = team
    }
  }

  private strikeBall(player: Phaser.GameObjects.Arc, team: Team, power: number) {
    const angle = team === 'blue'
      ? Phaser.Math.Angle.Between(player.x, player.y, this.ball.x + 30, this.ball.y)
      : Phaser.Math.Angle.Between(player.x, player.y, this.ball.x - 30, this.ball.y)

    const distance = Phaser.Math.Distance.Between(player.x, player.y, this.ball.x, this.ball.y)
    if (distance < 95) {
      this.kickBall(angle, power)
      this.lastShooter = team
    }
  }

  private kickBall(angle: number, power: number) {
    const velocity = (this.ball as any).velocity ?? { x: 0, y: 0 }
    velocity.x += Math.cos(angle) * power
    velocity.y += Math.sin(angle) * power
    ;(this.ball as any).velocity = velocity
  }

  private checkGoal(time: number) {
    const inGoalY = this.ball.y > GAME_HEIGHT / 2 - GOAL_HEIGHT / 2 && this.ball.y < GAME_HEIGHT / 2 + GOAL_HEIGHT / 2
    if (!inGoalY) return

    if (this.ball.x < RINK.x - 4) {
      this.redScore += 1
      this.onGoal('¡Gol rojo!', time)
    } else if (this.ball.x > RINK.x + RINK.width + 4) {
      this.blueScore += 1
      this.onGoal('¡Gol azul!', time)
    }
  }

  private onGoal(message: string, time: number) {
    this.centerText.setText(message).setVisible(true)
    this.restartAt = time + 1800
    ;(this.ball as any).velocity = { x: 0, y: 0 }
    this.updateHud()
  }

  private resetPositions(startingTeam: Team) {
    this.bluePlayer.setPosition(RINK.x + 220, GAME_HEIGHT / 2)
    this.redPlayer.setPosition(RINK.x + RINK.width - 220, GAME_HEIGHT / 2)
    this.ball.setPosition(
      GAME_WIDTH / 2 + (startingTeam === 'blue' ? -40 : 40),
      GAME_HEIGHT / 2,
    )
    ;(this.ball as any).velocity = { x: 0, y: 0 }
  }

  private constrainPlayer(player: Phaser.GameObjects.Arc, isBlue: boolean) {
    const minX = isBlue ? RINK.x + PLAYER_RADIUS : GAME_WIDTH / 2 + PLAYER_RADIUS / 2
    const maxX = isBlue ? GAME_WIDTH / 2 - PLAYER_RADIUS / 2 : RINK.x + RINK.width - PLAYER_RADIUS
    player.x = Phaser.Math.Clamp(player.x, minX, maxX)
    player.y = Phaser.Math.Clamp(player.y, RINK.y + PLAYER_RADIUS, RINK.y + RINK.height - PLAYER_RADIUS)
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
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'app',
  backgroundColor: '#0a1220',
  scene: [MatchScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})

window.addEventListener('resize', () => game.scale.refresh())
