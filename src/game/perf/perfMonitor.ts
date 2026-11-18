import * as Phaser from 'phaser'

/**
 * Monitor de rendimiento (workflow de rendimiento, docs/perf/WORKFLOW.md).
 *
 * Mide con los eventos del bucle de Phaser el intervalo entre fotogramas, el
 * coste de la lógica (PRE_STEP → POST_STEP) y el de enviar el dibujo
 * (PRE_RENDER → POST_RENDER). No asigna memoria por fotograma: guarda las
 * muestras en anillos de tamaño fijo.
 *
 * - `?perf=1`: panel con fps y percentiles (sirve también en producción, para probar en móviles).
 * - `?perfMs=N`: tras `perfWarm` ms (2000 por defecto) mide N ms y escribe en consola
 *   `[perf] {json}`, que lee `tools/perf-bench.mjs`.
 */

const RING = 1024

class Ring {
  readonly data = new Float32Array(RING)
  n = 0
  i = 0
  push(v: number) {
    this.data[this.i] = v
    this.i = (this.i + 1) % RING
    if (this.n < RING) this.n++
  }
  clear() { this.n = 0; this.i = 0 }
  stats() {
    if (!this.n) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 }
    const s = Array.from(this.data.subarray(0, this.n)).sort((a, b) => a - b)
    const at = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))]
    const avg = s.reduce((a, b) => a + b, 0) / s.length
    const r = (v: number) => Math.round(v * 100) / 100
    return { avg: r(avg), p50: r(at(0.5)), p95: r(at(0.95)), p99: r(at(0.99)), max: r(s[s.length - 1]) }
  }
}

export interface PerfSnapshot {
  frames: number
  fps: number
  frameMs: ReturnType<Ring['stats']>
  updateMs: ReturnType<Ring['stats']>
  renderMs: ReturnType<Ring['stats']>
  /** Fotogramas de más de 1,5 intervalos de refresco (tirones visibles). */
  jank: number
  /** Fotogramas de más de 50 ms. */
  long: number
}

/** Estado vivo del monitor: lo lee también la calidad adaptativa. */
export class PerfMonitor {
  private readonly frame = new Ring()
  private readonly update = new Ring()
  private readonly render = new Ring()
  private lastFrame = 0
  private t0 = 0
  private jank = 0
  private long = 0
  /** Intervalo de refresco estimado (mediana de los intervalos): base para contar tirones. */
  private refreshMs = 1000 / 60

  constructor(game: Phaser.Game) {
    let tStep = 0
    let tRender = 0
    game.events.on(Phaser.Core.Events.PRE_STEP, (time: number) => {
      if (this.lastFrame) {
        const d = time - this.lastFrame
        this.frame.push(d)
        if (d > this.refreshMs * 1.5) this.jank++
        if (d > 50) this.long++
      }
      this.lastFrame = time
      tStep = performance.now()
    })
    game.events.on(Phaser.Core.Events.POST_STEP, () => this.update.push(performance.now() - tStep))
    game.events.on(Phaser.Core.Events.PRE_RENDER, () => { tRender = performance.now() })
    game.events.on(Phaser.Core.Events.POST_RENDER, () => this.render.push(performance.now() - tRender))
    this.t0 = performance.now()
  }

  reset() {
    this.frame.clear()
    this.update.clear()
    this.render.clear()
    this.jank = 0
    this.long = 0
    this.t0 = performance.now()
  }

  snapshot(): PerfSnapshot {
    const frameMs = this.frame.stats()
    if (frameMs.p50 > 0) this.refreshMs = Math.min(this.refreshMs, frameMs.p50)
    return {
      frames: this.frame.n,
      fps: frameMs.avg > 0 ? Math.round(10000 / frameMs.avg) / 10 : 0,
      frameMs,
      updateMs: this.update.stats(),
      renderMs: this.render.stats(),
      jank: this.jank,
      long: this.long,
    }
  }

  /** ms reales desde el último reset. */
  elapsed() {
    return performance.now() - this.t0
  }
}

let monitor: PerfMonitor | null = null

/** Monitor único del juego (lo crea el primero que lo pide). */
export function perfMonitor(game: Phaser.Game) {
  monitor ??= new PerfMonitor(game)
  return monitor
}

/** Datos del entorno que acompañan al informe: tamaño de lienzo, DPR y GPU. */
function environment(game: Phaser.Game) {
  let gpu = ''
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer
  const gl = renderer.gl as WebGLRenderingContext | undefined
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  }
  return {
    game: [Math.round(game.scale.gameSize.width), Math.round(game.scale.gameSize.height)],
    canvas: [game.canvas.width, game.canvas.height],
    css: [Math.round(game.scale.displaySize.width), Math.round(game.scale.displaySize.height)],
    dpr: window.devicePixelRatio,
    gpu: gpu.slice(0, 80),
  }
}

/** Panel DOM con fps y percentiles; se refresca dos veces por segundo. */
function mountOverlay(game: Phaser.Game, extra: () => string) {
  const el = document.createElement('div')
  el.id = 'perf-hud'
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    // Arriba en el centro: las esquinas son del marcador, la pausa y el HUD de turbo
    position: 'absolute', left: '50%', top: '4px', transform: 'translateX(-50%)', zIndex: '95', pointerEvents: 'none',
    font: '11px/1.35 ui-monospace, Consolas, monospace', color: '#cfe3ff', whiteSpace: 'pre',
    background: 'rgba(4,10,20,0.72)', padding: '4px 6px', borderRadius: '3px',
  } satisfies Partial<CSSStyleDeclaration>)
  document.querySelector('#game-shell')?.appendChild(el)
  const m = perfMonitor(game)
  window.setInterval(() => {
    const s = m.snapshot()
    const env = environment(game)
    el.textContent =
      `${s.fps.toFixed(0)} fps  frame p50 ${s.frameMs.p50.toFixed(1)} p95 ${s.frameMs.p95.toFixed(1)} ms\n` +
      `lógica ${s.updateMs.avg.toFixed(1)}  render ${s.renderMs.avg.toFixed(1)} (p95 ${s.renderMs.p95.toFixed(1)}) ms\n` +
      `tirones ${s.jank}  lienzo ${env.canvas.join('×')} dpr ${env.dpr}${extra()}`
  }, 500)
}

/**
 * Engancha el monitor según la URL. `extra` añade una línea al panel (p. ej. la
 * calidad gráfica activa).
 */
export function setupPerfFromUrl(game: Phaser.Game, extra: () => string = () => '') {
  const q = new URLSearchParams(window.location.search)
  const reportMs = Number(q.get('perfMs') ?? 0)
  if (q.get('perf') === '1') mountOverlay(game, extra)
  if (!(reportMs > 0)) return
  const warm = Number(q.get('perfWarm') ?? 2000)
  const m = perfMonitor(game)
  window.setTimeout(() => {
    m.reset()
    window.setTimeout(() => {
      const report = { ...m.snapshot(), ms: Math.round(m.elapsed()), env: environment(game), quality: extra().trim() }
      console.log('[perf] ' + JSON.stringify(report))
    }, reportMs)
  }, warm)
}
