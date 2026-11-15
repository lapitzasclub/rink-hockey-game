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
