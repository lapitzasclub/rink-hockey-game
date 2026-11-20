/**
 * Pantalla completa del shell con fallback webkit. En dispositivos táctiles
 * intenta además fijar el apaisado (solo lo permite Android en fullscreen).
 */

type WebkitDoc = Document & { webkitFullscreenEnabled?: boolean, webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> }
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> }

// iPhone no tiene Fullscreen API para elementos: allí no se ofrece la opción
export const fullscreenSupported = !!(document.fullscreenEnabled || (document as WebkitDoc).webkitFullscreenEnabled)

// iPadOS se anuncia como Mac: se distingue por la pantalla táctil
const isIos = /iPhone|iPod|iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  || window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
/**
 * En iPhone la única pantalla completa es abrir el juego desde la pantalla de inicio:
 * donde iría el botón se ofrece cómo hacerlo (solo en Safari de iOS y fuera de la app).
 */
export const installHintSupported = !fullscreenSupported && isIos && !isStandalone

export function isFullscreen() {
  return !!(document.fullscreenElement ?? (document as WebkitDoc).webkitFullscreenElement)
}

export async function toggleFullscreen(target: HTMLElement, lockLandscape: boolean) {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen ? document.exitFullscreen() : (document as WebkitDoc).webkitExitFullscreen?.())
      return
    }
    const el = target as WebkitEl
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.())
    if (lockLandscape) await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => {})
  } catch {
    // el navegador rechazó la petición (sin gesto o no permitida): no hay nada más que hacer
  }
}

export function onFullscreenChange(fn: () => void) {
  document.addEventListener('fullscreenchange', fn)
  document.addEventListener('webkitfullscreenchange', fn)
}
