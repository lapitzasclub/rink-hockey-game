import type * as Phaser from 'phaser'
import { getInputMode } from '../game/input/inputMode'
import { createMatchStats } from '../game/systems/matchStats'

/**
 * Estadísticas de un partido real con `?stats=1` (B-01, también en producción): cuenta con
 * `matchStats` en cada paso y al final muestra un botón DOM «Copiar estadísticas» con el JSON
 * (más el control usado) y lo deja en consola como `[stats] {json}`. Sin el parámetro no se crea nada.
 */

export type LiveStats = NonNullable<ReturnType<typeof createLiveStats>>

export function createLiveStats(match: Phaser.Scene, mode: string) {
  if (new URLSearchParams(window.location.search).get('stats') !== '1') return null
  const stats = createMatchStats(match, mode, { keepShots: true })
  const coarse = window.matchMedia('(pointer: coarse)').matches
  /** Segundos de juego con cada modo de entrada activo (el mando cuenta en cuanto se usa). */
  const inputSec = { touch: 0, keyboard: 0, gamepad: 0 }
  let finished = false
  let el: HTMLElement | null = null

  const json = () => {
    const control = inputSec.gamepad > 0 ? 'mando' : coarse ? 'tactil' : 'teclado'
    const r = (v: number) => Math.round(v * 10) / 10
    return JSON.stringify({ control, inputSec: { touch: r(inputSec.touch), keyboard: r(inputSec.keyboard), gamepad: r(inputSec.gamepad) }, ...stats.snapshot() })
  }

  return {
    /** Un paso de simulación (ms); deja de contar al acabar el partido. */
    step(ms: number) {
      if (finished || !stats.step(ms)) return
      inputSec[getInputMode()] += ms / 1000
    },
    /** Final del partido: consola y botón para copiar. */
    finish() {
      if (finished) return
      finished = true
      const text = json()
      console.log('[stats] ' + text)
      el = showCopyButton(text)
    },
    destroy() {
      el?.remove()
      el = null
    },
  }
}

/** Botón encima del lienzo; si el portapapeles falla, deja un textarea seleccionado para copiar a mano. */
function showCopyButton(text: string) {
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 72px);transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:6px;font:14px system-ui,sans-serif'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = 'Copiar estadísticas'
  btn.style.cssText = 'padding:8px 14px;border-radius:6px;border:1px solid #fff8;background:#0b1a2acc;color:#fff;font:inherit;cursor:pointer'
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text)
      btn.textContent = 'Copiado'
    } catch {
      if (!box.querySelector('textarea')) {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.readOnly = true
        ta.style.cssText = 'width:min(80vw,520px);height:120px;font:11px monospace'
        box.appendChild(ta)
      }
      const ta = box.querySelector('textarea')!
      ta.focus()
      ta.select()
      btn.textContent = 'Selecciona y copia'
    }
  })
  box.addEventListener('pointerdown', e => e.stopPropagation())
  box.appendChild(btn)
  document.body.appendChild(box)
  return box
}
