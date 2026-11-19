import * as Phaser from 'phaser'
import { GAME_HEIGHT } from '../constants'

/**
 * Anclaje del HUD a lo que se ve de verdad (P-06, formato apaisado responsivo).
 *
 * El HUD se dibuja en coordenadas del área de diseño 1280×720, pero con
 * Scale.EXPAND la cámara de UI ve más (pantallas 19,5:9, 4:3…). Cada grupo se
 * desplaza en bloque a su esquina del área visible, respetando las zonas
 * seguras del dispositivo (muesca, barra de gestos). En táctil un grupo puede
 * cambiar de esquina para no quedar debajo del joystick.
 */

export type HudAnchor = 'top-left' | 'bottom-left'
type Movable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform

interface Group {
  anchor: HudAnchor
  /** Ancla y desplazamiento extra (px de diseño) cuando se juega con controles táctiles. */
  touch?: { anchor: HudAnchor, dy: number }
  items: { obj: Movable, x: number, y: number }[]
}

export interface ViewRect { x: number, y: number, width: number, height: number }
export interface Insets { left: number, top: number, right: number, bottom: number }

export class HudLayout {
  private readonly groups: Group[] = []

  /**
   * Registra como grupo los objetos que se añadieron a la escena desde `fromIndex`
   * de la lista de visualización, salvo `exclude` (p. ej. textos centrados).
   */
  capture(scene: Phaser.Scene, fromIndex: number, anchor: HudAnchor, opts: { exclude?: Phaser.GameObjects.GameObject[], touch?: Group['touch'] } = {}) {
    const items = scene.sys.displayList.list.slice(fromIndex)
      .filter(o => !opts.exclude?.includes(o) && 'x' in o && 'y' in o)
      .map(o => { const m = o as Movable; return { obj: m, x: m.x, y: m.y } })
    this.groups.push({ anchor, touch: opts.touch, items })
  }

  /** Recoloca los grupos en `view` (rect visible en coordenadas de UI) con los márgenes seguros. */
  fit(view: ViewRect, insets: Insets, touch: boolean) {
    for (const g of this.groups) {
      const anchor = touch && g.touch ? g.touch.anchor : g.anchor
      const dx = view.x + insets.left
      const dy = (anchor === 'top-left' ? view.y + insets.top : view.y + view.height - GAME_HEIGHT - insets.bottom)
        + (touch && g.touch ? g.touch.dy : 0)
      for (const it of g.items) if (it.obj.active) it.obj.setPosition(it.x + dx, it.y + dy)
    }
  }
}

let probe: HTMLElement | null = null

/**
 * Margen mínimo (px CSS) en pantallas táctiles. Android solo declara en env() la
 * muesca o la cámara, no las esquinas redondeadas ni los bordes curvos: sin este
 * mínimo el marcador quedaba a 3 px del borde y se cortaba. Con él, el marcador
 * queda a la altura del botón de pausa (14 px, style.css).
 */
const TOUCH_EDGE_MIN_CSS = 11
const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Márgenes seguros del dispositivo (env(safe-area-inset-*)) en px CSS, con el mínimo
 * táctil. Se leen de un elemento de prueba porque env() no es accesible desde JS.
 */
export function safeAreaInsetsCss(): Insets {
  if (!probe) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  const min = coarsePointer ? TOUCH_EDGE_MIN_CSS : 0
  const px = (v: string) => Math.max(min, Number.parseFloat(v) || 0)
  return { left: px(cs.paddingLeft), top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom) }
}
