import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, RINK } from '../../game/constants'
import { getFormation } from '../../game/formation'
import { worldToScreen } from '../../game/render/viewTransform'
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

/** Rejilla 3x3 de la misma figura: cerca/centro/lejos x izquierda/centro/derecha. */
function scaleScene(ctx: LabBuildCtx): LabBuild {
  const cols = [0.18, 0.5, 0.82]
  const rows = [0.12, 0.5, 0.88]
  const rowNames = ['lejos', 'centro', 'cerca']
  const colNames = ['izq', 'centro', 'der']
  const specs: FigureSpec[] = []
  rows.forEach((ry, r) => cols.forEach((cx, c) => {
    const x = RINK.x + RINK.width * cx
    const y = RINK.y + RINK.height * ry
    specs.push({ team: 'blue', role: 'defender', x, y, angle: Math.PI / 2, aimAhead: true })
    label(ctx.scene, x, y, `${rowNames[r]} · ${colNames[c]}`)
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
