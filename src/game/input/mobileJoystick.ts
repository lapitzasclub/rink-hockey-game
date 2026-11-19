import nipplejs from 'nipplejs'

export type MobileJoystickState = {
  x: number
  y: number
  pass?: boolean
  shoot?: boolean
  switch?: boolean
  sprint?: boolean
}

export function createMobileJoystick(options: {
  isTouchDevice: boolean
  zone: HTMLElement | null
  passButton: HTMLElement | null
  shootButton: HTMLElement | null
  sprintButton: HTMLElement | null
  switchButton: HTMLElement | null
  state: MobileJoystickState
}) {
  const { isTouchDevice, zone, passButton, shootButton, sprintButton, state } = options
  if (!isTouchDevice || !zone) return null

  state.pass = false
  state.shoot = false
  state.switch = false
  state.sprint = false

  const resetStick = () => {
    state.x = 0
    state.y = 0
  }

  type Btn = 'pass' | 'shoot' | 'sprint'
  const elements: Partial<Record<Btn, HTMLElement>> = {}
  if (passButton) elements.pass = passButton
  if (shootButton) elements.shoot = shootButton
  if (sprintButton) elements.sprint = sprintButton

  /**
   * Cada dedo se queda con el botón donde se apoyó. El de S además puede deslizarse
   * hasta A o B sin soltar el turbo: un pulgar no pulsa dos botones a la vez, y así
   * salen con una mano el tiro turbo y la carga.
   */
  const touches = new Map<number, { origin: Btn, over: Btn | null, rects: [Btn, DOMRect][] }>()

  const refresh = () => {
    const on: Record<Btn, boolean> = { pass: false, shoot: false, sprint: false }
    for (const t of touches.values()) {
      on[t.origin] = true
      if (t.origin === 'sprint' && t.over && t.over !== 'sprint') on[t.over] = true
    }
    for (const key of Object.keys(elements) as Btn[]) {
      state[key] = on[key]
      elements[key]!.classList.toggle('pressed', on[key])
    }
  }

  /** Margen de acierto al deslizar (px CSS): el pulgar tapa el borde del botón. */
  const SLIDE_SLOP = 8
  const hit = (rects: [Btn, DOMRect][], x: number, y: number): Btn | null => {
    for (const [key, r] of rects) {
      if (x >= r.left - SLIDE_SLOP && x <= r.right + SLIDE_SLOP && y >= r.top - SLIDE_SLOP && y <= r.bottom + SLIDE_SLOP) return key
    }
    return null
  }

  const unbinds: (() => void)[] = []
  for (const [key, element] of Object.entries(elements) as [Btn, HTMLElement][]) {
    const down = (event: PointerEvent) => {
      event.preventDefault()
      element.setPointerCapture?.(event.pointerId)
      // Los rectángulos se toman al apoyar el dedo: durante el gesto no cambian
      const rects = key === 'sprint'
        ? (Object.entries(elements) as [Btn, HTMLElement][]).filter(([k]) => k !== 'sprint').map(([k, el]) => [k, el.getBoundingClientRect()] as [Btn, DOMRect])
        : []
      touches.set(event.pointerId, { origin: key, over: key, rects })
      refresh()
    }
    const move = (event: PointerEvent) => {
      const t = touches.get(event.pointerId)
      if (!t || t.origin !== 'sprint') return
      const over = hit(t.rects, event.clientX, event.clientY)
      if (over !== t.over) {
        t.over = over
        refresh()
      }
    }
    const up = (event: PointerEvent) => {
      if (!touches.delete(event.pointerId)) return
      event.preventDefault()
      refresh()
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    element.addEventListener('lostpointercapture', up)
    unbinds.push(() => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('lostpointercapture', up)
    })
  }

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
      state.sprint = false
      touches.clear()
      for (const unbind of unbinds) unbind()
      manager?.destroy?.()
    },
  }
}
