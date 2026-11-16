import * as Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../game/constants'
import { createProceduralPuppetTextures } from '../game/render/createProceduralPuppetTextures'
import { ARCADE_FONT } from '../game/render/arcadeFx'
import { createArena, type Arena } from '../game/render/arena'
import { drawRink } from '../game/render/drawRink'
import { playUiConfirm, playUiMove, playUiThump } from '../game/audio/sounds'
import type { GameMode } from '../game/types'
import { consumePad } from '../game/input/gamepad'
import { getInputMode, onInputModeChange, PAD_GLYPH } from '../game/input/inputMode'

type MenuData = { blueScore?: number; redScore?: number; blueFouls?: number; redFouls?: number; mode?: GameMode }

type Hint = { key: string } | { pad: string } | { arrows: true }

type ModeDef = { mode: GameMode, title: string, lines: string[], footer: string, color: number, hex: string, dark: number }

const MODE_KEY = 'rh-mode'
const MODES: ModeDef[] = [
  { mode: 'arcade', title: 'ARCADE', lines: ['Turbo, cargas y powerups', 'Cabezones y racha de fuego', 'Sin faltas'], footer: '4 × 1:30', color: 0xff8a1a, hex: '#ffb347', dark: 0x3a1a04 },
  { mode: 'classic', title: 'REGLAMENTO', lines: ['Reglas oficiales', 'Faltas, bully y tarjetas', 'Penaltis y libres directos'], footer: '4 × 2:00', color: 0x4da3ff, hex: '#8cc4ff', dark: 0x07213f },
]

/** Medidas y tiempos del menú: solo presentación, por eso no viven en constants.ts. */
const UI = {
  cardW: 380,
  cardH: 214,
  skew: 24,
  cardGap: 420,
  /** Deriva lenta de la cámara sobre el pabellón (ms por trayecto, ida y vuelta). */
  driftMs: 16000,
  zoom: { min: 1.1, max: 1.22 },
} as const

const C = {
  ink: '#08111b',
  inkN: 0x08111b,
  orange: 0xff8a1a,
  blue: '#4da3ff',
  red: '#ff5d6c',
} as const

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

/** Paralelogramo centrado en el origen: la inclinación da el aire «deportivo» de toda la UI. */
function slantPts(w: number, h: number, skew: number, cx = 0, cy = 0) {
  return [
    new Phaser.Math.Vector2(cx - w / 2 + skew / 2, cy - h / 2),
    new Phaser.Math.Vector2(cx + w / 2 + skew / 2, cy - h / 2),
    new Phaser.Math.Vector2(cx + w / 2 - skew / 2, cy + h / 2),
    new Phaser.Math.Vector2(cx - w / 2 - skew / 2, cy + h / 2),
  ]
}

/** Los sonidos de hover solo si ya hubo gesto: antes, Chrome bloquea el AudioContext y avisa en consola. */
function canPlayAudio() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return ua ? ua.hasBeenActive : true
}

type Card = { def: ModeDef, frame: Phaser.GameObjects.Graphics, container: Phaser.GameObjects.Container, baseY: number }

/**
 * Pantalla principal. Fondo: el pabellón real (gradas con público y pista) con
 * una cámara que deriva despacio; encima, en una cámara de UI fija, logo,
 * tarjetas de modo y ayudas. Mismo enrutado de dos cámaras que MatchScene.
 */
export class MenuScene extends Phaser.Scene {
  private selected: GameMode = 'arcade'
  private cards: Card[] = []
  private chevrons: Phaser.GameObjects.Graphics[] = []
  private uiCamera!: Phaser.Cameras.Scene2D.Camera
  private uiBuilding = false
  private arena!: Arena
  private drift = { t: 0 }
  private shade!: Phaser.GameObjects.Image
  private beams: Phaser.GameObjects.Image[] = []
  private starting = false
  private reducedMotion = false

  constructor() {
    super('menu')
  }

  create(data: MenuData = {}) {
    createProceduralPuppetTextures(this)
    this.selected = data.mode ?? loadMode()
    this.cards = []
    this.chevrons = []
    this.beams = []
    this.starting = false
    this.drift = { t: 0 }
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.setupCameras()
    // Ayudas y texto de «jugar» siguen al último dispositivo usado (teclado, mando o táctil)
    const offMode = onInputModeChange(() => this.withUi(() => this.refreshHints(true)))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offMode)

    this.arena = createArena(this)
    drawRink(this)

    this.withUi(() => this.buildUi(data))
    this.fitCameras()
    this.playIntro()
    this.setupInput()
  }

  update(time: number) {
    this.arena.update(time, 0.25)
    // Mando (el shell ya lo sondeó en este frame y se queda con lo que use un panel abierto)
    if (!this.isBlockedByDom()) {
      if (consumePad('left') || consumePad('right')) this.select(this.selected === 'arcade' ? 'classic' : 'arcade')
      if (consumePad('confirm')) this.startMatch()
    }
    const t = this.drift.t
    const cam = this.cameras.main
    cam.setZoom(UI.zoom.min + (UI.zoom.max - UI.zoom.min) * t)
    cam.centerOn(GAME_WIDTH / 2 + (t - 0.5) * 140, GAME_HEIGHT / 2 + 10 - t * 30)
  }

  private setupCameras() {
    this.cameras.main.setBackgroundColor(C.ink)
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT)
    const route = (obj: Phaser.GameObjects.GameObject) => {
      if (this.uiBuilding) this.cameras.main.ignore(obj)
      else this.uiCamera.ignore(obj)
    }
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, route)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCameras, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, route)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCameras, this)
    })
  }

  private withUi(build: () => void) {
    this.uiBuilding = true
    try { build() } finally { this.uiBuilding = false }
  }

  /** Con Scale.EXPAND el lienzo cambia: la UI sigue centrada en 16:9 y el velo cubre todo. */
  private fitCameras() {
    const { width, height } = this.scale.gameSize
    this.cameras.main.setSize(width, height)
    this.uiCamera.setSize(width, height)
    this.uiCamera.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
    this.shade?.setDisplaySize(width + 4, height + 4)
    const top = GAME_HEIGHT / 2 - height / 2
    this.beams.forEach(b => b.setY(top - 30))
  }

  // ─── Construcción ──────────────────────────────────────────────────────────

  private buildUi(data: MenuData) {
    const cx = GAME_WIDTH / 2
    const hasResult = data.blueScore !== undefined && data.redScore !== undefined

    this.ensureTextures()
    this.shade = this.add.image(cx, GAME_HEIGHT / 2, 'menu-shade')
    this.beams = [
      this.add.image(cx - 360, 0, 'menu-beam').setOrigin(0.5, 0).setRotation(-0.32),
      this.add.image(cx + 360, 0, 'menu-beam').setOrigin(0.5, 0).setRotation(0.32),
    ]
    this.beams.forEach(b => b.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setScale(1.4, 1.6))

    const logoY = hasResult ? 82 : 168
    const logo = this.createLogo(cx, logoY, hasResult ? 0.62 : 1)
    logo.setName('logo')
    if (!hasResult) this.createRibbon(cx, logoY + 80).setName('ribbon')
    else this.createResult(cx, 228, data)

    const cardsY = hasResult ? 452 : 430
    MODES.forEach((def, i) => this.createModeCard(def, cx + (i === 0 ? -UI.cardGap / 2 : UI.cardGap / 2), cardsY))
    this.chevrons = [0, 1].map(() => this.add.graphics({ y: cardsY }).setName('chevron'))
    this.refreshCards(false)

    const promptY = cardsY + UI.cardH / 2 + 50
    const prompt = this.add.text(cx, promptY, '', {
      fontFamily: ARCADE_FONT, fontSize: '26px', color: '#ffffff', stroke: C.ink, strokeThickness: 7,
    }).setOrigin(0.5).setName('prompt')
    prompt.setShadow(0, 3, '#000000', 0, true, true)

    this.refreshHints(false)
  }

  /** Velo (degradado + viñeta) y haces de foco: texturas de canvas generadas una vez. */
  private ensureTextures() {
    if (!this.textures.exists('menu-shade')) {
      const tex = this.textures.createCanvas('menu-shade', 256, 256)!
      const ctx = tex.getContext()
      const lin = ctx.createLinearGradient(0, 0, 0, 256)
      lin.addColorStop(0, 'rgba(4,8,16,0.92)')
      lin.addColorStop(0.35, 'rgba(4,8,16,0.55)')
      lin.addColorStop(0.62, 'rgba(4,8,16,0.62)')
      lin.addColorStop(1, 'rgba(4,8,16,0.95)')
      ctx.fillStyle = lin
      ctx.fillRect(0, 0, 256, 256)
      const rad = ctx.createRadialGradient(128, 128, 60, 128, 128, 182)
      rad.addColorStop(0, 'rgba(0,0,0,0)')
      rad.addColorStop(1, 'rgba(0,0,0,0.6)')
      ctx.fillStyle = rad
      ctx.fillRect(0, 0, 256, 256)
      tex.refresh()
    }
    if (!this.textures.exists('menu-beam')) {
      const tex = this.textures.createCanvas('menu-beam', 256, 512)!
      const ctx = tex.getContext()
      const lin = ctx.createLinearGradient(0, 0, 0, 512)
      lin.addColorStop(0, 'rgba(190,220,255,0.38)')
      lin.addColorStop(1, 'rgba(190,220,255,0)')
      ctx.fillStyle = lin
      ctx.beginPath()
      ctx.moveTo(116, 0)
      ctx.lineTo(140, 0)
      ctx.lineTo(256, 512)
      ctx.lineTo(0, 512)
      ctx.closePath()
      ctx.fill()
      tex.refresh()
    }
  }

  /** Logo con extrusión (copias desplazadas) y relleno degradado. */
  private createLogo(x: number, y: number, scale: number) {
    const container = this.add.container(x, y).setScale(scale)
    const style = { fontFamily: ARCADE_FONT, fontSize: '104px' }
    for (let i = 9; i >= 1; i--) {
      container.add(this.add.text(0, i, 'RINK HOCKEY', {
        ...style, color: i > 6 ? '#020509' : '#0b2a55', stroke: i > 6 ? '#020509' : '#0b2a55', strokeThickness: 12,
      }).setOrigin(0.5))
    }
    const main = this.add.text(0, 0, 'RINK HOCKEY', {
      ...style, color: '#ffffff', stroke: '#1f6fd1', strokeThickness: 12,
    }).setOrigin(0.5)
    const grad = main.context.createLinearGradient(0, 0, 0, main.height)
    grad.addColorStop(0.2, '#ffffff')
    grad.addColorStop(0.55, '#e4f1ff')
    grad.addColorStop(0.56, '#9fcbff')
    grad.addColorStop(1, '#d8ebff')
    main.setFill(grad)
    container.add(main)
    return container
  }

  private createRibbon(x: number, y: number) {
    const container = this.add.container(x, y)
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.45)
    g.fillPoints(slantPts(470, 44, 26, 6, 6), true)
    g.fillStyle(C.orange, 1)
    g.fillPoints(slantPts(470, 44, 26), true)
    g.fillStyle(0xffffff, 0.22)
    g.fillPoints(slantPts(462, 6, 2, 3, -17), true)
    container.add(g)
    container.add(this.add.text(0, 1, 'HOCKEY SOBRE PATINES', {
      fontFamily: ARCADE_FONT, fontSize: '24px', color: '#ffffff', stroke: '#7a3300', strokeThickness: 5,
    }).setOrigin(0.5))
    return container
  }

  /** Marcador final tipo videomarcador tras volver de un partido. */
  private createResult(x: number, y: number, data: MenuData) {
    const blue = data.blueScore!
    const red = data.redScore!
    const container = this.add.container(x, y).setName('result')
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.5)
    g.fillPoints(slantPts(560, 128, 30, 6, 8), true)
    g.fillStyle(0x0b1828, 0.95)
    g.fillPoints(slantPts(560, 128, 30), true)
    g.fillStyle(0x1d5fb0, 1)
    g.fillPoints(slantPts(170, 96, 22, -150, 0), true)
    g.fillStyle(0xc0303d, 1)
    g.fillPoints(slantPts(170, 96, 22, 150, 0), true)
    g.lineStyle(2, 0xffffff, 0.14)
    g.strokePoints(slantPts(560, 128, 30), true)
    g.fillStyle(C.orange, 1)
    g.fillPoints(slantPts(140, 30, 14, 0, -64), true)
    container.add(g)
    container.add(this.add.text(0, -64, 'FINAL', {
      fontFamily: ARCADE_FONT, fontSize: '20px', color: '#ffffff', stroke: '#7a3300', strokeThickness: 4,
    }).setOrigin(0.5))
    const score = (sx: number, v: number) => this.add.text(sx, -6, `${v}`, {
      fontFamily: ARCADE_FONT, fontSize: '68px', color: '#ffffff', stroke: C.ink, strokeThickness: 8,
    }).setOrigin(0.5)
    container.add([score(-150, blue), score(150, red)])
    container.add(this.add.text(-150, 36, 'AZUL', { fontFamily: ARCADE_FONT, fontSize: '14px', color: '#cfe4ff' }).setOrigin(0.5))
    container.add(this.add.text(150, 36, 'ROJO', { fontFamily: ARCADE_FONT, fontSize: '14px', color: '#ffd6da' }).setOrigin(0.5))

    const winner = blue > red ? '¡GANA EL AZUL!' : red > blue ? '¡GANA EL ROJO!' : '¡EMPATE!'
    const winnerColor = blue > red ? C.blue : red > blue ? C.red : '#e8f4ff'
    container.add(this.add.text(0, -6, winner, {
      fontFamily: ARCADE_FONT, fontSize: '22px', color: winnerColor, stroke: C.ink, strokeThickness: 5, align: 'center',
      wordWrap: { width: 110 },
    }).setOrigin(0.5))
    if (data.mode === 'classic') {
      container.add(this.add.text(0, 42, `faltas ${data.blueFouls ?? 0} · ${data.redFouls ?? 0}`, {
        fontFamily: ARCADE_FONT, fontSize: '13px', color: '#7f9cbf',
      }).setOrigin(0.5))
    }
  }

  private createModeCard(def: ModeDef, x: number, y: number) {
    const { cardW: w, cardH: h } = UI
    const container = this.add.container(x, y)
    const frame = this.add.graphics()
    container.add(frame)
    container.add(this.drawModeIcon(def.mode, w / 2 - 46, -h / 2 + 46).setScale(0.82))
    container.add(this.add.text(-w / 2 + 34, -h / 2 + 30, def.title, {
      fontFamily: ARCADE_FONT, fontSize: def.title.length > 8 ? '34px' : '40px', color: def.hex, stroke: C.ink, strokeThickness: 7,
    }).setOrigin(0, 0))
    def.lines.forEach((line, i) => {
      const lx = -w / 2 + 34 - i * 2
      const ly = -h / 2 + 94 + i * 26
      const bullet = this.add.graphics()
      bullet.fillStyle(def.color, 1)
      bullet.fillTriangle(lx, ly + 6, lx + 7, ly + 10.5, lx, ly + 15)
      container.add(bullet)
      container.add(this.add.text(lx + 15, ly, line, {
        fontFamily: ARCADE_FONT, fontSize: '17px', color: '#d6e4f5',
      }).setOrigin(0, 0))
    })
    container.add(this.add.text(w / 2 - 44, h / 2 - 22, def.footer, {
      fontFamily: ARCADE_FONT, fontSize: '16px', color: '#ffffff',
    }).setOrigin(1, 0.5))
    container.setSize(w, h)
    container.setInteractive({ useHandCursor: true })
    container.on('pointerover', () => this.select(def.mode, canPlayAudio()))
    container.on('pointerdown', () => {
      this.select(def.mode, false)
      this.startMatch()
    })
    this.cards.push({ def, frame, container, baseY: y })
  }

  /** Iconos dibujados: llama para arcade; tarjetas azul y roja (las del rink hockey) para reglamento. */
  private drawModeIcon(mode: GameMode, x: number, y: number) {
    const g = this.add.graphics({ x, y })
    if (mode === 'arcade') {
      const flame = (s: number, color: number) => {
        g.fillStyle(color, 1)
        g.fillPoints([
          new Phaser.Math.Vector2(0, -34 * s), new Phaser.Math.Vector2(14 * s, -10 * s), new Phaser.Math.Vector2(22 * s, -22 * s),
          new Phaser.Math.Vector2(26 * s, 6 * s), new Phaser.Math.Vector2(16 * s, 26 * s), new Phaser.Math.Vector2(-16 * s, 26 * s),
          new Phaser.Math.Vector2(-26 * s, 4 * s), new Phaser.Math.Vector2(-18 * s, -16 * s), new Phaser.Math.Vector2(-8 * s, -4 * s),
        ], true)
      }
      flame(1.08, C.inkN)
      flame(1, 0xff5a1a)
      flame(0.66, 0xffb347)
      g.fillStyle(0xfff2b0, 1)
      g.fillEllipse(0, 14, 16, 20)
    } else {
      const card = (rot: number, dx: number, color: number) => {
        g.save()
        g.translateCanvas(dx, 0)
        g.rotateCanvas(rot)
        g.fillStyle(C.inkN, 1)
        g.fillRoundedRect(-17, -25, 34, 50, 4)
        g.fillStyle(color, 1)
        g.fillRoundedRect(-14, -22, 28, 44, 3)
        g.fillStyle(0xffffff, 0.25)
        g.fillRect(-14, -22, 28, 8)
        g.restore()
      }
      card(-0.28, -10, 0x2f7ff0)
      card(0.22, 12, 0xe0363c)
    }
    return g
  }

  /** Texto de «jugar» y fila de ayudas para el dispositivo actual; en táctil no hay fila. */
  private refreshHints(animate: boolean) {
    const mode = getInputMode()
    const prompt = this.children.getByName('prompt') as Phaser.GameObjects.Text | null
    prompt?.setText(mode === 'touch' ? 'TOCA UN MODO PARA JUGAR' : mode === 'gamepad' ? 'PULSA  A  PARA JUGAR' : 'PULSA ESPACIO PARA JUGAR')
    this.children.getByName('hints')?.destroy()
    if (mode === 'touch') return
    const hints: [Hint, string][] = mode === 'gamepad'
      ? [[{ pad: 'dpad' }, 'ELEGIR'], [{ pad: 'a' }, 'JUGAR'], [{ pad: 'START' }, 'AJUSTES']]
      : [[{ arrows: true }, 'ELEGIR'], [{ key: 'ESPACIO' }, 'JUGAR'], [{ key: 'ESC' }, 'AJUSTES']]
    if (mode === 'keyboard' && document.fullscreenEnabled) hints.push([{ key: 'F' }, 'PANTALLA COMPLETA'])
    const row = this.createHintRow(GAME_WIDTH / 2, 676, hints)
    if (animate && !this.reducedMotion) {
      row.setAlpha(0)
      this.tweens.add({ targets: row, alpha: 1, duration: 200 })
    }
  }

  /** Teclas dibujadas como teclas y botones del mando como círculos de color (A verde, B rojo…). */
  private createHintRow(cx: number, y: number, hints: [Hint, string][]) {
    const row = this.add.container(cx, y).setName('hints')
    let x = 0
    for (const [hint, label] of hints) {
      const g = this.add.graphics()
      let w: number
      let glyph: Phaser.GameObjects.GameObject
      if ('arrows' in hint) {
        // Tecla con las flechas izquierda y derecha dibujadas
        w = 52
        g.fillStyle(0x6f86a3, 1)
        g.fillRoundedRect(x, -14, w, 30, 6)
        g.fillStyle(0xe8f0fa, 1)
        g.fillRoundedRect(x, -16, w, 27, 6)
        g.fillStyle(C.inkN, 1)
        g.fillTriangle(x + 10, -3, x + 20, -9, x + 20, 3)
        g.fillTriangle(x + w - 10, -3, x + w - 20, -9, x + w - 20, 3)
        glyph = this.add.zone(0, 0, 1, 1)
      } else if ('pad' in hint && hint.pad === 'dpad') {
        // Cruceta dibujada sobre un botón oscuro
        w = 30
        g.fillStyle(0x000000, 0.45)
        g.fillRoundedRect(x, -13, w, 30, 15)
        g.fillStyle(0x2a3d57, 1)
        g.fillRoundedRect(x, -16, w, 30, 15)
        g.lineStyle(2, 0xffffff, 0.35)
        g.strokeRoundedRect(x, -16, w, 30, 15)
        g.fillStyle(0xffffff, 1)
        g.fillRect(x + w / 2 - 3, -10, 6, 18)
        g.fillRect(x + w / 2 - 9, -4, 18, 6)
        glyph = this.add.zone(0, 0, 1, 1)
      } else if ('key' in hint) {
        const t = this.add.text(0, 0, hint.key, { fontFamily: ARCADE_FONT, fontSize: '15px', color: C.ink }).setOrigin(0.5)
        glyph = t
        w = Math.max(34, t.width + 20)
        g.fillStyle(0x6f86a3, 1)
        g.fillRoundedRect(x, -14, w, 30, 6)
        g.fillStyle(0xe8f0fa, 1)
        g.fillRoundedRect(x, -16, w, 27, 6)
        t.setPosition(x + w / 2, -3)
      } else {
        const face = PAD_GLYPH[hint.pad as keyof typeof PAD_GLYPH]
        const t = this.add.text(0, 0, face ? face.label : hint.pad, { fontFamily: ARCADE_FONT, fontSize: face ? '16px' : '13px', color: '#ffffff', stroke: C.ink, strokeThickness: 3 }).setOrigin(0.5)
        glyph = t
        w = face ? 30 : Math.max(34, t.width + 22)
        g.fillStyle(0x000000, 0.45)
        g.fillRoundedRect(x, -13, w, 30, 15)
        g.fillStyle(face ? face.color : 0x2a3d57, 1)
        g.fillRoundedRect(x, -16, w, 30, 15)
        g.lineStyle(2, 0xffffff, 0.35)
        g.strokeRoundedRect(x, -16, w, 30, 15)
        t.setPosition(x + w / 2, -1)
      }
      const labelText = this.add.text(x + w + 10, -2, label, { fontFamily: ARCADE_FONT, fontSize: '15px', color: '#b8cbe2' }).setOrigin(0, 0.5)
      row.add([g, glyph, labelText])
      x += w + 10 + labelText.width + 34
    }
    row.x = cx - (x - 34) / 2
    return row
  }

  // ─── Selección ─────────────────────────────────────────────────────────────

  /** Con un panel DOM encima (ajustes o aviso de girar el móvil) el menú no debe reaccionar a teclas, toques ni mando. */
  private isBlockedByDom() {
    return !!document.querySelector('#game-shell.has-overlay, #game-shell.is-touch.is-portrait')
  }

  private select(mode: GameMode, withSound = true) {
    if (this.starting || mode === this.selected || this.isBlockedByDom()) return
    this.selected = mode
    if (withSound) playUiMove()
    this.refreshCards(true)
  }

  /** Redibuja marcos: la activa con brillo y barra de color; la otra apagada y algo más pequeña. */
  private refreshCards(animate: boolean) {
    const { cardW: w, cardH: h, skew } = UI
    for (const card of this.cards) {
      const { def, frame } = card
      const active = def.mode === this.selected
      frame.clear()
      frame.fillStyle(0x000000, 0.5)
      frame.fillPoints(slantPts(w, h, skew, 8, 10), true)
      if (active) {
        for (const [pad, a] of [[18, 0.08], [11, 0.14], [5, 0.24]] as const) {
          frame.fillStyle(def.color, a)
          frame.fillPoints(slantPts(w + pad * 2, h + pad * 2, skew + pad * 0.2), true)
        }
      }
      frame.fillStyle(active ? 0x0d1d31 : 0x08111b, active ? 0.97 : 0.86)
      frame.fillPoints(slantPts(w, h, skew), true)
      frame.fillStyle(active ? def.dark : 0x0c1726, 0.9)
      frame.fillPoints(slantPts(w * 0.62, h, skew, w * 0.19, 0), true)
      frame.fillStyle(def.color, active ? 1 : 0.4)
      frame.fillPoints(slantPts(w - 1, 8, skew * (8 / h), skew * (h - 8) / (2 * h), -h / 2 + 4), true)
      frame.fillStyle(def.color, active ? 0.9 : 0.25)
      frame.fillPoints(slantPts(150, 32, 10, w / 2 - 90 - skew * 0.4, h / 2 - 22), true)
      frame.lineStyle(active ? 3 : 2, active ? 0xffffff : def.color, active ? 0.85 : 0.3)
      frame.strokePoints(slantPts(w, h, skew), true)

      const target = { scale: active ? 1.04 : 0.94, alpha: active ? 1 : 0.62 }
      this.tweens.killTweensOf(card.container)
      if (animate && !this.reducedMotion) {
        this.tweens.add({ targets: card.container, ...target, duration: 180, ease: active ? 'Back.Out' : 'Cubic.Out' })
      } else {
        card.container.setScale(target.scale).setAlpha(target.alpha)
      }
    }
    this.placeChevrons()
  }

  /** Punta de flecha con muesca, apuntando a la tarjeta (`dir` 1 = derecha), con contorno oscuro. */
  private drawChevron(g: Phaser.GameObjects.Graphics, dir: 1 | -1, color: number) {
    const pts = (k: number) => [
      new Phaser.Math.Vector2(-13 * k * dir, -19 * k), new Phaser.Math.Vector2(15 * k * dir, 0),
      new Phaser.Math.Vector2(-13 * k * dir, 19 * k), new Phaser.Math.Vector2(-4 * k * dir, 0),
    ]
    g.clear()
    g.fillStyle(C.inkN, 1)
    g.fillPoints(pts(1.3), true)
    g.fillStyle(color, 1)
    g.fillPoints(pts(1), true)
  }

  private placeChevrons() {
    const card = this.cards.find(c => c.def.mode === this.selected)
    if (!card || this.chevrons.length < 2) return
    const off = UI.cardW / 2 + 46
    this.chevrons.forEach((ch, i) => {
      this.tweens.killTweensOf(ch)
      const dir = i === 0 ? -1 : 1
      ch.setPosition(card.container.x + dir * off, card.baseY)
      this.drawChevron(ch, -dir as 1 | -1, card.def.color)
      if (!this.reducedMotion) {
        this.tweens.add({ targets: ch, x: ch.x - dir * 8, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
      }
    })
  }

  // ─── Coreografía ───────────────────────────────────────────────────────────

  /**
   * Entrada: fundido desde negro, el logo «cae» con golpe, la cinta barre, las
   * tarjetas suben escalonadas y por último las ayudas. Con reduced motion,
   * todo aparece con un fundido corto y la cámara de fondo queda quieta.
   */
  private playIntro() {
    const byName = (n: string) => this.children.getByName(n) as Phaser.GameObjects.Container | null
    const logo = byName('logo')
    const ribbon = byName('ribbon')
    const result = byName('result')
    const prompt = byName('prompt')
    const hints = byName('hints')
    const rest = [ribbon, result, hints].filter(Boolean) as Phaser.GameObjects.Container[]

    this.cameras.main.fadeIn(this.reducedMotion ? 200 : 700, 0, 0, 0)

    if (this.reducedMotion) {
      for (const obj of [logo, prompt, ...rest, ...this.cards.map(c => c.container), ...this.chevrons]) {
        if (!obj) continue
        const a = obj.alpha
        obj.setAlpha(0)
        this.tweens.add({ targets: obj, alpha: a, duration: 200 })
      }
      return
    }

    this.tweens.add({ targets: this.drift, t: 1, duration: UI.driftMs, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.beams.forEach((b, i) => this.tweens.add({
      targets: b, rotation: b.rotation + (i === 0 ? 0.22 : -0.22), duration: 5200 + i * 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    }))

    if (logo) {
      const s = logo.scale
      logo.setScale(s * 1.9).setAlpha(0)
      this.tweens.add({
        targets: logo, scale: s, alpha: 1, duration: 420, delay: 180, ease: 'Back.Out',
        onStart: () => { if (canPlayAudio()) playUiThump() },
        onComplete: () => {
          this.uiCamera.shake(160, 0.006)
          this.uiCamera.flash(220, 255, 255, 255)
          this.tweens.add({ targets: logo, y: logo.y - 4, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
        },
      })
    }
    if (ribbon) {
      ribbon.setScale(0, 1)
      this.tweens.add({ targets: ribbon, scaleX: 1, duration: 300, delay: 560, ease: 'Cubic.Out' })
    }
    if (result) {
      result.setAlpha(0).setY(result.y - 30)
      this.tweens.add({ targets: result, alpha: 1, y: result.y + 30, duration: 380, delay: 520, ease: 'Back.Out' })
    }
    this.cards.forEach((card, i) => {
      const { container } = card
      const a = container.alpha
      container.setAlpha(0).setY(card.baseY + 70)
      this.tweens.add({ targets: container, alpha: a, y: card.baseY, duration: 420, delay: 700 + i * 110, ease: 'Cubic.Out' })
    })
    for (const ch of this.chevrons) {
      ch.setAlpha(0)
      this.tweens.add({ targets: ch, alpha: 1, duration: 240, delay: 1050 })
    }
    if (hints) {
      hints.setAlpha(0)
      this.tweens.add({ targets: hints, alpha: 1, duration: 300, delay: 1100 })
    }
    if (prompt) {
      prompt.setAlpha(0)
      this.tweens.add({
        targets: prompt, alpha: 1, duration: 300, delay: 1100,
        onComplete: () => this.tweens.add({ targets: prompt, alpha: 0.35, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
      })
    }
  }

  private startMatch() {
    if (this.starting || this.isBlockedByDom()) return
    this.starting = true
    saveMode(this.selected)
    playUiConfirm()
    const card = this.cards.find(c => c.def.mode === this.selected)
    const go = () => this.scene.start('match', { mode: this.selected })
    if (this.reducedMotion || !card) {
      this.cameras.main.fadeOut(180)
      this.uiCamera.fadeOut(180, 0, 0, 0, (_c: unknown, p: number) => { if (p >= 1) go() })
      return
    }
    this.tweens.killTweensOf(card.container)
    this.tweens.add({ targets: card.container, scale: 1.12, duration: 140, yoyo: true, ease: 'Quad.Out' })
    this.uiCamera.flash(160, 255, 255, 255)
    this.time.delayedCall(260, () => {
      this.cameras.main.fadeOut(320)
      this.uiCamera.fadeOut(320, 0, 0, 0, (_c: unknown, p: number) => { if (p >= 1) go() })
    })
  }

  private setupInput() {
    const keyboard = this.input.keyboard!
    const toggle = () => this.select(this.selected === 'arcade' ? 'classic' : 'arcade')
    for (const code of ['LEFT', 'RIGHT', 'A', 'D'] as const) {
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[code]).on('down', toggle)
    }
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => this.startMatch())
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', () => this.startMatch())
  }
}
