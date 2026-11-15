import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MenuScene } from './scenes/MenuScene'
import { MatchScene } from './scenes/MatchScene'
import { isAnnouncerEnabled, setAnnouncerEnabled } from './game/audio/announcer'

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-shell" class="${isTouchDevice ? 'is-touch' : 'is-desktop'}">
    <div id="game-host"></div>

    <button id="btn-settings" class="hud-btn" aria-label="Ajustes">⚙</button>

    <div id="settings-panel" class="settings-panel" hidden tabindex="-1">
      <div class="settings-card">
        <header class="settings-header">
          <span class="settings-title">AJUSTES</span>
          <button id="btn-settings-close" class="settings-close" aria-label="Cerrar">✕</button>
        </header>

        <section class="settings-section">
          <h3 class="settings-section-title">PANTALLA</h3>
          <button id="btn-fullscreen" class="settings-action-btn">
            <span>Pantalla completa</span><span>⛶</span>
          </button>
        </section>

        <section class="settings-section">
          <h3 class="settings-section-title">SONIDO</h3>
          <button id="btn-announcer" class="settings-action-btn">
            <span>Locutor (arcade)</span><span id="announcer-state"></span>
          </button>
        </section>

        <section class="settings-section">
          <h3 class="settings-section-title">TECLADO</h3>
          <dl class="settings-controls">
            <div><dt>WASD / Flechas</dt><dd>Mover</dd></div>
            <div><dt>Shift</dt><dd>Sprint / turbo</dd></div>
            <div><dt>U</dt><dd>Disparar · Robar</dd></div>
            <div><dt>Shift + U</dt><dd>Tiro turbo · Carga (arcade)</dd></div>
            <div><dt>Y</dt><dd>Pasar · Cambiar jugador</dd></div>
          </dl>
        </section>

        ${isTouchDevice ? `
        <section class="settings-section">
          <h3 class="settings-section-title">TÁCTIL</h3>
          <dl class="settings-controls">
            <div><dt>Joystick</dt><dd>Mover</dd></div>
            <div><dt>A</dt><dd>Disparar · Robar</dd></div>
            <div><dt>B</dt><dd>Pasar · Cambiar jugador</dd></div>
            <div><dt>S</dt><dd>Sprint / turbo</dd></div>
            <div><dt>S + A</dt><dd>Tiro turbo · Carga (arcade)</dd></div>
          </dl>
        </section>
        ` : ''}
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
  // Acceso para depurar y simular desde la consola; no llega a producción
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game
})

// --- Settings panel ---

const settingsBtn = document.querySelector<HTMLButtonElement>('#btn-settings')!
const settingsPanel = document.querySelector<HTMLElement>('#settings-panel')!
const settingsClose = document.querySelector<HTMLButtonElement>('#btn-settings-close')!
const fullscreenBtn = document.querySelector<HTMLButtonElement>('#btn-fullscreen')!

const openSettings = () => {
  settingsPanel.hidden = false
  settingsPanel.focus()
  if (game?.scene.isActive('match')) game.scene.pause('match')
}

const closeSettings = () => {
  settingsPanel.hidden = true
  if (game?.scene.isPaused('match')) game.scene.resume('match')
}

settingsBtn.addEventListener('click', openSettings)
settingsClose.addEventListener('click', closeSettings)

// Cerrar al pulsar el backdrop (fondo oscuro)
settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) closeSettings()
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsPanel.hidden) closeSettings()
})

// --- Fullscreen ---

const updateFullscreenLabel = () => {
  const isFs = !!document.fullscreenElement
  const span = fullscreenBtn.querySelector('span')
  if (span) span.textContent = isFs ? 'Salir de pantalla completa' : 'Pantalla completa'
}

fullscreenBtn.addEventListener('click', async () => {
  const shell = document.querySelector<HTMLElement>('#game-shell')!
  if (document.fullscreenElement) await document.exitFullscreen()
  else await shell.requestFullscreen()
})

// Reajustar escala tras entrar/salir de fullscreen (evita imagen estirada)
document.addEventListener('fullscreenchange', () => {
  updateFullscreenLabel()
  requestAnimationFrame(() => game?.scale.refresh())
})

window.addEventListener('resize', () => game?.scale.refresh())

// --- Locutor ---

const announcerBtn = document.querySelector<HTMLButtonElement>('#btn-announcer')!
const announcerState = document.querySelector<HTMLElement>('#announcer-state')!
const updateAnnouncerLabel = () => {
  announcerState.textContent = isAnnouncerEnabled() ? 'ON' : 'OFF'
}
announcerBtn.addEventListener('click', () => {
  setAnnouncerEnabled(!isAnnouncerEnabled())
  updateAnnouncerLabel()
})
updateAnnouncerLabel()
