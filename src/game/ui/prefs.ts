/**
 * Preferencias persistidas en localStorage: etiquetas sobre jugadores (WP-34,
 * `?labels=1|0` en la URL fuerza el valor) y duración real de cada parte.
 */

import { DEFAULT_HALF_REAL_MINUTES, HALF_REAL_MINUTES_OPTIONS } from '../constants'

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
