import * as Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../game/constants'
import { createProceduralPuppetTextures } from '../game/render/createProceduralPuppetTextures'
import { ARCADE_FONT } from '../game/render/arcadeFx'
import type { GameMode } from '../game/types'

type MenuData = { blueScore?: number; redScore?: number; blueFouls?: number; redFouls?: number; mode?: GameMode }

const MODE_KEY = 'rh-mode'
const MODES: { mode: GameMode, title: string, lines: string[], color: number, hex: string }[] = [
  { mode: 'arcade', title: 'ARCADE', lines: ['Turbo, cargas y powerups', 'Cabezones · racha de fuego', 'Sin faltas · 4 × 1:30'], color: 0xff8a1a, hex: '#ffb347' },
  { mode: 'classic', title: 'REGLAMENTO', lines: ['Reglas oficiales', 'Faltas, bully y tarjetas', '4 × 2:00'], color: 0x4da3ff, hex: '#8cc4ff' },
]

function loadMode(): GameMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'classic' ? 'classic' : 'arcade'
  } catch {
    return 'arcade'
  }
}

function saveMode(mode: GameMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // sin almacenamiento: el modo solo dura la sesión
  }
}

export class MenuScene extends Phaser.Scene {
  private selected: GameMode = 'arcade'
  private cards: { mode: GameMode, frame: Phaser.GameObjects.Graphics, container: Phaser.GameObjects.Container }[] = []

  constructor() {
    super('menu')
  }

  create(data: MenuData = {}) {
    createProceduralPuppetTextures(this)
    this.cameras.main.setBackgroundColor('#08111b')
    const center = () => this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
    center()
    this.scale.on(Phaser.Scale.Events.RESIZE, center)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, center))
    this.selected = data.mode ?? loadMode()
    this.cards = []

    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
    const hasResult = data.blueScore !== undefined && data.redScore !== undefined

    this.drawDecoration()

    const titleY = hasResult ? cy - 250 : cy - 170
    const title = this.add.text(cx, titleY, 'RINK HOCKEY', {
      fontSize: '76px',
      fontFamily: ARCADE_FONT,
      color: '#ffffff',
      stroke: '#1f6fd1',
      strokeThickness: 10,
    }).setOrigin(0.5)
    title.setShadow(0, 6, '#000000', 0, true, true)
    this.tweens.add({ targets: title, scale: { from: 0.97, to: 1.03 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this.add.text(cx, titleY + 62, 'hockey sobre patines', {
      fontSize: '20px',
      fontFamily: ARCADE_FONT,
      color: '#6f8fb8',
    }).setOrigin(0.5)

    if (hasResult) {
      this.showResult(cx, cy - 130, data.blueScore!, data.redScore!, data.blueFouls ?? 0, data.redFouls ?? 0)
    }

    const cardsY = hasResult ? cy + 70 : cy + 20
    MODES.forEach((def, i) => this.createModeCard(def, cx + (i === 0 ? -175 : 175), cardsY))
    this.refreshCards()

    const promptY = cardsY + 110
    const prompt = this.add.text(cx, promptY, isTouchDevice ? 'TOCA UN MODO PARA JUGAR' : '← →  elegir modo   ·   ESPACIO  jugar', {
      fontSize: '22px',
      fontFamily: ARCADE_FONT,
      color: '#ffffff',
    }).setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    if (!isTouchDevice) {
      this.add.text(cx, promptY + 40, 'WASD mover · SHIFT turbo · U tiro/robo · SHIFT+U tiro turbo/carga · Y pase/cambio', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#3a5a7a',
      }).setOrigin(0.5)
    }

    this.setupInput()
  }

  private createModeCard(def: typeof MODES[number], x: number, y: number) {
    const w = 310
    const h = 150
    const container = this.add.container(x, y)
    const frame = this.add.graphics()
    container.add(frame)
    container.add(this.add.text(0, -42, def.title, {
      fontSize: '34px',
      fontFamily: ARCADE_FONT,
      color: def.hex,
      stroke: '#050b13',
      strokeThickness: 6,
    }).setOrigin(0.5))
    def.lines.forEach((line, i) => {
      container.add(this.add.text(0, 4 + i * 22, line, {
        fontSize: '15px',
        fontFamily: ARCADE_FONT,
        color: '#c9d6e6',
      }).setOrigin(0.5))
    })
    container.setSize(w, h)
    container.setInteractive({ useHandCursor: true })
    container.on('pointerover', () => {
      this.selected = def.mode
      this.refreshCards()
    })
    container.on('pointerdown', () => {
      this.selected = def.mode
      this.startMatch()
    })
    this.cards.push({ mode: def.mode, frame, container })
  }

  private refreshCards() {
    for (const card of this.cards) {
      const def = MODES.find(m => m.mode === card.mode)!
      const active = card.mode === this.selected
      card.frame.clear()
      card.frame.fillStyle(active ? 0x0d1a2a : 0x09121d, active ? 0.95 : 0.7)
      card.frame.fillRoundedRect(-155, -75, 310, 150, 16)
      card.frame.lineStyle(active ? 4 : 2, def.color, active ? 1 : 0.3)
      card.frame.strokeRoundedRect(-155, -75, 310, 150, 16)
      card.container.setAlpha(active ? 1 : 0.6)
      this.tweens.killTweensOf(card.container)
      this.tweens.add({ targets: card.container, scale: active ? 1.06 : 0.96, duration: 160, ease: 'Back.Out' })
    }
  }

  private startMatch() {
    saveMode(this.selected)
    this.scene.start('match', { mode: this.selected })
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
      fontSize: '42px', fontFamily: ARCADE_FONT, color: '#4da3ff',
    }).setOrigin(0.5))
    scoreGroup.add(this.add.text(0, 0, '-', {
      fontSize: '36px', fontFamily: 'monospace', color: '#556677',
    }).setOrigin(0.5))
    scoreGroup.add(this.add.text(52, 0, `${red}`, {
      fontSize: '42px', fontFamily: ARCADE_FONT, color: '#ff5d6c',
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
    const keyboard = this.input.keyboard!
    const toggle = () => {
      this.selected = this.selected === 'arcade' ? 'classic' : 'arcade'
      this.refreshCards()
    }
    for (const code of ['LEFT', 'RIGHT', 'A', 'D'] as const) {
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[code]).on('down', toggle)
    }
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).once('down', () => this.startMatch())
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).once('down', () => this.startMatch())
  }
}
