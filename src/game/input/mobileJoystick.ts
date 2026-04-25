import nipplejs from 'nipplejs'

export type MobileJoystickState = { x: number, y: number }

export function createMobileJoystick(options: {
  isTouchDevice: boolean
  zone: HTMLElement | null
  state: MobileJoystickState
}) {
  const { isTouchDevice, zone, state } = options
  if (!isTouchDevice || !zone) return null

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

  const reset = () => {
    state.x = 0
    state.y = 0
  }

  ;(manager as any).on('move', (evt: any, data: any) => {
    const payload = data ?? evt?.data
    const vector = payload?.vector
    if (!vector) return
    state.x = Number(vector.x ?? 0)
    state.y = -Number(vector.y ?? 0)
  })

  ;(manager as any).on('end removed hidden', () => {
    reset()
  })

  return {
    destroy() {
      reset()
      manager?.destroy?.()
    },
  }
}
