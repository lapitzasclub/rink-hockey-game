/**
 * Preferencias persistidas en localStorage: etiquetas sobre jugadores (WP-34,
 * `?labels=1|0` en la URL fuerza el valor), duración real de cada parte y dificultad.
 */

import { DEFAULT_DIFFICULTY, DEFAULT_HALF_REAL_MINUTES, DIFFICULTY_LEVELS, HALF_REAL_MINUTES_OPTIONS, type DifficultyLevel } from '../constants'

const STORAGE_KEY = 'rh-role-labels'

/** Etiquetas DEF/ALA/PIV/POR sobre las cabezas; apagadas por defecto (el dorsal identifica). */
export function areRoleLabelsEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('labels')
    if (q === '1' || q === '0') return q === '1'
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function setRoleLabelsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sin storage la preferencia solo dura la sesión
  }
}

// ─── Duración del partido ────────────────────────────────────────────────────

const HALF_KEY = 'rh-half-minutes'
const halfListeners = new Set<(minutes: number) => void>()

/**
 * Minutos reales de cada parte. `?half=N` en la URL lo fuerza (pruebas y humo);
 * admite decimales para partidos de prueba muy cortos.
 */
export function getHalfRealMinutes(): number {
  try {
    const q = Number(new URLSearchParams(window.location.search).get('half'))
    if (q > 0) return q
    const v = Number(localStorage.getItem(HALF_KEY))
    return (HALF_REAL_MINUTES_OPTIONS as readonly number[]).includes(v) ? v : DEFAULT_HALF_REAL_MINUTES
  } catch {
    return DEFAULT_HALF_REAL_MINUTES
  }
}

export function setHalfRealMinutes(minutes: number) {
  try {
    localStorage.setItem(HALF_KEY, String(minutes))
  } catch {
    // Sin storage la preferencia solo dura la sesión
  }
  halfListeners.forEach(fn => fn(minutes))
}

export function onHalfRealMinutesChange(fn: (minutes: number) => void): () => void {
  halfListeners.add(fn)
  return () => halfListeners.delete(fn)
}

// ─── Dificultad ──────────────────────────────────────────────────────────────

const DIFFICULTY_KEY = 'rh-difficulty'
const difficultyListeners = new Set<(level: DifficultyLevel) => void>()

/** Nivel del rival en los partidos con persona; NORMAL por defecto. */
export function getDifficulty(): DifficultyLevel {
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY) as DifficultyLevel | null
    return v && DIFFICULTY_LEVELS.includes(v) ? v : DEFAULT_DIFFICULTY
  } catch {
    return DEFAULT_DIFFICULTY
  }
}

export function setDifficulty(level: DifficultyLevel) {
  try {
    localStorage.setItem(DIFFICULTY_KEY, level)
  } catch {
    // Sin storage la preferencia solo dura la sesión
  }
  difficultyListeners.forEach(fn => fn(level))
}

/** Paso de `dir` niveles desde el actual (con `wrap`, tras EXPERTO vuelve a FÁCIL); devuelve si cambió. */
export function stepDifficulty(dir: number, wrap = false): boolean {
  const i = DIFFICULTY_LEVELS.indexOf(getDifficulty())
  const n = DIFFICULTY_LEVELS.length
  const next = DIFFICULTY_LEVELS[wrap ? (i + dir + n) % n : Math.min(n - 1, Math.max(0, i + dir))]
  if (next === DIFFICULTY_LEVELS[i]) return false
  setDifficulty(next)
  return true
}

export function onDifficultyChange(fn: (level: DifficultyLevel) => void): () => void {
  difficultyListeners.add(fn)
  return () => difficultyListeners.delete(fn)
}
