import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, RINK } from '../../game/constants'
import { getFormation } from '../../game/formation'
import { DEPTH, PX_PER_M, WORLD_PX_PER_M } from '../../game/render/artSpec'
import { project, worldToScreen, type Projected } from '../../game/render/viewTransform'
import { getGoalLineX } from '../../game/utils'
import type { Ball, Role, TeamColor } from '../../game/types'
import { createFigure, type FigureSpec, type LabFigure } from './labFigures'
import type { LabParams } from './labParams'

/** Encuadre de cámara en coordenadas de pantalla (el mundo ya se dibuja proyectado). */
export interface LabFrame {
  sx: number
  sy: number
  zoom: number
}

export interface LabBuild {
  figures: LabFigure[]
  frame: LabFrame
}

export interface LabBuildCtx {
  scene: Phaser.Scene
  params: LabParams
  ball: Ball
}

const MID_Y = RINK.y + RINK.height / 2
const MID_X = RINK.x + RINK.width / 2
const DEFAULT_FRAME: LabFrame = { sx: GAME_WIDTH / 2, sy: GAME_HEIGHT / 2, zoom: 1 }
const TAU = Math.PI * 2
/** Fases del ciclo de patinaje de la hoja de estados: 0, 1/4, 1/2, 3/4. */
const QUARTER_PHASES = [0, 0.25, 0.5, 0.75].map(f => f * TAU)
/** 8 direcciones: E, SE, S, SW, W, NW, N, NE (y positiva = hacia cámara). */
const DIRS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)

function build(ctx: LabBuildCtx, specs: FigureSpec[]): LabFigure[] {
  // Orden por y de mundo: las figuras cercanas se crean después y tapan a las lejanas
  return specs
    .map((spec, i) => ({ spec, i }))
    .sort((a, b) => a.spec.y - b.spec.y)
    .map(({ spec, i }) => createFigure(ctx.scene, `lab-${i}`, spec, ctx.ball))
}

function label(scene: Phaser.Scene, wx: number, wy: number, text: string) {
  const p = worldToScreen(wx, wy)
  scene.add.text(p.x, p.y + 30, text, {
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '9px',
    color: '#ffffff',
    stroke: '#06101a',
    strokeThickness: 3,
  }).setOrigin(0.5, 0).setDepth(60)
}

/** Formación de saque inicial, 10 jugadores quietos. */
function rinkScene(ctx: LabBuildCtx): LabBuild {
  const specs: FigureSpec[] = []
  for (const [side, team] of [['left', 'blue'], ['right', 'red']] as const) {
    for (const slot of getFormation(side)) specs.push({ team, role: slot.role, x: slot.x, y: slot.y })
  }
  ctx.ball.x = MID_X
  ctx.ball.y = MID_Y
  return { figures: build(ctx, specs), frame: DEFAULT_FRAME }
}

/** Separación (px de mundo) entre la figura y su regla de 1 m. */
const RULER_OFFSET_X = 34
/** Paso de la rejilla de suelo de depuración: 5 m por eje. */
const GRID_STEP_M = 5
/** Justo por encima del suelo y por debajo de líneas y figuras. */
const GRID_DEPTH = DEPTH.FLOOR + 1
const GUIDE_DEPTH = 59

/** Rejilla de suelo de 5 m, con una celda de margen fuera de la pista para ver la perspectiva detrás de las vallas. */
function drawFloorGrid(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(GRID_DEPTH)
  const sx = GRID_STEP_M * WORLD_PX_PER_M.x
  const sy = GRID_STEP_M * WORLD_PX_PER_M.y
  const x0 = RINK.x - sx, x1 = RINK.x + RINK.width + sx
  const y0 = RINK.y - sy, y1 = RINK.y + RINK.height + sy
  const a: Projected = { x: 0, y: 0, s: 0 }
  const b: Projected = { x: 0, y: 0, s: 0 }
  g.lineStyle(1, 0xffe14d, 0.5)
  for (let x = x0; x <= x1 + 0.5; x += sx) {
    project(x, y0, 0, a); project(x, y1, 0, b)
    g.lineBetween(a.x, a.y, b.x, b.y)
  }
  for (let y = y0; y <= y1 + 0.5; y += sy) {
    project(x0, y, 0, a); project(x1, y, 0, b)
    g.lineBetween(a.x, a.y, b.x, b.y)
  }
}

/**
 * Regla vertical de 1 m proyectada con `project` (cian, marcas cada 25 cm) y,
 * pegada a ella, una barra de 1 m dibujada como figura: `setScale(s)` en el
 * punto del suelo (magenta). Si la cámara es coherente miden lo mismo.
 */
function drawMeterGuide(scene: Phaser.Scene, wx: number, wy: number) {
  const g = scene.add.graphics().setDepth(GUIDE_DEPTH)
  const foot = project(wx, wy, 0)
  const top = project(wx, wy, PX_PER_M)
  const tick: Projected = { x: 0, y: 0, s: 0 }
  g.lineStyle(2, 0x3ee6ff, 1).lineBetween(foot.x, foot.y, top.x, top.y)
  for (let i = 0; i <= 4; i++) {
    project(wx, wy, (PX_PER_M * i) / 4, tick)
    const w = i % 2 === 0 ? 4 : 2
    g.lineBetween(tick.x - w, tick.y, tick.x, tick.y)
  }
  scene.add.rectangle(foot.x + 4, foot.y, 3, PX_PER_M, 0xff4dd8)
    .setOrigin(0.5, 1).setScale(foot.s).setDepth(GUIDE_DEPTH)
  const rulerPx = foot.y - top.y
  const figurePx = PX_PER_M * foot.s
  scene.add.text(foot.x + 8, top.y, `s ${foot.s.toFixed(3)}\n${rulerPx.toFixed(1)}/${figurePx.toFixed(1)}`, {
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '8px',
    color: '#bff6ff',
    stroke: '#06101a',
    strokeThickness: 3,
  }).setDepth(GUIDE_DEPTH)
}

/**
 * Rejilla 3x3 de la misma figura: cerca/centro/lejos x izquierda/centro/derecha,
 * con regla de 1 m junto a cada una y rejilla de suelo de 5 m (solo lab).
 */
function scaleScene(ctx: LabBuildCtx): LabBuild {
  const cols = [0.18, 0.5, 0.82]
  const rows = [0.12, 0.5, 0.88]
  const rowNames = ['lejos', 'centro', 'cerca']
  const colNames = ['izq', 'centro', 'der']
  drawFloorGrid(ctx.scene)
  const specs: FigureSpec[] = []
  rows.forEach((ry, r) => cols.forEach((cx, c) => {
    const x = RINK.x + RINK.width * cx
    const y = RINK.y + RINK.height * ry
    specs.push({ team: 'blue', role: 'defender', x, y, angle: Math.PI / 2, aimAhead: true })
    label(ctx.scene, x, y, `${rowNames[r]} · ${colNames[c]}`)
    drawMeterGuide(ctx.scene, x + RULER_OFFSET_X, y)
  }))
  return { figures: build(ctx, specs), frame: DEFAULT_FRAME }
}

/** Zoom a la portería izquierda con portero, jugador en el área y otro tras la portería. */
function goalScene(ctx: LabBuildCtx): LabBuild {
  const gx = getGoalLineX('left')
  const specs: FigureSpec[] = [
    { team: 'blue', role: 'goalie', x: gx + 22, y: MID_Y, aimAhead: true },
    { team: 'red', role: 'pivot', x: gx + 95, y: MID_Y - 55, angle: Math.PI, aimAhead: true },
    { team: 'red', role: 'wing', x: gx - 58, y: MID_Y + 45, angle: Math.PI * 0.75, aimAhead: true },
  ]
  const c = worldToScreen(gx + 10, MID_Y)
  return { figures: build(ctx, specs), frame: { sx: c.x, sy: c.y, zoom: 2.4 } }
}

/** Hoja de estados: columnas = 8 direcciones, filas = parado, 4 fases de patinaje, con bola. */
function playersGrid(ctx: LabBuildCtx): LabBuild {
  const specs: FigureSpec[] = []
  type Row = { phase: number | null, carrying?: boolean }
  const fieldRows: Row[] = [{ phase: null }, ...QUARTER_PHASES.map(phase => ({ phase })), { phase: null, carrying: true }]
  const goalieRows: Row[] = [{ phase: null }, { phase: 0 }, { phase: Math.PI }, { phase: null, carrying: true }]
  const blocks: { role: Role, rows: Row[] }[] = []
  if (ctx.params.set !== 'goalie') blocks.push({ role: 'defender', rows: fieldRows })
  if (ctx.params.set === 'goalie' || ctx.params.set === 'all') blocks.push({ role: 'goalie', rows: goalieRows })
  const total = blocks.reduce((n, b) => n + b.rows.length, 0)
  const x0 = RINK.x + 50
  const dx = (RINK.width - 100) / 15
  const y0 = RINK.y + 45
  const dy = (RINK.height - 90) / Math.max(1, total - 1)
  let row = 0
  for (const block of blocks) {
    for (const r of block.rows) {
      for (const [ti, team] of (['blue', 'red'] as TeamColor[]).entries()) {
        DIRS.forEach((angle, d) => specs.push({
          team, role: block.role, angle, phase: r.phase, carrying: r.carrying, aimAhead: !r.carrying,
          x: x0 + (ti * 8 + d) * dx, y: y0 + row * dy,
        }))
      }
      row++
    }
  }
  return { figures: build(ctx, specs), frame: DEFAULT_FRAME }
}

/** Hojas de contactos: `?strip=<nombre>`. WP-31 y WP-32 añaden aquí sus entradas. */
const STRIPS: Record<string, (ctx: LabBuildCtx) => FigureSpec[]> = {
  /** 8 fotogramas consecutivos del ciclo de patinaje de un jugador mirando a la derecha. */
  stride: () => Array.from({ length: 8 }, (_, k) => ({
    team: 'blue' as TeamColor, role: 'defender' as Role, angle: 0, phase: (k / 8) * TAU, aimAhead: true,
    x: MID_X + (k - 3.5) * 120, y: MID_Y,
  })),
}

function stripScene(ctx: LabBuildCtx, name: string): LabBuild {
  const make = STRIPS[name]
  if (!make) throw new Error(`strip desconocido: ${name} (${Object.keys(STRIPS).join(', ')})`)
  const c = worldToScreen(MID_X, MID_Y)
  return { figures: build(ctx, make(ctx)), frame: { sx: c.x, sy: c.y - 20, zoom: 1.25 } }
}

/** Lado lejano: banquillos y zona de mesa (vacía por ahora). */
function officialsScene(): LabBuild {
  return { figures: [], frame: { sx: GAME_WIDTH / 2, sy: 95, zoom: 2 } }
}

/** Escena vacía con título, base para las pruebas de estilo (WP-20). */
function styleScene(ctx: LabBuildCtx): LabBuild {
  ctx.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'WP-20', {
    fontFamily: '"Courier New", Courier, monospace', fontSize: '48px', color: '#ffffff',
  }).setOrigin(0.5)
  return { figures: [], frame: DEFAULT_FRAME }
}

/** Las hojas de muestras no llevan rótulos de rol: quitan ruido. */
function noLabels(b: LabBuild): LabBuild {
  for (const f of b.figures) f.player.label.setVisible(false)
  return b
}

/** Escenas que necesitan el pabellón y la pista dibujados. */
export const WORLD_SCENES = new Set(['rink', 'scale', 'goal', 'players', 'officials'])

export function buildLabScene(ctx: LabBuildCtx): LabBuild {
  switch (ctx.params.scene) {
    case 'rink': return rinkScene(ctx)
    case 'scale': return scaleScene(ctx)
    case 'goal': return goalScene(ctx)
    case 'players': return noLabels(ctx.params.strip ? stripScene(ctx, ctx.params.strip) : playersGrid(ctx))
    case 'officials': return officialsScene()
    case 'style': return styleScene(ctx)
    default: throw new Error(`escena de lab desconocida: ${ctx.params.scene}`)
  }
}
