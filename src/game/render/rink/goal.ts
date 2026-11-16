/** Portería de rink hockey a escala real (1,70 × 1,05 m), con cámara única y partida por profundidad. */
import * as Phaser from 'phaser'
import { GOAL_BACK_DEPTH, GOAL_HALF_H, RINK } from '../../constants'
import { getGoalLineX } from '../../utils'
import { bandDepth, DEPTH, GOAL_VIS, LIGHT, PX_PER_M } from '../artSpec'
import { project } from '../viewTransform'

const C = GOAL_VIS.colors
const A = GOAL_VIS.alpha
const H = GOAL_VIS.heightM * PX_PER_M

interface Pt { x: number; y: number }

/** Geometría proyectada de una portería: arcos trasero (suelo y techo) de poste lejano a cercano. */
interface GoalGeom {
  dir: number
  line: number
  cy: number
  farFoot: Pt & { s: number }
  nearFoot: Pt & { s: number }
  floorArc: Pt[]
  topArc: Pt[]
}

/** Punto proyectado en un objeto nuevo (se construye una sola vez, no por frame). */
function pp(wx: number, wy: number, wz = 0): Pt & { s: number } {
  const p = project(wx, wy, wz)
  return { x: p.x, y: p.y, s: p.s }
}

/** Arco semielíptico trasero (fondo GOAL_BACK_DEPTH) de poste lejano a poste cercano, a altura `wz`. */
function rearArc(line: number, cy: number, dir: number, wz: number, n: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n
    out.push(pp(line + dir * GOAL_BACK_DEPTH * Math.cos(a), cy + GOAL_HALF_H * Math.sin(a), wz))
  }
  return out
}

function buildGeom(leftSide: boolean): GoalGeom {
  const line = getGoalLineX(leftSide ? 'left' : 'right')
  const cy = RINK.y + RINK.height / 2
  const dir = leftSide ? -1 : 1
  const n = GOAL_VIS.arcSegments
  return {
    dir, line, cy,
    farFoot: pp(line, cy - GOAL_HALF_H),
    nearFoot: pp(line, cy + GOAL_HALF_H),
    floorArc: rearArc(line, cy, dir, 0, n),
    topArc: rearArc(line, cy, dir, H * GOAL_VIS.rearTopFrac, n),
  }
}

/** Tubo con sombreado: borde oscuro, cuerpo y brillo especular desplazado a la luz. */
function tube(g: Phaser.GameObjects.Graphics, a: Pt, b: Pt, w: number, body: number, edge: number, shine: number) {
  g.lineStyle(w + LIGHT.goalGlowPx, LIGHT.goalGlowColor, LIGHT.goalGlowAlpha)
  g.lineBetween(a.x, a.y, b.x, b.y)
  g.lineStyle(w + 1.2, edge, 1)
  g.lineBetween(a.x, a.y, b.x, b.y)
  g.lineStyle(w, body, 1)
  g.lineBetween(a.x, a.y, b.x, b.y)
  g.lineStyle(Math.max(0.8, w * 0.3), shine, 0.9)
  g.lineBetween(a.x - w * 0.18, a.y, b.x - w * 0.18, b.y)
}

function polyline(g: Phaser.GameObjects.Graphics, pts: Pt[]) {
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.strokePath()
}

function fillPoly(g: Phaser.GameObjects.Graphics, pts: Pt[]) {
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.closePath()
  g.fillPath()
}

/** Casco convexo (cadena monótona). */
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Pt[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Contorno cerrado de un polígono. */
function fillPolyStroke(g: Phaser.GameObjects.Graphics, pts: Pt[]) {
  polyline(g, [...pts, pts[0]])
}

/** Interpola dos listas de puntos de igual longitud (para los anillos de malla). */
function lerpPts(a: Pt[], b: Pt[], t: number): Pt[] {
  return a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t }))
}

/** Parte trasera: sombra, suelo, red de fondo y techo, red colgante, arco blanco y poste lejano. */
function drawBack(g: Phaser.GameObjects.Graphics, geo: GoalGeom) {
  const { floorArc, topArc, farFoot, nearFoot, line, cy, dir } = geo
  const rings = GOAL_VIS.meshRings
  const farTop = pp(line, cy - GOAL_HALF_H, H)
  const nearTop = pp(line, cy + GOAL_HALF_H, H)

  // Sombra de la base y el arco trasero sobre el suelo: capas más anchas y suaves hacia fuera
  const cxs = floorArc.reduce((a, p) => a + p.x, 0) / floorArc.length
  const cys = floorArc.reduce((a, p) => a + p.y, 0) / floorArc.length
  for (const L of LIGHT.goalShadow) {
    g.fillStyle(0x000000, L.alpha)
    fillPoly(g, floorArc.map(p => ({ x: cxs + (p.x - cxs) * (1 + L.grow), y: cys + (p.y - cys) * (1 + L.grow) + L.dy })))
  }
  g.fillStyle(C.floor, A.floor)
  fillPoly(g, floorArc)

  // Red de fondo (panel curvo entre arco del suelo y arco superior)
  g.fillStyle(C.net, A.netFill)
  fillPoly(g, [...floorArc, ...[...topArc].reverse()])
  g.lineStyle(0.8, C.net, A.mesh)
  for (let i = 1; i < floorArc.length - 1; i++) g.lineBetween(floorArc[i].x, floorArc[i].y, topArc[i].x, topArc[i].y)
  for (let r = 1; r <= rings; r++) polyline(g, lerpPts(floorArc, topArc, r / (rings + 1)))

  // Red del techo: del larguero al arco superior trasero
  const crossbar = topArc.map((_, i) => {
    const t = i / (topArc.length - 1)
    return { x: farTop.x + (nearTop.x - farTop.x) * t, y: farTop.y + (nearTop.y - farTop.y) * t }
  })
  g.fillStyle(C.net, A.topFill)
  fillPoly(g, [...crossbar, ...[...topArc].reverse()])
  g.lineStyle(0.8, C.net, A.mesh)
  for (let i = 1; i < topArc.length - 1; i++) g.lineBetween(crossbar[i].x, crossbar[i].y, topArc[i].x, topArc[i].y)
  for (let r = 1; r <= rings; r++) polyline(g, lerpPts(crossbar, topArc, r / (rings + 1)))

  // Segunda red: colgante a 0,40 m de la línea, de poste a poste
  const ix = line + dir * GOAL_VIS.innerNetSetbackPx
  const ih = H * GOAL_VIS.innerNetHeightFrac
  const inner = [pp(ix, cy - GOAL_HALF_H, 0), pp(ix, cy + GOAL_HALF_H, 0), pp(ix, cy + GOAL_HALF_H, ih), pp(ix, cy - GOAL_HALF_H, ih)]
  g.fillStyle(C.net, A.innerFill)
  fillPoly(g, inner)
  g.lineStyle(1, C.net, A.meshInner)
  const cols = 7
  for (let k = 1; k < cols; k++) {
    const t = k / cols
    g.lineBetween(inner[0].x + (inner[1].x - inner[0].x) * t, inner[0].y + (inner[1].y - inner[0].y) * t,
      inner[3].x + (inner[2].x - inner[3].x) * t, inner[3].y + (inner[2].y - inner[3].y) * t)
  }
  for (let r = 1; r <= rings; r++) {
    const t = r / (rings + 1)
    g.lineBetween(inner[0].x + (inner[3].x - inner[0].x) * t, inner[0].y + (inner[3].y - inner[0].y) * t,
      inner[1].x + (inner[2].x - inner[1].x) * t, inner[1].y + (inner[2].y - inner[1].y) * t)
  }

  // Arcos blancos interiores, finos: no compiten con la silueta
  const rw = GOAL_VIS.tubePx * GOAL_VIS.rearTubeScale * ((farFoot.s + nearFoot.s) / 2)
  g.lineStyle(rw * 0.5, C.rear, 0.55)
  polyline(g, floorArc)
  polyline(g, topArc)

  // Silueta exterior de la jaula (casco convexo de ambos arcos y los postes): una sola forma
  const hull = convexHull([...floorArc, ...topArc, farFoot, nearFoot, farTop, nearTop])
  g.lineStyle(rw + LIGHT.goalGlowPx * 1.6, LIGHT.goalGlowColor, LIGHT.goalGlowAlpha * 0.6)
  polyline(g, [...hull, hull[0]])
  g.lineStyle(rw + 1.2, C.rearEdge, 0.9)
  fillPolyStroke(g, hull)
  g.lineStyle(rw, C.rear, 1)
  fillPolyStroke(g, hull)

  // Poste lejano (queda detrás de jugadores dentro de la portería)
  tube(g, farFoot, pp(line, cy - GOAL_HALF_H, H - GOAL_VIS.bevelPx), GOAL_VIS.tubePx * farFoot.s, C.tube, C.tubeEdge, C.tubeShine)
  g.fillStyle(C.tubeEdge, 0.8)
  g.fillEllipse(farFoot.x, farFoot.y, GOAL_VIS.tubePx * farFoot.s * 1.5, GOAL_VIS.tubePx * farFoot.s * 0.7)
}

/** Parte delantera: poste cercano, larguero con esquinas a 45° y base; tapa lo que queda detrás. */
function drawFront(g: Phaser.GameObjects.Graphics, geo: GoalGeom) {
  const { line, cy, nearFoot, farFoot } = geo
  const b = GOAL_VIS.bevelPx
  const w = GOAL_VIS.tubePx
  const wFar = w * farFoot.s
  const wNear = w * nearFoot.s
  const fy = cy - GOAL_HALF_H
  const ny = cy + GOAL_HALF_H

  // Base del marco en el suelo, de poste a poste
  tube(g, farFoot, nearFoot, wNear * 0.8, C.tube, C.tubeEdge, C.tubeShine)

  // Larguero y chaflanes superiores
  const farBevel = pp(line, fy, H - b)
  const farCut = pp(line, fy + b, H)
  const nearCut = pp(line, ny - b, H)
  const nearBevel = pp(line, ny, H - b)
  tube(g, farBevel, farCut, wFar, C.tube, C.tubeEdge, C.tubeShine)
  tube(g, farCut, nearCut, (wFar + wNear) / 2, C.tube, C.tubeEdge, C.tubeShine)
  tube(g, nearCut, nearBevel, wNear, C.tube, C.tubeEdge, C.tubeShine)

  // Poste cercano
  tube(g, nearFoot, nearBevel, wNear, C.tube, C.tubeEdge, C.tubeShine)
  g.fillStyle(C.tubeEdge, 0.8)
  g.fillEllipse(nearFoot.x, nearFoot.y, wNear * 1.5, wNear * 0.7)
}

/**
 * Crea los dos Graphics de una portería, partida por profundidad (SPEC §3):
 * trasera (red, arcos, poste lejano) tras los jugadores de dentro y delantera
 * (poste cercano, larguero, base) por delante de ellos. Mantiene la firma
 * que usa drawRink: `g` solo aporta la escena.
 */
export function drawGoal3D(g: Phaser.GameObjects.Graphics, _goalLineX: number, _centerY: number, leftSide: boolean) {
  const geo = buildGeom(leftSide)
  const scene = g.scene
  const back = scene.add.graphics().setDepth(bandDepth('COURT', geo.farFoot.y) - 0.002)
  const front = scene.add.graphics().setDepth(bandDepth('COURT', geo.nearFoot.y) + 0.002)
  drawBack(back, geo)
  drawFront(front, geo)
}

// ─── Flash de red (overlay animado al marcar gol) ─────────────────────────────

/**
 * Crea dos Graphics de flash (izq/der) a alpha=0 que repiten la red nueva
 * (suelo y panel de fondo). Al marcar gol se les aplica un tween alpha 0.9→0.
 */
export function createGoalNetFlash(scene: Phaser.Scene) {
  function buildFlash(leftSide: boolean) {
    const geo = buildGeom(leftSide)
    const gfx = scene.add.graphics().setDepth(DEPTH.FX).setAlpha(0)
    gfx.fillStyle(C.flash, 0.45)
    fillPoly(gfx, geo.floorArc)
    gfx.fillStyle(C.flash, 0.4)
    fillPoly(gfx, [...geo.floorArc, ...[...geo.topArc].reverse()])
    gfx.lineStyle(1.2, C.flash, 0.9)
    for (let i = 1; i < geo.floorArc.length - 1; i++) gfx.lineBetween(geo.floorArc[i].x, geo.floorArc[i].y, geo.topArc[i].x, geo.topArc[i].y)
    return gfx
  }
  return { left: buildFlash(true), right: buildFlash(false) }
}
