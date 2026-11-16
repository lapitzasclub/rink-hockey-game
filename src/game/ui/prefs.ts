/**
 * Preferencias de UI sobre jugadores (WP-34), persistidas en localStorage como
 * el locutor. `?labels=1|0` en la URL fuerza el valor (capturas y depuración).
 */

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
