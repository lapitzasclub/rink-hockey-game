import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MatchScene } from './scenes/MatchScene'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-shell">
    <div id="touch-left" class="touch-zone hidden">
      <div id="touch-stick-base"></div>
      <div id="touch-stick-knob"></div>
    </div>
    <div id="game-host"></div>
    <div id="touch-right" class="touch-buttons hidden">
      <button id="touch-pass">P</button>
      <button id="touch-shoot">T</button>
      <button id="touch-switch">C</button>
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

const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches
const hasGamepad = () => navigator.getGamepads?.().some(Boolean) ?? false
const touchLeft = document.getElementById('touch-left')!
const touchRight = document.getElementById('touch-right')!
const knob = document.getElementById('touch-stick-knob')!
const base = document.getElementById('touch-stick-base')!

function setTouchUiVisible(visible: boolean) {
  touchLeft.classList.toggle('hidden', !visible)
  touchRight.classList.toggle('hidden', !visible)
}

setTouchUiVisible(isTouchPrimary && !hasGamepad())
window.addEventListener('gamepadconnected', () => setTouchUiVisible(false))
window.addEventListener('gamepaddisconnected', () => setTouchUiVisible(isTouchPrimary && !hasGamepad()))

let activePointerId: number | null = null
const touchState = { x: 0, y: 0, pass: false, shoot: false, switch: false }
;(window as typeof window & { __RINK_TOUCH__?: typeof touchState }).__RINK_TOUCH__ = touchState

function resetStick() {
  touchState.x = 0
  touchState.y = 0
  knob.setAttribute('style', '')
}

touchLeft.addEventListener('pointerdown', (event) => {
  activePointerId = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
})

touchLeft.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointerId) return
  const rect = base.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = event.clientX - cx
  const dy = event.clientY - cy
  const max = 44
  const len = Math.hypot(dx, dy) || 1
  const clamped = Math.min(len, max)
  const nx = (dx / len) * clamped
  const ny = (dy / len) * clamped
  knob.setAttribute('style', `transform: translate(${nx}px, ${ny}px);`)
  touchState.x = nx / max
  touchState.y = ny / max
})

const clearPointer = (event: PointerEvent) => {
  if (event.pointerId !== activePointerId) return
  activePointerId = null
  resetStick()
}

touchLeft.addEventListener('pointerup', clearPointer)
touchLeft.addEventListener('pointercancel', clearPointer)

for (const [id, key] of [['touch-pass', 'pass'], ['touch-shoot', 'shoot'], ['touch-switch', 'switch']] as const) {
  const el = document.getElementById(id)!
  el.addEventListener('pointerdown', () => { touchState[key] = true })
  el.addEventListener('pointerup', () => { touchState[key] = false })
  el.addEventListener('pointercancel', () => { touchState[key] = false })
}
