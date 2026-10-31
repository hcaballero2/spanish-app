import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updateSettings } from '../../db/db'
import type { Segment } from '../../db/types'
import { cardsByKey, deleteCard, saveCard, updateCardMeaning } from '../../lib/cards'
import { RATE_STEPS, speakSegment, ttsAvailable } from '../../lib/tts'
import { recordingAvailable, startRecording, type ActiveRecording } from '../../lib/recorder'
import { markItemDone } from '../../lib/progress'
import TappableText, { type Selection } from '../../components/TappableText'
import LookupSheet from '../../components/LookupSheet'
import TopBar from '../../components/TopBar'
import Timer from '../../components/Timer'
import LevelBadge from '../../components/LevelBadge'
import GlossToggle from '../../components/GlossToggle'
import Comprehension from '../../components/Comprehension'
import DoneButton from '../../components/DoneButton'

const SHADOW_MAX_MS = 8000

type Shadow =
  | { phase: 'idle' }
  | { phase: 'listening' }
  | { phase: 'recording' }
  | { phase: 'done'; url: string; segmentId: string }

/** Listening (PLAN §7.3): TTS plays the transcript sentence by sentence with synced captions. */
export default function ListeningScreen() {
  const { itemId = '' } = useParams()
  const navigate = useNavigate()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  const progress = useLiveQuery(() => db.itemProgress.get(itemId), [itemId])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const settings = useLiveQuery(() => db.settings.get(1))

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [captions, setCaptions] = useState(true)
  const [showGloss, setShowGloss] = useState(false)
  const [rate, setRate] = useState<number | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [sel, setSel] = useState<Selection | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [shadow, setShadow] = useState<Shadow>({ phase: 'idle' })

  // Playback engine lives in refs so utterance callbacks never see stale state.
  const cancelRef = useRef<() => void>(() => {})
  const playingRef = useRef(false)
  const recRef = useRef<ActiveRecording | null>(null)
  const shadowTimer = useRef<number | null>(null)

  const effectiveRate = rate ?? settings?.ttsRate ?? 0.9

  const stop = () => {
    playingRef.current = false
    cancelRef.current()
    setPlaying(false)
  }

  const playFrom = (i: number, segments: Segment[]) => {
    const seg = segments[i]
    if (!seg) {
      stop()
      return
    }
    cancelRef.current()
    setIndex(i)
    setTtsError(null)
    playingRef.current = true
    setPlaying(true)
    cancelRef.current = speakSegment(
      seg.es,
      { rate: effectiveRate, voiceURI: settings?.ttsVoiceURI },
      {
        onEnd: () => {
          if (!playingRef.current) return
          if (i + 1 < segments.length) playFrom(i + 1, segments)
          else stop()
        },
        onError: (reason) => {
          stop()
          setTtsError(
            reason === 'unavailable'
              ? 'Este navegador no tiene voz.'
              : 'No se pudo reproducir. En iPhone: Ajustes › Accesibilidad › Contenido hablado › Voces › Español, y revisa el interruptor de silencio.',
          )
        },
      },
    )
  }

  // Clean up speech, mic and object URLs when leaving the screen.
  useEffect(() => {
    return () => {
      playingRef.current = false
      cancelRef.current()
      if (shadowTimer.current) window.clearTimeout(shadowTimer.current)
      void recRef.current?.stop()
    }
  }, [])
  useEffect(() => {
    return () => {
      if (shadow.phase === 'done') URL.revokeObjectURL(shadow.url)
    }
  }, [shadow])

  if (!item || !cards || !settings) return <main className="p-5 text-muted">Cargando…</main>
  if (!item.segments) return <main className="p-5">Este elemento no tiene transcripción.</main>

  const segments = item.segments
  const current = segments[index]
  const known = cardsByKey(cards)
  const existing = sel ? known.get(sel.key) : undefined
  const done = progress?.status === 'done'

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1500)
  }

  const togglePlay = () => {
    if (playing) stop()
    else playFrom(index, segments)
  }
  const prev = () => {
    const i = Math.max(0, index - 1)
    if (playing) playFrom(i, segments)
    else setIndex(i)
  }
  const next = () => {
    const i = Math.min(segments.length - 1, index + 1)
    if (playing) playFrom(i, segments)
    else setIndex(i)
  }
  const cycleRate = () => {
    const pos = RATE_STEPS.indexOf(effectiveRate)
    const r = RATE_STEPS[(pos + 1) % RATE_STEPS.length] ?? 0.9
    setRate(r)
    void updateSettings({ ttsRate: r })
    if (playing) playFrom(index, segments)
  }
  const jumpTo = (seg: Segment) => {
    const i = segments.findIndex((s) => s.id === seg.id)
    if (i < 0) return
    if (playing) playFrom(i, segments)
    else setIndex(i)
  }

  // Shadow: play the current sentence, then record the learner repeating it.
  const shadowStart = () => {
    if (!current) return
    stop()
    if (shadow.phase === 'done') URL.revokeObjectURL(shadow.url)
    setShadow({ phase: 'listening' })
    cancelRef.current = speakSegment(
      current.es,
      { rate: effectiveRate, voiceURI: settings.ttsVoiceURI },
      {
        onEnd: () => void shadowRecord(current.id),
        onError: () => {
          setShadow({ phase: 'idle' })
          setTtsError('No se pudo reproducir la frase.')
        },
      },
    )
  }
  const shadowRecord = async (segmentId: string) => {
    try {
      const rec = await startRecording()
      recRef.current = rec
      setShadow({ phase: 'recording' })
      shadowTimer.current = window.setTimeout(() => void shadowStop(segmentId), SHADOW_MAX_MS)
    } catch {
      setShadow({ phase: 'idle' })
      flash('No hay acceso al micrófono')
    }
  }
  const shadowStop = async (segmentId: string) => {
    if (shadowTimer.current) window.clearTimeout(shadowTimer.current)
    shadowTimer.current = null
    const rec = recRef.current
    recRef.current = null
    if (!rec) return
    const blob = await rec.stop()
    await db.recordings.add({ itemId: item.id, segmentId, blob, createdAt: new Date() })
    setShadow({ phase: 'done', url: URL.createObjectURL(blob), segmentId })
  }
  const shadowCancel = () => {
    if (shadowTimer.current) window.clearTimeout(shadowTimer.current)
    cancelRef.current()
    void recRef.current?.stop()
    recRef.current = null
    setShadow({ phase: 'idle' })
  }

  const onSelect = (s: Selection) => {
    stop()
    setSel(s)
  }

  return (
    <>
      <TopBar
        title={item.title}
        back={`/theme/${item.themeId}`}
        right={
          <>
            <Timer skill="listening" itemId={item.id} />
            <GlossToggle on={showGloss} onToggle={() => setShowGloss((v) => !v)} />
            <LevelBadge level={item.level} stretch={item.stretch} />
          </>
        }
      />
      <main className="mx-auto max-w-md p-5 pb-52">
        <div className="mb-4 flex items-center justify-between text-xs text-muted">
          <span>
            Frase {index + 1} de {segments.length} · {item.estimatedMinutes} min
          </span>
          <button type="button" onClick={() => setCaptions((v) => !v)} className="rounded-full border border-line px-2.5 py-1 text-muted">
            {captions ? 'Ocultar texto' : 'Ver texto'}
          </button>
        </div>

        {ttsError && <p className="mb-4 rounded-xl bg-accent-soft p-3 text-sm text-accent">{ttsError}</p>}

        {captions ? (
          <TappableText
            segments={segments}
            known={known}
            onSelect={onSelect}
            activeSegmentId={current?.id}
            showAllGloss={showGloss}
            onSentenceTap={jumpTo}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
            <p className="text-3xl">🎧</p>
            <p className="mt-2">Escucha primero. Cuando quieras leer, toca «Ver texto».</p>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold">Sombra</h2>
          <p className="mt-1 text-sm text-muted">Escucha la frase {index + 1} y repítela en voz alta. Luego compara.</p>
          {shadow.phase === 'idle' && (
            <button
              type="button"
              onClick={shadowStart}
              disabled={!ttsAvailable() || !recordingAvailable()}
              className="mt-3 w-full rounded-xl bg-accent-soft px-4 py-3 font-medium text-accent disabled:opacity-50"
            >
              🎤 Escuchar y repetir
            </button>
          )}
          {shadow.phase === 'listening' && <p className="mt-3 text-center text-sm text-accent">Escucha…</p>}
          {shadow.phase === 'recording' && (
            <button type="button" onClick={() => void shadowStop(current?.id ?? '')} className="mt-3 w-full rounded-xl bg-accent px-4 py-3 font-medium text-on-accent">
              ● Grabando… toca para terminar
            </button>
          )}
          {shadow.phase === 'done' && (
            <div className="mt-3 space-y-2">
              <audio controls src={shadow.url} className="w-full" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const seg = segments.find((s) => s.id === shadow.segmentId)
                    if (seg) speakSegment(seg.es, { rate: effectiveRate, voiceURI: settings.ttsVoiceURI })
                  }}
                  className="flex-1 rounded-xl border border-line px-4 py-2 text-sm"
                >
                  🔊 Original
                </button>
                <button type="button" onClick={shadowStart} className="flex-1 rounded-xl bg-accent-soft px-4 py-2 text-sm text-accent">
                  🎤 Otra vez
                </button>
              </div>
            </div>
          )}
          {(shadow.phase === 'listening' || shadow.phase === 'recording') && (
            <button type="button" onClick={shadowCancel} className="mt-2 w-full py-1 text-xs text-muted">
              Cancelar
            </button>
          )}
          {!recordingAvailable() && <p className="mt-2 text-xs text-muted">Este navegador no permite grabar.</p>}
        </section>

        {item.questions && <Comprehension questions={item.questions} />}

        <DoneButton
          done={done}
          onClick={() => {
            stop()
            void markItemDone(item.id, item.themeId).then(() => navigate(`/theme/${item.themeId}`))
          }}
        />
      </main>

      {/* Transport controls, above the home indicator. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <button type="button" onClick={cycleRate} aria-label="Velocidad" className="w-14 rounded-full border border-line py-2 text-sm font-medium">
            {effectiveRate.toFixed(1)}×
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={prev} aria-label="Frase anterior" className="h-12 w-12 rounded-full bg-accent-soft text-xl text-accent">
              ⏮
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pausar' : 'Reproducir'}
              className="h-16 w-16 rounded-full bg-accent text-2xl text-on-accent shadow-lg"
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button type="button" onClick={next} aria-label="Frase siguiente" className="h-12 w-12 rounded-full bg-accent-soft text-xl text-accent">
              ⏭
            </button>
          </div>
          <span className="w-14 text-right text-xs text-muted">
            {index + 1}/{segments.length}
          </span>
        </div>
      </div>

      {sel && (
        <LookupSheet
          selection={sel}
          existing={existing}
          onClose={() => setSel(null)}
          onSave={async (meaning) => {
            if (existing) {
              await updateCardMeaning(existing.id, meaning)
              flash('Tarjeta actualizada')
            } else {
              await saveCard({ word: sel.text, meaning, exampleEs: sel.segment.es, exampleEn: sel.segment.en, sourceItemId: item.id, themeId: item.themeId })
              flash('Tarjeta guardada')
            }
          }}
          onDelete={existing ? () => deleteCard(existing.id) : undefined}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center">
          <span className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow">{toast}</span>
        </div>
      )}
    </>
  )
}
