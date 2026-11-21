/**
 * E-16, solo DEV (`?lab=match&rfx=demo`): repite cada efecto de pista en un sitio fijo para
 * las capturas de cerca. Patinadores fantasma (frenada, derrape en círculo y arranque) y
 * golpes a ritmo fijo, escalonados para que siempre haya alguno a media vida al congelar.
 * Solo emite partículas: no toca el partido.
 */
import type * as Phaser from 'phaser'
import { GOAL_HALF_H, RINK } from '../constants'
import { getGoalLineX } from '../utils'
import { PX_PER_M, RINK_FX } from './artSpec'
import type { RinkFx } from './rinkFx'
import { project } from './viewTransform'

/** Sitios del laboratorio (mundo): lejos de las posiciones de saque. */
export const RFX_DEMO = {
  brake: { x0: 300, x1: 450, y: 200, periodMs: 1500 },
  skid: { cx: 560, cy: 220, r: 50, radPerS: 2.8 },
  start: { x0: 330, y: 520, periodMs: 1300 },
  board: { xs: [820, 880, 940], periodMs: 300 },
  postMs: 300,
  hit: { pts: [[840, 470], [930, 520]] as ReadonlyArray<readonly [number, number]>, periodMs: 400, strength: [300, 460] },
} as const

/** `?rfx=log` en partido; `?rfx=demolog`, el laboratorio con registro de los choques. */
const rfxParam = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('rfx') : null
export const rfxLogOn = rfxParam === 'log' || rfxParam === 'demolog'
/** Tras un efecto registrado, el bucle se duerme a los `freezeMs` (a media vida) para la captura. */
const LOG = { freezeMs: 70, freezeAt: -1 }

/**
 * `?rfx=log` (DEV): una línea por efecto con su sitio en pantalla en fracción del lienzo y, poco
 * después, el juego se duerme (`[rfx-frozen]`) para que un script de capturas haga el recorte de
 * cerca en el partido en vivo y lo despierte (`__game.loop.wake()`).
 */
export function logRinkFx(scene: Phaser.Scene, kind: string, wx: number, wy: number, k: number) {
  if (!rfxLogOn || LOG.freezeAt >= 0) return
  LOG.freezeAt = performance.now() + LOG.freezeMs
  const p = project(wx, wy, 0)
  const cam = scene.cameras.main
  const u = (p.x - cam.worldView.x) * cam.zoom / scene.scale.width
  const v = (p.y - cam.worldView.y) * cam.zoom / scene.scale.height
  console.log(`[rfx] ${JSON.stringify({ kind, u: +u.toFixed(3), v: +v.toFixed(3), k: +k.toFixed(2), zoom: +cam.zoom.toFixed(2) })}`)
}

/** Una vez por fotograma con `?rfx=log`: duerme el bucle cuando toca (ver `logRinkFx`). */
export function pollRinkFxLog(scene: Phaser.Scene) {
  if (LOG.freezeAt < 0 || performance.now() < LOG.freezeAt) return
  LOG.freezeAt = -1
  scene.game.loop.sleep()
  console.log('[rfx-frozen]')
}

const state = { lastVt: -1, skidX: 0, skidY: 0, brakeX: 0 }

/** Fase de un evento periódico: true en el fotograma en que se cruza `offset` dentro del periodo. */
function crossed(prev: number, now: number, period: number, offset: number) {
  return Math.floor((now - offset) / period) > Math.floor((prev - offset) / period)
}

export function runRinkFxDemo(fx: RinkFx, vt: number, steps: number) {
  const prev = state.lastVt < 0 ? vt : state.lastVt
  state.lastVt = vt
  const gap = RINK_FX.skate.gapM * PX_PER_M
  const n = Math.round(steps * 1.6 * fx.fxDensity)

  // Frenada: entra rápido y para; motas hacia delante y marcas rectas
  const b = RFX_DEMO.brake
  const ph = (vt % b.periodMs) / b.periodMs
  const bx = b.x0 + (b.x1 - b.x0) * (1 - (1 - Math.min(1, ph / 0.8)) ** 2)
  if (ph > 0.12 && ph < 0.78) {
    for (let j = 0; j < n; j++) fx.wheelSpray(bx, b.y + (j & 1 ? gap : -gap), 1, 0, 1, vt, j % 4 === 0)
    if (bx - state.brakeX > 8) {
      fx.markSegment(state.brakeX, b.y - gap, bx, b.y - gap, 1, vt)
      fx.markSegment(state.brakeX, b.y + gap, bx, b.y + gap, 1, vt)
      state.brakeX = bx
    }
  } else state.brakeX = bx

  // Derrape en círculo: motas hacia fuera de la curva y marcas curvas
  const s = RFX_DEMO.skid
  const a = (vt / 1000) * s.radPerS
  const sx = s.cx + Math.cos(a) * s.r
  const sy = s.cy + Math.sin(a) * s.r * 0.8
  const ox = Math.cos(a), oy = Math.sin(a)
  for (let j = 0; j < n; j++) fx.wheelSpray(sx + ox * gap * (j & 1 ? 1 : -1), sy + oy * gap * (j & 1 ? 1 : -1), ox * 0.8 - oy * 0.6, oy * 0.8 + ox * 0.6, 0.9, vt, j % 4 === 0)
  if (Math.hypot(sx - state.skidX, sy - state.skidY) > 8) {
    if (state.skidX) fx.markSegment(state.skidX, state.skidY, sx, sy, 0.8, vt)
    state.skidX = sx
    state.skidY = sy
  }

  // Arranque con turbo: motas hacia atrás, sin marcas
  const st = RFX_DEMO.start
  const sph = (vt % st.periodMs) / st.periodMs
  if (sph < 0.6) {
    const x = st.x0 + 160 * sph * sph
    for (let j = 0; j < Math.ceil(n * 0.6); j++) fx.wheelSpray(x, st.y + (j & 1 ? gap : -gap), -1, 0, 0.8, vt, j % 3 === 0)
  }

  // Bola contra la valla lejana (tres sitios escalonados) y contra el palo de arriba de la portería izquierda
  const bd = RFX_DEMO.board
  bd.xs.forEach((x, k) => {
    if (crossed(prev, vt, bd.periodMs, k * bd.periodMs / 3)) fx.impact(x, RINK.y, 0, 1, 120, 0, [0.6, 1, 0.35][k], false, vt)
  })
  const gx = getGoalLineX('left')
  if (crossed(prev, vt, RFX_DEMO.postMs, 0)) fx.impact(gx, RINK.y + RINK.height / 2 - GOAL_HALF_H, 0.4, -0.9, 0, 0, 1, true, vt)
  if (crossed(prev, vt, RFX_DEMO.postMs, RFX_DEMO.postMs / 2)) fx.impact(getGoalLineX('right'), RINK.y + RINK.height / 2 - GOAL_HALF_H, -0.4, -0.9, 0, 0, 0.5, true, vt)

  // Choques: uno normal y uno fuerte (con polvo de caída)
  const h = RFX_DEMO.hit
  h.pts.forEach(([x, y], k) => {
    if (!crossed(prev, vt, h.periodMs, k * h.periodMs / 2)) return
    logRinkFx(fx.scene, 'hit', x, y, h.strength[k])
    fx.hit(x, y, 1, 0.2, h.strength[k], x + 10, y + 4, vt)
  })
}
