let ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Genera un tono oscilante con envolvente de ataque/caída. */
function tone(
  freq: number,
  endFreq: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = 'sine',
  startOffset = 0,
): void {
  const c = ac()
  const t = c.currentTime + startOffset
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.connect(g)
  g.connect(c.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gainPeak, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.start(t)
  osc.stop(t + duration + 0.01)
}

export function playPass(): void {
  tone(380, 190, 0.09, 0.28, 'triangle')
}

export function playShot(): void {
  tone(200, 80, 0.14, 0.6, 'sawtooth')
}

/** Recepción suave al controlar la bola. */
export function playPickup(): void {
  tone(520, 420, 0.05, 0.12, 'sine')
}

/** Parada o despeje del portero. */
export function playSave(): void {
  tone(160, 80, 0.11, 0.5, 'triangle')
}

export function playSteal(): void {
  tone(280, 140, 0.08, 0.4, 'triangle')
}

/** Silbato de inicio o reanudación de juego. */
export function playWhistle(): void {
  tone(2680, 2620, 0.38, 0.18, 'sine', 0)
  tone(2720, 2660, 0.38, 0.16, 'sine', 0.004)
}

/** Dos pitidos cortos de falta. */
export function playFoul(): void {
  tone(2750, 2600, 0.16, 0.35, 'sine', 0)
  tone(2750, 2600, 0.12, 0.35, 'sine', 0.26)
}

/** Fanfarria ascendente de gol: C5–E5–G5–C6. */
export function playGoal(): void {
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => tone(freq, freq, 0.2, 0.38, 'sine', i * 0.13))
}
