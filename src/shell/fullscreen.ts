/**
 * Pantalla completa del shell con fallback webkit. En dispositivos táctiles
 * intenta además fijar el apaisado (solo lo permite Android en fullscreen).
 */

type WebkitDoc = Document & { webkitFullscreenEnabled?: boolean, webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> }
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> }

// iPhone no tiene Fullscreen API para elementos: allí no se ofrece la opción
export const fullscreenSupported = !!(document.fullscreenEnabled || (document as WebkitDoc).webkitFullscreenEnabled)

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
