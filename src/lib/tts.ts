// Text-to-speech via the browser's SpeechSynthesis (free, offline on iOS once
// a Spanish voice is installed). iOS only speaks in response to a user tap and
// delivers the voice list asynchronously through `voiceschanged` (PLAN §4).

import { noteActivity } from './sessions'

let voices: SpeechSynthesisVoice[] = []

function loadVoices(): void {
  voices = window.speechSynthesis.getVoices()
}

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

if (ttsAvailable()) {
  loadVoices()
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
}

export function spanishVoices(): SpeechSynthesisVoice[] {
  if (voices.length === 0 && ttsAvailable()) loadVoices()
  return voices.filter((v) => v.lang.toLowerCase().startsWith('es'))
}

/** Preferred voice: the saved one, else es-MX, else any Spanish voice. */
export function pickVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  const es = spanishVoices()
  if (voiceURI) {
    const saved = es.find((v) => v.voiceURI === voiceURI)
    if (saved) return saved
  }
  return es.find((v) => v.lang.toLowerCase() === 'es-mx') ?? es[0]
}

export function speak(text: string, opts: { rate?: number; voiceURI?: string } = {}): void {
  if (!ttsAvailable()) return
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'es-MX'
  u.rate = opts.rate ?? 0.9
  const voice = pickVoice(opts.voiceURI)
  if (voice) u.voice = voice
  synth.speak(u)
}

export const RATE_MIN = 0.7
export const RATE_MAX = 1.2
export const RATE_STEPS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2]

export interface SpeakHandlers {
  onStart?: () => void
  onEnd?: () => void
  /** Called when the utterance fails or never starts (no Spanish voice, for example). */
  onError?: (reason: string) => void
}

/**
 * Speaks one segment and reports start/end. Returns a cancel function.
 * iOS fires neither `onend` nor `onerror` reliably after `cancel()`, so the
 * caller is told nothing once it cancels. If nothing has started after
 * `startTimeoutMs`, `onError('no-start')` fires (typically: no voice installed).
 */
export function speakSegment(
  text: string,
  opts: { rate?: number; voiceURI?: string; startTimeoutMs?: number } = {},
  handlers: SpeakHandlers = {},
): () => void {
  if (!ttsAvailable()) {
    handlers.onError?.('unavailable')
    return () => {}
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'es-MX'
  u.rate = opts.rate ?? 0.9
  const voice = pickVoice(opts.voiceURI)
  if (voice) u.voice = voice

  let alive = true
  let started = false
  const timer = window.setTimeout(() => {
    if (alive && !started) {
      alive = false
      synth.cancel()
      handlers.onError?.('no-start')
    }
  }, opts.startTimeoutMs ?? 4000)

  u.onstart = () => {
    started = true
    noteActivity()
    if (alive) handlers.onStart?.()
  }
  u.onend = () => {
    window.clearTimeout(timer)
    noteActivity()
    if (alive) {
      alive = false
      handlers.onEnd?.()
    }
  }
  u.onerror = (e) => {
    window.clearTimeout(timer)
    if (!alive) return
    alive = false
    if (e.error === 'interrupted' || e.error === 'canceled') return
    handlers.onError?.(e.error)
  }
  synth.speak(u)
  return () => {
    alive = false
    window.clearTimeout(timer)
    synth.cancel()
  }
}
