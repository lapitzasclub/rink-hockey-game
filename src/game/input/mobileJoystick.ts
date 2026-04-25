import nipplejs from 'nipplejs'

export type MobileJoystickState = {
  x: number
  y: number
  pass?: boolean
  shoot?: boolean
  switch?: boolean
}

export function createMobileJoystick(options: {
  isTouchDevice: boolean
  zone: HTMLElement | null
  passButton: HTMLElement | null
  shootButton: HTMLElement | null
  switchButton: HTMLElement | null
  fullscreenButton: HTMLElement | null
  state: MobileJoystickState
}) {
  const { isTouchDevice, zone, passButton, shootButton, fullscreenButton, state } = options
  if (!isTouchDevice || !zone) return null

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

  const unbindPass = bindButton(passButton, 'pass')
  const unbindShoot = bindButton(shootButton, 'shoot')

  const onFullscreen = async (event: Event) => {
    event.preventDefault()
    const root = document.documentElement
    if (!document.fullscreenElement) await root.requestFullscreen?.()
    else await document.exitFullscreen?.()
  }
  fullscreenButton?.addEventListener('pointerdown', onFullscreen)

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

  ;(manager as any).on('move', (evt: any, data: any) => {
    const payload = data ?? evt?.data
    const vector = payload?.vector
    if (!vector) return
    state.x = Number(vector.x ?? 0)
    state.y = -Number(vector.y ?? 0)
  })

  ;(manager as any).on('end removed hidden', () => {
    resetStick()
  })

  return {
    destroy() {
      resetStick()
      state.pass = false
      state.shoot = false
      state.switch = false
      unbindPass()
      unbindShoot()
      fullscreenButton?.removeEventListener('pointerdown', onFullscreen)
      manager?.destroy?.()
    },
  }
}
