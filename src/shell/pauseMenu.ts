import { playUiBack } from '../game/audio/sounds'
import { getLadoHumano, getPartidoExterno, type EquipoExterno } from '../game/externalMatch'
import { focusFirst } from './menuNav'

export type PauseSummary = { mode: 'arcade' | 'classic', period: number, remainingSeconds: number, blue: number, red: number, ended: boolean }

type ConfirmKind = 'restart' | 'quit'

const CONFIRM_TEXT: Record<ConfirmKind, string> = {
  restart: '¿Reiniciar el partido? Se perderá el resultado actual.',
  quit: '¿Salir al menú? Se perderá el partido.',
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** Escudo y nombre de un lado del marcador de la pausa; sin equipo, el lado se oculta. */
function paintSide(side: HTMLElement, team: EquipoExterno | null) {
  side.hidden = !team
  if (!team) return
  const crest = side.querySelector<HTMLImageElement>('.pause-crest')!
  crest.hidden = !team.escudo
  if (team.escudo && crest.src !== team.escudo) crest.src = team.escudo
  const name = side.querySelector<HTMLElement>('.pause-name')!
  name.textContent = team.nombre
  side.title = team.nombre
}

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
      : `${mode} · ${s.period}ª PARTE · ${fmtClock(s.remainingSeconds)}`
    // Con partido externo, el local a la izquierda (como el videomarcador) y cada tanteo con el color de su camiseta
    const partido = getPartidoExterno()
    const localIsBlue = !partido || getLadoHumano() === 'local'
    const left = root.querySelector<HTMLElement>('#pause-left')!
    const right = root.querySelector<HTMLElement>('#pause-right')!
    left.textContent = String(localIsBlue ? s.blue : s.red)
    right.textContent = String(localIsBlue ? s.red : s.blue)
    for (const [el, team] of [[left, partido?.local], [right, partido?.visitante]] as const) {
      el.style.background = team ? hex(team.equipacion.camiseta) : ''
      el.style.color = team ? hex(team.equipacion.dorsal) : ''
    }
    paintSide(root.querySelector<HTMLElement>('#pause-side-left')!, partido?.local ?? null)
    paintSide(root.querySelector<HTMLElement>('#pause-side-right')!, partido?.visitante ?? null)
    root.querySelector('.pause-score')!.setAttribute('aria-label', partido
      ? `Marcador: ${partido.local.nombre} ${left.textContent}, ${partido.visitante.nombre} ${right.textContent}`
      : 'Marcador')
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
