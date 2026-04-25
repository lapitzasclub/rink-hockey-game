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
let activeTouchPointerId: number | null = null

const resetTouchStick = (diag = 'touch reset') => {
  touchLeft.classList.remove('active')
  touchState.x = 0
  touchState.y = 0
  activeTouchPointerId = null
  ;(window as any).__RINK_TOUCH_DIAG__ = diag
}

const updateTouchStickFromPoint = (clientX: number, clientY: number, diagPrefix = 'manual') => {
  const rect = touchLeft.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const dx = clientX - centerX
  const dy = clientY - centerY
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2)
  const normalizedX = Phaser.Math.Clamp(dx / radius, -1, 1)
  const normalizedY = Phaser.Math.Clamp(dy / radius, -1, 1)
  touchState.x = normalizedX
  touchState.y = normalizedY
  ;(window as any).__RINK_TOUCH_DIAG__ = `${diagPrefix} ${touchState.x.toFixed(2)},${touchState.y.toFixed(2)}`
}

async function setupTouchJoystick() {
  if (!isTouchPrimary) return

  try {
    const mod = await import('nipplejs')
    nipplejsModule = mod.default ?? mod

    const manager = nipplejsModule.create({
      zone: touchLeft,
      mode: 'static',
      position: { left: '66px', bottom: '66px' },
      multitouch: false,
      color: 'white',
      size: 120,
      threshold: 0.05,
      fadeTime: 0,
      restOpacity: 0.25,
    })

    const syncFromData = (data: any) => {
      const vectorX = Number(data?.vector?.x ?? 0)
      const vectorY = Number(data?.vector?.y ?? 0)
      touchState.x = Phaser.Math.Clamp(vectorX, -1, 1)
      touchState.y = Phaser.Math.Clamp(-vectorY, -1, 1)
      ;(window as any).__RINK_TOUCH_DIAG__ = `mgr ${touchState.x.toFixed(2)},${touchState.y.toFixed(2)}`
    }

    manager.on('start', () => {
      touchLeft.classList.add('active')
      ;(window as any).__RINK_TOUCH_DIAG__ = 'mgr start'
    })

    manager.on('move', (_evt: any, data: any) => {
      syncFromData(data)
    })

    manager.on('end hidden removed', () => {
      resetTouchStick('mgr end')
    })
  } catch {
    ;(window as any).__RINK_TOUCH_DIAG__ = 'mgr unavailable'
  }
}

void setupTouchJoystick()

touchLeft.addEventListener('pointerdown', (event) => {
  activeTouchPointerId = event.pointerId
  touchLeft.classList.add('active')
  updateTouchStickFromPoint(event.clientX, event.clientY, 'ptr down')
})

touchLeft.addEventListener('pointermove', (event) => {
  if (activeTouchPointerId !== event.pointerId) return
  updateTouchStickFromPoint(event.clientX, event.clientY, 'ptr move')
})

touchLeft.addEventListener('pointerup', (event) => {
  if (activeTouchPointerId !== event.pointerId) return
  resetTouchStick('ptr up')
})

touchLeft.addEventListener('pointercancel', (event) => {
  if (activeTouchPointerId !== event.pointerId) return
  resetTouchStick('ptr cancel')
})

touchLeft.addEventListener('lostpointercapture', () => {
  resetTouchStick('ptr lost')
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
