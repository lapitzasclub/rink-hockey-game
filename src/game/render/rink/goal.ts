/** Portería 3D con fondo semicircular y overlay de flash de red al marcar gol. */
import * as Phaser from 'phaser'
import { GOAL_HALF_H, RINK } from '../../constants'
import { getGoalLineX } from '../../utils'
import { worldToScreen } from '../viewTransform'

/**
 * Portería 3D con fondo semicircular real: el arco trasero tiene el mismo radio
 * que el área del portero (GOAL_HALF_H), formando un círculo completo entre ambos.
 *
 * yOff simula la altura vertical de los postes en pantalla.
 */
export function drawGoal3D(g: Phaser.GameObjects.Graphics, goalLineX: number, centerY: number, leftSide: boolean) {
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
