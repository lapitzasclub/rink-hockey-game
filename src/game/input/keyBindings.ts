/**
 * Asignación de teclas del jugador humano, configurable desde Ajustes → Controles.
 *
 * Cada acción admite dos teclas (principal y alternativa). Se guardan como
 * keyCode porque es lo que usa el teclado de Phaser, con la etiqueta que se
 * muestra en la UI. Persisten en localStorage (`rh-keys`); MatchScene se
 * suscribe y recrea sus Key al cambiar.
 */

export type BindAction = 'up' | 'down' | 'left' | 'right' | 'sprint' | 'shoot' | 'pass'

export type KeyBind = { code: number, label: string }

export type Bindings = Record<BindAction, [KeyBind | null, KeyBind | null]>

export const BIND_ACTIONS: { action: BindAction, label: string }[] = [
  { action: 'up', label: 'Arriba' },
  { action: 'down', label: 'Abajo' },
  { action: 'left', label: 'Izquierda' },
  { action: 'right', label: 'Derecha' },
  { action: 'sprint', label: 'Sprint / turbo' },
  { action: 'shoot', label: 'Tiro · robo' },
  { action: 'pass', label: 'Pase · cambio' },
]

/** Teclas que el shell usa siempre (pausa y pantalla completa): no se pueden asignar. */
export const RESERVED_CODES = new Set([27, 70])

const STORAGE_KEY = 'rh-keys'

const k = (code: number, label: string): KeyBind => ({ code, label })

export const DEFAULT_BINDINGS: Bindings = {
  up: [k(87, 'W'), k(38, 'ArrowUp')],
  down: [k(83, 'S'), k(40, 'ArrowDown')],
  left: [k(65, 'A'), k(37, 'ArrowLeft')],
  right: [k(68, 'D'), k(39, 'ArrowRight')],
  sprint: [k(16, 'Shift'), null],
  shoot: [k(85, 'U'), null],
  pass: [k(89, 'Y'), null],
}

const NAMED: Record<string, string> = {
  ' ': 'Espacio', Control: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Enter: 'Enter', Tab: 'Tab', Backspace: 'Retroceso',
}

/**
 * Etiqueta corta de una tecla pulsada. Las flechas se guardan como su nombre
 * (`ArrowUp`…): la UI las pinta como icono y los textos las nombran (ver `keyText`).
 */
export function labelForEvent(e: KeyboardEvent): string {
  if (NAMED[e.key]) return NAMED[e.key]
  if (e.code.startsWith('Numpad')) return `Num ${e.code.slice(6)}`
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

function clone(b: Bindings): Bindings {
  return JSON.parse(JSON.stringify(b)) as Bindings
}

function load(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return clone(DEFAULT_BINDINGS)
    const parsed = JSON.parse(raw) as Partial<Bindings>
    const out = clone(DEFAULT_BINDINGS)
    for (const { action } of BIND_ACTIONS) {
      const slots = parsed[action]
      if (Array.isArray(slots) && slots.length === 2) out[action] = slots
    }
    // Versiones de prueba guardaban las flechas como caracteres: se pasan a nombre
    const legacy: Record<string, string> = { '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight', '⌫': 'Retroceso' }
    for (const slots of Object.values(out)) for (const b of slots) if (b && legacy[b.label]) b.label = legacy[b.label]
    return out
  } catch {
    return clone(DEFAULT_BINDINGS)
  }
}

let current = load()
const listeners = new Set<() => void>()

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // sin almacenamiento: la asignación solo dura la sesión
  }
  listeners.forEach(fn => fn())
}

export function getBindings(): Bindings {
  return current
}

/** Teclas asignadas a una acción, sin huecos. */
export function codesFor(action: BindAction): number[] {
  return current[action].filter((b): b is KeyBind => !!b).map(b => b.code)
}

const ARROW_WORDS: Record<string, string> = { ArrowUp: 'flecha arriba', ArrowDown: 'flecha abajo', ArrowLeft: 'flecha izquierda', ArrowRight: 'flecha derecha' }

/** Nombre de una etiqueta para textos corridos («Pulsa U…»): las flechas, en palabras. */
export function keyText(label: string): string {
  return ARROW_WORDS[label] ?? label
}

/** Etiqueta principal de una acción para textos de ayuda («Pulsa U…»). */
export function primaryLabel(action: BindAction): string {
  const [a, b] = current[action]
  const label = (a ?? b)?.label
  return label ? keyText(label) : 'sin tecla'
}

/**
 * Asigna una tecla a un hueco. Si la tecla ya estaba en otra acción, se
 * quita de allí (intercambio simple, como en la mayoría de juegos).
 * Devuelve la acción de la que se quitó, para avisar en la UI.
 */
export function setBinding(action: BindAction, slot: 0 | 1, bind: KeyBind | null): BindAction | null {
  let movedFrom: BindAction | null = null
  if (bind) {
    for (const { action: other } of BIND_ACTIONS) {
      current[other] = current[other].map((b, i) => {
        if (b && b.code === bind.code && !(other === action && i === slot)) {
          if (other !== action) movedFrom = other
          return null
        }
        return b
      }) as [KeyBind | null, KeyBind | null]
    }
  }
  current[action][slot] = bind
  commit()
  return movedFrom
}

export function resetBindings() {
  current = clone(DEFAULT_BINDINGS)
  commit()
}

export function onBindingsChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
