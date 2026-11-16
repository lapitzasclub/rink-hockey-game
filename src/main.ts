import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MenuScene } from './scenes/MenuScene'
import { MatchScene } from './scenes/MatchScene'
import { isAnnouncerEnabled, setAnnouncerEnabled } from './game/audio/announcer'
import { areRoleLabelsEnabled, setRoleLabelsEnabled } from './game/ui/prefs'

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

const ICON = {
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V3h6v2.4H5.4V9zm12-6h6v6h-2.4V5.4H15zM3 15h2.4v3.6H9V21H3zm15.6 0H21v6h-6v-2.4h3.6z"/></svg>',
  compress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3H9v6H3V6.6h3.6zM15 3h2.4v3.6H21V9h-6zM3 15h6v6H6.6v-3.6H3zm12 0h6v2.4h-3.6V21H15z"/></svg>',
}

type WebkitDoc = Document & { webkitFullscreenEnabled?: boolean, webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> }
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> }

// iPhone no tiene Fullscreen API para elementos: allí no se ofrece el botón
const fullscreenSupported = !!(document.fullscreenEnabled || (document as WebkitDoc).webkitFullscreenEnabled)

const toggleRow = (id: string, label: string) => `
  <button id="${id}" class="settings-row" role="switch" aria-checked="false">
    <span>${label}</span><span class="switch" aria-hidden="true"><span class="switch-knob"></span></span>
  </button>`

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-shell" class="${isTouchDevice ? 'is-touch' : 'is-desktop'}">
    <div id="game-host"></div>

    <div class="hud-cluster">
      ${fullscreenSupported ? `<button id="btn-fullscreen-quick" class="hud-btn hud-btn--menu-only" aria-label="Pantalla completa" title="Pantalla completa (F)">${ICON.expand}</button>` : ''}
      <button id="btn-settings" class="hud-btn" aria-label="Ajustes" title="Ajustes">${ICON.gear}</button>
    </div>

    <div id="settings-panel" class="settings-panel" hidden tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="settings-card">
        <header class="settings-header">
          <span id="settings-title" class="settings-title">AJUSTES</span>
          <button id="btn-settings-close" class="settings-close" aria-label="Cerrar">✕</button>
        </header>

        <div class="settings-body">
          ${fullscreenSupported ? `
          <section class="settings-section">
            <h3 class="settings-section-title">PANTALLA</h3>
            ${toggleRow('btn-fullscreen', 'Pantalla completa')}
          </section>` : ''}

          <section class="settings-section">
            <h3 class="settings-section-title">SONIDO</h3>
            ${toggleRow('btn-announcer', 'Locutor (arcade)')}
          </section>

          <section class="settings-section">
            <h3 class="settings-section-title">PANTALLA DE JUEGO</h3>
            ${toggleRow('btn-role-labels', 'Etiquetas de rol')}
          </section>

          <section class="settings-section">
            <h3 class="settings-section-title">TECLADO</h3>
            <dl class="settings-controls">
              <div><dt><kbd>WASD</kbd> <kbd>←↑↓→</kbd></dt><dd>Mover</dd></div>
              <div><dt><kbd>Shift</kbd></dt><dd>Sprint / turbo</dd></div>
              <div><dt><kbd>U</kbd></dt><dd>Disparar · Robar</dd></div>
              <div><dt><kbd>Shift</kbd>+<kbd>U</kbd></dt><dd>Tiro turbo · Carga (arcade)</dd></div>
              <div><dt><kbd>Y</kbd></dt><dd>Pasar · Cambiar jugador</dd></div>
              ${fullscreenSupported ? '<div><dt><kbd>F</kbd></dt><dd>Pantalla completa</dd></div>' : ''}
            </dl>
          </section>

          ${isTouchDevice ? `
          <section class="settings-section">
            <h3 class="settings-section-title">TÁCTIL</h3>
            <dl class="settings-controls">
              <div><dt><kbd>Joystick</kbd></dt><dd>Mover</dd></div>
              <div><dt><kbd>A</kbd></dt><dd>Disparar · Robar</dd></div>
              <div><dt><kbd>B</kbd></dt><dd>Pasar · Cambiar jugador</dd></div>
              <div><dt><kbd>S</kbd></dt><dd>Sprint / turbo</dd></div>
              <div><dt><kbd>S</kbd>+<kbd>A</kbd></dt><dd>Tiro turbo · Carga (arcade)</dd></div>
            </dl>
          </section>
          ` : ''}
        </div>
      </div>
    </div>

    <div id="rotate-overlay" role="alertdialog" aria-labelledby="rotate-title" aria-describedby="rotate-text">
      <div class="rotate-rink" aria-hidden="true"></div>
      <div class="rotate-content">
        <svg class="rotate-phone" viewBox="0 0 140 140" aria-hidden="true">
          <path class="rotate-arrow" d="M26 52a46 46 0 0 1 66-32" />
          <path class="rotate-arrow-head" d="M86 10l12 10-15 6z" />
          <g class="rotate-device">
            <rect x="46" y="26" width="48" height="88" rx="9" class="device-body" />
            <rect x="51" y="35" width="38" height="70" rx="3" class="device-screen" />
            <line x1="51" y1="70" x2="89" y2="70" class="device-line" />
            <circle cx="70" cy="70" r="8" class="device-circle" />
            <circle cx="70" cy="52" r="3.4" class="device-ball" />
          </g>
        </svg>
        <h2 id="rotate-title" class="rotate-title">GIRA EL MÓVIL</h2>
        <p id="rotate-text" class="rotate-text">Rink Hockey se juega en horizontal</p>
      </div>
    </div>

    <div id="mobile-controls" aria-hidden="true">
      <div id="left-zone"></div>
      <div id="right-buttons">
        <button id="btn-shoot" class="touch-btn">A</button>
        <button id="btn-pass" class="touch-btn">B</button>
        <button id="btn-sprint" class="touch-btn">S</button>
      </div>
    </div>
  </div>
`

let game: Phaser.Game | null = null

// Phaser rasteriza los textos al crearlos: hay que esperar a la fuente arcade
// (con tope, para no bloquear el arranque si Google Fonts no responde)
const fontReady = Promise.race([
  document.fonts.load('32px "Russo One"'),
  new Promise(resolve => setTimeout(resolve, 1500)),
]).catch(() => undefined)

void fontReady.then(async () => {
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
  // Un partido que arranca con el móvil en vertical nace pausado
  game.events.on(Phaser.Core.Events.STEP, () => { if (isPortraitBlocked()) syncMatchPause() })
  // Acceso para depurar y simular desde la consola; no llega a producción
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game
})

// --- Settings panel ---

const shell = document.querySelector<HTMLElement>('#game-shell')!
const settingsBtn = document.querySelector<HTMLButtonElement>('#btn-settings')!
const settingsPanel = document.querySelector<HTMLElement>('#settings-panel')!
const settingsClose = document.querySelector<HTMLButtonElement>('#btn-settings-close')!
const fullscreenBtn = document.querySelector<HTMLButtonElement>('#btn-fullscreen')
const fullscreenQuickBtn = document.querySelector<HTMLButtonElement>('#btn-fullscreen-quick')
const portraitQuery = window.matchMedia('(orientation: portrait)')

/** El partido se pausa con los ajustes abiertos o con el móvil en vertical, y se reanuda cuando no queda ninguno. */
const isPortraitBlocked = () => isTouchDevice && portraitQuery.matches
// Solo se reanuda lo que pausó el shell: el laboratorio congela el partido por su cuenta
let pausedByShell = false
function syncMatchPause() {
  if (!game) return
  const shouldPause = !settingsPanel.hidden || isPortraitBlocked()
  if (shouldPause && game.scene.isActive('match')) {
    game.scene.pause('match')
    pausedByShell = true
  } else if (!shouldPause && pausedByShell) {
    pausedByShell = false
    if (game.scene.isPaused('match')) game.scene.resume('match')
  }
}

const openSettings = () => {
  settingsPanel.hidden = false
  settingsPanel.focus()
  syncMatchPause()
}

const closeSettings = () => {
  settingsPanel.hidden = true
  settingsBtn.focus({ preventScroll: true })
  syncMatchPause()
}

settingsBtn.addEventListener('click', openSettings)
settingsClose.addEventListener('click', closeSettings)

// Cerrar al pulsar el backdrop (fondo oscuro)
settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) closeSettings()
})

const setSwitch = (btn: HTMLElement | null, on: boolean) => btn?.setAttribute('aria-checked', String(on))

// --- Fullscreen ---

const fullscreenElement = () => document.fullscreenElement ?? (document as WebkitDoc).webkitFullscreenElement ?? null

const toggleFullscreen = async () => {
  try {
    if (fullscreenElement()) {
      await (document.exitFullscreen ? document.exitFullscreen() : (document as WebkitDoc).webkitExitFullscreen?.())
      return
    }
    const el = shell as WebkitEl
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.())
    // En Android, con pantalla completa se puede fijar el apaisado; donde no se deja, falla en silencio
    if (isTouchDevice) await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => {})
  } catch {
    // el navegador rechazó la petición (sin gesto o no permitida): no hay nada más que hacer
  }
}

const updateFullscreenLabel = () => {
  const isFs = !!fullscreenElement()
  setSwitch(fullscreenBtn, isFs)
  if (fullscreenQuickBtn) {
    fullscreenQuickBtn.innerHTML = isFs ? ICON.compress : ICON.expand
    const label = isFs ? 'Salir de pantalla completa' : 'Pantalla completa'
    fullscreenQuickBtn.setAttribute('aria-label', label)
    fullscreenQuickBtn.title = `${label} (F)`
  }
}

fullscreenBtn?.addEventListener('click', toggleFullscreen)
fullscreenQuickBtn?.addEventListener('click', toggleFullscreen)

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsPanel.hidden) closeSettings()
  else if ((e.key === 'f' || e.key === 'F') && fullscreenSupported && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) void toggleFullscreen()
})

// Reajustar escala tras entrar/salir de fullscreen (evita imagen estirada)
const onFullscreenChange = () => {
  updateFullscreenLabel()
  requestAnimationFrame(() => game?.scale.refresh())
}
document.addEventListener('fullscreenchange', onFullscreenChange)
document.addEventListener('webkitfullscreenchange', onFullscreenChange)
updateFullscreenLabel()

window.addEventListener('resize', () => game?.scale.refresh())

// --- Orientación (móvil) ---

// El aviso lo muestra el CSS (#rotate-overlay); aquí solo se marca el shell y se pausa el partido
const onOrientation = () => {
  shell.classList.toggle('is-portrait', isPortraitBlocked())
  syncMatchPause()
}
portraitQuery.addEventListener('change', onOrientation)
onOrientation()

// --- Locutor ---

const announcerBtn = document.querySelector<HTMLButtonElement>('#btn-announcer')!
const updateAnnouncerLabel = () => setSwitch(announcerBtn, isAnnouncerEnabled())
announcerBtn.addEventListener('click', () => {
  setAnnouncerEnabled(!isAnnouncerEnabled())
  updateAnnouncerLabel()
})
updateAnnouncerLabel()

const roleLabelsBtn = document.querySelector<HTMLButtonElement>('#btn-role-labels')!
const updateRoleLabelsLabel = () => setSwitch(roleLabelsBtn, areRoleLabelsEnabled())
roleLabelsBtn.addEventListener('click', () => {
  setRoleLabelsEnabled(!areRoleLabelsEnabled())
  updateRoleLabelsLabel()
})
updateRoleLabelsLabel()
