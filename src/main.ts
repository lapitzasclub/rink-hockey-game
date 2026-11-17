import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MenuScene } from './scenes/MenuScene'
import { MatchScene } from './scenes/MatchScene'
import { initPartidoExterno } from './game/externalMatch'
import { playUiMove } from './game/audio/sounds'
import { consumePad, pollGamepad } from './game/input/gamepad'
import { getInputMode, onInputModeChange, type InputMode } from './game/input/inputMode'
import { ICON, shellHtml } from './shell/template'
import { fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from './shell/fullscreen'
import { attachMenuNav } from './shell/menuNav'
import { createSettingsPanel } from './shell/settingsPanel'
import { createPauseMenu, type PauseSummary } from './shell/pauseMenu'

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

document.querySelector<HTMLDivElement>('#app')!.innerHTML = shellHtml({ isTouch: isTouchDevice, fullscreen: fullscreenSupported })

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
    scene: labScene ? [labScene, MenuScene, MatchScene] : [MenuScene, MatchScene],
    scale: {
      // EXPAND: el lienzo ocupa toda la ventana; el pabellón rellena lo que sobra de 16:9
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  })
  game.events.on(Phaser.Core.Events.STEP, onStep)
  // Acceso para depurar y simular desde la consola; no llega a producción
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game
})

// ─── Estado del shell ────────────────────────────────────────────────────────

const shell = document.querySelector<HTMLElement>('#game-shell')!
const portraitQuery = window.matchMedia('(orientation: portrait)')
const isPortraitBlocked = () => isTouchDevice && portraitQuery.matches

type ActiveScene = 'menu' | 'match' | ''
let activeScene: ActiveScene = ''

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
  isMatchRunning: () => activeScene === 'match',
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
    e.preventDefault()
    if (settings.isOpen()) settings.close()
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
  if (document.hidden && activeScene === 'match' && !pause.isOpen() && !matchSummary()?.ended) pause.open()
})

// ─── Pantalla completa ───────────────────────────────────────────────────────

const fullscreenQuickBtn = document.querySelector<HTMLButtonElement>('#btn-fullscreen-quick')
fullscreenQuickBtn?.addEventListener('click', () => void toggleFullscreen(shell, isTouchDevice))

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

// Reajustar escala tras entrar/salir de fullscreen (evita imagen estirada)
onFullscreenChange(() => {
  updateFullscreenUi()
  requestAnimationFrame(() => game?.scale.refresh())
})
updateFullscreenUi()

window.addEventListener('resize', () => game?.scale.refresh())

// ─── Orientación (móvil) ─────────────────────────────────────────────────────

// El aviso lo muestra el CSS (#rotate-overlay); en partido además se abre la pausa
const onOrientation = () => {
  const blocked = isPortraitBlocked()
  shell.classList.toggle('is-portrait', blocked)
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
