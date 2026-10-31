import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Item, Settings } from '../../db/types'
import { speakSegment, ttsAvailable } from '../../lib/tts'
import { recordingAvailable } from '../../lib/recorder'
import { transcriptAvailable } from '../../lib/transcribe'
import { useRecorder } from '../../lib/useRecorder'
import { MONOLOGUE_KEY, saveRecording, useRecordingUrls } from '../../lib/recordings'
import { markItemDone } from '../../lib/progress'
import { formatClock } from '../../lib/sessions'
import TopBar from '../../components/TopBar'
import Timer from '../../components/Timer'
import LevelBadge from '../../components/LevelBadge'
import DoneButton from '../../components/DoneButton'
import SelfRating from '../../components/SelfRating'
import AddWord from '../../components/AddWord'

const MONOLOGUE_TARGET_S = 60
const SHADOW_MAX_MS = 8000
const TRANSCRIPT_PREF = 'speakTranscript'

const MODE_LABEL = { monologue: 'Monólogo', dialogue: 'Diálogo', shadow: 'Sombra' } as const

interface ModeProps {
  item: Item
  settings: Settings
  urls: Map<string, string>
  withTranscript: boolean
  say: (text: string, onEnd?: () => void) => void
}

/** Speaking (PLAN §7.4): monologue, scripted dialogue or shadowing, recorded and played back. */
export default function SpeakingScreen() {
  const { itemId = '' } = useParams()
  // Keyed so moving between items starts with fresh state.
  return <SpeakingItem key={itemId} itemId={itemId} />
}

function SpeakingItem({ itemId }: { itemId: string }) {
  const navigate = useNavigate()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  const progress = useLiveQuery(() => db.itemProgress.get(itemId), [itemId])
  const settings = useLiveQuery(() => db.settings.get(1))
  const urls = useRecordingUrls(itemId)
  const [toast, setToast] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [withTranscript, setWithTranscript] = useState(() => {
    try {
      return localStorage.getItem(TRANSCRIPT_PREF) === '1'
    } catch {
      return false
    }
  })
  const cancelSpeech = useRef<() => void>(() => {})

  useEffect(() => () => cancelSpeech.current(), [])

  if (!item || !settings || !urls) return <main className="p-5 text-muted">Cargando…</main>
  const mode = item.mode ?? 'monologue'

  const say = (text: string, onEnd?: () => void) => {
    setTtsError(null)
    cancelSpeech.current()
    cancelSpeech.current = speakSegment(
      text,
      { rate: settings.ttsRate, voiceURI: settings.ttsVoiceURI },
      {
        onEnd,
        onError: () => {
          setTtsError('No se pudo reproducir la voz. En iPhone: Ajustes › Accesibilidad › Contenido hablado › Voces › Español.')
          onEnd?.()
        },
      },
    )
  }

  const toggleTranscript = (on: boolean) => {
    setWithTranscript(on)
    try {
      localStorage.setItem(TRANSCRIPT_PREF, on ? '1' : '0')
    } catch {
      /* per-device convenience only */
    }
  }

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1500)
  }

  const turns = item.partnerLines?.length ?? 0
  const attempted =
    mode === 'dialogue' ? turns > 0 && Array.from({ length: turns }, (_, i) => urls.has(`turn-${i}`)).every(Boolean) : urls.size > 0
  const props: ModeProps = { item, settings, urls, withTranscript, say }
  const exampleTexts = [item.prompt ?? '', item.modelAnswer ?? '', ...(item.partnerLines ?? []), ...(item.segments ?? []).map((s) => s.es)]

  return (
    <>
      <TopBar
        title={item.title}
        back={`/theme/${item.themeId}`}
        right={
          <>
            <Timer skill="speaking" itemId={item.id} />
            <LevelBadge level={item.level} stretch={item.stretch} />
          </>
        }
      />
      <main className="mx-auto max-w-md px-5 pb-32 pt-5">
        <p className="text-xs uppercase tracking-wide text-muted">
          {MODE_LABEL[mode]} · {item.estimatedMinutes} min
        </p>
        <p className="mt-2 text-[17px] leading-relaxed">{item.prompt}</p>

        {!recordingAvailable() && <p className="mt-4 rounded-xl bg-accent-soft p-3 text-sm text-accent">Este navegador no permite grabar.</p>}
        {ttsError && <p className="mt-4 rounded-xl bg-accent-soft p-3 text-sm text-accent">{ttsError}</p>}

        {transcriptAvailable() && mode !== 'shadow' && (
          <label className="mt-4 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={withTranscript} onChange={(e) => toggleTranscript(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
            Mostrar lo que entiende el teléfono (aproximado)
          </label>
        )}

        {mode === 'monologue' && <Monologue {...props} />}
        {mode === 'dialogue' && <Dialogue {...props} />}
        {mode === 'shadow' && <Shadow {...props} />}

        {attempted && <SelfRating itemId={item.id} value={progress?.selfRating} />}

        <AddWord itemId={item.id} themeId={item.themeId} texts={exampleTexts} onSaved={(w) => flash(`«${w}» guardada`)} />

        <DoneButton
          done={progress?.status === 'done'}
          onClick={() => {
            cancelSpeech.current()
            void markItemDone(item.id, item.themeId).then(() => navigate(`/theme/${item.themeId}`))
          }}
        />
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center">
          <span className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow">{toast}</span>
        </div>
      )}
    </>
  )
}

function Transcript({ text }: { text: string }) {
  if (!text) return null
  return (
    <p className="mt-3 rounded-xl border border-dashed border-line p-3 text-sm">
      <span className="block text-xs text-muted">El teléfono entendió (aproximado):</span>
      {text}
    </p>
  )
}

function RecordButton({ rec, idleLabel, disabled }: { rec: ReturnType<typeof useRecorder>; idleLabel: string; disabled?: boolean }) {
  return rec.recording ? (
    <button type="button" onClick={() => void rec.stop()} className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-on-accent">
      ● Grabando {formatClock(rec.elapsed)} · toca para terminar
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void rec.start()}
      disabled={disabled || !recordingAvailable()}
      className="w-full rounded-xl bg-accent-soft px-4 py-3 font-medium text-accent disabled:opacity-50"
    >
      {idleLabel}
    </button>
  )
}

/** Your take next to one possible model, so you can hear the difference right away. */
function Compare({ url, model, say, label = 'Tu respuesta' }: { url?: string; model?: string; say: (text: string) => void; label?: string }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {url && (
        <div>
          <p className="mb-1 text-xs text-muted">▶ {label}</p>
          <audio controls src={url} className="w-full" aria-label={label} />
        </div>
      )}
      {model && (
        <div className="border-l-2 border-accent pl-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Una respuesta posible (no la única)</span>
            <button type="button" onClick={() => say(model)} className="shrink-0 text-sm text-accent">
              🔊 Modelo
            </button>
          </div>
          <p className="mt-1 font-reading text-[17px] leading-snug text-reading">{model}</p>
        </div>
      )}
    </div>
  )
}

function Monologue({ item, urls, withTranscript, say }: ModeProps) {
  const [lastTranscript, setLastTranscript] = useState('')
  const rec = useRecorder({
    withTranscript,
    onBlob: async (blob, transcript) => {
      setLastTranscript(transcript)
      await saveRecording(item.id, undefined, blob)
    },
  })
  const url = urls.get(MONOLOGUE_KEY)
  const pct = Math.min(100, (rec.elapsed / MONOLOGUE_TARGET_S) * 100)

  return (
    <section className="mt-5 rounded-2xl border border-line bg-card p-4">
      {rec.recording && (
        <div className="mb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={rec.elapsed} aria-valuemax={MONOLOGUE_TARGET_S}>
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{rec.elapsed >= MONOLOGUE_TARGET_S ? '✓ Ya pasaste el minuto; sigue si quieres.' : `Meta: ${MONOLOGUE_TARGET_S} s o más`}</p>
        </div>
      )}
      <RecordButton rec={rec} idleLabel={url ? '🎤 Grabar otra vez' : '🎤 Empezar a hablar'} />
      {rec.error && <p className="mt-2 text-sm text-accent">{rec.error}</p>}
      {rec.recording ? <Transcript text={rec.transcript} /> : <Transcript text={lastTranscript} />}
      {url && !rec.recording && <Compare url={url} model={item.modelAnswer} say={say} label="Tu grabación" />}
    </section>
  )
}

function Dialogue({ item, urls, withTranscript, say }: ModeProps) {
  const lines = item.partnerLines ?? []
  // modelAnswer holds one reply per partner line, separated by " / ".
  const replies = (item.modelAnswer ?? '').split(/\s*\/\s*/)
  const firstMissing = lines.findIndex((_, i) => !urls.has(`turn-${i}`))
  // Resume where the learner left off; a finished dialogue shows every turn.
  const [turn, setTurn] = useState(firstMissing < 0 ? lines.length : firstMissing)
  const [started, setStarted] = useState(firstMissing > 0)
  // The turn replied to in this run: show the comparison and wait for "Siguiente". Holding the
  // turn number (not a flag) keeps a late save from an "Otra vez" from marking the next turn.
  const [answeredTurn, setAnsweredTurn] = useState<number | null>(null)
  const [transcripts, setTranscripts] = useState<Record<number, string>>({})
  const turnRef = useRef(turn)
  turnRef.current = turn

  const rec = useRecorder({
    withTranscript,
    onBlob: async (blob, transcript) => {
      const t = turnRef.current
      setTranscripts((m) => ({ ...m, [t]: transcript }))
      await saveRecording(item.id, `turn-${t}`, blob)
      setAnsweredTurn(t)
    },
  })

  const begin = () => {
    setStarted(true)
    setAnsweredTurn(null)
    setTurn(0)
    say(lines[0]!)
  }

  const next = () => {
    const n = turn + 1
    setTurn(n)
    if (n < lines.length) say(lines[n]!)
  }

  const finished = turn >= lines.length
  const last = turn === lines.length - 1
  const answered = answeredTurn === turn

  return (
    <section className="mt-5">
      {!started && !finished ? (
        <button type="button" onClick={begin} disabled={!ttsAvailable()} className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-on-accent disabled:opacity-50">
          ▶ Empezar diálogo ({lines.length} turnos)
        </button>
      ) : (
        <ol className="flex flex-col gap-4">
          {lines.slice(0, Math.min(turn + 1, lines.length)).map((line, i) => {
            const url = urls.get(`turn-${i}`)
            const current = i === turn && !finished
            return (
              <li key={i} className="flex flex-col gap-2">
                <div className="flex items-start gap-2 self-start rounded-2xl rounded-tl-sm border border-line bg-card px-3 py-2">
                  <p className="font-reading text-[17px] leading-snug text-reading">{line}</p>
                  <button type="button" onClick={() => say(line)} aria-label={`Escuchar turno ${i + 1}`} className="shrink-0 text-accent">
                    🔊
                  </button>
                </div>
                {current && !answered ? (
                  <div className="self-stretch">
                    <RecordButton rec={rec} idleLabel="🎤 Responder" />
                    {rec.recording && <Transcript text={rec.transcript} />}
                  </div>
                ) : (
                  url && (
                    <div className="self-stretch pl-6">
                      {!(current && rec.recording) && <Compare url={url} model={replies[i]} say={say} label={`Tu respuesta ${i + 1}`} />}
                      <Transcript text={current && rec.recording ? rec.transcript : (transcripts[i] ?? '')} />
                      {current && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className={rec.recording ? 'col-span-2' : ''}>
                            <RecordButton rec={rec} idleLabel="🎤 Otra vez" />
                          </div>
                          {!rec.recording && (
                            <button type="button" onClick={next} className="rounded-xl bg-accent px-4 py-3 font-medium text-on-accent">
                              {last ? 'Terminar ✓' : 'Siguiente ▶'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                )}
              </li>
            )
          })}
        </ol>
      )}
      {rec.error && <p className="mt-2 text-sm text-accent">{rec.error}</p>}
      {finished && (
        <button type="button" onClick={begin} className="mt-3 w-full rounded-xl border border-line px-4 py-2.5 text-sm">
          ↺ Repetir el diálogo
        </button>
      )}
    </section>
  )
}

function Shadow({ item, urls, say }: ModeProps) {
  const segments = item.segments ?? []
  const [active, setActive] = useState<{ id: string; phase: 'listening' | 'recording' } | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  const rec = useRecorder({
    maxMs: SHADOW_MAX_MS,
    onBlob: async (blob) => {
      const id = activeRef.current?.id
      setActive(null)
      if (id) await saveRecording(item.id, id, blob)
    },
  })

  const go = (id: string, es: string) => {
    if (rec.recording) return
    // Update the ref now too: a voice failure can call back before the next render.
    activeRef.current = { id, phase: 'listening' }
    setActive(activeRef.current)
    say(es, () => {
      if (activeRef.current?.id !== id) return
      setActive({ id, phase: 'recording' })
      void rec.start().then((ok) => !ok && setActive(null))
    })
  }

  return (
    <ol className="mt-5 flex flex-col gap-3">
      {segments.map((s, i) => {
        const url = urls.get(s.id)
        const mine = active?.id === s.id
        return (
          <li key={s.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-reading text-[18px] leading-snug text-reading">
              <span className="mr-2 font-sans text-xs text-muted">{i + 1}</span>
              {s.es}
            </p>
            {s.en && <p className="mt-1 text-sm text-muted">{s.en}</p>}
            <div className="mt-3">
              {mine && active.phase === 'listening' && <p className="py-2 text-center text-sm text-accent">Escucha…</p>}
              {mine && active.phase === 'recording' && rec.recording && <RecordButton rec={rec} idleLabel="" />}
              {!mine && (
                <button
                  type="button"
                  onClick={() => go(s.id, s.es)}
                  disabled={!!active || !ttsAvailable() || !recordingAvailable()}
                  className="w-full rounded-xl bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent disabled:opacity-50"
                >
                  🎤 {url ? 'Otra vez' : 'Escuchar y repetir'}
                </button>
              )}
              {url && !mine && (
                <div className="mt-2 flex items-center gap-2">
                  <audio controls src={url} className="min-w-0 flex-1" aria-label={`Tu voz ${i + 1}`} />
                  <button type="button" onClick={() => say(s.es)} className="shrink-0 text-sm text-accent">
                    🔊 Original
                  </button>
                </div>
              )}
            </div>
          </li>
        )
      })}
      {rec.error && <p className="text-sm text-accent">{rec.error}</p>}
    </ol>
  )
}
