let ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// ─── Volumen ─────────────────────────────────────────────────────────────────
// Todo pasa por dos buses (efectos y público) que cuelgan del general. Los
// niveles (0..1) se guardan en localStorage y se ajustan desde Ajustes → Audio.

export type VolumeChannel = 'master' | 'sfx' | 'crowd'

const VOLUME_KEY = 'rh-volume'
const DEFAULT_VOLUME: Record<VolumeChannel, number> = { master: 0.8, sfx: 1, crowd: 0.8 }

function loadVolumes(): Record<VolumeChannel, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '{}') as Partial<Record<VolumeChannel, number>>
    const out = { ...DEFAULT_VOLUME }
    for (const ch of Object.keys(out) as VolumeChannel[]) {
      const v = parsed[ch]
      if (typeof v === 'number' && v >= 0 && v <= 1) out[ch] = v
    }
    return out
  } catch {
    return { ...DEFAULT_VOLUME }
  }
}

const volumes = loadVolumes()
let buses: Record<VolumeChannel, GainNode> | null = null

function bus(c: AudioContext, channel: 'sfx' | 'crowd'): GainNode {
  if (!buses) {
    const master = c.createGain()
    master.connect(c.destination)
    const sfx = c.createGain()
    const crowd = c.createGain()
    sfx.connect(master)
    crowd.connect(master)
    buses = { master, sfx, crowd }
    for (const ch of Object.keys(buses) as VolumeChannel[]) buses[ch].gain.value = volumes[ch]
  }
  return buses[channel]
}

export function getVolume(channel: VolumeChannel): number {
  return volumes[channel]
}

export function setVolume(channel: VolumeChannel, value: number) {
  volumes[channel] = Math.max(0, Math.min(1, value))
  if (buses && ctx) buses[channel].gain.setTargetAtTime(volumes[channel], ctx.currentTime, 0.03)
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes))
  } catch {
    // sin almacenamiento: el volumen solo dura la sesión
  }
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
  g.connect(bus(c, 'sfx'))
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

// ─── Arcade ─────────────────────────────────────────────────────────────────

let noiseBuffer: AudioBuffer | null = null

/** Buffer de ruido blanco compartido (2 s) para golpes, siseos y público. */
function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer
  noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return noiseBuffer
}

/** Ráfaga de ruido filtrado con barrido de frecuencia. */
function noiseBurst(
  duration: number,
  gainPeak: number,
  filterType: BiquadFilterType,
  freq: number,
  endFreq = freq,
  startOffset = 0,
  attack = 0.005,
): void {
  const c = ac()
  const t = c.currentTime + startOffset
  const src = c.createBufferSource()
  src.buffer = getNoise(c)
  const filter = c.createBiquadFilter()
  filter.type = filterType
  filter.frequency.setValueAtTime(freq, t)
  if (endFreq !== freq) filter.frequency.exponentialRampToValueAtTime(endFreq, t + duration)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gainPeak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.001, t + duration)
  src.connect(filter)
  filter.connect(g)
  g.connect(bus(c, 'sfx'))
  src.start(t, Math.random() * 1.2)
  src.stop(t + duration + 0.02)
}

/** Golpe seco de carga contra el cuerpo / la valla. */
export function playCheck(): void {
  tone(120, 45, 0.22, 0.7, 'sine')
  noiseBurst(0.16, 0.5, 'lowpass', 900, 200)
}

/** Arpegio brillante al recoger un powerup. */
export function playPowerup(): void {
  const notes = [660, 880, 1175, 1568]
  notes.forEach((freq, i) => tone(freq, freq * 1.01, 0.12, 0.2, 'square', i * 0.055))
}

/** Silbido de tiro turbo. */
export function playTurboShot(): void {
  tone(260, 70, 0.22, 0.55, 'sawtooth')
  noiseBurst(0.28, 0.35, 'bandpass', 2400, 600)
}

/** Rugido de bola de fuego. */
export function playFireShot(): void {
  tone(180, 50, 0.4, 0.6, 'sawtooth')
  tone(90, 40, 0.5, 0.5, 'square', 0.02)
  noiseBurst(0.55, 0.55, 'lowpass', 3200, 300)
}

/** Brillo cristalino al congelar rivales. */
export function playFreeze(): void {
  ;[1760, 2349, 2794, 3520].forEach((freq, i) => tone(freq, freq * 0.98, 0.3, 0.09, 'triangle', i * 0.04))
  noiseBurst(0.5, 0.18, 'highpass', 5000, 8000)
}

/** Ovación del público tras gol, más intensa cuanto mayor `intensity` (0..1). */
export function playCrowdRoar(intensity = 0.6): void {
  noiseBurst(2.2, 0.22 + intensity * 0.25, 'bandpass', 900, 600, 0, 0.18)
  noiseBurst(1.6, 0.12 + intensity * 0.12, 'bandpass', 1800, 1200, 0.05, 0.12)
}

/** Fanfarria de "en racha". */
export function playOnFire(): void {
  const notes = [523, 659, 784, 1047, 1319]
  notes.forEach((freq, i) => tone(freq, freq, 0.16, 0.26, 'sawtooth', i * 0.07))
}

/**
 * Murmullo continuo del público con intensidad variable.
 * Devuelve un controlador para ajustar el volumen y pararlo al salir de la escena.
 */
export function startCrowdAmbience(): { setIntensity(v: number): void, stop(): void } {
  let c: AudioContext
  try {
    c = ac()
  } catch {
    return { setIntensity: () => {}, stop: () => {} }
  }
  const src = c.createBufferSource()
  src.buffer = getNoise(c)
  src.loop = true
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 700
  filter.Q.value = 0.6
  const g = c.createGain()
  g.gain.value = 0
  src.connect(filter)
  filter.connect(g)
  g.connect(bus(c, 'crowd'))
  src.start()
  let stopped = false
  return {
    setIntensity(v: number) {
      if (stopped) return
      // v < 0 silencia (partido en pausa)
      const level = v < 0 ? 0 : 0.015 + Math.min(1, v) * 0.06
      g.gain.setTargetAtTime(level, c.currentTime, 0.4)
      if (v >= 0) filter.frequency.setTargetAtTime(600 + v * 500, c.currentTime, 0.4)
    },
    stop() {
      if (stopped) return
      stopped = true
      g.gain.setTargetAtTime(0, c.currentTime, 0.1)
      src.stop(c.currentTime + 0.5)
    },
  }
}

/** Navegación de menú: clic corto y seco. */
export function playUiMove(): void {
  tone(880, 660, 0.05, 0.12, 'square')
}

/** Confirmación de menú: arpegio ascendente. */
export function playUiConfirm(): void {
  tone(523, 523, 0.09, 0.18, 'square')
  tone(659, 659, 0.09, 0.18, 'square', 0.07)
  tone(988, 1320, 0.22, 0.2, 'triangle', 0.14)
}

/** Golpe grave del logo al aparecer en el menú. */
export function playUiThump(): void {
  tone(140, 45, 0.28, 0.5, 'sine')
  tone(2400, 900, 0.05, 0.05, 'triangle')
}

/** Volver / cerrar en menús: dos notas descendentes. */
export function playUiBack(): void {
  tone(660, 660, 0.06, 0.12, 'square')
  tone(440, 330, 0.09, 0.12, 'square', 0.05)
}
