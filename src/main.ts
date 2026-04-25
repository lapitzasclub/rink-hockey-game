import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MatchScene } from './scenes/MatchScene'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-shell">
    <div id="game-host"></div>
    <div id="mobile-controls" aria-hidden="true">
      <div id="left-zone"></div>
      <div id="right-buttons">
        <button id="btn-pass" class="touch-btn">P</button>
        <button id="btn-shoot" class="touch-btn">T</button>
        <button id="btn-switch" class="touch-btn">C</button>
        <button id="btn-fullscreen" class="touch-btn">⛶</button>
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

window.addEventListener('resize', () => game.scale.refresh())
