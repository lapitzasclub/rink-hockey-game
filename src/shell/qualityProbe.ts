import * as Phaser from 'phaser'
import type { MatchScene } from '../scenes/MatchScene'
import { QUALITY_LABEL, saveProbeResult, setProbeQuality, type QualityTier } from '../game/render/quality'
import { QUALITY_TARGET_MS } from '../game/render/qualityGovernor'

/**
 * Tiempos de cada nivel (ms reales). El calentamiento deja fuera el horneado, la
 * subida de texturas y los sombreadores del arranque; si en la medida hay muy pocos
 * fotogramas (equipo muy lento) se alarga una vez. Un nivel que a mitad de medida ya
 * va `earlyFail` veces por encima del objetivo se da por suspendido sin esperar.
 * `budgetShare`: el trabajo del juego debe caber en la mitad del fotograma de 55 fps;
 * la otra mitad es del navegador (composición, GC, ráster) y del margen para los
 * picos del arcade (goles, powerups) que unos segundos de prueba no ven.
 */
const PROBE = { budgetShare: 0.5, warmMs: 1500, measureMs: 2500, earlyMs: 1000, earlyFail: 1.5, minFrames: 45, extendMs: 1500, createTimeoutMs: 10000 }
/** De más a menos; si ninguno aguanta, el equipo se queda en baja sin probarla. */
const PROBE_TIERS: QualityTier[] = ['alta', 'media']
/** El arcade es el modo que más pinta (partículas, zoom, powerups). */
const PROBE_MODE = 'arcade'

export type ProbeTrial = { tier: QualityTier, ok: boolean, workMs: number, fps: number, frames: number }
export type ProbeOutcome = { tier: QualityTier, trials: ProbeTrial[] }

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

/**
 * Prueba del equipo (Ajustes → Gráficos → PROBAR EQUIPO): juega unos segundos de
 * partido IA contra IA con el pintado real, empezando en alta, y se queda con el
 * primer nivel cuyo trabajo por fotograma cabe en la mitad del fotograma de 55 fps
 * (`FrameWorkMeter.projectedWork`, lo mismo que mide el regulador). Detrás de un
 * velo con el nivel que se prueba; se cancela con el botón, Esc o B del mando.
 * Guarda el resultado como punto de partida de auto (`saveProbeResult`); no toca
 * una preferencia fija ni la personalizada.
 */
export function createQualityProbe(deps: { game: () => Phaser.Game | null, onFinish: (outcome: ProbeOutcome | null, cancelled: boolean) => void }) {
  const veil = $<HTMLElement>('#probe-veil')
  const tierText = $<HTMLElement>('#probe-tier')
  const bar = $<HTMLElement>('#probe-bar')
  const cancelBtn = $<HTMLButtonElement>('#btn-probe-cancel')
  let running = false
  let cancelled = false
  let wake: (() => void) | null = null

  /** Espera cancelable: `cancel()` la despierta al momento. */
  const wait = (ms: number) => new Promise<void>((resolve) => {
    const done = () => { window.clearTimeout(timer); wake = null; resolve() }
    const timer = window.setTimeout(done, ms)
    wake = done
  })

  /** Espera no cancelable a que `scene` termine de crearse (con tope). */
  const created = (scene: Phaser.Scene) => new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(false), PROBE.createTimeoutMs)
    scene.events.once(Phaser.Scenes.Events.CREATE, () => { window.clearTimeout(timer); resolve(true) })
  })

  const startMatch = (game: Phaser.Game, match: MatchScene) => {
    const data = { mode: PROBE_MODE, probe: true }
    if (game.scene.isActive('match') || game.scene.isPaused('match')) match.scene.restart(data)
    else game.scene.getScenes(true)[0]?.scene.start('match', data)
  }

  /** Mide un nivel en un partido nuevo (la nitidez de la pista se hornea al crearlo). null si se canceló. */
  async function trial(game: Phaser.Game, tier: QualityTier): Promise<ProbeTrial | null> {
    setProbeQuality(tier)
    tierText.textContent = QUALITY_LABEL[tier]
    bar.classList.remove('is-running')
    void bar.offsetWidth
    bar.classList.add('is-running')
    const match = game.scene.getScene('match') as MatchScene
    // Sin cancelar a medias: el partido pedido arranca igual y hay que salir de él después
    const ready = created(match)
    startMatch(game, match)
    if (!(await ready) || cancelled) return null
    await wait(PROBE.warmMs)
    if (cancelled) return null
    const m = match.qualityMeter
    m.reset()
    await wait(PROBE.earlyMs)
    if (cancelled) return null
    const budget = QUALITY_TARGET_MS * PROBE.budgetShare
    if (m.projectedWork() <= budget * PROBE.earlyFail) {
      await wait(PROBE.measureMs - PROBE.earlyMs)
      if (m.frames < PROBE.minFrames) await wait(PROBE.extendMs)
      if (cancelled) return null
    }
    const workMs = m.projectedWork()
    const fps = m.avgInterval() > 0 ? 1000 / m.avgInterval() : 0
    const r = (v: number) => Math.round(v * 100) / 100
    return { tier, ok: m.frames > 0 && workMs <= budget, workMs: r(workMs), fps: r(fps), frames: m.frames }
  }

  async function start() {
    const game = deps.game()
    if (running || !game) return
    running = true
    cancelled = false
    veil.hidden = false
    cancelBtn.focus({ preventScroll: true })
    console.info('[quality-probe] start')
    const trials: ProbeTrial[] = []
    let tier: QualityTier | null = null
    try {
      for (const t of PROBE_TIERS) {
        const result = await trial(game, t)
        if (!result) break
        trials.push(result)
        if (result.ok) { tier = t; break }
      }
      if (!cancelled && !tier && trials.length === PROBE_TIERS.length) tier = 'baja'
    } finally {
      setProbeQuality(null)
      const match = game.scene.getScene('match')
      if (game.scene.isActive('match') || game.scene.isPaused('match')) {
        // Se vuelve al menú antes de quitar el velo: Ajustes se abre ya sobre él
        const menu = created(game.scene.getScene('menu'))
        match.scene.start('menu')
        await menu
      }
      veil.hidden = true
      bar.classList.remove('is-running')
      running = false
    }
    const outcome = tier && !cancelled ? { tier, trials } : null
    if (outcome) saveProbeResult(outcome.tier)
    console.info('[quality-probe] ' + JSON.stringify({ tier: outcome?.tier ?? null, cancelled, trials }))
    deps.onFinish(outcome, cancelled)
  }

  function cancel() {
    if (!running) return
    cancelled = true
    wake?.()
  }

  cancelBtn.addEventListener('click', cancel)

  return { start, cancel, isRunning: () => running }
}
