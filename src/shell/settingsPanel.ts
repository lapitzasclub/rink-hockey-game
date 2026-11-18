import { isAnnouncerEnabled, setAnnouncerEnabled } from '../game/audio/announcer'
import { getVolume, playUiBack, playUiMove, setVolume, type VolumeChannel } from '../game/audio/sounds'
import { BIND_ACTIONS, getBindings, keyText, labelForEvent, RESERVED_CODES, resetBindings, setBinding, type BindAction } from '../game/input/keyBindings'
import { HALF_REAL_MINUTES_OPTIONS } from '../game/constants'
import { areRoleLabelsEnabled, getHalfRealMinutes, setHalfRealMinutes, setRoleLabelsEnabled } from '../game/ui/prefs'
import { QUALITY_LABEL, QUALITY_PREFS, getQualityPref, onQualityChange, qualityTier, setQualityPref } from '../game/render/quality'
import { focusFirst } from './menuNav'
import { keyGlyph } from './template'

export type SettingsTab = 'general' | 'audio' | 'controls'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)

const setSwitch = (btn: HTMLElement | null, on: boolean) => btn?.setAttribute('aria-checked', String(on))

/** Teclas que no se asignan nunca: las reservadas del shell y Tab (navegación de menús). */
const isReserved = (code: number) => RESERVED_CODES.has(code) || code === 9

/**
 * Panel de ajustes por pestañas (General, Audio, Controles). Incluye la
 * reasignación de teclas: al elegir una casilla, la siguiente tecla pulsada
 * se captura en fase de captura y no llega ni al shell ni a Phaser.
 */
export function createSettingsPanel(deps: { onVisibilityChange: () => void, onToggleFullscreen: () => void, isMatchRunning: () => boolean }) {
  const panel = $<HTMLElement>('#settings-panel')!
  const closeBtn = $<HTMLButtonElement>('#btn-settings-close')!
  const tabs = Array.from(panel.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const panes = Array.from(panel.querySelectorAll<HTMLElement>('[data-pane]'))
  const table = $<HTMLElement>('#bindings-table')!
  const msg = $<HTMLElement>('#bindings-msg')!
  let returnFocus: HTMLElement | null = null
  let capturing: { action: BindAction, slot: 0 | 1 } | null = null

  // ─── Pestañas ──────────────────────────────────────────────────────────────

  const setTab = (tab: SettingsTab, focusTab = false) => {
    for (const t of tabs) {
      const on = t.dataset.tab === tab
      t.setAttribute('aria-selected', String(on))
      t.tabIndex = on ? 0 : -1
      if (on && focusTab) t.focus({ preventScroll: true })
    }
    for (const p of panes) p.hidden = p.dataset.pane !== tab
    cancelCapture()
    msg.textContent = ''
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setTab(t.dataset.tab as SettingsTab))
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
      setTab(next.dataset.tab as SettingsTab, true)
      playUiMove()
    })
  })

  // ─── General y audio ───────────────────────────────────────────────────────

  const fullscreenBtn = $<HTMLButtonElement>('#btn-fullscreen')
  fullscreenBtn?.addEventListener('click', deps.onToggleFullscreen)

  const roleLabelsBtn = $<HTMLButtonElement>('#btn-role-labels')!
  roleLabelsBtn.addEventListener('click', () => {
    setRoleLabelsEnabled(!areRoleLabelsEnabled())
    setSwitch(roleLabelsBtn, areRoleLabelsEnabled())
  })

  // Duración de cada parte: ← → (o clic en las flechas) recorren las opciones
  const halfBtn = $<HTMLButtonElement>('#half-length')!
  const halfValue = $<HTMLElement>('#half-length-value')!
  const halfNote = $<HTMLElement>('#half-length-note')!
  const halfText = (m: number) => (m === 25 ? '25 MIN · REAL' : `${m} MIN`)
  const paintHalf = () => {
    const m = getHalfRealMinutes()
    halfValue.textContent = halfText(m)
    halfBtn.setAttribute('aria-label', `Duración de cada parte: ${m} minutos reales`)
    halfNote.textContent = deps.isMatchRunning()
      ? 'Se aplicará en el próximo partido.'
      : 'Dos partes de 25:00 en el marcador, como en el reglamento; el reloj corre acelerado.'
  }
  const stepHalf = (dir: number, sound = true) => {
    const opts = HALF_REAL_MINUTES_OPTIONS as readonly number[]
    const i = Math.max(0, opts.indexOf(getHalfRealMinutes()))
    const next = opts[Math.min(opts.length - 1, Math.max(0, i + dir))]
    if (next === opts[i]) return
    setHalfRealMinutes(next)
    paintHalf()
    if (sound) playUiMove()
  }
  halfBtn.addEventListener('click', (e) => {
    const arrow = (e.target as HTMLElement).closest<HTMLElement>('[data-step]')
    // El clic ya suena por la navegación de menús
    stepHalf(arrow ? Number(arrow.dataset.step) : 1, false)
  })
  halfBtn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    stepHalf(e.key === 'ArrowLeft' ? -1 : 1)
  })

  // Calidad gráfica: AUTO (según el equipo y bajando sola si no llega), ALTA, MEDIA o BAJA
  const qualityBtn = $<HTMLButtonElement>('#quality')!
  const qualityValue = $<HTMLElement>('#quality-value')!
  const qualityNote = $<HTMLElement>('#quality-note')!
  const paintQuality = () => {
    const pref = getQualityPref()
    qualityValue.textContent = QUALITY_LABEL[pref]
    qualityBtn.setAttribute('aria-label', `Calidad gráfica: ${QUALITY_LABEL[pref]}`)
    const using = pref === 'auto' ? `En uso: ${qualityTier()}. Se ajusta sola al equipo.` : 'Efectos y público según el nivel elegido.'
    qualityNote.textContent = deps.isMatchRunning() ? `${using} La nitidez de la pista cambia en el próximo partido.` : using
  }
  const stepQuality = (dir: number, sound = true) => {
    const i = Math.max(0, QUALITY_PREFS.indexOf(getQualityPref()))
    const next = QUALITY_PREFS[Math.min(QUALITY_PREFS.length - 1, Math.max(0, i + dir))]
    if (next === QUALITY_PREFS[i]) return
    setQualityPref(next)
    paintQuality()
    if (sound) playUiMove()
  }
  qualityBtn.addEventListener('click', (e) => {
    const arrow = (e.target as HTMLElement).closest<HTMLElement>('[data-step]')
    stepQuality(arrow ? Number(arrow.dataset.step) : 1, false)
  })
  qualityBtn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    stepQuality(e.key === 'ArrowLeft' ? -1 : 1)
  })
  onQualityChange(paintQuality)

  const announcerBtn = $<HTMLButtonElement>('#btn-announcer')!
  announcerBtn.addEventListener('click', () => {
    setAnnouncerEnabled(!isAnnouncerEnabled())
    setSwitch(announcerBtn, isAnnouncerEnabled())
  })

  const sliders: [VolumeChannel, string][] = [['master', 'vol-master'], ['sfx', 'vol-sfx'], ['crowd', 'vol-crowd']]
  for (const [channel, id] of sliders) {
    const input = $<HTMLInputElement>(`#${id}`)!
    const out = $<HTMLOutputElement>(`#${id}-value`)!
    const paint = () => {
      out.textContent = `${input.value}%`
      input.style.setProperty('--fill', `${input.value}%`)
    }
    input.value = String(Math.round(getVolume(channel) * 100))
    paint()
    input.addEventListener('input', () => {
      setVolume(channel, Number(input.value) / 100)
      paint()
    })
    // Muestra del nivel al soltar: el público no tiene sonido corto propio, usa el de menú
    input.addEventListener('change', () => playUiMove())
  }

  // ─── Controles ─────────────────────────────────────────────────────────────

  const renderBindings = (focus?: { action: BindAction, slot: 0 | 1 }) => {
    const b = getBindings()
    table.innerHTML = BIND_ACTIONS.map(({ action, label }) => `
      <div class="bind-row">
        <span class="bind-label">${label}</span>
        ${[0, 1].map(slot => {
          const key = b[action][slot]
          return `<button class="bind-slot${key ? '' : ' is-empty'}" data-action="${action}" data-slot="${slot}" data-nav
            aria-label="${label}, tecla ${slot === 0 ? 'principal' : 'alternativa'}: ${key ? keyText(key.label) : 'vacía'}">${key ? keyGlyph(key.label) : ''}</button>`
        }).join('')}
      </div>`).join('')
    if (focus) table.querySelector<HTMLElement>(`[data-action="${focus.action}"][data-slot="${focus.slot}"]`)?.focus({ preventScroll: true })
  }

  const slotButton = (c: { action: BindAction, slot: 0 | 1 }) =>
    table.querySelector<HTMLButtonElement>(`[data-action="${c.action}"][data-slot="${c.slot}"]`)

  function cancelCapture() {
    if (!capturing) return
    const c = capturing
    capturing = null
    renderBindings(c)
  }

  table.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.bind-slot')
    if (!btn) return
    // Doble clic en la misma casilla: cancelar
    if (capturing && slotButton(capturing) === btn) { cancelCapture(); return }
    cancelCapture()
    capturing = { action: btn.dataset.action as BindAction, slot: Number(btn.dataset.slot) as 0 | 1 }
    const fresh = slotButton(capturing)!
    fresh.classList.add('is-listening')
    fresh.textContent = 'Pulsa…'
    fresh.focus({ preventScroll: true })
    msg.textContent = ''
  })

  const actionLabel = (a: BindAction) => BIND_ACTIONS.find(x => x.action === a)!.label

  // Fase de captura en window: llega antes que el Esc del shell y que cualquier otro listener
  window.addEventListener('keydown', (e) => {
    if (!capturing) return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.repeat) return
    const c = capturing
    if (e.key === 'Escape') { cancelCapture(); playUiBack(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const other = getBindings()[c.action][c.slot === 0 ? 1 : 0]
      capturing = null
      if (!other) msg.textContent = 'Cada acción necesita al menos una tecla.'
      else setBinding(c.action, c.slot, null)
      renderBindings(c)
      return
    }
    if (isReserved(e.keyCode)) {
      msg.textContent = `${keyText(labelForEvent(e))} está reservada; elige otra tecla.`
      return
    }
    capturing = null
    const label = labelForEvent(e)
    const name = keyText(label)
    const movedFrom = setBinding(c.action, c.slot, { code: e.keyCode, label })
    if (movedFrom) {
      const left = getBindings()[movedFrom].some(Boolean)
      msg.textContent = left
        ? `${name} se ha quitado de «${actionLabel(movedFrom)}».`
        : `${name} se ha quitado de «${actionLabel(movedFrom)}», que se queda sin tecla.`
    } else {
      msg.textContent = ''
    }
    playUiMove()
    renderBindings(c)
  }, true)

  // Un clic fuera de la casilla que escucha cancela la captura
  panel.addEventListener('pointerdown', (e) => {
    if (capturing && !(e.target as HTMLElement).closest('.bind-slot')) cancelCapture()
  })

  $<HTMLButtonElement>('#btn-bindings-reset')!.addEventListener('click', () => {
    resetBindings()
    renderBindings()
    msg.textContent = 'Teclas restablecidas.'
  })

  // ─── Abrir y cerrar ────────────────────────────────────────────────────────

  const syncToggles = (isFullscreen: boolean) => {
    paintHalf()
    paintQuality()
    setSwitch(fullscreenBtn, isFullscreen)
    setSwitch(roleLabelsBtn, areRoleLabelsEnabled())
    setSwitch(announcerBtn, isAnnouncerEnabled())
  }

  const open = (tab: SettingsTab = 'general', from?: HTMLElement | null) => {
    returnFocus = from ?? (document.activeElement as HTMLElement | null)
    renderBindings()
    paintHalf()
    paintQuality()
    setTab(tab)
    panel.hidden = false
    deps.onVisibilityChange()
    focusFirst(panel, '[role="tab"][aria-selected="true"]')
  }

  const close = () => {
    if (panel.hidden) return
    cancelCapture()
    panel.hidden = true
    playUiBack()
    deps.onVisibilityChange()
    returnFocus?.focus({ preventScroll: true })
    returnFocus = null
  }

  closeBtn.addEventListener('click', close)
  // Cerrar al pulsar el fondo
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close()
  })

  return {
    open,
    close,
    isOpen: () => !panel.hidden,
    syncToggles,
    root: panel,
  }
}
