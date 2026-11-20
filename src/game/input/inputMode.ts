/**
 * Último dispositivo de entrada usado: decide qué ayudas y botones muestra la
 * UI (teclas, botones del mando o controles táctiles). El ratón cuenta como
 * «teclado» porque va con él. El mando lo notifica gamepad.ts al detectar actividad.
 */

import { primaryLabel } from './keyBindings'

export type InputMode = 'touch' | 'keyboard' | 'gamepad'

const listeners = new Set<(mode: InputMode) => void>()
let mode: InputMode = window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard'

export function getInputMode(): InputMode {
  return mode
}

export function setInputMode(next: InputMode) {
  if (next === mode) return
  mode = next
  listeners.forEach(fn => fn(mode))
}

export function onInputModeChange(fn: (mode: InputMode) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Solo eventos reales: el shell envía teclas sintéticas para navegar con el mando
window.addEventListener('keydown', (e) => { if (e.isTrusted) setInputMode('keyboard') }, true)
window.addEventListener('pointerdown', (e) => setInputMode(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'keyboard'), true)
// Mover el ratón tras usar el mando devuelve la UI a teclado/ratón
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && mode === 'gamepad' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 4)) setInputMode('keyboard')
}, true)

/** Botones del mando (disposición Xbox, la de la «standard mapping» del navegador). */
export const PAD_GLYPH = {
  a: { label: 'A', color: 0x3fb34f, css: '#3fb34f' },
  b: { label: 'B', color: 0xe0363c, css: '#e0363c' },
  x: { label: 'X', color: 0x2f7ff0, css: '#2f7ff0' },
  y: { label: 'Y', color: 0xf2b417, css: '#f2b417' },
} as const

/** Texto de la tecla o botón de una acción de juego según el dispositivo actual. */
export function actionPrompt(action: 'shoot' | 'pass' | 'sprint', m: InputMode = mode): string {
  if (m === 'gamepad') return action === 'shoot' ? 'X' : action === 'pass' ? 'A' : 'RT'
  if (m === 'touch') return action === 'shoot' ? 'TIRO' : action === 'pass' ? 'PASE' : 'el joystick a fondo'
  return primaryLabel(action)
}
