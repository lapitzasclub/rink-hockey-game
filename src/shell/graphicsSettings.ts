import { playUiMove } from '../game/audio/sounds'
import {
  OPTION_STEPS, QUALITY_LABEL, QUALITY_PREFS, autoAdjusted, getQualityPref, getShowFps, onQualityChange, probeResult,
  qualityOptions, qualityTier, setQualityOption, setQualityPref, setShowFps, type QualityOption, type QualityOptions,
} from '../game/render/quality'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

/** Texto de cada valor de las opciones sueltas. */
const OPTION_TEXT: { [K in QualityOption]: (v: QualityOptions[K]) => string } = {
  bakeMax: v => (v > 1 ? 'NÍTIDA' : 'NORMAL'),
  crowd: v => (v ? 'ANIMADO' : 'SOLO PEÑAS'),
  particles: v => (v >= 1 ? 'TODAS' : v >= 0.7 ? 'MEDIAS' : v > 0 ? 'POCAS' : 'APAGADAS'),
}

const OPTION_NAME: Record<QualityOption, string> = { bakeMax: 'Nitidez de la pista', crowd: 'Público', particles: 'Efectos y partículas' }

/**
 * Qué cuesta cada opción. Cifras de `tools/perf-bench.mjs --profile movil-bajo --mode
 * arcade` (CPU × 6, 3 rondas intercaladas, WP-71): alta 10,0 ms de trabajo por
 * fotograma; sin público animado 8,6; sin partículas 9,1. La nitidez no se distingue
 * del ruido por fotograma: cuesta memoria (×2,1 píxeles de textura) y horneado.
 * `live`: lo que se nota ya en el partido en curso.
 */
const OPTION_NOTE: Record<QualityOption, { cost: string, live: string }> = {
  bakeMax: {
    cost: 'NÍTIDA hornea pista, vallas y gradas para el zoom del arcade: el doble de memoria de texturas y un arranque de partido más lento. Por fotograma, casi nada.',
    live: 'Se aplica en el próximo partido.',
  },
  crowd: {
    cost: 'SOLO PEÑAS deja quieto el público neutro; las peñas siguen y saltan con los goles. Es lo que más ahorra: ~14 % del trabajo por fotograma en un móvil modesto.',
    live: 'Ya se queda quieto; del todo, en el próximo partido.',
  },
  particles: {
    cost: 'Estelas, auras y explosiones del arcade. Apagadas ahorran ~9 % del trabajo por fotograma en un móvil modesto; solo cuestan cuando salen.',
    live: '',
  },
}

const stepIn = <T>(steps: readonly T[], value: T, dir: number, wrap: boolean): T => {
  const i = Math.max(0, steps.indexOf(value))
  const j = i + dir
  if (wrap) return steps[(j + steps.length) % steps.length]
  return steps[Math.min(steps.length - 1, Math.max(0, j))]
}

/**
 * Selector por pasos: ← → recorren sin dar la vuelta; el clic en una flecha va en
 * ese sentido y en el resto de la fila avanza dando la vuelta (en táctil no hay tope mudo).
 */
function bindStepper(btn: HTMLButtonElement, step: (dir: number, wrap: boolean) => boolean) {
  btn.addEventListener('click', (e) => {
    const arrow = (e.target as HTMLElement).closest<HTMLElement>('[data-step]')
    // El clic ya suena por la navegación de menús
    step(arrow ? Number(arrow.dataset.step) : 1, !arrow)
  })
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    if (step(e.key === 'ArrowLeft' ? -1 : 1, false)) playUiMove()
  })
}

/**
 * Pestaña Gráficos de Ajustes (WP-71): calidad (AUTO, niveles o PERSONALIZADA),
 * opciones sueltas con lo que cuestan, prueba del equipo y panel de fps. Las filas
 * enseñan siempre lo que hay en uso, también en AUTO.
 */
export function bindGraphicsSettings(deps: {
  isMatchRunning: () => boolean
  onProbe: () => void
  onShowFps: (on: boolean) => void
}) {
  const qualityBtn = $<HTMLButtonElement>('#quality')
  const qualityValue = $<HTMLElement>('#quality-value')
  const qualityNote = $<HTMLElement>('#quality-note')
  const probeBtn = $<HTMLButtonElement>('#btn-probe')
  const probeNote = $<HTMLElement>('#probe-note')
  const fpsBtn = $<HTMLButtonElement>('#btn-show-fps')
  const options = (Object.keys(OPTION_NAME) as QualityOption[]).map(key => ({
    key,
    btn: $<HTMLButtonElement>(`#opt-${key}`),
    value: $<HTMLElement>(`#opt-${key}-value`),
    note: $<HTMLElement>(`#opt-${key}-note`),
  }))
  let probeMsg = ''

  const paintQuality = () => {
    const pref = getQualityPref()
    qualityValue.textContent = QUALITY_LABEL[pref]
    qualityBtn.setAttribute('aria-label', `Calidad gráfica: ${QUALITY_LABEL[pref]}`)
    const tier = QUALITY_LABEL[qualityTier()]
    qualityNote.textContent = pref === 'auto'
      ? `En uso: ${tier}${autoAdjusted() ? ' con ajustes' : ''}. Baja sola si el partido no llega y sube entre partidos si sobra.`
      : pref === 'custom'
        ? 'Tus opciones, sin regulador: no cambian solas.'
        : 'Las opciones siguen al nivel. Tocar una pasa a PERSONALIZADA.'
    const live = deps.isMatchRunning()
    const o = qualityOptions()
    for (const opt of options) {
      const text = (OPTION_TEXT[opt.key] as (v: unknown) => string)(o[opt.key])
      opt.value.textContent = text
      opt.btn.setAttribute('aria-label', `${OPTION_NAME[opt.key]}: ${text}`)
      const n = OPTION_NOTE[opt.key]
      opt.note.textContent = live && n.live ? `${n.cost} ${n.live}` : n.cost
    }
  }

  const paintProbe = () => {
    const live = deps.isMatchRunning()
    probeBtn.disabled = live
    const res = probeResult()
    const date = res ? new Date(res.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''
    const result = res ? `Tu equipo: ${QUALITY_LABEL[res.tier]} (prueba del ${date}).${getQualityPref() === 'auto' ? '' : ' Se usa en AUTO.'}` : ''
    probeNote.textContent = live
      ? `${result} Se prueba desde el menú principal.`.trim()
      : probeMsg || result || 'Juega unos segundos de partido y elige el nivel más alto que aguanta tu equipo. Tarda 15 s como mucho y se puede cancelar.'
  }

  const paintFps = () => fpsBtn.setAttribute('aria-checked', String(getShowFps()))

  bindStepper(qualityBtn, (dir, wrap) => {
    const next = stepIn(QUALITY_PREFS, getQualityPref(), dir, wrap)
    if (next === getQualityPref()) return false
    setQualityPref(next)
    return true
  })

  for (const opt of options) {
    bindStepper(opt.btn, (dir, wrap) => {
      const steps = OPTION_STEPS[opt.key] as unknown[]
      const cur = qualityOptions()[opt.key]
      const next = stepIn(steps, cur, dir, wrap)
      if (next === cur) return false
      setQualityOption(opt.key, next as QualityOptions[typeof opt.key])
      return true
    })
  }

  probeBtn.addEventListener('click', () => {
    probeMsg = ''
    deps.onProbe()
  })

  fpsBtn.addEventListener('click', () => {
    const on = !getShowFps()
    setShowFps(on)
    paintFps()
    deps.onShowFps(on)
  })

  onQualityChange(() => { paintQuality(); paintProbe() })

  return {
    paint() {
      paintQuality()
      paintProbe()
      paintFps()
    },
    /** Tras una prueba: mensaje si se canceló o falló (se borra al volver a probar). */
    setProbeMessage(msg: string) {
      probeMsg = msg
      paintProbe()
      // Al volver de la prueba el resultado queda a la vista aunque la pestaña sea larga
      probeNote.scrollIntoView({ block: 'nearest' })
    },
    probeButton: probeBtn,
  }
}
