import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MatchScene } from './scenes/MatchScene'

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-shell" class="${isTouchDevice ? 'is-touch' : 'is-desktop'}">
    <div id="game-host"></div>
    <button id="btn-fullscreen" class="hud-btn" aria-label="Alternar pantalla completa">⛶</button>
    <div id="mobile-controls" aria-hidden="true">
      <div id="left-zone"></div>
      <div id="right-buttons">
        <button id="btn-shoot" class="touch-btn">A</button>
        <button id="btn-pass" class="touch-btn">B</button>
      </div>
    </div>
  </div>
`

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-host',
  backgroundColor: '#08111b',
  scene: [MatchScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})

const fullscreenButton = document.querySelector<HTMLButtonElement>('#btn-fullscreen')
fullscreenButton?.addEventListener('click', async () => {
  const shell = document.querySelector<HTMLElement>('#game-shell')
  if (!shell) return

  if (document.fullscreenElement) await document.exitFullscreen()
  else await shell.requestFullscreen()
})

window.addEventListener('resize', () => game.scale.refresh())
