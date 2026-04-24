import './style.css'
import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants'
import { MatchScene } from './scenes/MatchScene'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-shell">
    <div id="touch-left" class="touch-zone hidden"></div>
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

function setTouchUiVisible(visible: boolean) {
  touchLeft.classList.toggle('hidden', !visible)
  touchRight.classList.toggle('hidden', !visible)
}

setTouchUiVisible(isTouchPrimary && !hasGamepad())
window.addEventListener('gamepadconnected', () => setTouchUiVisible(false))
window.addEventListener('gamepaddisconnected', () => setTouchUiVisible(isTouchPrimary && !hasGamepad()))

const touchState = { x: 0, y: 0, pass: false, shoot: false, switch: false }
;(window as Window & { __RINK_TOUCH_LOG__?: boolean }).__RINK_TOUCH_LOG__ = true
;(window as typeof window & { __RINK_TOUCH__?: typeof touchState }).__RINK_TOUCH__ = touchState

let nipplejsModule: any = null

async function setupTouchJoystick() {
  if (!isTouchPrimary) return

  const mod = await import('nipplejs')
  nipplejsModule = mod.default ?? mod

  const joystick = nipplejsModule.create({
    zone: touchLeft,
    mode: 'dynamic',
    multitouch: false,
    color: 'white',
    size: 120,
    threshold: 0.05,
    fadeTime: 0,
    restOpacity: 0.25,
    dynamicPage: true,
  })

  const syncFromData = (data: any) => {
    const vectorX = Number(data?.vector?.x ?? 0)
    const vectorY = Number(data?.vector?.y ?? 0)
    touchState.x = Phaser.Math.Clamp(vectorX, -1, 1)
    touchState.y = Phaser.Math.Clamp(vectorY, -1, 1)
  }

  joystick.on('start', (_event: any, data: any) => {
    touchLeft.classList.add('active')
    syncFromData(data)
  })

  joystick.on('move dir plain', (_event: any, data: any) => {
    syncFromData(data)
  })

  joystick.on('end hidden removed', () => {
    touchLeft.classList.remove('active')
    touchState.x = 0
    touchState.y = 0
  })
}

void setupTouchJoystick()

touchLeft.addEventListener('touchstart', () => {
  ;(window as any).__RINK_TOUCH_DIAG__ = 'touchstart-left'
}, { passive: true })

touchLeft.addEventListener('pointerdown', () => {
  ;(window as any).__RINK_TOUCH_DIAG__ = 'pointerdown-left'
})

for (const [id, key] of [['touch-pass', 'pass'], ['touch-shoot', 'shoot'], ['touch-switch', 'switch']] as const) {
  const el = document.getElementById(id)!
  const press = (event: PointerEvent) => {
    event.preventDefault()
    touchState[key] = true
  }
  const release = (event: PointerEvent) => {
    event.preventDefault()
    touchState[key] = false
  }
  el.addEventListener('pointerdown', press)
  el.addEventListener('pointerup', release)
  el.addEventListener('pointercancel', release)
  el.addEventListener('pointerleave', release)
  el.addEventListener('lostpointercapture', release)
}

window.addEventListener('blur', () => {
  touchState.x = 0
  touchState.y = 0
  touchState.pass = false
  touchState.shoot = false
  touchState.switch = false
})
