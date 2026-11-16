import { playUiConfirm, playUiMove } from '../game/audio/sounds'

/**
 * Navegación de menús DOM al estilo consola: ↑/↓ recorren los elementos
 * `[data-nav]` visibles (con vuelta), el ratón selecciona al pasar por encima
 * y Tab queda atrapado dentro del panel. Enter/Espacio son los nativos del
 * botón: el teclado de Phaser está desactivado mientras hay un panel abierto.
 */
export function attachMenuNav(root: HTMLElement) {
  const items = () => Array.from(root.querySelectorAll<HTMLElement>('[data-nav]'))
    .filter(el => el.offsetParent !== null && !(el as HTMLButtonElement).disabled)

  const move = (dir: 1 | -1) => {
    const list = items()
    if (!list.length) return
    const idx = list.indexOf(document.activeElement as HTMLElement)
    const next = list[(idx + dir + list.length) % list.length]
    next.focus({ preventScroll: false })
    playUiMove()
  }

  root.addEventListener('keydown', (e) => {
    // En filas horizontales (`data-nav-row`, p. ej. Sí / No) también valen ← →
    const inRow = !!(e.target as HTMLElement).closest('[data-nav-row]')
    if (e.key === 'ArrowDown' || (inRow && e.key === 'ArrowRight')) { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp' || (inRow && e.key === 'ArrowLeft')) { e.preventDefault(); move(-1) }
    else if (e.key === 'Tab') {
      const list = items()
      if (!list.length) return
      const idx = list.indexOf(document.activeElement as HTMLElement)
      const last = list.length - 1
      if (e.shiftKey && idx <= 0) { e.preventDefault(); list[last].focus() }
      else if (!e.shiftKey && idx === last) { e.preventDefault(); list[0].focus() }
    }
  })

  // Pasar el ratón selecciona, como en un menú de juego; el foco es la única «selección»
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]')
    if (el && el !== document.activeElement && root.contains(el)) {
      el.focus({ preventScroll: true })
      playUiMove()
    }
  })

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button[data-nav]')
    if (!el) return
    if (el.classList.contains('menu-item')) playUiConfirm()
    else playUiMove()
  })
}

/** Enfoca el primer elemento navegable (o el indicado) al abrir un panel. */
export function focusFirst(root: HTMLElement, selector = '[data-nav]') {
  const el = Array.from(root.querySelectorAll<HTMLElement>(selector)).find(x => x.offsetParent !== null)
  el?.focus({ preventScroll: true })
}
