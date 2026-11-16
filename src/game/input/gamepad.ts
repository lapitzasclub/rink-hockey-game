/**
 * Mando con la Gamepad API (standard mapping). Se sondea una vez por frame
 * desde el bucle del juego (evento STEP, antes de actualizar escenas) y
 * expone botones lógicos con «recién pulsado» consumible: el primero que lo
 * consume (menú DOM, menú Phaser o partido) se lo queda, así una pulsación
 * nunca hace dos cosas en el mismo frame.
 *
 * Partido: stick izquierdo o cruceta mueven, X/B tiro · robo, A pase · cambio,
 * RT/RB sprint · turbo, Start pausa. Menús: cruceta/stick, A acepta, B vuelve.
 */

import { setInputMode } from './inputMode'

export type PadButton = 'confirm' | 'back' | 'shoot' | 'pass' | 'sprint' | 'start' | 'up' | 'down' | 'left' | 'right'

const BUTTONS: Record<Exclude<PadButton, 'up' | 'down' | 'left' | 'right'>, number[]> = {
  confirm: [0],
  back: [1],
  shoot: [2, 1],
  pass: [0],
  sprint: [7, 5],
  start: [9],
}
const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const
const DEADZONE = 0.22
/** Umbral del stick para contar como dirección de menú (con histéresis al soltar). */
const NAV_ON = 0.6
const NAV_OFF = 0.4

const held: Record<PadButton, boolean> = { confirm: false, back: false, shoot: false, pass: false, sprint: false, start: false, up: false, down: false, left: false, right: false }
const edge: Record<PadButton, boolean> = { ...held }
let axis = { x: 0, y: 0 }
let connected = false

function pressed(pad: Gamepad, i: number) {
  const b = pad.buttons[i]
  return !!b && (b.pressed || b.value > 0.5)
}

export function pollGamepad() {
  for (const k of Object.keys(edge) as PadButton[]) edge[k] = false
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
  const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected)
  connected = !!pad
  if (!pad) {
    axis = { x: 0, y: 0 }
    for (const k of Object.keys(held) as PadButton[]) held[k] = false
    return
  }

  let x = pad.axes[0] ?? 0
  let y = pad.axes[1] ?? 0
  if (Math.hypot(x, y) < DEADZONE) { x = 0; y = 0 }
  // La cruceta manda sobre el stick si está pulsada
  const dx = (pressed(pad, DPAD.right) ? 1 : 0) - (pressed(pad, DPAD.left) ? 1 : 0)
  const dy = (pressed(pad, DPAD.down) ? 1 : 0) - (pressed(pad, DPAD.up) ? 1 : 0)
  if (dx || dy) { x = dx; y = dy }
  axis = { x, y }

  let active = x !== 0 || y !== 0
  const set = (k: PadButton, now: boolean) => {
    if (now && !held[k]) { edge[k] = true; active = true }
    if (now) active = true
    held[k] = now
  }
  for (const [k, idx] of Object.entries(BUTTONS) as [PadButton, number[]][]) set(k, idx.some(i => pressed(pad, i)))
  const dir = (k: 'up' | 'down' | 'left' | 'right', v: number) => set(k, held[k] ? v > NAV_OFF : v > NAV_ON)
  dir('up', -y)
  dir('down', y)
  dir('left', -x)
  dir('right', x)
  if (active) setInputMode('gamepad')
}

export function padConnected() {
  return connected
}

export function padAxis() {
  return axis
}

export function padHeld(btn: PadButton) {
  return held[btn]
}

/** Devuelve true una sola vez por pulsación (y solo en el frame en que ocurrió). */
export function consumePad(btn: PadButton) {
  if (!edge[btn]) return false
  edge[btn] = false
  // A es «aceptar» y «pase»: consumir uno consume los que comparten botón físico
  const mine = (BUTTONS as Record<string, number[] | undefined>)[btn]
  if (mine) {
    for (const [other, idx] of Object.entries(BUTTONS) as [PadButton, number[]][]) {
      if (idx.some(i => mine.includes(i))) edge[other] = false
    }
  }
  return true
}
