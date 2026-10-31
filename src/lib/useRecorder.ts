import { useEffect, useRef, useState } from 'react'
import { startRecording, type ActiveRecording } from './recorder'
import { startTranscript } from './transcribe'
import { noteActivity } from './sessions'

export interface RecorderState {
  recording: boolean
  /** Whole seconds since the current recording started. */
  elapsed: number
  /** Live approximate transcript while `withTranscript` is on. */
  transcript: string
  error: string | null
  /** Resolves false when the microphone could not be opened. */
  start: () => Promise<boolean>
  stop: () => Promise<void>
}

/** One microphone recording at a time, with an elapsed clock and an optional live transcript. */
export function useRecorder(opts: {
  maxMs?: number
  withTranscript?: boolean
  /** Receives the audio whenever a recording ends, by tap or by `maxMs`. */
  onBlob: (blob: Blob, transcript: string) => void | Promise<void>
}): RecorderState {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<ActiveRecording | null>(null)
  const stopTranscript = useRef<() => void>(() => {})
  const tick = useRef<number | null>(null)
  const limit = useRef<number | null>(null)
  const latest = useRef({ onBlob: opts.onBlob, transcript: '' })
  latest.current.onBlob = opts.onBlob

  const clearTimers = () => {
    if (tick.current) window.clearInterval(tick.current)
    if (limit.current) window.clearTimeout(limit.current)
    tick.current = limit.current = null
  }

  const stop = async (): Promise<void> => {
    clearTimers()
    stopTranscript.current()
    stopTranscript.current = () => {}
    const r = rec.current
    rec.current = null
    setRecording(false)
    noteActivity()
    if (!r) return
    const blob = await r.stop()
    await latest.current.onBlob(blob, latest.current.transcript)
  }

  const start = async (): Promise<boolean> => {
    if (rec.current) return true
    setError(null)
    setTranscript('')
    latest.current.transcript = ''
    try {
      rec.current = await startRecording()
    } catch {
      setError('No hay acceso al micrófono')
      return false
    }
    const t0 = Date.now()
    setElapsed(0)
    setRecording(true)
    noteActivity()
    // Talking without touching the screen still counts as study time.
    tick.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000))
      noteActivity()
    }, 1000)
    if (opts.maxMs) limit.current = window.setTimeout(() => void stop(), opts.maxMs)
    if (opts.withTranscript) stopTranscript.current = startTranscript((t) => {
        latest.current.transcript = t
        setTranscript(t)
      })
    return true
  }

  useEffect(
    () => () => {
      clearTimers()
      stopTranscript.current()
      void rec.current?.stop()
    },
    [],
  )

  return { recording, elapsed, transcript, error, start, stop }
}
