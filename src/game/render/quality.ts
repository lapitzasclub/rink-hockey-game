/**
 * Calidad gráfica (workflow de rendimiento, P-05). Decide los ajustes que cuestan
 * en equipos modestos sin tocar el juego: resolución del horneado de la pista,
 * densidad de partículas y vaivén del público.
 *
 * - Preferencia del usuario en Ajustes (`rh-quality`): auto | alta | media | baja.
 *   `?quality=` la fuerza para pruebas.
 * - En auto, el nivel de partida sale del dispositivo (núcleos, memoria, táctil) y
 *   baja en caliente si el partido no llega a los fps objetivo (ver QualityGovernor
 *   en MatchScene). La bajada se recuerda (`rh-quality-auto`) para la próxima sesión.
 */

import { ARCADE_CAMERA_ZOOM_ATTACK } from '../constants'

export type QualityTier = 'alta' | 'media' | 'baja'
export type QualityPref = 'auto' | QualityTier

const PREF_KEY = 'rh-quality'
const AUTO_KEY = 'rh-quality-auto'
/** La bajada aprendida en auto caduca: el equipo puede ir mejor otro día (otra pestaña, enchufado…). */
const AUTO_TTL_MS = 7 * 24 * 3600 * 1000
const TIERS: QualityTier[] = ['alta', 'media', 'baja']

/** Ajustes por nivel. */
export const QUALITY: Record<QualityTier, { bakeMax: number, particles: number, crowd: boolean }> = {
  alta: { bakeMax: 2, particles: 1, crowd: true },
  media: { bakeMax: 1.5, particles: 0.7, crowd: true },
  baja: { bakeMax: 1, particles: 0.4, crowd: false },
}

export const QUALITY_LABEL: Record<QualityPref, string> = { auto: 'AUTO', alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' }
export const QUALITY_PREFS: QualityPref[] = ['auto', 'alta', 'media', 'baja']

const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* almacenamiento bloqueado: solo dura la sesión */ }
}
const isTier = (v: unknown): v is QualityTier => TIERS.includes(v as QualityTier)

let pref: QualityPref = (() => {
  const q = new URLSearchParams(window.location.search).get('quality')
  if (q === 'auto' || isTier(q)) return q
  const saved = read(PREF_KEY)
  return saved === 'auto' || isTier(saved) ? saved : 'auto'
})()

/** Nivel inicial en auto según el dispositivo; se usa solo si no hay uno aprendido. */
function detectTier(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory ?? 8
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (cores <= 2 || memory <= 2) return 'baja'
  if (touch) return cores <= 4 || memory <= 4 ? 'baja' : 'media'
  return cores <= 4 ? 'media' : 'alta'
}

let autoTier: QualityTier = (() => {
  try {
    const learned = JSON.parse(read(AUTO_KEY) ?? 'null') as { tier?: unknown, at?: number } | null
    if (learned && isTier(learned.tier) && Date.now() - (learned.at ?? 0) < AUTO_TTL_MS) return learned.tier
  } catch { /* valor antiguo o roto: se ignora */ }
  return detectTier()
})()

const listeners = new Set<() => void>()

/**
 * Regulador de auto: tras `warmupMs` de partido mide ventanas de `windowMs`. Una
 * ventana es lenta si el fotograma medio pasa de `slowFrameMs` (< 45 fps) y además
 * el equipo está trabajando de verdad: lógica + envío del pintado por encima de
 * `busyShare` de ese tiempo, o fotogramas irregulares (más de `jankShare` por encima
 * de 1,5 × la mediana). Así una pantalla limitada a 30 Hz (ahorro de batería) no
 * baja la calidad. Dos ventanas lentas seguidas bajan un nivel.
 */
export const QUALITY_WATCH = { warmupMs: 4000, windowMs: 3000, slowFrameMs: 1000 / 45, busyShare: 0.45, jankShare: 0.2, slowWindows: 2 } as const

/** El laboratorio y el banco de rendimiento miden con la calidad fija: sin regulador. */
export const qualityWatchEnabled = (() => {
  const q = new URLSearchParams(window.location.search)
  return !(q.has('lab') || q.has('perfMs') || q.has('quality'))
})()

export function getQualityPref(): QualityPref {
  return pref
}

export function setQualityPref(next: QualityPref) {
  pref = next
  write(PREF_KEY, next)
  // Volver a auto da otra oportunidad al dispositivo: se olvida la bajada aprendida
  if (next === 'auto') {
    write(AUTO_KEY, null)
    autoTier = detectTier()
  }
  listeners.forEach(fn => fn())
}

/** Nivel en uso. */
export function qualityTier(): QualityTier {
  return pref === 'auto' ? autoTier : pref
}

/**
 * Baja un nivel en auto (lo pide el regulador del partido). Devuelve false si la
 * preferencia es fija o ya está en baja.
 */
export function downgradeAutoQuality(): boolean {
  if (pref !== 'auto') return false
  const i = TIERS.indexOf(autoTier)
  if (i >= TIERS.length - 1) return false
  autoTier = TIERS[i + 1]
  write(AUTO_KEY, JSON.stringify({ tier: autoTier, at: Date.now() }))
  listeners.forEach(fn => fn())
  return true
}

export function onQualityChange(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Texto del nivel en uso para el panel de rendimiento y los ajustes («media (auto)»). */
export function qualityText() {
  return pref === 'auto' ? `${autoTier} (auto)` : pref
}

/**
 * px de textura por px de pantalla al hornear Graphics estáticos. Lo del mundo usa
 * una sola resolución para todas las escenas (nítido hasta el zoom habitual del
 * arcade; el menú y el reglamento la comparten y no se duplican texturas); el HUD,
 * sin zoom, va a 1.
 */
export function bakeResolution(world: boolean) {
  if (!world) return 1
  if (labZoom > 0) return Math.min(3, Math.max(1, labZoom))
  return Math.min(QUALITY[qualityTier()].bakeMax, ARCADE_CAMERA_ZOOM_ATTACK)
}

/** Laboratorio (DEV, `?lab=…&zoom=`): las capturas de detalle se hornean al zoom pedido para que sigan nítidas. */
const labZoom = (() => {
  if (!import.meta.env.DEV) return 0
  const q = new URLSearchParams(window.location.search)
  return q.has('lab') ? Number(q.get('zoom')) || 0 : 0
})()

export function particleDensity() {
  return QUALITY[qualityTier()].particles
}

export function crowdAnimated() {
  return QUALITY[qualityTier()].crowd
}
