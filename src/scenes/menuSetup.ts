import * as Phaser from 'phaser'
import { DIFFICULTY, DIFFICULTY_LEVELS, GAME_WIDTH } from '../game/constants'
import { ARCADE_FONT } from '../game/render/arcadeFx'
import { teamKit } from '../game/render/puppet/kit'
import { getDifficulty } from '../game/ui/prefs'
import { claveEscudo, getLadoHumano, getPartidoExterno, ladoDeHueco, registrarEscudos, type Lado } from '../game/externalMatch'
import { C, slantPts } from './menuStyle'

export type SetupRow = 'team' | 'diff' | 'play'

export interface SetupHost {
  scene: Phaser.Scene
  /** Rótulo del modo elegido en la primera pantalla, con su color. */
  modeTitle: string
  modeColor: number
  durationLabel: string
  pickSide(lado: Lado): void
  stepDifficulty(dir: number): void
  play(): void
  back(): void
  free(): void
}

const CX = GAME_WIDTH / 2

const L = {
  headerY: 62,
  titleY: 112,
  matchY: 262,
  cardW: 430,
  cardH: 168,
  cardX: 262,
  infoY: 372,
  diffY: 452,
  diffW: 520,
  diffH: 62,
  actionsY: 566,
  playW: 300,
  playH: 68,
  sideW: 200,
  sideH: 46,
  sideX: 340,
} as const

/**
 * Segunda pantalla del menú: «prepara el partido». Enfrentamiento (con partido
 * externo, la persona elige qué equipo lleva), dificultad y botones de jugar,
 * volver y partido libre. Tres filas con foco para teclado y mando; en táctil
 * todo se pulsa. Solo se redibuja al cambiar algo.
 */
export class MenuSetup {
  readonly container: Phaser.GameObjects.Container
  readonly rows: SetupRow[]
  private focusIdx: number
  private readonly host: SetupHost
  private readonly ext = getPartidoExterno()
  private teamFrames!: Phaser.GameObjects.Graphics
  private teamBadges: { lado: Lado, label: Phaser.GameObjects.Text, role: Phaser.GameObjects.Text }[] = []
  private diffFrame!: Phaser.GameObjects.Graphics
  private diffValue!: Phaser.GameObjects.Text
  private playFrame!: Phaser.GameObjects.Graphics
  private hoverArmed = false

  constructor(host: SetupHost) {
    this.host = host
    const s = host.scene
    this.rows = this.ext ? ['team', 'diff', 'play'] : ['diff', 'play']
    this.focusIdx = this.rows.length - 1
    this.container = s.add.container(0, 0).setName('setup')
    s.input.once('pointermove', () => { this.hoverArmed = true })
    if (this.ext) registrarEscudos(s.textures)
    this.buildHeader()
    this.buildMatchup()
    this.buildDifficulty()
    this.buildActions()
    this.redraw()
  }

  get focus(): SetupRow {
    return this.rows[this.focusIdx]
  }

  moveFocus(dir: number) {
    const next = Phaser.Math.Clamp(this.focusIdx + dir, 0, this.rows.length - 1)
    if (next === this.focusIdx) return false
    this.focusIdx = next
    this.redraw()
    return true
  }

  /** Hover → foco, solo si el ratón se ha movido desde que abrió el panel (un puntero quieto no roba el foco del teclado). */
  private hover(row: SetupRow) {
    if (this.hoverArmed) this.setFocus(row)
  }

  private setFocus(row: SetupRow) {
    const i = this.rows.indexOf(row)
    if (i < 0 || i === this.focusIdx) return
    this.focusIdx = i
    this.redraw()
  }

  /** ←/→ sobre la fila con foco. */
  change(dir: number) {
    if (this.focus === 'team') this.host.pickSide(getLadoHumano() === 'local' ? 'visitante' : 'local')
    else if (this.focus === 'diff') this.host.stepDifficulty(dir)
  }

  // ─── Construcción ──────────────────────────────────────────────────────────

  private text(x: number, y: number, t: string, size: number, color: string, stroke = 0, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
    const obj = this.host.scene.add.text(x, y, t, {
      fontFamily: ARCADE_FONT, fontSize: `${size}px`, color, ...(stroke ? { stroke: C.ink, strokeThickness: stroke } : {}), ...extra,
    })
    this.container.add(obj)
    return obj
  }

  private buildHeader() {
    const s = this.host.scene
    const cx = CX
    const g = s.add.graphics()
    const chip = `${this.host.modeTitle}  ·  ${this.host.durationLabel}`
    const probe = s.add.text(0, 0, chip, { fontFamily: ARCADE_FONT, fontSize: '17px' })
    const w = probe.width + 56
    probe.destroy()
    g.fillStyle(0x000000, 0.45)
    g.fillPoints(slantPts(w, 34, 16, cx + 5, L.headerY + 5), true)
    g.fillStyle(this.host.modeColor, 1)
    g.fillPoints(slantPts(w, 34, 16, cx, L.headerY), true)
    this.container.add(g)
    this.text(cx, L.headerY + 1, chip, 17, '#ffffff', 4).setOrigin(0.5)
    this.text(cx, L.titleY, 'PREPARA EL PARTIDO', 38, '#ffffff', 8).setOrigin(0.5).setShadow(0, 3, '#000000', 0, true, true)
  }

  /** Dos fichas de equipo frente a frente; con partido externo se pulsa la que quieres llevar. */
  private buildMatchup() {
    const s = this.host.scene
    const cx = CX
    this.teamFrames = s.add.graphics()
    this.container.add(this.teamFrames)
    const lados: Lado[] = ['local', 'visitante']
    lados.forEach((lado, i) => {
      const x = cx + (i === 0 ? -L.cardX : L.cardX)
      const y = L.matchY
      const left = x - L.cardW / 2
      const team = this.ext?.[lado]
      // Escudo sobre un disco claro (lo pinta redraw); sin escudo, la abreviatura
      const crestX = left + 70
      const key = claveEscudo(lado)
      if (key) {
        const img = s.add.image(crestX, y + 4, key)
        img.setScale(66 / Math.max(img.width, img.height))
        this.container.add(img)
      } else {
        const abrev = team?.abrev ?? (i === 0 ? 'AZL' : 'ROJ')
        this.text(crestX, y + 4, abrev, 22, '#ffffff', 5).setOrigin(0.5)
      }
      const label = this.text(left + 128, y - 40, '', 13, C.muted)
      const name = team?.nombre ?? (i === 0 ? 'Azul' : 'Rojo')
      const clipped = name.length > 40 ? `${name.slice(0, 38)}..` : name
      this.text(left + 128, y + 4, clipped, 23, '#ffffff', 4, { wordWrap: { width: L.cardW - 150 }, lineSpacing: -2 })
        .setOrigin(0, 0.5)
      const role = this.text(x + L.cardW / 2 - 24, y + L.cardH / 2 - 24, '', 15, '#ffffff', 0).setOrigin(1, 0.5)
      this.teamBadges.push({ lado, label, role })
      if (this.ext) {
        const zone = s.add.zone(x, y, L.cardW, L.cardH).setInteractive({ useHandCursor: true })
        zone.on('pointerover', () => this.hover('team'))
        zone.on('pointerdown', () => this.host.pickSide(lado))
        this.container.add(zone)
      }
    })
    // «VS» en el centro, entre las dos fichas
    const vs = s.add.graphics()
    vs.fillStyle(0x000000, 0.5)
    vs.fillCircle(cx + 3, L.matchY + 4, 36)
    vs.fillStyle(C.orange, 1)
    vs.fillCircle(cx, L.matchY, 34)
    vs.lineStyle(3, 0xffffff, 0.9)
    vs.strokeCircle(cx, L.matchY, 34)
    this.container.add(vs)
    this.text(cx, L.matchY + 1, 'VS', 28, '#ffffff', 5).setOrigin(0.5)

    if (this.ext) {
      const p = this.ext
      const info = [p.competicion, [p.fecha, p.hora].filter(Boolean).join(' '), p.pista].filter(Boolean).join('  ·  ')
      if (info) this.text(cx, L.infoY, info.length > 90 ? `${info.slice(0, 88)}..` : info, 15, '#cfe4ff', 4).setOrigin(0.5)
    } else {
      this.text(cx, L.infoY, 'Tú llevas al azul; el rojo lo lleva la máquina', 15, '#cfe4ff', 4).setOrigin(0.5)
    }
  }

  private buildDifficulty() {
    const s = this.host.scene
    const cx = CX, y = L.diffY, w = L.diffW, h = L.diffH
    this.diffFrame = s.add.graphics()
    this.container.add(this.diffFrame)
    this.text(cx - w / 2 + 26, y, 'DIFICULTAD', 15, C.muted).setOrigin(0, 0.5)
    this.diffValue = this.text(cx + 104, y - 6, '', 24, C.orangeHex, 5).setOrigin(0.5)
    const ax = [cx - 14, cx + 222]
    ax.forEach((x, i) => {
      const zone = s.add.zone(x, y, 64, h + 10).setInteractive({ useHandCursor: true })
      zone.on('pointerover', () => this.hover('diff'))
      zone.on('pointerdown', () => this.host.stepDifficulty(i === 0 ? -1 : 1))
      this.container.add(zone)
    })
    const row = s.add.zone(cx, y, w, h).setInteractive()
    row.on('pointerover', () => this.hover('diff'))
    this.container.add(row)
    this.container.sendToBack(row)
  }

  private buildActions() {
    const s = this.host.scene
    const cx = CX, y = L.actionsY
    this.playFrame = s.add.graphics()
    this.container.add(this.playFrame)
    this.text(cx, y + 1, 'JUGAR', 34, '#ffffff', 7).setOrigin(0.5)
    const play = s.add.zone(cx, y, L.playW, L.playH).setInteractive({ useHandCursor: true })
    play.on('pointerover', () => this.hover('play'))
    play.on('pointerdown', () => this.host.play())
    this.container.add(play)

    const side = (x: number, label: string, onTap: () => void) => {
      const g = s.add.graphics()
      g.fillStyle(C.panel, 0.88)
      g.fillPoints(slantPts(L.sideW, L.sideH, 14, x, y), true)
      g.lineStyle(2, 0xffffff, 0.3)
      g.strokePoints(slantPts(L.sideW, L.sideH, 14, x, y), true)
      this.container.add(g)
      this.text(x, y + 1, label, 15, '#ffffff', 0).setOrigin(0.5)
      const z = s.add.zone(x, y, L.sideW + 10, L.sideH + 14).setInteractive({ useHandCursor: true })
      z.on('pointerdown', onTap)
      this.container.add(z)
    }
    side(cx - L.sideX, '◀  VOLVER', () => this.host.back())
    if (this.ext) side(cx + L.sideX, 'PARTIDO LIBRE', () => this.host.free())
  }

  // ─── Estado ────────────────────────────────────────────────────────────────

  redraw() {
    this.drawTeams()
    this.drawDifficulty()
    this.drawPlay()
  }

  private drawTeams() {
    const g = this.teamFrames
    const focused = this.focus === 'team'
    const human = this.ext ? getLadoHumano() : 'local'
    g.clear()
    for (const { lado, label, role } of this.teamBadges) {
      const i = lado === 'local' ? 0 : 1
      const x = CX + (i === 0 ? -L.cardX : L.cardX)
      const y = L.matchY
      const mine = lado === human
      const slot = this.ext ? (ladoDeHueco('blue') === lado ? 'blue' : 'red') : (i === 0 ? 'blue' : 'red')
      const jersey = teamKit(slot).jersey
      const w = L.cardW, h = L.cardH
      g.fillStyle(0x000000, 0.5)
      g.fillPoints(slantPts(w, h, 22, x + 7, y + 9), true)
      if (mine) {
        for (const [pad, a] of [[14, 0.1], [7, 0.2]] as const) {
          g.fillStyle(C.orange, a)
          g.fillPoints(slantPts(w + pad * 2, h + pad * 2, 22 + pad * 0.2, x, y), true)
        }
      }
      g.fillStyle(mine ? 0x0d1d31 : 0x08111b, mine ? 0.97 : 0.82)
      g.fillPoints(slantPts(w, h, 22, x, y), true)
      // Franja con el color de la camiseta y disco claro para el escudo
      g.fillStyle(jersey, mine ? 1 : 0.55)
      g.fillPoints(slantPts(w - 2, 10, 22 * (10 / h), x + 22 * (h - 10) / (2 * h), y - h / 2 + 5), true)
      g.fillStyle(0xffffff, mine ? 0.92 : 0.45)
      g.fillCircle(x - w / 2 + 70, y + 4, 44)
      g.lineStyle(4, jersey, mine ? 1 : 0.5)
      g.strokeCircle(x - w / 2 + 70, y + 4, 44)
      // Etiqueta TÚ / IA
      const bx = x + w / 2 - 58, by = y + h / 2 - 24
      g.fillStyle(mine ? C.orange : 0x2a3d57, 1)
      g.fillPoints(slantPts(76, 28, 10, bx - 6, by), true)
      g.lineStyle(mine ? 3 : 2, mine ? 0xffffff : 0xffffff, mine ? 0.9 : 0.25)
      g.strokePoints(slantPts(w, h, 22, x, y), true)
      if (mine) {
        g.lineStyle(3, C.orange, 1)
        g.strokePoints(slantPts(w + 8, h + 8, 23, x, y), true)
      }
      label.setText(this.ext ? (lado === 'local' ? 'LOCAL' : 'VISITANTE') : (mine ? 'TU EQUIPO' : 'RIVAL'))
      role.setText(mine ? 'TÚ' : 'IA').setX(bx + 18).setColor(mine ? '#ffffff' : '#b8cbe2')
    }
    // Con foco en la fila de equipo: flechas a los lados del enfrentamiento
    if (focused) {
      for (const dir of [-1, 1]) {
        const ax = CX + dir * (L.cardX + L.cardW / 2 + 34)
        g.fillStyle(C.inkN, 1)
        g.fillTriangle(ax + 17 * dir, L.matchY, ax - 13 * dir, L.matchY - 22, ax - 13 * dir, L.matchY + 22)
        g.fillStyle(C.orange, 1)
        g.fillTriangle(ax + 12 * dir, L.matchY, ax - 9 * dir, L.matchY - 16, ax - 9 * dir, L.matchY + 16)
      }
    }
  }

  private drawDifficulty() {
    const g = this.diffFrame
    const cx = CX, y = L.diffY, w = L.diffW, h = L.diffH
    const focused = this.focus === 'diff'
    const level = getDifficulty()
    const idx = DIFFICULTY_LEVELS.indexOf(level)
    g.clear()
    g.fillStyle(0x000000, 0.45)
    g.fillPoints(slantPts(w, h, 18, cx + 5, y + 6), true)
    g.fillStyle(focused ? 0x0d1d31 : C.panel, 0.95)
    g.fillPoints(slantPts(w, h, 18, cx, y), true)
    g.lineStyle(focused ? 3 : 2, focused ? C.orange : 0xffffff, focused ? 1 : 0.25)
    g.strokePoints(slantPts(w, h, 18, cx, y), true)
    // Flechas (apagadas en los extremos) y puntos de nivel bajo el valor
    const ax = [cx - 14, cx + 222]
    ax.forEach((x, k) => {
      const dir = k === 0 ? -1 : 1
      const live = k === 0 ? idx > 0 : idx < DIFFICULTY_LEVELS.length - 1
      g.fillStyle(0xffffff, live ? 0.95 : 0.2)
      g.fillTriangle(x + 9 * dir, y, x - 7 * dir, y - 10, x - 7 * dir, y + 10)
    })
    const n = DIFFICULTY_LEVELS.length
    for (let i = 0; i < n; i++) {
      const px = cx + 104 + (i - (n - 1) / 2) * 22
      g.fillStyle(i <= idx ? C.orange : 0xffffff, i <= idx ? 1 : 0.2)
      g.fillPoints(slantPts(16, 6, 4, px, y + 18), true)
    }
    this.diffValue.setText(DIFFICULTY[level].label)
  }

  private drawPlay() {
    const g = this.playFrame
    const cx = CX, y = L.actionsY, w = L.playW, h = L.playH
    const focused = this.focus === 'play'
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillPoints(slantPts(w, h, 24, cx + 6, y + 8), true)
    if (focused) {
      for (const [pad, a] of [[16, 0.1], [9, 0.18], [4, 0.3]] as const) {
        g.fillStyle(C.orange, a)
        g.fillPoints(slantPts(w + pad * 2, h + pad * 2, 24 + pad * 0.2, cx, y), true)
      }
    }
    g.fillStyle(focused ? C.orange : 0xb85f10, 1)
    g.fillPoints(slantPts(w, h, 24, cx, y), true)
    g.fillStyle(0xffffff, 0.22)
    g.fillPoints(slantPts(w - 10, 8, 3, cx + 3, y - h / 2 + 8), true)
    g.lineStyle(3, 0xffffff, focused ? 0.95 : 0.4)
    g.strokePoints(slantPts(w, h, 24, cx, y), true)
  }
}
