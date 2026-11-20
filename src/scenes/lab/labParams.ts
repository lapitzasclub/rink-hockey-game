/** Parámetros de la URL del laboratorio gráfico (`?lab=<escena>&...`). Solo DEV. */
export interface LabParams {
  scene: string
  mode: 'arcade' | 'classic'
  zoom: number | null
  cx: number | null
  cy: number | null
  /** Tiempo de animación fijo (ms) para poses y público. */
  t: number
  /** ms tras los que se pausa 'match'; null = sin congelar. */
  freeze: number | null
  anim: boolean
  hud: boolean
  strip: string | null
  set: string
  /** Nº de sancionados de demo en la escena officials. */
  pen: number
  /** Partido de humo IA contra IA (WP-64) y ms de juego a medir. */
  auto: boolean
  smokeMs: number
  /** IA contra IA en tiempo real, con render (banco de rendimiento, `tools/perf-bench.mjs`). */
  ai: boolean
  /** WP-66: evento a esperar (goal|foul|card|save|<ms>) y ms de juego extra antes de congelar. */
  at: string | null
  after: number
  /** Objeto que centra la cámara bloqueada al congelar: ball|referee|goalie-blue|goalie-red. */
  follow: string | null
  seed: number | null
  /** B-02: con `auto=1`, una persona simulada (táctil o mando) lleva al controlado del azul. */
  human: 'touch' | 'pad' | null
}

const num = (q: URLSearchParams, key: string): number | null => {
  const raw = q.get(key)
  if (raw === null || raw === '') return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

export function readLabParams(search: string): LabParams {
  const q = new URLSearchParams(search)
  const mode = q.get('mode')
  return {
    scene: q.get('lab') ?? 'rink',
    mode: mode === 'reglamento' || mode === 'classic' ? 'classic' : 'arcade',
    zoom: num(q, 'zoom'),
    cx: num(q, 'cx'),
    cy: num(q, 'cy'),
    t: num(q, 't') ?? 0,
    freeze: num(q, 'freeze'),
    anim: q.get('anim') === '1',
    hud: q.get('hud') !== '0',
    strip: q.get('strip'),
    set: q.get('set') ?? 'field',
    pen: num(q, 'pen') ?? 0,
    auto: q.get('auto') === '1',
    smokeMs: num(q, 'smokeMs') ?? 120000,
    ai: q.get('ai') === '1',
    at: q.get('at') || null,
    after: num(q, 'after') ?? 400,
    follow: q.get('follow'),
    seed: num(q, 'seed'),
    human: q.get('human') === 'touch' ? 'touch' : q.get('human') === 'pad' ? 'pad' : null,
  }
}

/** PRNG con semilla fija: el lab sustituye Math.random para que las capturas sean repetibles. */
export function seedMathRandom(seed = 20260101) {
  let a = seed
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
