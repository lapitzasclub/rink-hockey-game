import { playUiBack } from '../game/audio/sounds'
import { focusFirst } from './menuNav'

export type PauseSummary = { mode: 'arcade' | 'classic', period: number, remainingSeconds: number, blue: number, red: number, ended: boolean }

type ConfirmKind = 'restart' | 'quit'

const CONFIRM_TEXT: Record<ConfirmKind, string> = {
  restart: '¿Reiniciar el partido? Se perderá el resultado actual.',
  quit: '¿Salir al menú? Se perderá el partido.',
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Menú de pausa del partido: continuar, reiniciar, ajustes, controles y salir.
 * Reiniciar y salir piden confirmación mientras el partido sigue en juego.
 */
export function createPauseMenu(deps: {
  getSummary: () => PauseSummary | null
  onVisibilityChange: () => void
  onRestart: () => void
  onQuit: () => void
  onSettings: (tab: 'general' | 'controls', from: HTMLElement) => void
}) {
  const root = document.querySelector<HTMLElement>('#pause-menu')!
  const list = root.querySelector<HTMLElement>('[data-view="main"]')!
  const confirm = root.querySelector<HTMLElement>('[data-view="confirm"]')!
  const confirmText = root.querySelector<HTMLElement>('#pause-confirm-text')!
  let pending: ConfirmKind | null = null

  const paintSummary = () => {
    const s = deps.getSummary()
    if (!s) return
    const mode = s.mode === 'arcade' ? 'ARCADE' : 'REGLAMENTO'
    root.querySelector('#pause-kicker')!.textContent = s.ended
      ? `${mode} · FINAL`
      : `${mode} · PERIODO ${s.period} · ${fmtClock(s.remainingSeconds)}`
    root.querySelector('#pause-blue')!.textContent = String(s.blue)
    root.querySelector('#pause-red')!.textContent = String(s.red)
  }

  const showView = (view: 'main' | 'confirm') => {
    list.hidden = view !== 'main'
    confirm.hidden = view !== 'confirm'
  }

  const askOrRun = (kind: ConfirmKind) => {
    if (deps.getSummary()?.ended) { run(kind); return }
    pending = kind
    confirmText.textContent = CONFIRM_TEXT[kind]
    showView('confirm')
    // «No» por defecto: lo destructivo nunca queda a un Enter de distancia
    focusFirst(confirm, '[data-act="confirm-no"]')
  }

  const run = (kind: ConfirmKind) => {
    close(false)
    if (kind === 'restart') deps.onRestart()
    else deps.onQuit()
  }

  root.addEventListener('click', (e) => {
    if (e.target === root) { close(); return }
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]')
    if (!btn) return
    switch (btn.dataset.act) {
      case 'resume': close(); break
      case 'restart': askOrRun('restart'); break
      case 'quit': askOrRun('quit'); break
      case 'settings': deps.onSettings('general', btn); break
      case 'controls': deps.onSettings('controls', btn); break
      case 'confirm-yes': if (pending) run(pending); break
      case 'confirm-no': back(); break
    }
  })

  const open = () => {
    if (!root.hidden) return
    pending = null
    paintSummary()
    showView('main')
    root.hidden = false
    deps.onVisibilityChange()
    focusFirst(list)
  }

  function close(withSound = true) {
    if (root.hidden) return
    root.hidden = true
    pending = null
    if (withSound) playUiBack()
    deps.onVisibilityChange()
  }

  /** Esc dentro de la pausa: de la confirmación vuelve a la lista; de la lista, cierra. Devuelve si cerró. */
  function back(): boolean {
    if (!confirm.hidden) {
      const from = pending
      pending = null
      showView('main')
      playUiBack()
      focusFirst(list, from ? `[data-act="${from}"]` : '[data-nav]')
      return false
    }
    close()
    return true
  }

  return {
    open,
    close,
    back,
    isOpen: () => !root.hidden,
    root,
  }
}
