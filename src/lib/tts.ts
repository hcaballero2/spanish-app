// Text-to-speech via the browser's SpeechSynthesis (free, offline on iOS once
// a Spanish voice is installed). iOS only speaks in response to a user tap and
// delivers the voice list asynchronously through `voiceschanged` (PLAN §4).

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
