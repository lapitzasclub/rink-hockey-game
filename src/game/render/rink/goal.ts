/**
 * Portería de rink hockey a escala real (1,70 × 1,05 m) con la cámara única.
 *
 * La cámara lateral ve el plano de la boca casi de canto: postes y larguero
 * caen en la misma x de pantalla. Para abrir la boca sin mover nada del
 * suelo, la portería usa la inclinación de perspectiva común de las vallas y
 * las redes (`projectLeaned`, WP-70): todo punto con altura z se desplaza en x
 * de pantalla hacia el fondo en proporción a su altura en pantalla. Lo que
 * toca el suelo (pies de los postes, arco trasero) queda en su sitio exacto,
 * así que la línea de gol pintada, la bola y los rebotes en el poste
 * coinciden con la física.
 */
import * as Phaser from 'phaser'
import { GOAL_BACK_DEPTH, GOAL_HALF_H, RINK } from '../../constants'
import { getGoalLineX } from '../../utils'
import { bandDepth, DEPTH, GOAL_VIS, LIGHT, PX_PER_M } from '../artSpec'
import { project, projectLeaned, type Projected } from '../viewTransform'

const V = GOAL_VIS
const C = V.colors
const A = V.alpha
const H = V.heightM * PX_PER_M
const BEVEL = V.bevelM * PX_PER_M

interface Pt { x: number; y: number; s: number }

/** Geometría proyectada de una portería (se construye una vez, al crear la escena). */
interface GoalGeom {
  /** +1: el fondo de la portería queda hacia +x de mundo (portería derecha). */
  back: number
  line: number
  cy: number
  farFoot: Pt
  nearFoot: Pt
  /** Marco naranja: pie lejano → chaflán → larguero → chaflán → pie cercano. */
  frame: Pt[]
  /** Arco trasero del suelo, estructura superior y larguero, muestreados con el mismo parámetro. */
  floorArc: Pt[]
  topArc: Pt[]
  crossbar: Pt[]
  /** Red de fondo: anillos de abajo arriba (floorArc … topArc) con caída hacia fuera. */
  backRings: Pt[][]
  /** Red de techo: anillos del larguero a la estructura superior, con caída hacia abajo. */
  topRings: Pt[][]
}

const tmp: Projected = { x: 0, y: 0, s: 0 }

/**
 * Punto de la portería en coordenadas propias: `u` hacia el fondo (0 en la
 * línea de gol), `v` lateral (+ hacia la cámara) y `z` altura, en px de mundo.
 */
function gp(back: number, line: number, cy: number, u: number, v: number, z: number): Pt {
  projectLeaned(line + back * u, cy + v, z, tmp)
  return { x: tmp.x, y: tmp.y, s: tmp.s }
}

function buildGeom(leftSide: boolean): GoalGeom {
  const line = getGoalLineX(leftSide ? 'left' : 'right')
  const cy = RINK.y + RINK.height / 2
  const back = leftSide ? -1 : 1
  const P = (u: number, v: number, z: number) => gp(back, line, cy, u, v, z)
  const hh = GOAL_HALF_H
  const n = V.arcSegments
  const topSide = V.topSideM * PX_PER_M
  const topCenter = V.topCenterM * PX_PER_M
  const sagBack = V.backSagM * PX_PER_M
  const sagTop = V.topSagM * PX_PER_M

  // Parámetro común a = −π/2 (poste lejano) … π/2 (poste cercano)
  const floor: [number, number][] = []
  const top: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n
    floor.push([GOAL_BACK_DEPTH * Math.cos(a), hh * Math.sin(a)])
    top.push([topSide + (topCenter - topSide) * Math.cos(a), (hh - BEVEL * 0.5) * Math.sin(a)])
  }
  const bar = top.map(([, v]) => Math.max(-(hh - BEVEL), Math.min(hh - BEVEL, v)))

  const backRings: Pt[][] = []
  for (let r = 0; r <= V.backRings; r++) {
    const t = r / V.backRings
    const bulge = 4 * t * (1 - t) * sagBack
    backRings.push(floor.map(([fu, fv], i) => {
      const [tu, tv] = top[i]
      const a = -Math.PI / 2 + (Math.PI * i) / n
      return P(fu + (tu - fu) * t + bulge * Math.cos(a), fv + (tv - fv) * t + bulge * Math.sin(a) * 0.5, H * t)
    }))
  }
  const topRings: Pt[][] = []
  for (let r = 0; r <= V.topRings; r++) {
    const t = r / V.topRings
    const droop = 4 * t * (1 - t) * sagTop
    topRings.push(top.map(([tu, tv], i) => P(tu * t, bar[i] + (tv - bar[i]) * t, H - droop)))
  }

  return {
    back, line, cy,
    farFoot: P(0, -hh, 0),
    nearFoot: P(0, hh, 0),
    frame: [P(0, -hh, 0), P(0, -hh, H - BEVEL), P(0, -hh + BEVEL, H), P(0, hh - BEVEL, H), P(0, hh, H - BEVEL), P(0, hh, 0)],
    floorArc: backRings[0],
    topArc: topRings[topRings.length - 1],
    crossbar: topRings[0],
    backRings,
    topRings,
  }
}

// ─── Primitivas ───────────────────────────────────────────────────────────────

function path(g: Phaser.GameObjects.Graphics, pts: Pt[], close = false) {
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  if (close) g.closePath()
}

function stroke(g: Phaser.GameObjects.Graphics, pts: Pt[], w: number, color: number, alpha: number) {
  g.lineStyle(w, color, alpha)
  path(g, pts)
  g.strokePath()
  // Juntas redondas: Graphics no une los segmentos
  g.fillStyle(color, alpha)
  for (let i = 1; i < pts.length - 1; i++) g.fillCircle(pts[i].x, pts[i].y, w / 2)
}

function fill(g: Phaser.GameObjects.Graphics, pts: Pt[], color: number, alpha: number) {
  g.fillStyle(color, alpha)
  path(g, pts, true)
  g.fillPath()
}

/** Desplaza una polilínea en pantalla (para brillos y sombras del tubo). */
function offset(pts: Pt[], dx: number, dy: number): Pt[] {
  return pts.map(p => ({ x: p.x + dx, y: p.y + dy, s: p.s }))
}

/**
 * Tubo redondo en estilo A: halo claro, contorno oscuro, cuerpo, sombra
 * propia del lado contrario a la luz y brillo especular hacia la luz.
 */
function tube(g: Phaser.GameObjects.Graphics, pts: Pt[], w: number, body: number, edge: number, dark: number, shine: number, glow = true) {
  if (glow) stroke(g, pts, w + LIGHT.goalGlowPx, LIGHT.goalGlowColor, LIGHT.goalGlowAlpha)
  stroke(g, pts, w + V.outlinePx * 2, edge, 1)
  stroke(g, pts, w, body, 1)
  stroke(g, offset(pts, w * 0.22, w * 0.1), w * 0.4, dark, 0.55)
  stroke(g, offset(pts, -w * 0.2, -w * 0.08), Math.max(0.7, w * 0.28), shine, 0.95)
}

/** Malla entre anillos: líneas a lo largo de cada anillo y entre anillos por cada muestra. */
function mesh(g: Phaser.GameObjects.Graphics, rings: Pt[][], w: number, alpha: number, every = 1) {
  g.lineStyle(w, C.net, alpha)
  for (let r = 1; r < rings.length - 1; r++) { path(g, rings[r]); g.strokePath() }
  const first = rings[0]
  for (let i = 0; i < first.length; i += every) {
    g.beginPath()
    g.moveTo(rings[0][i].x, rings[0][i].y)
    for (let r = 1; r < rings.length; r++) g.lineTo(rings[r][i].x, rings[r][i].y)
    g.strokePath()
  }
}

/** Banda entre dos anillos consecutivos como un polígono cerrado. */
function band(a: Pt[], b: Pt[]): Pt[] {
  return [...a, ...[...b].reverse()]
}

// ─── Partes ───────────────────────────────────────────────────────────────────

/** Trasera: sombra, suelo, redes (fondo, techo y colgante), estructura blanca y poste lejano. */
function drawBack(g: Phaser.GameObjects.Graphics, geo: GoalGeom) {
  const { floorArc, topArc, backRings, topRings, farFoot, nearFoot, frame } = geo
  const sMid = (farFoot.s + nearFoot.s) / 2

  // Sombra en el suelo hacia la cámara y hacia el fondo (luz cenital algo adelantada)
  const shadowPoly = [...floorArc, ...offset([...floorArc].reverse(), geo.back * V.shadowBackPx * sMid, V.shadowDownPx * sMid)]
  for (const L of LIGHT.goalShadow) {
    const cx = floorArc.reduce((acc, p) => acc + p.x, 0) / floorArc.length
    const cyy = floorArc.reduce((acc, p) => acc + p.y, 0) / floorArc.length
    fill(g, shadowPoly.map(p => ({ x: cx + (p.x - cx) * (1 + L.grow), y: cyy + (p.y - cyy) * (1 + L.grow) + L.dy, s: p.s })), C.shadow, L.alpha)
  }
  fill(g, [...floorArc], C.floor, A.floor)

  // Red de fondo: relleno por bandas (más opaco abajo: interior en sombra) y malla
  for (let r = 0; r < backRings.length - 1; r++) {
    const t = r / (backRings.length - 1)
    fill(g, band(backRings[r], backRings[r + 1]), C.netShade, A.backFillLow + (A.backFillHigh - A.backFillLow) * t)
  }
  // Paneles laterales: del poste al primer tramo de red (triángulos poste–larguero–estructura)
  fill(g, [frame[0], frame[1], topArc[0], ...backRings.map(r => r[0]).reverse()], C.netShade, A.sideFill)
  const last = floorArc.length - 1
  fill(g, [frame[5], frame[4], topArc[last], ...backRings.map(r => r[last]).reverse()], C.netShade, A.sideFill)
  mesh(g, backRings, V.meshPx * sMid, A.mesh)

  // Red de techo
  for (let r = 0; r < topRings.length - 1; r++) fill(g, band(topRings[r], topRings[r + 1]), C.netFill, A.topFill)
  mesh(g, topRings, V.meshPx * sMid, A.meshTop)

  // Estructura trasera blanca: arco del suelo (Ø 5 cm) y barras superiores (Ø 1,5 cm)
  const rw = V.tubePx * V.rearTubeScale * sMid
  tube(g, floorArc, rw, C.rear, C.rearEdge, C.rearDark, C.rearShine, false)
  stroke(g, [frame[2], topArc[0]], rw * V.rearBarScale + V.outlinePx * 2, C.rearEdge, 0.9)
  stroke(g, [frame[3], topArc[last]], rw * V.rearBarScale + V.outlinePx * 2, C.rearEdge, 0.9)
  stroke(g, topArc, rw * V.rearBarScale + V.outlinePx * 2, C.rearEdge, 0.9)
  stroke(g, [frame[2], topArc[0]], rw * V.rearBarScale, C.rear, 1)
  stroke(g, [frame[3], topArc[last]], rw * V.rearBarScale, C.rear, 1)
  stroke(g, topArc, rw * V.rearBarScale, C.rear, 1)

  // Poste lejano (detrás de quien esté dentro de la portería)
  const w = V.tubePx * farFoot.s
  g.fillStyle(C.shadow, V.footShadowAlpha)
  g.fillEllipse(farFoot.x, farFoot.y + 0.5, w * V.footShadowW, w * V.footShadowH)
  tube(g, frame.slice(0, 2), w, C.tube, C.tubeEdge, C.tubeDark, C.tubeShine)
}

/** Delantera: larguero con chaflanes a 45° y poste cercano; tapa lo que hay dentro o detrás. */
function drawFront(g: Phaser.GameObjects.Graphics, geo: GoalGeom) {
  const { frame, nearFoot } = geo
  const w = V.tubePx * nearFoot.s
  g.fillStyle(C.shadow, V.footShadowAlpha)
  g.fillEllipse(nearFoot.x, nearFoot.y + 0.5, w * V.footShadowW, w * V.footShadowH)
  tube(g, frame.slice(1), w, C.tube, C.tubeEdge, C.tubeDark, C.tubeShine)
}

// ─── Profundidad ──────────────────────────────────────────────────────────────

let frontDepthCache: number | null = null

/** Depth de la parte delantera (larguero y poste cercano). */
function goalFrontDepth(): number {
  if (frontDepthCache === null) {
    project(getGoalLineX('left'), RINK.y + RINK.height / 2 + GOAL_HALF_H, 0, tmp)
    frontDepthCache = bandDepth('COURT', tmp.y) + V.depthEps
  }
  return frontDepthCache
}

/**
 * Depth para una figura con los pies en (wx, wy): si está delante de la boca
 * de una portería (lado campo, a la altura de la boca), queda por encima del
 * marco; si no, la de su y de pantalla (`baseDepth`).
 */
export function depthBesideGoal(wx: number, wy: number, baseDepth: number): number {
  const cy = RINK.y + RINK.height / 2
  if (Math.abs(wy - cy) > GOAL_HALF_H + V.frontBandPx) return baseDepth
  const dl = wx - getGoalLineX('left')
  const dr = getGoalLineX('right') - wx
  const ahead = (dl >= 0 && dl < V.frontReachPx) || (dr >= 0 && dr < V.frontReachPx)
  return ahead ? Math.max(baseDepth, goalFrontDepth() + V.depthEps) : baseDepth
}

/**
 * Crea los dos Graphics de una portería, partida por profundidad (SPEC §3):
 * trasera (redes, estructura blanca, poste lejano) tras los jugadores de
 * dentro y delantera (larguero y poste cercano) por delante de ellos. Mantiene
 * la firma que usa drawRink: `g` solo aporta la escena.
 */
export function drawGoal3D(g: Phaser.GameObjects.Graphics, _goalLineX: number, _centerY: number, leftSide: boolean) {
  const geo = buildGeom(leftSide)
  const scene = g.scene
  const back = scene.add.graphics().setDepth(bandDepth('COURT', geo.farFoot.y) - V.depthEps)
  const front = scene.add.graphics().setDepth(goalFrontDepth())
  drawBack(back, geo)
  drawFront(front, geo)
}

// ─── Flash de red (overlay animado al marcar gol) ─────────────────────────────

/**
 * Crea dos Graphics de flash (izq/der) a alpha=0 que repiten la red (fondo y
 * techo, con malla). Al marcar gol se les aplica un tween alpha 0.9→0.
 */
export function createGoalNetFlash(scene: Phaser.Scene) {
  function buildFlash(leftSide: boolean) {
    const geo = buildGeom(leftSide)
    const gfx = scene.add.graphics().setDepth(DEPTH.FX).setAlpha(0)
    const s = (geo.farFoot.s + geo.nearFoot.s) / 2
    for (let r = 0; r < geo.backRings.length - 1; r++) fill(gfx, band(geo.backRings[r], geo.backRings[r + 1]), C.flash, 0.32)
    for (let r = 0; r < geo.topRings.length - 1; r++) fill(gfx, band(geo.topRings[r], geo.topRings[r + 1]), C.flash, 0.4)
    mesh(gfx, geo.backRings, V.meshPx * s * 1.6, 0.9)
    mesh(gfx, geo.topRings, V.meshPx * s * 1.6, 0.9)
    return gfx
  }
  return { left: buildFlash(true), right: buildFlash(false) }
}
