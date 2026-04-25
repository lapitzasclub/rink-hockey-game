import nipplejs from 'nipplejs'

export type MobileJoystickState = {
  x: number
  y: number
  pass?: boolean
  shoot?: boolean
  switch?: boolean
  debug?: string
  build?: string
}

export function createMobileJoystick(options: {
  isTouchDevice: boolean
  zone: HTMLElement | null
  passButton: HTMLElement | null
  shootButton: HTMLElement | null
  switchButton: HTMLElement | null
  state: MobileJoystickState
}) {
  const { isTouchDevice, zone, passButton, shootButton, switchButton, state } = options
  state.build = 'overlay-nipple-v3'
  if (!isTouchDevice || !zone) {
    state.debug = 'touch-disabled-or-no-zone'
    return null
  }

  state.debug = 'zone-ready'
  state.pass = false
  state.shoot = false
  state.switch = false

  const resetStick = () => {
    state.x = 0
    state.y = 0
  }

  const bindButton = (element: HTMLElement | null, key: 'pass' | 'shoot' | 'switch') => {
    if (!element) return () => {}
    const press = (event: Event) => {
      event.preventDefault()
      state[key] = true
      state.debug = `btn-${key}-down`
      element.classList.add('pressed')
    }
    const release = (event: Event) => {
      event.preventDefault()
      state[key] = false
      element.classList.remove('pressed')
    }
    element.addEventListener('pointerdown', press)
    element.addEventListener('pointerup', release)
    element.addEventListener('pointercancel', release)
    element.addEventListener('pointerleave', release)
    return () => {
      element.removeEventListener('pointerdown', press)
      element.removeEventListener('pointerup', release)
      element.removeEventListener('pointercancel', release)
      element.removeEventListener('pointerleave', release)
    }
  }

  const onPointerDown = () => {
    state.debug = 'raw-pointerdown'
  }
  const onTouchStart = () => {
    state.debug = 'raw-touchstart'
  }

  zone.addEventListener('pointerdown', onPointerDown)
  zone.addEventListener('touchstart', onTouchStart, { passive: true })

  const unbindPass = bindButton(passButton, 'pass')
  const unbindShoot = bindButton(shootButton, 'shoot')
  const unbindSwitch = bindButton(switchButton, 'switch')

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
    resetStick()
    state.debug = 'nipple-end'
  })

  return {
    destroy() {
      resetStick()
      state.pass = false
      state.shoot = false
      state.switch = false
      zone.removeEventListener('pointerdown', onPointerDown)
      zone.removeEventListener('touchstart', onTouchStart)
      unbindPass()
      unbindShoot()
      unbindSwitch()
      manager?.destroy?.()
    },
  }
}
