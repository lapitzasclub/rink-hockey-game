import * as Phaser from 'phaser'
import { BLUE_LINE_OFFSET, GAME_WIDTH, GOAL_HALF_H, GOAL_HEIGHT, RINK } from '../constants'
import { getGoalLineX } from '../utils'
import { worldToScreen, worldToScreenExt } from './viewTransform'

/**
 * Pista con perspectiva 3/4 real: todos los elementos se proyectan
 * explícitamente con worldToScreen (convergencia X + curva Y no-lineal).
 * Ya no se usa g.setScale como atajo — permite que el campo aparezca
 * trapezoidal con filas lejanas más comprimidas que las cercanas.
 */
export function drawRink(scene: Phaser.Scene) {
  const boardBack  = scene.add.graphics().setDepth(-2)
  const boardFront = scene.add.graphics().setDepth(20)
  drawPerspectiveBoards(boardBack, boardFront)

  const g  = scene.add.graphics().setDepth(0)
  const cx = GAME_WIDTH / 2
  const cy = RINK.y + RINK.height / 2   // 360 — centro mundo del campo

  const sx = RINK.width  / 40   // px/m horizontal
  const sy = RINK.height / 20   // px/m vertical (mundo)

  const leftGoalX  = getGoalLineX('left')
  const rightGoalX = getGoalLineX('right')
  const leftBlueX  = cx - BLUE_LINE_OFFSET
  const rightBlueX = cx + BLUE_LINE_OFFSET

  // ── Superficie de hielo ───────────────────────────────────────────────────
  g.fillStyle(0xe4f2fb, 1)
  projFill(g, roundedRectPts(RINK.x, RINK.y, RINK.width, RINK.height, 86, 10))

  // Rayaduras horizontales de hielo
  g.lineStyle(1, 0x9ec8de, 0.09)
  for (let iy = RINK.y + 22; iy < RINK.y + RINK.height; iy += 26) {
    const l = worldToScreen(RINK.x + 40, iy)
    const r = worldToScreen(RINK.x + RINK.width - 40, iy)
    g.lineBetween(l.x, l.y, r.x, r.y)
  }

  // ── Áreas de penalti ─────────────────────────────────────────────────────
  drawPenaltyArea(g, leftGoalX,  cy, true,  sx, sy)
  drawPenaltyArea(g, rightGoalX, cy, false, sx, sy)

  // ── Semicírculo D del portero ─────────────────────────────────────────────
  drawGoalCrease(g, leftGoalX,  cy, true)
  drawGoalCrease(g, rightGoalX, cy, false)

  // ── Porterías 3D ─────────────────────────────────────────────────────────
  drawGoal3D(g, leftGoalX,  cy, true)
  drawGoal3D(g, rightGoalX, cy, false)

  // ── Línea central y círculo ───────────────────────────────────────────────
  g.lineStyle(4, 0x0a1525, 1)
  projStrokePath(g, [worldToScreen(cx, RINK.y + 8), worldToScreen(cx, RINK.y + RINK.height - 8)])
  g.lineStyle(4, 0x0a1525, 1)
  projStrokeCircle(g, cx, cy, 3 * sy)

  const cc = worldToScreen(cx, cy)
  g.fillStyle(0x0a1525, 1)
  g.fillCircle(cc.x, cc.y, 7)

  // ── Líneas azules de zona ─────────────────────────────────────────────────
  g.lineStyle(4, 0x2060cc, 1)
  projStrokePath(g, [worldToScreen(leftBlueX,  RINK.y + 8), worldToScreen(leftBlueX,  RINK.y + RINK.height - 8)])
  projStrokePath(g, [worldToScreen(rightBlueX, RINK.y + 8), worldToScreen(rightBlueX, RINK.y + RINK.height - 8)])

  // ── Puntos reglamentarios ─────────────────────────────────────────────────
  drawFieldDots(g, leftGoalX, rightGoalX, cy, sx)

  // ── Borde perimetral ──────────────────────────────────────────────────────
  g.lineStyle(7, 0x0a1525, 1)
  projStrokePoly(g, roundedRectPts(RINK.x, RINK.y, RINK.width, RINK.height, 86, 10))
}

// ─── Helpers de proyección ────────────────────────────────────────────────────

/** Genera puntos del contorno redondeado en coordenadas MUNDO (sin proyectar, CW). */
function roundedRectWorldPts(
  rx: number, ry: number, rw: number, rh: number, cr: number, segs: number,
): { x: number; y: number }[] {
  const corners = [
    { cx: rx + cr,      cy: ry + cr,      a0: 180, a1: 270 },
    { cx: rx + rw - cr, cy: ry + cr,      a0: 270, a1: 360 },
    { cx: rx + rw - cr, cy: ry + rh - cr, a0: 0,   a1: 90  },
    { cx: rx + cr,      cy: ry + rh - cr, a0: 90,  a1: 180 },
  ]
  const pts: { x: number; y: number }[] = []
  for (const c of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = Phaser.Math.DegToRad(c.a0 + (c.a1 - c.a0) * (i / segs))
      pts.push({ x: c.cx + Math.cos(a) * cr, y: c.cy + Math.sin(a) * cr })
    }
  }
  return pts
}

/** Genera puntos de pantalla para un rounded rect en coordenadas mundo (CW). */
function roundedRectPts(
  rx: number, ry: number, rw: number, rh: number, cr: number, segs: number,
): { x: number; y: number }[] {
  return roundedRectWorldPts(rx, ry, rw, rh, cr, segs).map(p => worldToScreen(p.x, p.y))
}

/** Genera puntos de pantalla de un arco en coords mundo. */
function arcPts(
  cx: number, cy: number, r: number, startDeg: number, endDeg: number, N = 20,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= N; i++) {
    const a = Phaser.Math.DegToRad(startDeg + (endDeg - startDeg) * (i / N))
    pts.push(worldToScreen(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
  }
  return pts
}

/** Rellena un polígono de puntos de pantalla. */
function projFill(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
  if (pts.length < 3) return
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.closePath()
  g.fillPath()
}

/** Dibuja el contorno de un polígono de pantalla. */
function projStrokePoly(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.closePath()
  g.strokePath()
}

/** Dibuja una polyline abierta de puntos de pantalla. */
function projStrokePath(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.strokePath()
}

/** Dibuja un círculo en coords mundo proyectado como polígono. */
function projStrokeCircle(g: Phaser.GameObjects.Graphics, wx: number, wy: number, wr: number, N = 32) {
  g.beginPath()
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const { x, y } = worldToScreen(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr)
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  g.strokePath()
}

// ─── Tableros ─────────────────────────────────────────────────────────────────

/**
 * Tableros como paredes 3D: el borde exterior se computa en espacio MUNDO
 * y se proyecta con worldToScreenExt (sin clamp de t).
 *
 * Para el tablero lejano la curva de potencia aplana la derivada Y en t≈0,
 * haciendo que el borde exterior proyecte al mismo Y que el interior.
 * Se compensa con un offset de pantalla proporcional a la fracción "lejana"
 * de la normal (farFrac = max(0, -nwy)).  Los tableros lateral y cercano
 * no necesitan compensación: worldToScreenExt los proyecta correctamente.
 */
function drawPerspectiveBoards(back: Phaser.GameObjects.Graphics, front: Phaser.GameObjects.Graphics) {
  const CORNER_R = 86
  const SEGS     = 12
  const BOARD_W  = 17   // ancho físico del tablero en unidades mundo
  const FAR_H    = 9    // altura visual tablero lejano en px pantalla (compens. curva potencia)

  const topY    = worldToScreen(RINK.x, RINK.y).y
  const bottomY = worldToScreen(RINK.x, RINK.y + RINK.height).y
  const midY    = (topY + bottomY) * 0.5

  const wpts = roundedRectWorldPts(RINK.x, RINK.y, RINK.width, RINK.height, CORNER_R, SEGS)
  const n = wpts.length

  for (let i = 0; i < n; i++) {
    const w0 = wpts[i]
    const w1 = wpts[(i + 1) % n]
    const dx = w1.x - w0.x
    const dy = w1.y - w0.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.5) continue

    // Normal exterior en espacio mundo (CW → apunta afuera del campo)
    const nwx = dy / len
    const nwy = -dx / len

    // Arista interior (borde del hielo) proyectada normalmente
    const ib0 = worldToScreen(w0.x, w0.y)
    const ib1 = worldToScreen(w1.x, w1.y)

    // Arista exterior: offset en mundo, proyectada sin clamp
    const rob0 = worldToScreenExt(w0.x + nwx * BOARD_W, w0.y + nwy * BOARD_W)
    const rob1 = worldToScreenExt(w1.x + nwx * BOARD_W, w1.y + nwy * BOARD_W)

    // Compensación para tablero lejano: cuánto de la normal apunta al borde lejano.
    // La curva Y se aplana en t≈0 → añadir offset de pantalla proporcional.
    const farFrac = Math.max(0, -nwy)
    const ob0 = { x: rob0.x, y: rob0.y - FAR_H * farFrac }
    const ob1 = { x: rob1.x, y: rob1.y - FAR_H * farFrac }

    const avgY   = (ib0.y + ib1.y) * 0.5
    const isBack = avgY < midY
    const isSide = Math.abs(nwx) > Math.abs(nwy)
    const g = isBack ? back : front
    const color = isBack ? 0x0f2841 : (isSide ? 0x163a5d : 0x12304d)
    g.fillStyle(color, 1)
    fillQuad(g, ib0.x, ib0.y, ib1.x, ib1.y, ob1.x, ob1.y, ob0.x, ob0.y)
  }

  // Sombra de contacto tablero lejano–hielo
  back.lineStyle(2, 0x06101b, 0.45)
  for (let i = 0; i < n; i++) {
    const ib  = worldToScreen(wpts[i].x, wpts[i].y)
    const ib1 = worldToScreen(wpts[(i + 1) % n].x, wpts[(i + 1) % n].y)
    if (ib.y < midY && ib1.y < midY) back.lineBetween(ib.x, ib.y + 1, ib1.x, ib1.y + 1)
  }

  // Canto superior del tablero cercano (cara interior visible)
  front.lineStyle(3, 0x254f79, 0.95)
  for (let i = 0; i < n; i++) {
    const ib  = worldToScreen(wpts[i].x, wpts[i].y)
    const ib1 = worldToScreen(wpts[(i + 1) % n].x, wpts[(i + 1) % n].y)
    if (ib.y >= midY && ib1.y >= midY) front.lineBetween(ib.x, ib.y - 1, ib1.x, ib1.y - 1)
  }

  // Ribete inferior tablero cercano (borde exterior proyectado)
  front.lineStyle(2, 0x08192e, 0.8)
  for (let i = 0; i < n; i++) {
    const w0 = wpts[i]
    const w1 = wpts[(i + 1) % n]
    const dxi = w1.x - w0.x
    const dyi = w1.y - w0.y
    const li  = Math.sqrt(dxi * dxi + dyi * dyi)
    if (li < 0.5) continue
    const nwxi = dyi / li
    const nwyi = -dxi / li
    const ib0i = worldToScreen(w0.x, w0.y)
    const ib1i = worldToScreen(w1.x, w1.y)
    if ((ib0i.y + ib1i.y) * 0.5 < midY) continue   // solo tablero cercano
    const ob0i = worldToScreenExt(w0.x + nwxi * BOARD_W, w0.y + nwyi * BOARD_W)
    const ob1i = worldToScreenExt(w1.x + nwxi * BOARD_W, w1.y + nwyi * BOARD_W)
    front.lineBetween(ob0i.x, ob0i.y, ob1i.x, ob1i.y)
  }
}

function fillQuad(
  g: Phaser.GameObjects.Graphics,
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
) {
  g.beginPath()
  g.moveTo(ax, ay)
  g.lineTo(bx, by)
  g.lineTo(cx, cy)
  g.lineTo(dx, dy)
  g.closePath()
  g.fillPath()
}

// ─── Elementos del campo ──────────────────────────────────────────────────────

function drawPenaltyArea(
  g: Phaser.GameObjects.Graphics,
  goalLineX: number, cy: number, leftSide: boolean,
  sx: number, sy: number,
) {
  const halfH = 4.5 * sy
  const depth = 5.40 * sx
  const top   = cy - halfH
  const bot   = cy + halfH

  let tl, tr, br, bl
  if (leftSide) {
    tl = worldToScreen(goalLineX,         top)
    tr = worldToScreen(goalLineX + depth, top)
    br = worldToScreen(goalLineX + depth, bot)
    bl = worldToScreen(goalLineX,         bot)
  } else {
    tl = worldToScreen(goalLineX - depth, top)
    tr = worldToScreen(goalLineX,         top)
    br = worldToScreen(goalLineX,         bot)
    bl = worldToScreen(goalLineX - depth, bot)
  }

  g.lineStyle(3, 0xcc2020, 0.80)
  g.beginPath()
  g.moveTo(tl.x, tl.y); g.lineTo(tr.x, tr.y)
  g.lineTo(br.x, br.y); g.lineTo(bl.x, bl.y)
  g.closePath()
  g.strokePath()
}

function drawGoalCrease(g: Phaser.GameObjects.Graphics, goalLineX: number, cy: number, leftSide: boolean) {
  const r = (GOAL_HEIGHT - 36) / 2
  // Arco que abre hacia el campo: derecha para portería izq, izquierda para portería dcha
  const startDeg = leftSide ? 270 : 90
  const endDeg   = leftSide ? 270 + 180 : 90 + 180

  const arc = arcPts(goalLineX, cy, r, startDeg, endDeg, 24)
  const gpt = worldToScreen(goalLineX, cy)

  g.fillStyle(0xee2222, 0.07)
  g.beginPath()
  g.moveTo(gpt.x, gpt.y)
  for (const p of arc) g.lineTo(p.x, p.y)
  g.closePath()
  g.fillPath()

  g.lineStyle(2, 0xcc2020, 0.70)
  g.beginPath()
  g.moveTo(arc[0].x, arc[0].y)
  for (let i = 1; i < arc.length; i++) g.lineTo(arc[i].x, arc[i].y)
  g.strokePath()
}




/**
 * Portería 3D con fondo semicircular real: el arco trasero tiene el mismo radio
 * que el área del portero (GOAL_HALF_H), formando un círculo completo entre ambos.
 *
 * yOff simula la altura vertical de los postes en pantalla.
 */
function drawGoal3D(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
  const halfH = GOAL_HALF_H
  const yOff  = 30
  const postR = 4.5

  // ── Arco trasero: semicírculo real con radio halfH centrado en la línea de gol ──
  // El diámetro es la boca de la portería, por lo que el arco coincide exactamente
  // con el área del portero (drawGoalCrease), formando un círculo completo entre ambos.
  const arcR  = halfH
  const arcCx = goalLineX
  // a0=90 siempre (poste inferior/cercano); a1 recorre el fondo de red
  const a0 = 90
  const a1 = leftSide ? 270 : -90

  const N = 12
  const arcIce: { x: number; y: number }[] = []
  const arcTop: { x: number; y: number }[] = []
  for (let i = 0; i <= N; i++) {
    const ang = Phaser.Math.DegToRad(a0 + (a1 - a0) * (i / N))
    const sp  = worldToScreen(arcCx + Math.cos(ang) * arcR, centerY + Math.sin(ang) * arcR)
    arcIce.push(sp)
    arcTop.push({ x: sp.x, y: sp.y - yOff })
  }
  // arcIce[0] ≈ poste cercano, arcIce[N] ≈ poste lejano
  // arcIce[N/2] ≈ punto más profundo del fondo

  const fFar  = worldToScreen(goalLineX, centerY - halfH)
  const fNear = worldToScreen(goalLineX, centerY + halfH)
  const fFarH  = { x: fFar.x,  y: fFar.y  - yOff }
  const fNearH = { x: fNear.x, y: fNear.y - yOff }

  // ── Suelo interior curvo ──────────────────────────────────────────────────
  g.fillStyle(0x0a1828, 0.32)
  g.beginPath()
  g.moveTo(arcIce[0].x, arcIce[0].y)
  for (let i = 1; i <= N; i++) g.lineTo(arcIce[i].x, arcIce[i].y)
  g.closePath(); g.fillPath()

  // ── Superficie curva de la red (panel trasero completo) ───────────────────
  g.fillStyle(0x0d1e34, 0.26)
  g.beginPath()
  g.moveTo(arcIce[0].x, arcIce[0].y)
  for (let i = 1; i <= N; i++) g.lineTo(arcIce[i].x, arcIce[i].y)
  for (let i = N; i >= 0; i--) g.lineTo(arcTop[i].x, arcTop[i].y)
  g.closePath(); g.fillPath()

  // Refuerzo visual en el lado cercano (más visible desde cámara)
  const half = Math.floor(N / 2)
  g.fillStyle(0x0a1828, 0.10)
  g.beginPath()
  g.moveTo(arcIce[0].x, arcIce[0].y)
  for (let i = 1; i <= half; i++) g.lineTo(arcIce[i].x, arcIce[i].y)
  for (let i = half; i >= 0; i--) g.lineTo(arcTop[i].x, arcTop[i].y)
  g.closePath(); g.fillPath()

  // ── Malla de red ──────────────────────────────────────────────────────────
  g.lineStyle(1.1, 0xffffff, 0.80)
  for (let i = 1; i < N; i++) {
    g.lineBetween(arcIce[i].x, arcIce[i].y, arcTop[i].x, arcTop[i].y)
  }
  for (let r = 1; r <= 3; r++) {
    const t = r / 4
    g.beginPath()
    for (let i = 0; i <= N; i++) {
      const px = arcIce[i].x + (arcTop[i].x - arcIce[i].x) * t
      const py = arcIce[i].y + (arcTop[i].y - arcIce[i].y) * t
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)
    }
    g.strokePath()
  }

  // ── Techo curvo (lid) ─────────────────────────────────────────────────────
  // El panel superior va de arcTop[0]=fNearH hasta arcTop[N]=fFarH por el arco,
  // y cierra de vuelta por el travesaño frontal (línea recta fFarH→fNearH).
  g.fillStyle(0x0d1e34, 0.22)
  g.beginPath()
  g.moveTo(arcTop[0].x, arcTop[0].y)
  for (let i = 1; i <= N; i++) g.lineTo(arcTop[i].x, arcTop[i].y)
  g.closePath(); g.fillPath()

  // ── Red en el techo: líneas longitudinales y transversales ────────────────
  g.lineStyle(1.1, 0xffffff, 0.75)
  // Longitudinales: de cada punto del travesaño al punto correspondiente del arco trasero
  for (let i = 1; i < N; i++) {
    const t  = i / N
    const fx = fNearH.x + (fFarH.x - fNearH.x) * t
    const fy = fNearH.y + (fFarH.y - fNearH.y) * t
    g.lineBetween(fx, fy, arcTop[i].x, arcTop[i].y)
  }
  // Transversales: curvas paralelas al travesaño a distintas profundidades
  for (let r = 1; r <= 3; r++) {
    const d = r / 4
    g.beginPath()
    for (let i = 0; i <= N; i++) {
      const t  = i / N
      const fx = fNearH.x + (fFarH.x - fNearH.x) * t
      const fy = fNearH.y + (fFarH.y - fNearH.y) * t
      const px = fx + (arcTop[i].x - fx) * d
      const py = fy + (arcTop[i].y - fy) * d
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)
    }
    g.strokePath()
  }

  // ── Marco metálico rojo ───────────────────────────────────────────────────
  // Barra curva trasera superior
  g.lineStyle(3, 0xcc2020, 0.85)
  g.beginPath()
  g.moveTo(arcTop[0].x, arcTop[0].y)
  for (let i = 1; i <= N; i++) g.lineTo(arcTop[i].x, arcTop[i].y)
  g.strokePath()

  // Barra curva trasera inferior (nivel suelo)
  g.lineStyle(2, 0xcc2020, 0.52)
  g.beginPath()
  g.moveTo(arcIce[0].x, arcIce[0].y)
  for (let i = 1; i <= N; i++) g.lineTo(arcIce[i].x, arcIce[i].y)
  g.strokePath()

  // Travesaño frontal (larguero)
  g.lineStyle(5, 0xcc2020, 1)
  g.lineBetween(fFarH.x, fFarH.y, fNearH.x, fNearH.y)

  // Postes frontales verticales
  g.lineStyle(6, 0xcc2020, 1)
  g.lineBetween(fFar.x, fFar.y, fFarH.x, fFarH.y)
  g.lineBetween(fNear.x, fNear.y, fNearH.x, fNearH.y)

  // Remates de poste frontales
  g.fillStyle(0xff3333, 1)
  g.fillCircle(fFar.x, fFar.y, postR)
  g.fillCircle(fNear.x, fNear.y, postR)
  g.fillStyle(0xff5555, 1)
  g.fillCircle(fFarH.x, fFarH.y, postR - 0.5)
  g.fillCircle(fNearH.x, fNearH.y, postR - 0.5)
  // Remate del punto más profundo del arco
  const arcMidTop = arcTop[Math.floor(N / 2)]
  g.fillStyle(0xcc2020, 0.68)
  g.fillCircle(arcMidTop.x, arcMidTop.y, postR - 1.5)
}

// ─── Flash de red (overlay animado al marcar gol) ─────────────────────────────

/**
 * Crea dos Graphics de flash (izq/der) a alpha=0.
 * Al marcar gol se les aplica tween alpha 0.9→0 para el efecto "red iluminada".
 * Usa el mismo arco curvo que drawGoal3D.
 */
export function createGoalNetFlash(scene: Phaser.Scene) {
  const cy    = RINK.y + RINK.height / 2
  const halfH = GOAL_HALF_H
  const yOff  = 30

  function buildFlash(goalLineX: number, leftSide: boolean) {
    const arcR  = halfH
    const arcCx = goalLineX
    const a0 = 90
    const a1 = leftSide ? 270 : -90

    const N = 12
    const arcIce: { x: number; y: number }[] = []
    const arcTop: { x: number; y: number }[] = []
    for (let i = 0; i <= N; i++) {
      const ang = Phaser.Math.DegToRad(a0 + (a1 - a0) * (i / N))
      const sp  = worldToScreen(arcCx + Math.cos(ang) * arcR, cy + Math.sin(ang) * arcR)
      arcIce.push(sp)
      arcTop.push({ x: sp.x, y: sp.y - yOff })
    }

    const gfx = scene.add.graphics().setDepth(22).setAlpha(0)
    // Suelo de la portería
    gfx.fillStyle(0xffffff, 0.55)
    gfx.beginPath()
    gfx.moveTo(arcIce[0].x, arcIce[0].y)
    for (let i = 1; i <= N; i++) gfx.lineTo(arcIce[i].x, arcIce[i].y)
    gfx.closePath(); gfx.fillPath()
    // Superficie curva de la red
    gfx.fillStyle(0xffffff, 0.45)
    gfx.beginPath()
    gfx.moveTo(arcIce[0].x, arcIce[0].y)
    for (let i = 1; i <= N; i++) gfx.lineTo(arcIce[i].x, arcIce[i].y)
    for (let i = N; i >= 0; i--) gfx.lineTo(arcTop[i].x, arcTop[i].y)
    gfx.closePath(); gfx.fillPath()
    return gfx
  }

  return {
    left:  buildFlash(getGoalLineX('left'),  true),
    right: buildFlash(getGoalLineX('right'), false),
  }
}

function drawFieldDots(
  g: Phaser.GameObjects.Graphics,
  leftGoalX: number, rightGoalX: number, cy: number, sx: number,
) {
  const penaltyDepth  = 5.40 * sx
  const freeHitDepth  = 7.40 * sx

  g.fillStyle(0xcc2020, 0.85)
  const dots = [
    worldToScreen(leftGoalX  + penaltyDepth,  cy),
    worldToScreen(rightGoalX - penaltyDepth,  cy),
    worldToScreen(leftGoalX  + freeHitDepth,  cy),
    worldToScreen(rightGoalX - freeHitDepth,  cy),
  ]
  for (const d of dots) g.fillCircle(d.x, d.y, 5)
}
