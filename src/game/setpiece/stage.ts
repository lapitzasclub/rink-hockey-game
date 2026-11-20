import * as Phaser from 'phaser'
import { DIRECT_FREE_HIT_SPOT_OFFSET, GAME_HEIGHT, GAME_WIDTH, GOAL_LINE_OFFSET, PENALTY_SPOT_OFFSET, RINK, RINK_WIDTH_M } from '../constants'
import { BOARDS, GOAL_VIS, MARKINGS, PX_PER_M, SETPIECE_CAMERA, SETPIECE_STAGE, STANDS_COLORS } from '../render/artSpec'
import { shade as shadeColor } from '../render/rink/boards'
import { StageBackdrop, hallBase } from '../render/setpiece/backdrop'
import { enqueue } from '../render/setpiece/grid'
import { StageFloor } from '../render/setpiece/floor'
import { StageFx } from '../render/setpiece/fx'
import { qualityTier } from '../render/quality'
import { Ops, StageBatch, pal, v3, type V3 } from './batch'
import type { TeamColor } from '../types'
import type { SetPieceView } from './view'

/**
 * Decorado estático de los lanzamientos (pista, valla, marcas y portería) en metros,
 * en el marco de la escena (portería en y = 0). La geometría se genera una vez
 * (L-00, `labSetPiece`) como lista de primitivas; cada fotograma solo se reproyecta
 * con la cámara cercana y se escribe en los vértices de un Mesh2D de topología fija
 * (un cuadrilátero por ranura, color sacado de una paleta horneada). Así la cámara
 * se mueve sin redibujar Graphics. Requiere WebGL.
 */

const P = SETPIECE_CAMERA
const C = GOAL_VIS.colors
const A = GOAL_VIS.alpha
const TUBE_R = 0.075 / 2
/** Ejes de postes y larguero: la boca interior mide 1,70 × 1,05 m. */
const POST_X = 0.85 + TUBE_R
const BAR_Z = 1.05 + TUBE_R
/** Fondo de la estructura trasera (REGLAMENTO-MEDIDAS §4): arco inferior y rectángulo superior. */
const BACK_LOW = 0.64
const BACK_TOP = 0.65
const HANG_Y = -0.4

// ─── Paleta ──────────────────────────────────────────────────────────────────

const FLOOR = pal(P.colors.floor, 1)
const FLOOR_FAR = pal(P.colors.floorFar, 0.6)
/** Valla del partido (`rink/boards.ts`): cara, rodapié a 0,7 y canto con la luminosidad de la pared. */
const wallPals = (lum: number) => ({
  face: pal(shadeColor(BOARDS.wallColor, lum), 1),
  kick: pal(shadeColor(shadeColor(BOARDS.wallColor, lum), 0.7), 1),
  top: pal(shadeColor(BOARDS.topColor, 0.8 + 0.2 * lum), 1),
})
const WALL_BACK = wallPals(SETPIECE_STAGE.boardLumBack)
const WALL_SIDE = wallPals(SETPIECE_STAGE.boardLumSide)
const BOARD_EDGE = pal(0xf4f8fc, 0.9)
const FLOOR_OUT = pal(shadeColor(STANDS_COLORS.floor, 0.8), 1)
const NET_CLOTH = pal(0xdbe6f2, BOARDS.netAlpha * 0.5)
const NET_LINE = pal(0xdbe6f2, BOARDS.netAlpha * 1.6)
const NET_POST = pal(0x9fb2c9, 0.85)
const LINE = pal(MARKINGS.lineColor, MARKINGS.lineAlpha)
const GOAL_FLOOR = pal(C.floor, A.floor)
const NET_SIDE = pal(C.netFill, A.backFillLow * 0.6)
const NET_TOP = pal(C.netFill, A.topFill * 0.5)
const MESH = pal(C.net, A.mesh)
const MESH_TOP = pal(C.net, A.meshTop)
const MESH_HANG = pal(C.net, A.mesh * 0.8)
const HANG = pal(C.netShade, 0.22)
const REAR = pal(C.rear, 1)
const REAR_EDGE = pal(C.rearEdge, 1)
const REAR_SHINE = pal(C.rearShine, 0.85)
const TUBE = pal(C.tube, 1)
const TUBE_EDGE = pal(C.tubeEdge, 1)
const TUBE_SHINE = pal(C.tubeShine, 0.85)


// ─── Pista ───────────────────────────────────────────────────────────────────

/** Raya del suelo de `w` m de ancho entre dos puntos. */
function groundLine(ops: Ops, x0: number, y0: number, x1: number, y1: number, w: number) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = (-(y1 - y0) / len) * w * 0.5
  const ny = ((x1 - x0) / len) * w * 0.5
  ops.poly(LINE, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]])
}

/** Pista entera: suelo liso (`base`, bajo el pintado), marcas de la mitad atacada (`lines`) y valla de 1 m con rodapié (`ops`). */
function court(base: Ops, lines: Ops, ops: Ops) {
  const halfW = RINK_WIDTH_M / 2
  const backY = -GOAL_LINE_OFFSET / PX_PER_M
  const farY = RINK.width / PX_PER_M + backY
  base.poly(FLOOR, [[-halfW, backY], [halfW, backY], [halfW, farY], [-halfW, farY]])
  // Lejos, algo más oscuro: la luz cenital cae en el centro
  base.poly(FLOOR_FAR, [[-halfW, backY], [halfW, backY], [halfW, backY + 2], [-halfW, backY + 2]])

  // Marcas: área 9 × 5,40 m, semicírculo r 0,85 m, puntos de Ø 10 cm y línea central
  const lw = 0.08
  groundLine(lines, -4.5, 0, 4.5, 0, lw)
  groundLine(lines, -4.5, 5.4, 4.5, 5.4, lw)
  groundLine(lines, -4.5, 0, -4.5, 5.4, lw)
  groundLine(lines, 4.5, 0, 4.5, 5.4, lw)
  const N = 28
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI
    const a1 = ((i + 1) / N) * Math.PI
    groundLine(lines, 0.85 * Math.cos(a0), 0.85 * Math.sin(a0), 0.85 * Math.cos(a1), 0.85 * Math.sin(a1), lw)
  }
  for (const sy of [PENALTY_SPOT_OFFSET / PX_PER_M, DIRECT_FREE_HIT_SPOT_OFFSET / PX_PER_M]) {
    const pts: number[][] = []
    for (let i = 0; i < 12; i++) pts.push([0.05 * Math.cos((i / 12) * Math.PI * 2), sy + 0.05 * Math.sin((i / 12) * Math.PI * 2)])
    lines.poly(LINE, pts)
  }
  const midY = (farY + backY) / 2
  groundLine(lines, -halfW, midY, halfW, midY, lw)

  // Valla: cara, rodapié de 20 cm, canto de espesor visual y filo claro (misma construcción que `boards.ts`)
  const out = BOARDS.kickM + SETPIECE_STAGE.stands.setbackM
  const wall = (x0: number, y0: number, x1: number, y1: number, ox: number, oy: number, w: typeof WALL_BACK) => {
    const t = SETPIECE_STAGE.capThickM
    ops.poly(FLOOR_OUT, [[x0, y0, 0], [x1, y1, 0], [x1 + ox * out, y1 + oy * out, 0], [x0 + ox * out, y0 + oy * out, 0]])
    ops.poly(w.face, [[x0, y0, 0], [x1, y1, 0], [x1, y1, 1], [x0, y0, 1]])
    ops.poly(w.kick, [[x0, y0, 0], [x1, y1, 0], [x1, y1, BOARDS.kickM], [x0, y0, BOARDS.kickM]])
    ops.poly(w.top, [[x0, y0, 1], [x1, y1, 1], [x1 + ox * t, y1 + oy * t, 1], [x0 + ox * t, y0 + oy * t, 1]])
    ops.line(BOARD_EDGE, 2, v3(x0, y0, 1), v3(x1, y1, 1))
  }
  wall(-halfW, backY, halfW, backY, 0, -1, WALL_BACK)
  wall(-halfW, backY, -halfW, farY, -1, 0, WALL_SIDE)
  wall(halfW, backY, halfW, farY, 1, 0, WALL_SIDE)
  wall(-halfW, farY, halfW, farY, 0, 1, WALL_SIDE)
}

/** Red de retención sobre la valla del fondo, centrada en la portería (medidas de `BOARDS.net*`). */
function protectionNet(ops: Ops) {
  const y = -GOAL_LINE_OFFSET / PX_PER_M + 0.02
  const hw = BOARDS.netHalfWidthM, z0 = 1, z1 = BOARDS.netTopM
  ops.poly(NET_CLOTH, [[-hw, y, z0], [hw, y, z0], [hw, y, z1], [-hw, y, z1]])
  const cols = Math.round((2 * hw) / BOARDS.netMeshM)
  for (let i = 0; i <= cols; i++) ops.line(NET_LINE, 1, v3(-hw + (2 * hw * i) / cols, y, z0), v3(-hw + (2 * hw * i) / cols, y, z1))
  const rows = Math.round((z1 - z0) / BOARDS.netMeshM)
  for (let j = 1; j < rows; j++) ops.line(NET_LINE, 1, v3(-hw, y, z0 + ((z1 - z0) * j) / rows), v3(hw, y, z0 + ((z1 - z0) * j) / rows))
  ops.line(NET_POST, 2, v3(-hw, y, z0), v3(-hw, y, z1))
  ops.line(NET_POST, 2, v3(hw, y, z0), v3(hw, y, z1))
  ops.line(NET_POST, 2, v3(-hw, y, z1), v3(hw, y, z1))
}

// ─── Portería ────────────────────────────────────────────────────────────────

/** Contorno trasero (u = 0 poste derecho … 1 poste izquierdo): arco inferior o rectángulo superior. */
function backAt(u: number, top: boolean): V3 {
  const a = u * Math.PI
  return v3(POST_X * Math.cos(a), -TUBE_R - (top ? BACK_TOP * Math.pow(Math.sin(a), 0.45) : BACK_LOW * Math.sin(a)), top ? BAR_Z : 0)
}

const tri = (p: V3) => [p.x, p.y, p.z]

/** Suelo, lienzos y malla de la red, estructura trasera blanca y red colgante. */
function goalBack(ops: Ops) {
  const S = 24
  const lo: V3[] = []
  const hi: V3[] = []
  for (let i = 0; i <= S; i++) { lo.push(backAt(i / S, false)); hi.push(backAt(i / S, true)) }

  ops.poly(GOAL_FLOOR, lo.map(tri))
  for (let i = 0; i < S; i++) ops.poly(NET_SIDE, [tri(hi[i]), tri(hi[i + 1]), tri(lo[i + 1]), tri(lo[i])])
  for (let i = 0; i < S; i++) {
    ops.poly(NET_TOP, [tri(hi[i]), tri(hi[i + 1]), [hi[i + 1].x, -TUBE_R, BAR_Z], [hi[i].x, -TUBE_R, BAR_Z]])
  }

  // Malla: verticales del contorno trasero, aros a cada paso de altura y techo
  const mesh = P.netMeshM
  const cols = Math.ceil((Math.PI * (POST_X + BACK_LOW) / 2) / mesh)
  for (let i = 1; i < cols; i++) ops.line(MESH, 1, backAt(i / cols, true), backAt(i / cols, false))
  const rows = Math.ceil(BAR_Z / mesh)
  for (let r = 1; r < rows; r++) {
    const v = r / rows
    const at = (i: number) => v3(hi[i].x + (lo[i].x - hi[i].x) * v, hi[i].y + (lo[i].y - hi[i].y) * v, BAR_Z * (1 - v))
    for (let i = 0; i < S; i++) ops.line(MESH, 1, at(i), at(i + 1))
  }
  for (let i = 1; i < cols; i++) {
    const a = backAt(i / cols, true)
    ops.line(MESH_TOP, 1, a, v3(a.x, -TUBE_R, BAR_Z))
  }

  // Red colgante interior a 40 cm de la línea (hasta donde la deja el arco)
  const hx = POST_X * Math.sqrt(1 - Math.pow((-HANG_Y - TUBE_R) / BACK_LOW, 2))
  ops.poly(HANG, [[-hx, HANG_Y, 0], [hx, HANG_Y, 0], [hx, HANG_Y, 1.05], [-hx, HANG_Y, 1.05]])
  for (let x = -hx + mesh; x < hx; x += mesh) ops.line(MESH_HANG, 1, v3(x, HANG_Y, 0), v3(x, HANG_Y, 1.05))
  for (let z = mesh; z < 1.05; z += mesh) ops.line(MESH_HANG, 1, v3(-hx, HANG_Y, z), v3(hx, HANG_Y, z))

  // Estructura trasera blanca: arco inferior Ø 5 cm y contorno superior Ø 1,5 cm
  for (let i = 0; i < S; i++) {
    ops.tube(0.05, REAR, REAR_EDGE, REAR_SHINE, lo[i], lo[i + 1])
    ops.tube(0.02, REAR, REAR_EDGE, REAR_SHINE, hi[i], hi[i + 1])
  }
}

/** Marco frontal naranja: postes y larguero, tubo de Ø 7,5 cm. */
function goalFront(ops: Ops) {
  const d = TUBE_R * 2
  const pr = v3(POST_X, -TUBE_R, 0), pl = v3(-POST_X, -TUBE_R, 0)
  const tr = v3(POST_X, -TUBE_R, BAR_Z), tl = v3(-POST_X, -TUBE_R, BAR_Z)
  ops.tube(d, TUBE, TUBE_EDGE, TUBE_SHINE, pl, tl)
  ops.tube(d, TUBE, TUBE_EDGE, TUBE_SHINE, pr, tr)
  ops.tube(d, TUBE, TUBE_EDGE, TUBE_SHINE, tl, tr)
}

/** Capas del decorado (respecto a `BASE`): del pabellón al suelo y su reflejo, la valla, la red y la luz; el marco va con las figuras. */
const BASE = -1e6
const DEPTH = {
  hall: BASE - 3, glow: BASE - 2.9, struct: BASE - 2.8, crowd: BASE - 2.7, parapet: BASE - 2.6, flashes: BASE - 2.5,
  floorBase: BASE - 2, floor: BASE - 1.9, lines: BASE - 1.8, refl: BASE - 1.7, adsRefl: BASE - 1.69, pools: BASE - 1.6,
  walls: BASE, ads: BASE + 1, beams: BASE + 1.5, mid: BASE + 2, vignette: 2e5,
}

/**
 * Decorado completo: suelo liso y pintado (`floor`), marcas, reflejo del barniz, valla, publicidad,
 * gradas y público (`backdrop`), red y fondo de la portería (`mid`), marco (`front`) y, en media y
 * alta, la luz (`fx`). Se monta por fases en la cola de horneado (ninguna tanda larga al crear la
 * escena) y aparece por partes; cada fase lista repinta con la última cámara.
 */
export class SetPieceStage {
  private readonly batches: StageBatch[] = []
  private front: StageBatch | null = null
  private floor: StageFloor | null = null
  private backdrop: StageBackdrop | null = null
  private fx: StageFx | null = null
  private pena: TeamColor | null = 'blue'
  private visible = true
  private lastView: SetPieceView | null = null
  private lastMs = 0
  private lastFx = 1
  private lastW: number = GAME_WIDTH
  private lastH: number = GAME_HEIGHT

  constructor(scene: Phaser.Scene) {
    enqueue(this.build(scene), () => this.repaint())
  }

  private repaint() {
    if (this.lastView) this.draw(this.lastView, this.lastMs, this.lastFx, this.lastW, this.lastH)
  }

  private batch(scene: Phaser.Scene, ops: Ops, depth: number, fadeM = 0) {
    const b = new StageBatch(scene, ops, fadeM)
    b.mesh.setDepth(depth).setVisible(this.visible)
    this.batches.push(b)
    return b
  }

  private *build(scene: Phaser.Scene): Generator {
    const base = new Ops(), lines = new Ops(), back = new Ops()
    court(base, lines, back)
    const mid = new Ops()
    protectionNet(mid)
    goalBack(mid)
    const front = new Ops()
    goalFront(front)
    // Reflejo: la valla y la portería espejadas (la red de retención queda fuera del fundido)
    const mirror = new Ops()
    goalBack(mirror)
    goalFront(mirror)
    const refl = new Ops(), mb = back.mirrored(), mm = mirror.mirrored()
    refl.list.push(...mb.list, ...mm.list)
    refl.quads = mb.quads + mm.quads
    yield
    this.batch(scene, base, DEPTH.floorBase)
    this.batch(scene, lines, DEPTH.lines)
    this.batch(scene, back, DEPTH.walls)
    yield
    this.batch(scene, mid, DEPTH.mid)
    this.front = this.batch(scene, front, 0)
    this.batch(scene, refl, DEPTH.refl, SETPIECE_STAGE.reflect.fadeM).mesh.setAlpha(SETPIECE_STAGE.reflect.alpha)
    this.repaint()
    yield
    const halfW = RINK_WIDTH_M / 2
    const backY = -GOAL_LINE_OFFSET / PX_PER_M
    const farY = RINK.width / PX_PER_M + backY
    const rich = qualityTier() !== 'baja'
    // Primero el suelo: es lo que más pantalla ocupa (las tandas de pintado van en orden)
    const floor = new StageFloor(scene, halfW, backY, farY, DEPTH.floor, DEPTH.pools, rich)
    floor.onReady = () => this.repaint()
    floor.setVisible(this.visible)
    this.floor = floor
    yield
    const backdrop = new StageBackdrop(scene, halfW, backY, farY, DEPTH)
    backdrop.onReady = () => this.repaint()
    backdrop.setPena(this.pena)
    backdrop.setVisible(this.visible)
    this.backdrop = backdrop
    yield* backdrop.build()
    if (!rich) return
    const [hallD, hallZ] = hallBase()
    this.fx = new StageFx(scene, backdrop.ring.all, hallD, hallZ, backdrop.crowd.headPoints(48), DEPTH)
    this.fx.setVisible(this.visible)
  }

  /**
   * Reproyecta el decorado; el marco va a la profundidad de la línea de gol. `ms` mueve el público
   * y los flashes; `fx` (0..1) es la intensidad de la luz; `w`/`h`, el tamaño de pantalla.
   */
  draw(view: SetPieceView, ms = 0, fx = 1, w: number = GAME_WIDTH, h: number = GAME_HEIGHT) {
    this.lastView = view
    this.lastMs = ms
    this.lastFx = fx
    this.lastW = w
    this.lastH = h
    for (const b of this.batches) b.draw(view)
    this.floor?.draw(view, fx)
    this.backdrop?.draw(view, ms)
    this.fx?.draw(view, ms, fx, w, h)
    this.front?.mesh.setDepth(view.depthAt(0, 0))
  }

  /** Peña de la grada del fondo: la del equipo que defiende esa portería. */
  setPena(team: TeamColor | null) {
    this.pena = team
    this.backdrop?.setPena(team)
  }

  setVisible(on: boolean) {
    this.visible = on
    for (const b of this.batches) b.mesh.setVisible(on)
    this.floor?.setVisible(on)
    this.backdrop?.setVisible(on)
    this.fx?.setVisible(on)
  }
}
