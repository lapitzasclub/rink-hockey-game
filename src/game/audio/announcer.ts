/**
 * Locutor arcade con la Web Speech API del navegador (sin assets).
 *
 * Elige una voz en español si existe, limita la frecuencia de frases y se
 * puede desactivar desde Ajustes (preferencia en localStorage).
 */

import { getVolume } from './sounds'

const STORAGE_KEY = 'rh-announcer'
const MIN_GAP_MS = 1400

let lastSpokeAt = 0
let cachedVoice: SpeechSynthesisVoice | null | undefined

function supported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function isAnnouncerEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setAnnouncerEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sin storage la preferencia solo dura la sesión
  }
  if (!enabled && supported()) window.speechSynthesis.cancel()
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined && cachedVoice !== null) return cachedVoice
  const voices = window.speechSynthesis.getVoices()
  // getVoices puede venir vacío hasta el evento voiceschanged; no cachear null
  if (voices.length === 0) return null
  cachedVoice = voices.find(v => v.lang.toLowerCase().startsWith('es-es'))
    ?? voices.find(v => v.lang.toLowerCase().startsWith('es'))
    ?? null
  return cachedVoice
}

/**
 * Pronuncia una frase. `priority` corta la frase en curso (goles, racha);
 * sin prioridad se descarta si el locutor habló hace poco.
 */
export function announce(text: string, priority = false) {
  if (!supported() || !isAnnouncerEnabled()) return
  const now = performance.now()
  const synth = window.speechSynthesis
  if (!priority && (synth.speaking || now - lastSpokeAt < MIN_GAP_MS)) return
  if (priority) synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice()
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? 'es-ES'
  utterance.rate = 1.18
  utterance.pitch = 1.05
  utterance.volume = getVolume('master')
  synth.speak(utterance)
  lastSpokeAt = now
}

/** Elige una frase al azar de la lista. */
export function announceOneOf(lines: string[], priority = false) {
  announce(lines[Math.floor(Math.random() * lines.length)], priority)
}

export function stopAnnouncer() {
  if (supported()) window.speechSynthesis.cancel()
}
