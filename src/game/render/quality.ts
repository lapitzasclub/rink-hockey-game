/**
 * Calidad gráfica (workflow de rendimiento, P-05; WP-71). Decide los ajustes que
 * cuestan en equipos modestos sin tocar el juego: nitidez del horneado de la pista,
 * público animado y densidad de partículas.
 *
 * - Preferencia de Ajustes (`rh-quality`): auto | alta | media | baja | custom.
 *   Un nivel rellena las tres opciones; tocar una pasa a custom (`rh-quality-custom`).
 *   `?quality=` la fuerza para el banco y el laboratorio (con custom, `&sharp=&crowd=&fx=`).
 * - En auto, el punto de partida es la prueba del equipo (`rh-quality-probe`) o, sin
 *   ella, lo que dice el navegador (`detectTier`). El regulador del partido
 *   (`QualityGovernor`) baja opciones en caliente y sube un nivel entre partidos si
 *   sobra margen; lo aprendido se guarda en `rh-quality-auto` y caduca a los 7 días.
 */

import { ARCADE_CAMERA_ZOOM_ATTACK } from '../constants'

export type QualityTier = 'alta' | 'media' | 'baja'
export type QualityPref = 'auto' | QualityTier | 'custom'
/** Opciones sueltas: px de horneado por px (tope), público animado entero y fracción de partículas. */
export type QualityOptions = { bakeMax: number, crowd: boolean, particles: number }
export type QualityOption = keyof QualityOptions

const PREF_KEY = 'rh-quality'
const CUSTOM_KEY = 'rh-quality-custom'
const AUTO_KEY = 'rh-quality-auto'
const PROBE_KEY = 'rh-quality-probe'
const FPS_KEY = 'rh-show-fps'
/** Lo aprendido por el regulador caduca: el equipo puede ir mejor otro día (otra pestaña, enchufado…). */
const AUTO_TTL_MS = 7 * 24 * 3600 * 1000
/** La prueba del equipo dura más: es una medida pedida, no una reacción a un mal momento. */
const PROBE_TTL_MS = 30 * 24 * 3600 * 1000
export const TIERS: QualityTier[] = ['alta', 'media', 'baja']

/**
 * Opciones de cada nivel. La nitidez de 1,5 y la de 2 dan lo mismo en el partido
 * (las dos topan en el zoom del arcade, ARCADE_CAMERA_ZOOM_ATTACK): por eso la
 * opción suelta solo tiene dos valores y media usa el alto.
 */
export const QUALITY: Record<QualityTier, QualityOptions> = {
  alta: { bakeMax: 2, crowd: true, particles: 1 },
  media: { bakeMax: 2, crowd: true, particles: 0.7 },
  baja: { bakeMax: 1, crowd: false, particles: 0.4 },
}

/** Valores que ofrece Ajustes por opción, de menos a más. */
export const OPTION_STEPS: { [K in QualityOption]: QualityOptions[K][] } = {
  bakeMax: [1, 2],
  crowd: [false, true],
  particles: [0, 0.4, 0.7, 1],
}

export const QUALITY_LABEL: Record<QualityPref, string> = { auto: 'AUTO', alta: 'ALTA', media: 'MEDIA', baja: 'BAJA', custom: 'PERSONALIZADA' }
export const QUALITY_PREFS: QualityPref[] = ['auto', 'alta', 'media', 'baja', 'custom']

const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* almacenamiento bloqueado: solo dura la sesión */ }
}
const readJson = (key: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(read(key) ?? 'null') as unknown
    return v && typeof v === 'object' ? v as Record<string, unknown> : null
  } catch { return null }
}
const isTier = (v: unknown): v is QualityTier => TIERS.includes(v as QualityTier)
const isPref = (v: unknown): v is QualityPref => QUALITY_PREFS.includes(v as QualityPref)

/** Opciones guardadas o de la URL, validadas: lo que falte o no cuadre sale de `fallback`. */
function sanitize(raw: Record<string, unknown> | null, fallback: QualityOptions): QualityOptions {
  const pick = <K extends QualityOption>(k: K): QualityOptions[K] => {
    const v = raw?.[k]
    return (OPTION_STEPS[k] as unknown[]).includes(v) ? v as QualityOptions[K] : fallback[k]
  }
  return { bakeMax: pick('bakeMax'), crowd: pick('crowd'), particles: pick('particles') }
}

const url = new URLSearchParams(window.location.search)

let pref: QualityPref = (() => {
  const q = url.get('quality')
  if (isPref(q)) return q
  const saved = read(PREF_KEY)
  return isPref(saved) ? saved : 'auto'
})()

let customOpts: QualityOptions = url.get('quality') === 'custom'
  ? sanitize({
      bakeMax: Number(url.get('sharp') ?? NaN),
      crowd: url.has('crowd') ? url.get('crowd') === '1' : undefined,
      particles: Number(url.get('fx') ?? NaN),
    }, QUALITY.alta)
  : sanitize(readJson(CUSTOM_KEY), QUALITY.alta)

/** Nivel inicial en auto según el dispositivo; se usa si no hay prueba del equipo. */
function detectTier(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory ?? 8
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (cores <= 2 || memory <= 2) return 'baja'
  if (touch) return cores <= 4 || memory <= 4 ? 'baja' : 'media'
  return cores <= 4 ? 'media' : 'alta'
}

/** Resultado de la prueba del equipo, si hay uno vigente. */
export function probeResult(): { tier: QualityTier, at: number } | null {
  const p = readJson(PROBE_KEY)
  const at = typeof p?.at === 'number' ? p.at : 0
  return p && isTier(p.tier) && Date.now() - at < PROBE_TTL_MS ? { tier: p.tier, at } : null
}

/** Techo y punto de partida de auto: la prueba del equipo o, sin ella, el dispositivo. */
const autoBase = (): QualityTier => probeResult()?.tier ?? detectTier()

/**
 * Lo aprendido por el regulador vale si no ha caducado y es posterior a la última
 * prueba (una prueba nueva lo sustituye). Los valores antiguos `{ tier, at }` se leen igual.
 */
function loadAutoOpts(): QualityOptions {
  const base = QUALITY[autoBase()]
  const learned = readJson(AUTO_KEY)
  const at = typeof learned?.at === 'number' ? learned.at : 0
  const fresh = learned && Date.now() - at < AUTO_TTL_MS && at > (probeResult()?.at ?? 0)
  if (!fresh) return base
  if (isTier(learned.tier) && !learned.opts) return QUALITY[learned.tier]
  return sanitize(learned.opts as Record<string, unknown> | null, base)
}

let autoOpts = loadAutoOpts()
/** Nivel forzado mientras corre la prueba del equipo (no se guarda). */
let probeOverride: QualityTier | null = null

const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())

export function onQualityChange(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** El laboratorio y el banco de rendimiento miden con la calidad fija: sin regulador. */
export const qualityWatchEnabled = !(url.has('lab') || url.has('perfMs') || url.has('quality'))

export function getQualityPref(): QualityPref {
  return pref
}

/** Opciones en uso (lo que pinta el partido). */
export function qualityOptions(): QualityOptions {
  if (probeOverride) return QUALITY[probeOverride]
  if (pref === 'auto') return autoOpts
  if (pref === 'custom') return customOpts
  return QUALITY[pref]
}

const sameOpts = (a: QualityOptions, b: QualityOptions) => a.bakeMax === b.bakeMax && a.crowd === b.crowd && a.particles === b.particles

/** Nivel que corresponde a unas opciones: el exacto o el más alto que no las supera. */
export function tierOf(o: QualityOptions): QualityTier {
  const exact = TIERS.find(t => sameOpts(QUALITY[t], o))
  if (exact) return exact
  return TIERS.find(t => o.bakeMax >= QUALITY[t].bakeMax && (o.crowd || !QUALITY[t].crowd) && o.particles >= QUALITY[t].particles) ?? 'baja'
}

/** Nivel en uso (lo usan los efectos que solo distinguen por nivel). */
export function qualityTier(): QualityTier {
  return tierOf(qualityOptions())
}

/** ¿Las opciones de auto son justo las de un nivel? Si no, el regulador las ha ajustado. */
export const autoAdjusted = () => !TIERS.some(t => sameOpts(QUALITY[t], autoOpts))

export function setQualityPref(next: QualityPref) {
  pref = next
  write(PREF_KEY, next)
  // Volver a auto da otra oportunidad al dispositivo: se olvida lo aprendido por el regulador
  if (next === 'auto') {
    write(AUTO_KEY, null)
    autoOpts = QUALITY[autoBase()]
  }
  notify()
}

/** Cambia una opción suelta: pasa a personalizada partiendo de lo que hay en uso. */
export function setQualityOption<K extends QualityOption>(key: K, value: QualityOptions[K]) {
  customOpts = { ...qualityOptions(), [key]: value }
  write(CUSTOM_KEY, JSON.stringify(customOpts))
  pref = 'custom'
  write(PREF_KEY, 'custom')
  notify()
}

function learnAuto(next: QualityOptions, src: 'down' | 'up') {
  autoOpts = next
  write(AUTO_KEY, JSON.stringify({ opts: next, at: Date.now(), src }))
  notify()
}

/**
 * Orden en que baja el regulador de auto: primero lo que más ahorra y menos se nota
 * (el vaivén del público neutro y las partículas, en caliente); la nitidez de la
 * pista, que se ve más y ahorra poco por fotograma, al final y desde el próximo partido.
 * Nunca por debajo de baja.
 */
const DOWN_ORDER: QualityOption[] = ['crowd', 'particles', 'bakeMax']

/** Baja un escalón en auto (lo pide el regulador). false si no es auto o ya está en baja. */
export function downgradeAutoQuality(): boolean {
  if (pref !== 'auto' || probeOverride) return false
  const floor = QUALITY.baja
  const next = { ...autoOpts }
  for (const key of DOWN_ORDER) {
    const steps = OPTION_STEPS[key] as unknown[]
    const i = steps.indexOf(next[key])
    if (i <= steps.indexOf(floor[key])) continue
    ;(next as Record<QualityOption, unknown>)[key] = steps[i - 1]
    learnAuto(next, 'down')
    return true
  }
  return false
}

/**
 * Sube un nivel en auto entre partidos (el regulador vio margen claro). El techo es
 * la prueba del equipo, o alta si no se ha hecho: lo que la prueba dejó abajo no se sube.
 */
export function upgradeAutoQuality(): boolean {
  if (pref !== 'auto' || probeOverride) return false
  const ceiling = TIERS.indexOf(probeResult()?.tier ?? 'alta')
  const up = QUALITY[TIERS[Math.max(ceiling, TIERS.indexOf(tierOf(autoOpts)) - 1)]]
  const next = {
    bakeMax: Math.max(autoOpts.bakeMax, up.bakeMax),
    crowd: autoOpts.crowd || up.crowd,
    particles: Math.max(autoOpts.particles, up.particles),
  }
  if (sameOpts(next, autoOpts)) return false
  learnAuto(next, 'up')
  return true
}

/** La prueba del equipo fuerza un nivel mientras mide (null al acabar). */
export function setProbeQuality(tier: QualityTier | null) {
  probeOverride = tier
}

/** Guarda el resultado de la prueba como punto de partida de auto y olvida lo aprendido antes. */
export function saveProbeResult(tier: QualityTier) {
  write(PROBE_KEY, JSON.stringify({ tier, at: Date.now() }))
  write(AUTO_KEY, null)
  autoOpts = QUALITY[tier]
  notify()
}

/** Texto de lo que hay en uso para el panel de rendimiento («media (auto)»). */
export function qualityText() {
  if (probeOverride) return `${probeOverride} (prueba)`
  const o = qualityOptions()
  const detail = `nitidez ${o.bakeMax} · público ${o.crowd ? 'animado' : 'peñas'} · partículas ${o.particles}`
  if (pref === 'custom') return `personalizada (${detail})`
  if (pref === 'auto') return autoAdjusted() ? `auto (${detail})` : `${tierOf(o)} (auto)`
  return pref
}

/** Panel de fps (Ajustes → Gráficos): preferencia aparte, no cuenta como calidad. */
export function getShowFps() {
  return read(FPS_KEY) === '1'
}

export function setShowFps(on: boolean) {
  write(FPS_KEY, on ? '1' : null)
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
  return Math.min(qualityOptions().bakeMax, ARCADE_CAMERA_ZOOM_ATTACK)
}

/** Laboratorio (DEV, `?lab=…&zoom=`): las capturas de detalle se hornean al zoom pedido para que sigan nítidas. */
const labZoom = (() => {
  if (!import.meta.env.DEV) return 0
  return url.has('lab') ? Number(url.get('zoom')) || 0 : 0
})()

export function particleDensity() {
  return qualityOptions().particles
}

export function crowdAnimated() {
  return qualityOptions().crowd
}
