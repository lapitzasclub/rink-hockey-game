import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MenuScene } from './scenes/MenuScene'
import { MatchScene } from './scenes/MatchScene'
import { SetPieceScene } from './game/setpiece/scene'
import { initPartidoExterno } from './game/externalMatch'
import { playUiMove } from './game/audio/sounds'
import { consumePad, pollGamepad } from './game/input/gamepad'
import { getInputMode, onInputModeChange, type InputMode } from './game/input/inputMode'
import { ICON, shellHtml } from './shell/template'
import { backToHost, fullscreenSupported, hostedByLoyola, installHintSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from './shell/fullscreen'
import { attachMenuNav } from './shell/menuNav'
import { createSettingsPanel } from './shell/settingsPanel'
import { createPauseMenu, type PauseSummary } from './shell/pauseMenu'
import { getShowFps, qualityText } from './game/render/quality'
import { createQualityProbe } from './shell/qualityProbe'

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

document.querySelector<HTMLDivElement>('#app')!.innerHTML = shellHtml({ isTouch: isTouchDevice, fullscreen: fullscreenSupported, installHint: installHintSupported, hostBack: hostedByLoyola })
document.querySelector('#btn-host-back')?.addEventListener('click', backToHost)

let game: Phaser.Game | null = null

// Phaser rasteriza los textos al crearlos: hay que esperar a la fuente arcade
// (con tope, para no bloquear el arranque si Google Fonts no responde)
const fontReady = Promise.race([
  document.fonts.load('32px "Russo One"'),
  new Promise(resolve => setTimeout(resolve, 1500)),
]).catch(() => undefined)

// Enlace de partido (#partido=...): si es válido, equipos, equipaciones y escudos vienen de fuera; si no, juego normal
const partidoReady = initPartidoExterno().catch(e => console.warn('[partido] error al cargar el partido externo', e))
// Cambiar solo el fragmento no recarga la página: se recarga para que el juego arranque con el partido nuevo
window.addEventListener('hashchange', () => { if (window.location.hash.startsWith('#partido=')) window.location.reload() })

void Promise.all([fontReady, partidoReady]).then(async () => {
  // Laboratorio gráfico: solo DEV y con ?lab=; el import dinámico queda fuera del build de producción
  const labScene = import.meta.env.DEV && new URLSearchParams(window.location.search).has('lab')
    ? (await import('./scenes/LabScene')).LabScene
    : null
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-host',
    backgroundColor: '#08111b',
    // La escena cercana de los lanzamientos (L-02) va antes de 'match' para pintarse debajo
    scene: labScene ? [labScene, MenuScene, SetPieceScene, MatchScene] : [MenuScene, SetPieceScene, MatchScene],
    scale: {
      // EXPAND: el lienzo ocupa toda la ventana; el pabellón rellena lo que sobra de 16:9
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  })
  game.events.on(Phaser.Core.Events.STEP, onStep)
  syncPortraitSleep()
  // Monitor de rendimiento (?perf=1 panel, ?perfMs=N informe en consola): carga diferida, fuera del arranque normal
  if (/[?&]perf(Ms)?=/.test(window.location.search)) {
    const g = game
    void import('./game/perf/perfMonitor').then(m => m.setupPerfFromUrl(g, perfExtra))
  } else if (getShowFps()) showFps(true)
  // Acceso para depurar y simular desde la consola; no llega a producción
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game
})

const perfExtra = () => `  calidad ${qualityText()}`

/** Ajustes → Gráficos → Mostrar FPS: el mismo panel que `?perf=1`, cargado al pedirlo. */
function showFps(on: boolean) {
  const g = game
  if (!g) return
  void import('./game/perf/perfMonitor').then(m => m.setPerfOverlay(g, perfExtra, on))
}

// ─── Estado del shell ────────────────────────────────────────────────────────

const shell = document.querySelector<HTMLElement>('#game-shell')!
const portraitQuery = window.matchMedia('(orientation: portrait)')
const isPortraitBlocked = () => isTouchDevice && portraitQuery.matches

type ActiveScene = 'menu' | 'match' | ''
let activeScene: ActiveScene = ''
/** El usuario salió de pantalla completa: ya no se pide sola. */
let fullscreenDeclined = false

const matchScene = () => game?.scene.getScene('match') as MatchScene | undefined
const matchSummary = (): PauseSummary | null => {
  const m = matchScene()
  const live = !!game && (game.scene.isActive('match') || game.scene.isPaused('match'))
  return m && live ? m.getPauseSummary() : null
}

/** Escena visible para el CSS (`data-scene`): decide qué botones HUD se muestran. */
function onStep() {
  if (!game) return
  pollGamepad()
  handlePadInShell()
  const scene: ActiveScene = game.scene.isActive('match') || game.scene.isPaused('match') ? 'match' : game.scene.isActive('menu') ? 'menu' : ''
  if (scene !== activeScene) {
    activeScene = scene
    shell.dataset.scene = scene
    // La prueba del equipo arranca partidos sin gesto del usuario: ahí no se pide
    if (scene === 'match' && !probe.isRunning()) autoFullscreen()
  }
  if (probe.isRunning()) {
    // La prueba mide un partido que se ve: en vertical no se pinta, así que se cancela
    if (isPortraitBlocked()) probe.cancel()
    return
  }
  // `?probe=1`: la prueba arranca sola en cuanto hay menú (banco de pruebas y móvil por adb)
  if (autoProbe && scene === 'menu') {
    autoProbe = false
    probe.start()
  }
  // Un partido que arranca con el móvil en vertical nace con el menú de pausa abierto
  if (scene === 'match' && isPortraitBlocked() && !pause.isOpen()) pause.open()
}

// Solo se reanuda lo que pausó el shell: el laboratorio congela el partido por su cuenta
let pausedByShell = false

/**
 * Llamada cada vez que se abre o cierra un panel. Pausa o reanuda el partido
 * y apaga el teclado de Phaser mientras haya un panel encima: así las teclas
 * de menú (Espacio, flechas) no llegan al juego ni Phaser les hace preventDefault.
 */
function syncOverlays() {
  const anyOverlay = pause.isOpen() || settings.isOpen()
  shell.classList.toggle('has-overlay', anyOverlay)
  if (!game) return
  const kb = game.input.keyboard
  if (kb) {
    if (anyOverlay) kb.enabled = false
    else if (!kb.enabled) {
      kb.enabled = true
      for (const s of game.scene.getScenes(true)) s.input.keyboard?.resetKeys()
    }
  }
  const shouldPause = anyOverlay || isPortraitBlocked()
  if (shouldPause && game.scene.isActive('match')) {
    game.scene.pause('match')
    pausedByShell = true
  } else if (!shouldPause && pausedByShell) {
    pausedByShell = false
    if (game.scene.isPaused('match')) game.scene.resume('match')
  }
}

// ─── Paneles ─────────────────────────────────────────────────────────────────

const settings = createSettingsPanel({
  onVisibilityChange: syncOverlays,
  onToggleFullscreen: () => void toggleFullscreen(shell, isTouchDevice),
  isMatchRunning: () => !!matchSummary(),
  onProbe: () => {
    settings.close(false)
    probe.start()
  },
  onShowFps: showFps,
})

let autoProbe = new URLSearchParams(window.location.search).get('probe') === '1'
const probe = createQualityProbe({
  game: () => game,
  // Al acabar se vuelve a Ajustes → Gráficos con el resultado a la vista
  onFinish: (outcome, cancelled) => {
    settings.open('graphics', settingsBtn, '#btn-probe')
    settings.probeMessage(outcome ? '' : cancelled ? 'Prueba cancelada.' : 'No se pudo completar la prueba.')
  },
})

const pause = createPauseMenu({
  getSummary: matchSummary,
  onVisibilityChange: syncOverlays,
  onSettings: (tab, from) => settings.open(tab, from),
  onRestart: () => {
    const m = matchScene()
    if (!m) return
    pausedByShell = false
    m.scene.restart({ mode: m.getPauseSummary().mode })
  },
  onQuit: () => {
    const m = matchScene()
    if (!m) return
    pausedByShell = false
    m.scene.start('menu', { mode: m.getPauseSummary().mode })
  },
})

attachMenuNav(pause.root)
attachMenuNav(settings.root)

const settingsBtn = document.querySelector<HTMLButtonElement>('#btn-settings')!
const pauseBtn = document.querySelector<HTMLButtonElement>('#btn-pause')!
settingsBtn.addEventListener('click', () => { playUiMove(); settings.open('general', settingsBtn) })
pauseBtn.addEventListener('click', () => { playUiMove(); pause.open() })

// ─── Teclas globales del shell ───────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.repeat) {
    // En «prepara el partido» Esc vuelve al título: lo atiende MenuScene, y Phaser ignora eventos ya prevenidos
    const menuSetup = activeScene === 'menu' && !!game?.registry.get('menuSetup') && !settings.isOpen() && !probe.isRunning()
    if (menuSetup) return
    e.preventDefault()
    if (installHintEl && !installHintEl.hidden) closeInstallHint()
    else if (probe.isRunning()) probe.cancel()
    else if (settings.isOpen()) settings.close()
    else if (pause.isOpen()) pause.back()
    else if (activeScene === 'match') { playUiMove(); pause.open() }
    else if (activeScene === 'menu') { playUiMove(); settings.open('general', settingsBtn) }
    return
  }
  const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT'
  if ((e.key === 'f' || e.key === 'F') && fullscreenSupported && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    void toggleFullscreen(shell, isTouchDevice)
  }
})

// Al cambiar de pestaña o minimizar, el partido se queda en pausa con el menú abierto
document.addEventListener('visibilitychange', () => {
  // Una prueba con la pestaña oculta no mide nada (el navegador para el pintado)
  if (document.hidden && probe.isRunning()) probe.cancel()
  else if (document.hidden && activeScene === 'match' && !pause.isOpen() && !matchSummary()?.ended) pause.open()
})

// ─── Pantalla completa ───────────────────────────────────────────────────────

const fullscreenQuickBtn = document.querySelector<HTMLButtonElement>('#btn-fullscreen-quick')
fullscreenQuickBtn?.addEventListener('click', () => void toggleFullscreen(shell, isTouchDevice))

// iPhone: el botón explica cómo abrir el juego desde la pantalla de inicio
const installHintEl = document.querySelector<HTMLElement>('#install-hint')
const openInstallHint = () => {
  if (!installHintEl) return
  playUiMove()
  installHintEl.hidden = false
  installHintEl.querySelector<HTMLButtonElement>('#btn-install-close')?.focus()
}
const closeInstallHint = () => { if (installHintEl) installHintEl.hidden = true }
document.querySelector('#btn-install-quick')?.addEventListener('click', openInstallHint)
document.querySelector('#btn-install-settings')?.addEventListener('click', openInstallHint)
document.querySelector('#btn-install-close')?.addEventListener('click', closeInstallHint)
// Tocar fuera de la tarjeta también cierra
installHintEl?.addEventListener('click', (e) => { if (e.target === installHintEl) closeInstallHint() })

const updateFullscreenUi = () => {
  const fs = isFullscreen()
  settings.syncToggles(fs)
  if (fullscreenQuickBtn) {
    fullscreenQuickBtn.innerHTML = fs ? ICON.compress : ICON.expand
    const label = fs ? 'Salir de pantalla completa' : 'Pantalla completa'
    fullscreenQuickBtn.setAttribute('aria-label', label)
    fullscreenQuickBtn.title = `${label} (F)`
  }
}

/**
 * En táctil, al empezar un partido se pide pantalla completa: sin ella la barra del
 * navegador se come una quinta parte del alto. El toque en el modo sigue contando como
 * gesto del usuario durante unos segundos; si el navegador lo rechaza, no pasa nada.
 */
function autoFullscreen() {
  if (isTouchDevice && fullscreenSupported && !fullscreenDeclined && !isFullscreen()) void toggleFullscreen(shell, true)
}

// Reajustar escala tras entrar/salir de fullscreen (evita imagen estirada)
onFullscreenChange(() => {
  if (!isFullscreen()) fullscreenDeclined = true
  updateFullscreenUi()
  requestAnimationFrame(() => game?.scale.refresh())
})
updateFullscreenUi()

window.addEventListener('resize', () => game?.scale.refresh())

// En Android, al entrar en pantalla completa las barras del navegador se van después
// de `fullscreenchange` y de `resize`: el lienzo se quedaba con el alto viejo y
// salían franjas negras. Se reajusta cuando el contenedor cambia de verdad.
const gameHost = document.querySelector<HTMLElement>('#game-host')
if (gameHost && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => game?.scale.refresh()).observe(gameHost)

// ─── Orientación (móvil) ─────────────────────────────────────────────────────

/** En vertical (táctil) el aviso de girar tapa el juego: no se pinta nada, ahorra batería. */
function syncPortraitSleep() {
  if (!game) return
  if (isPortraitBlocked()) game.pause()
  else if (game.isPaused) game.resume()
}

// El aviso lo muestra el CSS (#rotate-overlay); en partido además se abre la pausa
const onOrientation = () => {
  const blocked = isPortraitBlocked()
  shell.classList.toggle('is-portrait', blocked)
  syncPortraitSleep()
  if (blocked && activeScene === 'match' && !pause.isOpen()) pause.open()
  else syncOverlays()
}
portraitQuery.addEventListener('change', onOrientation)
onOrientation()

// ─── Dispositivo de entrada ──────────────────────────────────────────────────

// `data-input` en el shell: el CSS muestra controles táctiles, teclas o botones del mando según lo último usado
const applyInputMode = (mode: InputMode) => { shell.dataset.input = mode }
applyInputMode(getInputMode())
onInputModeChange(applyInputMode)

/** Teclas sintéticas para reutilizar la navegación de teclado de los paneles (no cambian el modo de entrada). */
function sendKey(key: string, target: EventTarget = document.activeElement ?? document) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/**
 * Mando fuera del partido: con un panel abierto, la cruceta navega, A acepta,
 * B vuelve y Start cierra; sin panel, Start abre la pausa (partido) o los ajustes (menú).
 */
function handlePadInShell() {
  if (probe.isRunning()) {
    if (consumePad('back') || consumePad('start') || consumePad('confirm')) probe.cancel()
    return
  }
  if (pause.isOpen() || settings.isOpen()) {
    const el = document.activeElement as HTMLElement | null
    if (consumePad('up')) sendKey('ArrowUp')
    if (consumePad('down')) sendKey('ArrowDown')
    for (const dir of ['left', 'right'] as const) {
      if (!consumePad(dir)) continue
      if (el instanceof HTMLInputElement && el.type === 'range') {
        if (dir === 'left') el.stepDown()
        else el.stepUp()
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        sendKey(dir === 'left' ? 'ArrowLeft' : 'ArrowRight')
      }
    }
    if (consumePad('confirm') && el && el !== document.body) el.click()
    if (consumePad('back')) sendKey('Escape')
    if (consumePad('start')) {
      settings.close()
      pause.close()
    }
    return
  }
  if (!consumePad('start')) return
  if (activeScene === 'match') { playUiMove(); pause.open() }
  else if (activeScene === 'menu') { playUiMove(); settings.open('general', settingsBtn) }
}
