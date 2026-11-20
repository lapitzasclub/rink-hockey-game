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
/**
 * La web del Loyola sirve el juego bajo /jugar/ (su worker hace de proxy). Así queda dentro de su
 * PWA y el iPhone lo abre en la misma ventana sin barras, por lo que el aviso de instalar ya no
 * hace falta, pero hay que poder volver a ella.
 */
export const hostedByLoyola = location.pathname.startsWith('/jugar/')

export const installHintSupported = !fullscreenSupported && isIos && !isStandalone && !hostedByLoyola

/**
 * El APK del Loyola abre /jugar/ en su WebView, que se anuncia en el user agent. Allí la actividad
 * ya lo pone sin barras y en apaisado.
 */
const loyolaApk = hostedByLoyola && /\bLoyolaHockeyApp\b/.test(navigator.userAgent)

/**
 * Abierto como app (la PWA instalada o el APK del Loyola), el juego se presenta como un juego
 * nativo: sin botón de pantalla completa, que ya no aportaría nada.
 */
export const inHostApp = hostedByLoyola && (isStandalone || loyolaApk)

/** Pantalla completa como opción del jugador: solo en el navegador. */
export const fullscreenOffered = fullscreenSupported && !inHostApp

/**
 * En la PWA instalada de Android sí quedan la barra de estado y la de navegación: se quitan en el
 * primer toque (la API pide un gesto) y en cualquier toque posterior si el sistema las devolvió.
 */
export function hideBarsInHostApp(target: HTMLElement) {
  if (!inHostApp || loyolaApk || !fullscreenSupported) return
  document.addEventListener('pointerup', () => { if (!isFullscreen()) void toggleFullscreen(target, true) })
}

/**
 * Atrás de Android en el APK del Loyola. `fn` devuelve si lo ha usado el juego; si no, el WebView
 * vuelve a la página del Loyola.
 */
export function onHostBackButton(fn: () => boolean) {
  if (loyolaApk) window.addEventListener('loyola:atras', e => { if (fn()) e.preventDefault() })
}

/**
 * La PWA del Loyola instalada en Android fija el vertical de su manifest también en /jugar/.
 * Instalada, Chrome deja girar sin pantalla completa ni gesto; iOS no tiene `lock` y ya gira.
 * En el APK gira la actividad.
 */
export function lockLandscapeInHostApp() {
  if (inHostApp && !loyolaApk) void (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => {})
}

/** El juego no toca el historial: atrás es la página del Loyola desde la que se abrió. */
export function backToHost() {
  try { screen.orientation?.unlock?.() } catch { /* sin bloqueo que soltar */ }
  if (history.length > 1) history.back()
  else location.assign('/')
}

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
