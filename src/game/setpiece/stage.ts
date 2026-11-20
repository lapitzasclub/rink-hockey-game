import * as Phaser from 'phaser'
import { DIRECT_FREE_HIT_SPOT_OFFSET, GOAL_LINE_OFFSET, PENALTY_SPOT_OFFSET, RINK, RINK_WIDTH_M } from '../constants'
import { BOARDS, GOAL_VIS, MARKINGS, PX_PER_M, SETPIECE_CAMERA, SETPIECE_STAGE, STANDS_COLORS } from '../render/artSpec'
import { shade as shadeColor } from '../render/rink/boards'
import { StageBackdrop } from '../render/setpiece/backdrop'
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
/** Plano cercano de recorte (m sobre el eje óptico). */
const NEAR_CLIP = 0.12

// ─── Paleta horneada ─────────────────────────────────────────────────────────

const PALETTE_KEY = 'sp-palette'
const SWATCH = 4
const PALETTE: Array<[number, number]> = []
const pal = (color: number, alpha: number) => PALETTE.push([color, alpha]) - 1
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

/** Hornea la paleta (una vez por juego): un cuadradito de SWATCH px por color. */
function ensurePalette(scene: Phaser.Scene) {
  if (scene.textures.exists(PALETTE_KEY)) return
  const tex = scene.textures.createCanvas(PALETTE_KEY, PALETTE.length * SWATCH, SWATCH)!
  const ctx = tex.getContext()
  PALETTE.forEach(([color, alpha], i) => {
    ctx.fillStyle = `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`
    ctx.fillRect(i * SWATCH, 0, SWATCH, SWATCH)
  })
  tex.refresh()
}

// ─── Primitivas ──────────────────────────────────────────────────────────────

const OP_POLY = 0
const OP_LINE = 1
const OP_TUBE = 2

/** Lista de primitivas en metros: polígono convexo, raya de ancho fijo en pantalla y tubo. */
class Ops {
  readonly list: number[] = []
  quads = 0
  poly(color: number, pts: number[][]) {
    this.list.push(OP_POLY, color, pts.length)
    for (const [x, y, z] of pts) this.list.push(x, y, z ?? 0)
    this.quads += Math.ceil((pts.length - 1) / 2)
  }
  line(color: number, widthPx: number, a: V3, b: V3) {
    this.list.push(OP_LINE, color, widthPx, a.x, a.y, a.z, b.x, b.y, b.z)
    this.quads += 1
  }
  tube(diam: number, body: number, edge: number, shine: number, a: V3, b: V3) {
    this.list.push(OP_TUBE, diam, body, edge, shine, a.x, a.y, a.z, b.x, b.y, b.z)
    this.quads += 3
  }
}

interface V3 { x: number; y: number; z: number }
const v3 = (x: number, y: number, z = 0): V3 => ({ x, y, z })

// Búferes de trabajo (sin asignar por fotograma)
const clipIn = new Float64Array(3 * 64)
const clipOut = new Float64Array(3 * 64)
const scrX = new Float64Array(64)
const scrY = new Float64Array(64)
const pj = { x: 0, y: 0, s: 0 }
const pk = { x: 0, y: 0, s: 0 }

/** Lote de cuadriláteros sobre un Mesh2D: ranuras fijas, las que sobran quedan degeneradas. */
export class StageBatch {
  readonly mesh: Phaser.GameObjects.Mesh2D
  private readonly verts: number[]
  private readonly cap: number
  private readonly ops: number[]
  private n = 0

  constructor(scene: Phaser.Scene, ops: Ops) {
    ensurePalette(scene)
    this.ops = ops.list
    this.cap = ops.quads
    this.verts = new Array<number>(this.cap * 16).fill(0)
    const indices: number[] = []
    const ordered: number[] = []
    for (let i = 0; i < this.cap; i++) {
      const b = i * 4
      indices.push(b, b + 1, b + 2, 0, b + 1, b + 3, b + 2, 0)
      ordered.push(b, b + 1, b + 2, 0, b + 1, b + 2, b + 3, 0)
    }
    this.mesh = scene.add.mesh2d(0, 0, PALETTE_KEY, this.verts, indices)
    this.mesh.indicesOrdered = ordered
    this.mesh.useOrderedIndices = true
  }

  /** Reproyecta todas las primitivas con `view`. */
  draw(view: SetPieceView) {
    this.n = 0
    const o = this.ops
    let i = 0
    while (i < o.length) {
      const op = o[i]
      if (op === OP_POLY) {
        const color = o[i + 1], n = o[i + 2]
        for (let k = 0; k < n * 3; k++) clipIn[k] = o[i + 3 + k]
        this.polygon(view, n, color)
        i += 3 + n * 3
      } else if (op === OP_LINE) {
        if (this.segment(view, o[i + 3], o[i + 4], o[i + 5], o[i + 6], o[i + 7], o[i + 8])) {
          this.band(pj.x, pj.y, pk.x, pk.y, o[i + 2], 0, o[i + 1])
        }
        i += 9
      } else {
        const d = o[i + 1]
        if (this.segment(view, o[i + 5], o[i + 6], o[i + 7], o[i + 8], o[i + 9], o[i + 10])) {
          const w = Math.max(1, d * ((pj.s + pk.s) / 2) * PX_PER_M)
          this.band(pj.x, pj.y, pk.x, pk.y, w + 2, (w + 2) / 2, o[i + 3])
          this.band(pj.x, pj.y, pk.x, pk.y, w, w / 2, o[i + 2])
          const off = w * 0.22
          this.band(pj.x - off, pj.y - off, pk.x - off, pk.y - off, Math.max(1, w * 0.28), 0, o[i + 4])
        }
        i += 11
      }
    }
    // Ranuras sobrantes: degeneradas en un punto fuera de pantalla
    const v = this.verts
    for (let q = this.n * 16; q < this.cap * 16; q += 4) { v[q] = -9999; v[q + 1] = -9999 }
  }

  /** Recorta el polígono de `clipIn` contra el plano cercano, lo proyecta y lo emite en abanico. */
  private polygon(view: SetPieceView, n: number, color: number) {
    let m = 0
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n
      const ax = clipIn[k * 3], ay = clipIn[k * 3 + 1], az = clipIn[k * 3 + 2]
      const bx = clipIn[j * 3], by = clipIn[j * 3 + 1], bz = clipIn[j * 3 + 2]
      const da = view.depth(ax, ay, az) - NEAR_CLIP
      const db = view.depth(bx, by, bz) - NEAR_CLIP
      if (da >= 0) { clipOut[m * 3] = ax; clipOut[m * 3 + 1] = ay; clipOut[m * 3 + 2] = az; m++ }
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db)
        clipOut[m * 3] = ax + (bx - ax) * t; clipOut[m * 3 + 1] = ay + (by - ay) * t; clipOut[m * 3 + 2] = az + (bz - az) * t
        m++
      }
    }
    if (m < 3) return
    for (let k = 0; k < m; k++) {
      view.project(clipOut[k * 3], clipOut[k * 3 + 1], clipOut[k * 3 + 2], pj)
      scrX[k] = pj.x; scrY[k] = pj.y
    }
    for (let k = 1; k + 1 < m; k += 2) {
      const c = Math.min(k + 2, m - 1)
      // Cuadrilátero (0, k, k+1, k+2) en orden de tira: 0, k, k+2, k+1
      this.quad(scrX[0], scrY[0], scrX[k], scrY[k], scrX[c], scrY[c], scrX[k + 1], scrY[k + 1], color)
    }
  }

  /** Recorta un segmento contra el plano cercano y deja sus extremos proyectados en pj/pk. */
  private segment(view: SetPieceView, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const da = view.depth(ax, ay, az) - NEAR_CLIP
    const db = view.depth(bx, by, bz) - NEAR_CLIP
    if (da < 0 && db < 0) return false
    if (da < 0) { const t = da / (da - db); ax += (bx - ax) * t; ay += (by - ay) * t; az += (bz - az) * t }
    else if (db < 0) { const t = db / (db - da); bx += (ax - bx) * t; by += (ay - by) * t; bz += (az - bz) * t }
    view.project(ax, ay, az, pj)
    view.project(bx, by, bz, pk)
    return true
  }

  /** Banda de `w` px entre dos puntos de pantalla, alargada `ext` px por cada extremo. */
  private band(ax: number, ay: number, bx: number, by: number, w: number, ext: number, color: number) {
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    const nx = -uy * w * 0.5, ny = ux * w * 0.5
    ax -= ux * ext; ay -= uy * ext; bx += ux * ext; by += uy * ext
    this.quad(ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny, bx - nx, by - ny, color)
  }

  /** Escribe una ranura en orden de tira (TL, BL, TR, BR). */
  private quad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number) {
    if (this.n >= this.cap) return
    const v = this.verts
    const q = this.n++ * 16
    const u = (color * SWATCH + SWATCH / 2) / (PALETTE.length * SWATCH)
    v[q] = x0; v[q + 1] = y0; v[q + 2] = u; v[q + 3] = 0.5
    v[q + 4] = x1; v[q + 5] = y1; v[q + 6] = u; v[q + 7] = 0.5
    v[q + 8] = x2; v[q + 9] = y2; v[q + 10] = u; v[q + 11] = 0.5
    v[q + 12] = x3; v[q + 13] = y3; v[q + 14] = u; v[q + 15] = 0.5
  }
}

// ─── Pista ───────────────────────────────────────────────────────────────────

/** Raya del suelo de `w` m de ancho entre dos puntos. */
function groundLine(ops: Ops, x0: number, y0: number, x1: number, y1: number, w: number) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = (-(y1 - y0) / len) * w * 0.5
  const ny = ((x1 - x0) / len) * w * 0.5
  ops.poly(LINE, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]])
}

/** Pista entera (suelo, valla de 1 m con rodapié) y marcas de la mitad atacada. */
function court(ops: Ops) {
  const halfW = RINK_WIDTH_M / 2
  const backY = -GOAL_LINE_OFFSET / PX_PER_M
  const farY = RINK.width / PX_PER_M + backY
  ops.poly(FLOOR, [[-halfW, backY], [halfW, backY], [halfW, farY], [-halfW, farY]])
  // Lejos, algo más oscuro: la luz cenital cae en el centro
  ops.poly(FLOOR_FAR, [[-halfW, backY], [halfW, backY], [halfW, backY + 2], [-halfW, backY + 2]])

  // Marcas: área 9 × 5,40 m, semicírculo r 0,85 m, puntos de Ø 10 cm y línea central
  const lw = 0.08
  groundLine(ops, -4.5, 0, 4.5, 0, lw)
  groundLine(ops, -4.5, 5.4, 4.5, 5.4, lw)
  groundLine(ops, -4.5, 0, -4.5, 5.4, lw)
  groundLine(ops, 4.5, 0, 4.5, 5.4, lw)
  const N = 28
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI
    const a1 = ((i + 1) / N) * Math.PI
    groundLine(ops, 0.85 * Math.cos(a0), 0.85 * Math.sin(a0), 0.85 * Math.cos(a1), 0.85 * Math.sin(a1), lw)
  }
  for (const sy of [PENALTY_SPOT_OFFSET / PX_PER_M, DIRECT_FREE_HIT_SPOT_OFFSET / PX_PER_M]) {
    const pts: number[][] = []
    for (let i = 0; i < 12; i++) pts.push([0.05 * Math.cos((i / 12) * Math.PI * 2), sy + 0.05 * Math.sin((i / 12) * Math.PI * 2)])
    ops.poly(LINE, pts)
  }
  const midY = (farY + backY) / 2
  groundLine(ops, -halfW, midY, halfW, midY, lw)

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

/** Decorado completo: `back` (pista y valla, debajo de todo), publicidad y gradas (`backdrop`), `mid` (red y fondo de la portería) y `front` (marco). */
export class SetPieceStage {
  readonly back: StageBatch
  readonly mid: StageBatch
  readonly front: StageBatch
  private readonly backdrop: StageBackdrop
  private lastView: SetPieceView | null = null
  private lastMs = 0

  constructor(scene: Phaser.Scene) {
    const back = new Ops()
    court(back)
    const mid = new Ops()
    protectionNet(mid)
    goalBack(mid)
    const front = new Ops()
    goalFront(front)
    this.back = new StageBatch(scene, back)
    this.mid = new StageBatch(scene, mid)
    this.front = new StageBatch(scene, front)
    this.back.mesh.setDepth(-1e6)
    this.mid.mesh.setDepth(-1e6 + 2);
    const backY = -GOAL_LINE_OFFSET / PX_PER_M
    this.backdrop = new StageBackdrop(scene, RINK_WIDTH_M / 2, backY, RINK.width / PX_PER_M + backY)
    // El horneado de las gradas es progresivo: al acabar cada una se repinta con la última cámara
    this.backdrop.onReady = () => { if (this.lastView) this.backdrop.draw(this.lastView, this.lastMs) }
  }

  /** Reproyecta el decorado; el marco va a la profundidad de la línea de gol. `ms` mueve la peña. */
  draw(view: SetPieceView, ms = 0) {
    this.lastView = view
    this.lastMs = ms
    this.back.draw(view)
    this.mid.draw(view)
    this.front.draw(view)
    this.backdrop.draw(view, ms)
    this.front.mesh.setDepth(view.depthAt(0, 0))
  }

  /** Peña de la grada del fondo: la del equipo que defiende esa portería. */
  setPena(team: TeamColor | null) {
    this.backdrop.setPena(team)
  }

  setVisible(on: boolean) {
    this.back.mesh.setVisible(on)
    this.mid.mesh.setVisible(on)
    this.front.mesh.setVisible(on)
    this.backdrop.setVisible(on)
  }
}
