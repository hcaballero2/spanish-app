// Optional live transcript (PLAN §7.4) through the browser's speech recognition,
// `lang='es-MX'`. Shown to the learner as approximate: it is what the phone
// *thinks* they said. Safari and Chrome expose it as `webkitSpeechRecognition`.

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function transcriptAvailable(): boolean {
  return typeof window !== 'undefined' && !!ctor()
}

/** Starts recognising; `onText` gets the running transcript. Returns a stop function. Never throws. */
export function startTranscript(onText: (text: string) => void, onError?: (reason: string) => void): () => void {
  const C = ctor()
  if (!C) return () => {}
  const r = new C()
  r.lang = 'es-MX'
  r.continuous = true
  r.interimResults = true
  let finalText = ''
  let stopped = false
  r.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!
      if (res.isFinal) finalText += res[0].transcript + ' '
      else interim += res[0].transcript
    }
    onText((finalText + interim).trim())
  }
  r.onerror = (e) => {
    if (e.error !== 'aborted' && e.error !== 'no-speech') onError?.(e.error)
  }
  // Recognition can end on its own after a pause; restart until the caller stops it.
  r.onend = () => {
    if (!stopped) {
      try {
        r.start()
      } catch {
        /* already running or not allowed */
      }
    }
  }
  try {
    r.start()
  } catch {
    onError?.('start')
  }
  return () => {
    stopped = true
    try {
      r.stop()
    } catch {
      /* ignore */
    }
  }
}
