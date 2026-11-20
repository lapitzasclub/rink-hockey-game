import * as Phaser from 'phaser'
import { DIRECT_FREE_HIT_SPOT_OFFSET, GOAL_LINE_OFFSET, PENALTY_SPOT_OFFSET, RINK, RINK_WIDTH_M } from '../../game/constants'
import {
  ACTION_CLIP_MS, FIGURE_EXAG, GOAL_VIS, MARKINGS, PLAYER_HEIGHT_M, PUPPET_LOCAL, PX_PER_M, RIG_FLOOR_FORESHORTEN, SETPIECE_CAMERA,
  figureScale,
} from '../../game/render/artSpec'
import { RIG_UNIT } from '../../game/render/puppet/rig'
import { project as projectMatch, type Projected } from '../../game/render/viewTransform'
import { SetPieceView } from '../../game/setpiece/view'
import { setVisualHeadScale, updateVisuals } from '../../game/systems/visuals'
import type { Ball, Player } from '../../game/types'
import { createFigure, createHiddenBall } from './labFigures'
import type { LabParams } from './labParams'

/**
 * Prototipo L-00 (`?lab=setpiece`): la cámara baja de los lanzamientos (D-01) con
 * suelo, marcas, portería reglamentaria, bola y las figuras del rig del partido.
 * Todo se dibuja una vez en `create` (es un banco de pruebas, no se hornea).
 */

const P = SETPIECE_CAMERA
const C = GOAL_VIS.colors
const TUBE_R = 0.075 / 2
/** Ejes de postes y larguero: la boca interior mide 1,70 × 1,05 m. */
const POST_X = 0.85 + TUBE_R
const BAR_Z = 1.05 + TUBE_R
/** Fondo de la estructura trasera (REGLAMENTO-MEDIDAS §4): arco inferior y rectángulo superior. */
const BACK_LOW = 0.64
const BACK_TOP = 0.65
const HANG_Y = -0.4
/** Metros por unidad de figura (la altura del rig es 1). */
const FIG_M = PLAYER_HEIGHT_M * P.figureExag
const DUMMY = { id: '__none__' } as Player

interface V3 { x: number; y: number; z: number }

export function buildSetPieceLab(scene: Phaser.Scene, params: LabParams) {
  scene.cameras.main.setBackgroundColor(P.colors.backdrop)
  setVisualHeadScale(1)
  // El lanzador puede patinar con la bola hacia la portería: `takerm` lo acerca
  const spot = params.takerm ?? (params.kind === 'direct' ? DIRECT_FREE_HIT_SPOT_OFFSET : PENALTY_SPOT_OFFSET) / PX_PER_M
  const view = new SetPieceView().follow(0, spot)
  const flight = params.ballx !== null || params.bally !== null || params.ballz !== null
  const ball: V3 = flight
    ? { x: params.ballx ?? 0, y: params.bally ?? spot / 2, z: params.ballz ?? 0 }
    : { x: 0, y: spot, z: 0 }

  drawCourt(scene, view)
  drawGoal(scene, view)

  const hidden = createHiddenBall(scene)
  const mid = { x: RINK.x + RINK.width / 2, y: RINK.y + RINK.height / 2 }
  const shooter = createFigure(scene, 'sp-shooter', { team: 'blue', role: 'pivot', x: mid.x, y: mid.y }, hidden)
  const goalie = createFigure(scene, 'sp-goalie', { team: 'red', role: 'goalie', x: mid.x, y: mid.y }, hidden)
  // La bola queda del lado del stick: el lanzador se aparta al contrario
  const side = shooter.player.rig.stickSide === 1 ? 1 : -1
  const sFeet = { x: -side * P.shooterSide, y: spot + P.shooterBack }
  const gFeet = { x: 0, y: P.goalieFront }
  const shadows = scene.add.graphics().setDepth(view.depthAt(0, 0) + 0.5)
  placeFigure(view, shooter.player, hidden, sFeet, -1, { x: 0, y: spot }, !flight, flight ? 0.8 : null, params.t, shadows)
  placeFigure(view, goalie.player, hidden, gFeet, 1, ball, false, null, params.t, shadows)
  drawBall(scene, view, ball, shadows)
}

/**
 * Posa una figura con `updateVisuals` y la recoloca con la cámara de la escena.
 * `face` = +1 mira a cámara (portero), −1 hacia la portería (lanzador). El yaw se
 * corrige por el rayo de cámara, y la bola del contexto de pose se fabrica en el
 * mundo del partido para que, al deshacer su proyección, quede en el marco del
 * cuerpo donde está de verdad (así la pala cae sobre la bola de esta cámara).
 */
function placeFigure(
  view: SetPieceView, player: Player, hidden: Ball, feet: { x: number; y: number }, face: 1 | -1,
  ballAt: { x: number; y: number }, carrying: boolean, shotT: number | null, t: number, shadows: Phaser.GameObjects.Graphics,
) {
  const phi = view.rayAngle(feet.x, feet.y) - Math.PI
  const c = Math.cos(phi)
  const sn = Math.sin(phi)
  // Rumbo y bola en el marco alineado con el rayo (x a la derecha en pantalla, y hacia cámara)
  player.facing = { x: -face * sn, y: face * c }
  const ox = (ballAt.x - feet.x) / FIG_M
  const oy = (ballAt.y - feet.y) / FIG_M
  const X = ox * c - oy * sn
  const Z = oy * c + ox * sn
  const proxy: Ball = { ...matchPointFor(player.pos, X, Z), visual: hidden.visual }

  player.velocity = { x: 0, y: 0 }
  player.sprinting = false
  const ct = player.container
  ct.setData('ab', 0)
  ct.setData('sp', 0)
  ct.setData('pt', t)
  if (shotT !== null) player.anim = { type: 'shot', at: t - shotT * ACTION_CLIP_MS.shot }
  player.rig.floorForeshorten = view.floorForeshorten(feet.x, feet.y)
  updateVisuals([player], DUMMY, proxy, carrying ? player.id : null, t)

  const fp = view.project(feet.x, feet.y, 0)
  const k = (figureScale(fp.s) * P.figureExag) / FIGURE_EXAG
  ct.setPosition(fp.x, fp.y - PUPPET_LOCAL.feetY * k)
    .setScale(k * view.lateralStretch(feet.x, feet.y), k)
    .setDepth(view.depthAt(feet.x, feet.y))
  for (const o of [player.shadow, player.selectionRing, player.selectionArrow, player.label, player.nameTag, player.staminaBar]) o?.setVisible(false)
  ;(player.staminaBar?.getData('bg') as Phaser.GameObjects.Rectangle | undefined)?.setVisible(false)
  const w = 0.62 * fp.s * PX_PER_M
  shadows.fillStyle(0x000000, 0.3).fillEllipse(fp.x, fp.y, w, w * view.floorForeshorten(feet.x, feet.y))
}

/**
 * Punto del mundo del partido cuya proyección, vista desde el jugador en `at`,
 * deshace `groundFromLocal` en (X, Z) unidades de figura (pantalla: derecha, hacia cámara).
 */
function matchPointFor(at: { x: number; y: number }, X: number, Z: number): { x: number; y: number } {
  const sp = projectMatch(at.x, at.y, 0)
  const k = figureScale(sp.s)
  const tx = sp.x + X * RIG_UNIT * k
  const ty = sp.y + Z * RIG_UNIT * RIG_FLOOR_FORESHORTEN * k
  const w = { x: at.x + (tx - sp.x), y: at.y + (ty - sp.y) }
  const p: Projected = { x: 0, y: 0, s: 0 }
  const q: Projected = { x: 0, y: 0, s: 0 }
  for (let i = 0; i < 6; i++) {
    projectMatch(w.x, w.y, 0, p)
    projectMatch(w.x + 1, w.y, 0, q)
    const a = q.x - p.x, b = q.y - p.y
    projectMatch(w.x, w.y + 1, 0, q)
    const cc = q.x - p.x, d = q.y - p.y
    const ex = tx - p.x, ey = ty - p.y
    const det = a * d - b * cc || 1
    w.x += (ex * d - ey * cc) / det
    w.y += (ey * a - ex * b) / det
  }
  return w
}

// ─── Pista ───────────────────────────────────────────────────────────────────

/** Rellena un polígono del suelo (z = 0) dado en metros. */
function groundPoly(g: Phaser.GameObjects.Graphics, view: SetPieceView, pts: number[][]) {
  g.fillPoints(pts.map(([x, y, z]) => {
    const p = view.project(x, y, z ?? 0)
    return new Phaser.Math.Vector2(p.x, p.y)
  }), true)
}

/** Raya del suelo de `w` m de ancho entre dos puntos. */
function groundLine(g: Phaser.GameObjects.Graphics, view: SetPieceView, x0: number, y0: number, x1: number, y1: number, w: number) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = (-(y1 - y0) / len) * w * 0.5
  const ny = ((x1 - x0) / len) * w * 0.5
  groundPoly(g, view, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]])
}

function drawCourt(scene: Phaser.Scene, view: SetPieceView) {
  const g = scene.add.graphics().setDepth(0)
  const halfW = RINK_WIDTH_M / 2
  const backY = -GOAL_LINE_OFFSET / PX_PER_M
  const nearY = view.eyeY - 0.3
  g.fillStyle(P.colors.floor, 1)
  groundPoly(g, view, [[-halfW, backY], [halfW, backY], [halfW, nearY], [-halfW, nearY]])
  // Lejos, algo más oscuro: la luz cenital cae en el centro
  g.fillStyle(P.colors.floorFar, 0.6)
  groundPoly(g, view, [[-halfW, backY], [halfW, backY], [halfW, backY + 2], [-halfW, backY + 2]])

  // Valla de fondo y laterales (1 m) con rodapié de 20 cm
  const wall = (pts: number[][], color: number, alpha = 1) => { g.fillStyle(color, alpha); groundPoly(g, view, pts) }
  wall([[-halfW, backY, 0], [halfW, backY, 0], [halfW, backY, 1], [-halfW, backY, 1]], P.colors.board)
  wall([[-halfW, backY, 0], [halfW, backY, 0], [halfW, backY, 0.2], [-halfW, backY, 0.2]], P.colors.kick)
  for (const x of [-halfW, halfW]) {
    wall([[x, backY, 0], [x, nearY, 0], [x, nearY, 1], [x, backY, 1]], P.colors.board)
    wall([[x, backY, 0], [x, nearY, 0], [x, nearY, 0.2], [x, backY, 0.2]], P.colors.kick)
  }
  wall([[-halfW, backY, 0.97], [halfW, backY, 0.97], [halfW, backY, 1], [-halfW, backY, 1]], P.colors.boardTop, 0.8)

  // Marcas: área 9 × 5,40 m, semicírculo r 0,85 m y puntos de Ø 10 cm
  const lw = 0.08
  g.fillStyle(MARKINGS.lineColor, MARKINGS.lineAlpha)
  groundLine(g, view, -4.5, 0, 4.5, 0, lw)
  groundLine(g, view, -4.5, 5.4, 4.5, 5.4, lw)
  groundLine(g, view, -4.5, 0, -4.5, 5.4, lw)
  groundLine(g, view, 4.5, 0, 4.5, 5.4, lw)
  const N = 28
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI
    const a1 = ((i + 1) / N) * Math.PI
    groundLine(g, view, 0.85 * Math.cos(a0), 0.85 * Math.sin(a0), 0.85 * Math.cos(a1), 0.85 * Math.sin(a1), lw)
  }
  for (const sy of [PENALTY_SPOT_OFFSET / PX_PER_M, DIRECT_FREE_HIT_SPOT_OFFSET / PX_PER_M]) {
    const pts: number[][] = []
    for (let i = 0; i < 16; i++) pts.push([0.05 * Math.cos((i / 16) * Math.PI * 2), sy + 0.05 * Math.sin((i / 16) * Math.PI * 2)])
    groundPoly(g, view, pts)
  }
}

// ─── Portería ────────────────────────────────────────────────────────────────

/** Contorno trasero (u = 0 poste derecho … 1 poste izquierdo): arco inferior o rectángulo superior. */
function backAt(u: number, top: boolean, out: V3): V3 {
  const a = u * Math.PI
  out.x = POST_X * Math.cos(a)
  out.y = -TUBE_R - (top ? BACK_TOP * Math.pow(Math.sin(a), 0.45) : BACK_LOW * Math.sin(a))
  out.z = top ? BAR_Z : 0
  return out
}

/** Tubo como trazo grueso: canto oscuro, cuerpo y brillo arriba a la izquierda. */
function tube(g: Phaser.GameObjects.Graphics, view: SetPieceView, a: V3, b: V3, diam: number, body: number, edge: number, shine: number) {
  const pa = view.project(a.x, a.y, a.z)
  const pb = view.project(b.x, b.y, b.z)
  const w = Math.max(1, diam * ((pa.s + pb.s) / 2) * PX_PER_M)
  g.lineStyle(w + 2, edge, 1).lineBetween(pa.x, pa.y, pb.x, pb.y)
  g.fillStyle(edge, 1).fillCircle(pa.x, pa.y, w / 2 + 1).fillCircle(pb.x, pb.y, w / 2 + 1)
  g.lineStyle(w, body, 1).lineBetween(pa.x, pa.y, pb.x, pb.y)
  g.fillStyle(body, 1).fillCircle(pa.x, pa.y, w / 2).fillCircle(pb.x, pb.y, w / 2)
  const o = w * 0.22
  g.lineStyle(Math.max(1, w * 0.28), shine, 0.85).lineBetween(pa.x - o, pa.y - o, pb.x - o, pb.y - o)
}

function drawGoal(scene: Phaser.Scene, view: SetPieceView) {
  const back = scene.add.graphics().setDepth(view.depthAt(0, -0.3))
  const front = scene.add.graphics().setDepth(view.depthAt(0, 0))
  const S = 24
  const lo: V3[] = []
  const hi: V3[] = []
  for (let i = 0; i <= S; i++) {
    lo.push(backAt(i / S, false, { x: 0, y: 0, z: 0 }))
    hi.push(backAt(i / S, true, { x: 0, y: 0, z: 0 }))
  }
  const pj = (p: V3) => view.project(p.x, p.y, p.z)
  const quad = (pts: V3[], color: number, alpha: number) => {
    back.fillStyle(color, alpha)
    back.fillPoints(pts.map(p => { const q = pj(p); return new Phaser.Math.Vector2(q.x, q.y) }), true)
  }

  // Suelo dentro de la portería y lienzos de red (lados y fondo, luego techo)
  quad(lo, C.floor, GOAL_VIS.alpha.floor)
  for (let i = 0; i < S; i++) quad([hi[i], hi[i + 1], lo[i + 1], lo[i]], C.netFill, GOAL_VIS.alpha.backFillLow * 0.6)
  for (let i = 0; i < S; i++) {
    quad([hi[i], hi[i + 1], { x: hi[i + 1].x, y: -TUBE_R, z: BAR_Z }, { x: hi[i].x, y: -TUBE_R, z: BAR_Z }], C.netFill, GOAL_VIS.alpha.topFill * 0.5)
  }

  // Malla: verticales del contorno trasero, aros a cada paso de altura y techo
  const mesh = P.netMeshM
  const lineW = 1
  back.lineStyle(lineW, C.net, GOAL_VIS.alpha.mesh)
  const arcLen = Math.PI * (POST_X + BACK_LOW) / 2
  const cols = Math.ceil(arcLen / mesh)
  const tmpA: V3 = { x: 0, y: 0, z: 0 }
  const tmpB: V3 = { x: 0, y: 0, z: 0 }
  for (let i = 1; i < cols; i++) {
    const u = i / cols
    const a = pj(backAt(u, true, tmpA))
    const b = pj(backAt(u, false, tmpB))
    back.lineBetween(a.x, a.y, b.x, b.y)
  }
  const rows = Math.ceil(BAR_Z / mesh)
  for (let r = 1; r < rows; r++) {
    const v = r / rows
    back.beginPath()
    for (let i = 0; i <= S; i++) {
      const q = pj({ x: hi[i].x + (lo[i].x - hi[i].x) * v, y: hi[i].y + (lo[i].y - hi[i].y) * v, z: BAR_Z * (1 - v) })
      if (i === 0) back.moveTo(q.x, q.y)
      else back.lineTo(q.x, q.y)
    }
    back.strokePath()
  }
  back.lineStyle(lineW, C.net, GOAL_VIS.alpha.meshTop)
  for (let i = 1; i < cols; i++) {
    const a = pj(backAt(i / cols, true, tmpA))
    const b = view.project(tmpA.x, -TUBE_R, BAR_Z)
    back.lineBetween(a.x, a.y, b.x, b.y)
  }

  // Red colgante interior a 40 cm de la línea (hasta donde la deja el arco)
  const hx = POST_X * Math.sqrt(1 - Math.pow((-HANG_Y - TUBE_R) / BACK_LOW, 2))
  quad([{ x: -hx, y: HANG_Y, z: 0 }, { x: hx, y: HANG_Y, z: 0 }, { x: hx, y: HANG_Y, z: 1.05 }, { x: -hx, y: HANG_Y, z: 1.05 }], C.netShade, 0.22)
  back.lineStyle(lineW, C.net, GOAL_VIS.alpha.mesh * 0.8)
  for (let x = -hx + mesh; x < hx; x += mesh) {
    const a = view.project(x, HANG_Y, 0)
    const b = view.project(x, HANG_Y, 1.05)
    back.lineBetween(a.x, a.y, b.x, b.y)
  }
  for (let z = mesh; z < 1.05; z += mesh) {
    const a = view.project(-hx, HANG_Y, z)
    const b = view.project(hx, HANG_Y, z)
    back.lineBetween(a.x, a.y, b.x, b.y)
  }

  // Estructura trasera blanca: arco inferior Ø 5 cm y contorno superior Ø 1,5 cm
  for (let i = 0; i < S; i++) {
    tube(back, view, lo[i], lo[i + 1], 0.05, C.rear, C.rearEdge, C.rearShine)
    tube(back, view, hi[i], hi[i + 1], 0.02, C.rear, C.rearEdge, C.rearShine)
  }

  // Marco frontal naranja: postes y larguero, tubo de Ø 7,5 cm
  const pr = { x: POST_X, y: -TUBE_R, z: 0 }
  const pl = { x: -POST_X, y: -TUBE_R, z: 0 }
  const tr = { x: POST_X, y: -TUBE_R, z: BAR_Z }
  const tl = { x: -POST_X, y: -TUBE_R, z: BAR_Z }
  const d = TUBE_R * 2
  tube(front, view, pl, tl, d, C.tube, C.tubeEdge, C.tubeShine)
  tube(front, view, pr, tr, d, C.tube, C.tubeEdge, C.tubeShine)
  tube(front, view, tl, tr, d, C.tube, C.tubeEdge, C.tubeShine)
}

// ─── Bola ────────────────────────────────────────────────────────────────────

/** Bola real con su sombra en el suelo (más pequeña y tenue cuanto más alta). */
function drawBall(scene: Phaser.Scene, view: SetPieceView, b: V3, shadows: Phaser.GameObjects.Graphics) {
  const r = P.ballDiameterM / 2
  const z = Math.max(r, b.z)
  const ground = view.project(b.x, b.y, 0)
  const sw = P.ballDiameterM * 1.3 * ground.s * PX_PER_M
  const fade = Math.max(0.15, 1 - z / 1.5)
  shadows.fillStyle(0x000000, 0.45 * fade).fillEllipse(ground.x, ground.y, sw * (0.7 + 0.3 * fade), sw * view.floorForeshorten(b.x, b.y))
  const p = view.project(b.x, b.y, z)
  const diam = P.ballDiameterM * p.s * PX_PER_M * view.lateralStretch(b.x, b.y)
  scene.add.image(p.x, p.y, 'puck-pixel').setDisplaySize(diam, diam).setDepth(view.depthAt(b.x, b.y) + 0.01)
}
