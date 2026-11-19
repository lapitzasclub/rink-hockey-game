/**
 * Medida del trabajo por fotograma y regulador de calidad de auto (WP-71). La usan
 * el partido normal (regulador) y la prueba del equipo, así que las dos miden lo mismo.
 *
 * Se mide tiempo de CPU (lógica + envío del pintado), no el intervalo entre
 * fotogramas: una pantalla de 30 Hz da 33 ms de intervalo con el equipo ocioso y una
 * de 120 Hz puede ir a 8 ms con el equipo justo. Además se separa la simulación (que
 * corre a 60 pasos por segundo, haya los fotogramas que haya) para proyectar el
 * trabajo a lo que costaría cada fotograma a `QUALITY_TARGET_FPS`.
 */

import { SIM_STEP_MS } from '../constants'
import { downgradeAutoQuality, upgradeAutoQuality } from './quality'

/** fps que debe aguantar un nivel (prueba del equipo y margen para subir). */
export const QUALITY_TARGET_FPS = 55
export const QUALITY_TARGET_MS = 1000 / QUALITY_TARGET_FPS

/**
 * Regulador de auto: tras `warmupMs` de partido mide ventanas de `windowMs`. Una
 * ventana es lenta si el fotograma medio pasa de `slowFrameMs` (< 45 fps) y además
 * el equipo está trabajando de verdad: lógica + envío del pintado por encima de
 * `busyShare` de ese tiempo, o fotogramas irregulares (más de `jankShare` por encima
 * de 1,5 × la mediana). Así una pantalla limitada a 30 Hz (ahorro de batería) no
 * baja la calidad. `slowWindows` ventanas lentas seguidas bajan un escalón; si en el
 * partido no hubo ninguna y `spareWindows` ventanas trabajaron menos de `spareShare`
 * del fotograma objetivo, se sube un nivel para el siguiente.
 */
export const QUALITY_WATCH = {
  warmupMs: 4000, windowMs: 3000, slowFrameMs: 1000 / 45, busyShare: 0.45, jankShare: 0.2, slowWindows: 2,
  spareShare: 0.3, spareWindows: 2,
} as const

/** Acumulador sin asignaciones por fotograma. */
export class FrameWorkMeter {
  frames = 0
  intervalMs = 0
  workMs = 0
  simMs = 0
  steps = 0
  private readonly intervals = new Float32Array(512)

  reset() {
    this.frames = 0
    this.intervalMs = 0
    this.workMs = 0
    this.simMs = 0
    this.steps = 0
  }

  /** Cierra un fotograma: intervalo de rAF desde el anterior. */
  frame(intervalMs: number) {
    if (this.frames < this.intervals.length) this.intervals[this.frames] = intervalMs
    this.intervalMs += intervalMs
    this.frames++
  }

  /** Trabajo de CPU (update o render). */
  work(ms: number) {
    this.workMs += ms
  }

  /** Parte del trabajo que es simulación a paso fijo y cuántos pasos fueron. */
  sim(ms: number, steps: number) {
    this.simMs += ms
    this.steps += steps
  }

  avgInterval() {
    return this.frames ? this.intervalMs / this.frames : 0
  }

  avgWork() {
    return this.frames ? this.workMs / this.frames : 0
  }

  /**
   * Trabajo medio por fotograma si el juego fuera a QUALITY_TARGET_FPS: lo que se hace
   * una vez por fotograma (pose, pintado) más la simulación por paso × los pasos que
   * tocarían a ese ritmo. A 30 Hz hay dos pasos por fotograma y a 120 Hz, medio.
   */
  projectedWork() {
    if (!this.frames) return 0
    const perFrame = (this.workMs - this.simMs) / this.frames
    const perStep = this.steps ? this.simMs / this.steps : 0
    return perFrame + perStep * (QUALITY_TARGET_MS / SIM_STEP_MS)
  }

  /** Fracción de fotogramas más largos que 1,5 × la mediana (tirones). */
  jank() {
    const n = Math.min(this.frames, this.intervals.length)
    if (!n) return 0
    const sorted = this.intervals.slice(0, n).sort()
    const median = sorted[n >> 1]
    let over = 0
    for (let i = 0; i < n; i++) if (sorted[i] > median * 1.5) over++
    return over / n
  }
}

/** Regulador de auto del partido: decide al cerrar cada ventana; nada por fotograma salvo sumar. */
export class QualityGovernor {
  readonly meter = new FrameWorkMeter()
  private warm = 0
  private slow = 0
  private spare = 0
  private lowered = false

  /** Llamar al principio de cada fotograma con el intervalo de rAF; los huecos largos no cuentan. */
  frame(intervalMs: number, maxMs: number) {
    const m = this.meter
    if (intervalMs <= 0 || intervalMs > maxMs) return
    if (this.warm < QUALITY_WATCH.warmupMs) {
      this.warm += intervalMs
      m.reset()
      return
    }
    m.frame(intervalMs)
    if (m.intervalMs < QUALITY_WATCH.windowMs) return
    const avg = m.avgInterval()
    const loaded = m.avgWork() > avg * QUALITY_WATCH.busyShare || m.jank() > QUALITY_WATCH.jankShare
    const slow = avg > QUALITY_WATCH.slowFrameMs && loaded
    this.slow = slow ? this.slow + 1 : 0
    if (!slow && m.projectedWork() < QUALITY_TARGET_MS * QUALITY_WATCH.spareShare) this.spare++
    m.reset()
    if (this.slow >= QUALITY_WATCH.slowWindows) {
      this.slow = 0
      if (downgradeAutoQuality()) this.lowered = true
    }
  }

  /** Tras una pausa: lo trabajado mientras tanto no es de ningún fotograma medido. */
  resume() {
    this.meter.reset()
  }

  /** Fin del partido: sube un nivel para el siguiente si sobró margen y no hubo que bajar. */
  matchOver() {
    if (!this.lowered && this.spare >= QUALITY_WATCH.spareWindows) upgradeAutoQuality()
  }
}
