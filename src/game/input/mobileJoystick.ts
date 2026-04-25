import nipplejs from 'nipplejs'

export type MobileJoystickState = { x: number, y: number, debug?: string, build?: string }

export function createMobileJoystick(options: {
  isTouchDevice: boolean
  zone: HTMLElement | null
  state: MobileJoystickState
}) {
  const { isTouchDevice, zone, state } = options
  state.build = 'overlay-nipple-v2'
  if (!isTouchDevice || !zone) {
    state.debug = 'touch-disabled-or-no-zone'
    return null
  }

  state.debug = 'zone-ready'

  const reset = () => {
    state.x = 0
    state.y = 0
  }

  const onPointerDown = () => {
    state.debug = 'raw-pointerdown'
  }
  const onTouchStart = () => {
    state.debug = 'raw-touchstart'
  }

  zone.addEventListener('pointerdown', onPointerDown)
  zone.addEventListener('touchstart', onTouchStart, { passive: true })

  const manager = nipplejs.create({
    zone,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'white',
    size: 120,
    restOpacity: 0.35,
    fadeTime: 0,
    multitouch: false,
  })

  ;(manager as any).on('start', () => {
    state.debug = 'nipple-start'
  })

  ;(manager as any).on('move', (evt: any, data: any) => {
    const payload = data ?? evt?.data
    const vector = payload?.vector
    if (!vector) {
      state.debug = 'nipple-move-no-vector'
      return
    }
    state.x = Number(vector.x ?? 0)
    state.y = -Number(vector.y ?? 0)
    state.debug = `nipple-move ${state.x.toFixed(2)},${state.y.toFixed(2)}`
  })

  ;(manager as any).on('end removed hidden', () => {
    reset()
    state.debug = 'nipple-end'
  })

  return {
    destroy() {
      reset()
      zone.removeEventListener('pointerdown', onPointerDown)
      zone.removeEventListener('touchstart', onTouchStart)
      manager?.destroy?.()
    },
  }
}
