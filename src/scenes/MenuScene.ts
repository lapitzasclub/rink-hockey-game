import * as Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../game/constants'
import { createProceduralPuppetTextures } from '../game/render/createProceduralPuppetTextures'

type MenuData = { blueScore?: number; redScore?: number; blueFouls?: number; redFouls?: number }

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu')
  }

  preload() {
  }

  create(data: MenuData = {}) {
    createProceduralPuppetTextures(this)
    this.cameras.main.setBackgroundColor('#08111b')

    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

    this.drawDecoration()

    // Título principal
    this.add.text(cx, cy - 148, 'RINK HOCKEY', {
      fontSize: '68px',
      fontFamily: 'monospace',
      color: '#4da3ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.add.text(cx, cy - 84, 'hockey sobre patines', {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#4a6a9a',
    }).setOrigin(0.5)

    // Resultado del partido anterior
    if (data.blueScore !== undefined && data.redScore !== undefined) {
      this.showResult(cx, cy, data.blueScore, data.redScore, data.blueFouls ?? 0, data.redFouls ?? 0)
    }

    // Separador
    const sepY = data.blueScore !== undefined ? cy + 92 : cy + 10
    this.add.rectangle(cx, sepY, 420, 1, 0x2a4060)

    // Prompt pulsante
    const promptY = sepY + 44
    const prompt = this.add.text(cx, promptY, isTouchDevice ? 'TOCA PARA JUGAR' : 'ESPACIO  para jugar', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5)

    this.tweens.add({
      targets: prompt,
      alpha: 0.15,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // Controles (solo escritorio)
    if (!isTouchDevice) {
      this.add.text(cx, promptY + 52, 'WASD · SHIFT sprint · U disparo/robo · Y pase/cambio', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#2a4060',
      }).setOrigin(0.5)
    }

    this.setupInput()
  }

  private showResult(cx: number, cy: number, blue: number, red: number, blueFouls = 0, redFouls = 0) {
    const winner = blue > red ? '¡GANA EL AZUL!' : red > blue ? '¡GANA EL ROJO!' : '¡EMPATE!'
    const winnerColor = blue > red ? '#4da3ff' : red > blue ? '#ff5d6c' : '#aaaaaa'

    this.add.text(cx, cy - 8, winner, {
      fontSize: '26px',
      fontFamily: 'monospace',
      color: winnerColor,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Marcador con colores de equipo
    const scoreGroup = this.add.container(cx, cy + 36)
    scoreGroup.add(this.add.text(-52, 0, `${blue}`, {
      fontSize: '42px', fontFamily: 'monospace', color: '#4da3ff', fontStyle: 'bold',
    }).setOrigin(0.5))
    scoreGroup.add(this.add.text(0, 0, '-', {
      fontSize: '36px', fontFamily: 'monospace', color: '#556677',
    }).setOrigin(0.5))
    scoreGroup.add(this.add.text(52, 0, `${red}`, {
      fontSize: '42px', fontFamily: 'monospace', color: '#ff5d6c', fontStyle: 'bold',
    }).setOrigin(0.5))

    this.add.text(cx, cy + 70, `faltas  AZ ${blueFouls}  ·  RJ ${redFouls}`, {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#3a5a7a',
    }).setOrigin(0.5)
  }

  private drawDecoration() {
    const g = this.add.graphics()
    const alpha = 0.07

    // Líneas de zona, difuminadas
    g.lineStyle(2, 0xff3333, alpha)
    g.lineBetween(320, 60, 320, GAME_HEIGHT - 60)
    g.lineBetween(GAME_WIDTH - 320, 60, GAME_WIDTH - 320, GAME_HEIGHT - 60)

    // Círculo central
    g.lineStyle(2, 0xffffff, alpha * 0.8)
    g.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 88)
    g.lineStyle(2, 0xffffff, alpha * 0.5)
    g.lineBetween(GAME_WIDTH / 2, 60, GAME_WIDTH / 2, GAME_HEIGHT - 60)

    // Porterías esquemáticas
    const gw = 28
    const gh = 150
    const gAlpha = alpha * 1.2
    g.lineStyle(2, 0xffffff, gAlpha)
    g.strokeRect(70, GAME_HEIGHT / 2 - gh / 2, gw, gh)
    g.strokeRect(GAME_WIDTH - 70 - gw, GAME_HEIGHT / 2 - gh / 2, gw, gh)

    // Puck animado
    this.spawnPuck()
  }

  private spawnPuck() {
    const puck = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 7, 0xffffff, 0.55)

    const angle = Phaser.Math.FloatBetween(0.3, 0.9)
    const speed = 180
    const vx = Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1)
    const vy = Math.sin(angle) * speed * (Math.random() < 0.5 ? 1 : -1)
    const minX = 100, maxX = GAME_WIDTH - 100
    const minY = 80, maxY = GAME_HEIGHT - 80

    let px = GAME_WIDTH / 2
    let py = GAME_HEIGHT / 2
    let dvx = vx
    let dvy = vy

    this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        px += dvx * 0.016
        py += dvy * 0.016
        if (px < minX || px > maxX) { dvx *= -1; px = Phaser.Math.Clamp(px, minX, maxX) }
        if (py < minY || py > maxY) { dvy *= -1; py = Phaser.Math.Clamp(py, minY, maxY) }
        puck.setPosition(px, py)
      },
    })
  }

  private setupInput() {
    const start = () => this.scene.start('match')

    this.input.keyboard!
      .addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      .once('down', start)

    this.input.once('pointerdown', start)
  }
}
