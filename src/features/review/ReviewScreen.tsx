import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Card } from '../../db/types'
import TopBar from '../../components/TopBar'
import { GRADES, GRADE_LABEL, blankOut, buildQueue, formatSpan, isReversed, previewDue, rateCard, type Grade } from '../../lib/fsrs'
import { speak, ttsAvailable } from '../../lib/tts'

/** Flashcard review (PLAN §7.2): one card at a time, four FSRS ratings. */
export default function ReviewScreen() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)

  // Build the queue once; rating does not reshuffle it under the learner's thumb.
  useEffect(() => {
    if (!settings || queue) return
    let cancelled = false
    buildQueue(settings).then((q) => {
      if (!cancelled) setQueue(q)
    })
    return () => {
      cancelled = true
    }
  }, [settings, queue])

  if (!settings || !queue) return <main className="p-5 text-muted">Cargando…</main>

  const card = queue[0]
  const total = done + queue.length

  const rate = async (grade: Grade) => {
    if (!card || busy) return
    setBusy(true)
    try {
      const now = new Date()
      const updated = await rateCard(card, grade, now)
      const rest = queue.slice(1)
      // "Otra vez" (1-minute learning step) comes back later in this session;
      // "Difícil" (6 min) and "Bien" (10 min) wait for the next session.
      if (updated.fsrs.due.getTime() - now.getTime() < 5 * 60_000) rest.push(updated)
      else setDone((d) => d + 1)
      setQueue(rest)
      setRevealed(false)
    } finally {
      setBusy(false)
    }
  }

  const say = (text: string) => speak(text, { rate: settings.ttsRate, voiceURI: settings.ttsVoiceURI })

  if (!card) {
    return (
      <>
        <TopBar title="Repaso" back="/" />
        <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-5 pt-16 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-semibold">¡Listo!</h2>
          <p className="text-muted">
            {done === 0 ? 'No hay tarjetas pendientes.' : `${done} tarjeta${done === 1 ? '' : 's'} repasada${done === 1 ? '' : 's'}.`}
          </p>
          <Link to="/" className="mt-4 rounded-xl bg-accent px-6 py-3 font-medium text-on-accent">
            Volver a Hoy
          </Link>
        </main>
      </>
    )
  }

  const reversed = isReversed(card)
  const due = revealed ? previewDue(card) : null
  const now = new Date()

  return (
    <>
      <TopBar
        title="Repaso"
        back="/"
        right={
          <span className="text-xs text-muted">
            {done + 1} / {total}
          </span>
        }
      />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-32">
        <section className="min-h-56 rounded-2xl border border-line bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{reversed ? '¿Cómo se dice?' : '¿Qué significa?'}</p>

          {reversed ? (
            <>
              <p className="mt-2 text-2xl font-bold">{card.meaning}</p>
              {card.exampleEn && <p className="mt-2 text-muted">{card.exampleEn}</p>}
            </>
          ) : (
            <>
              <div className="mt-2 flex items-center gap-3">
                <p className="text-2xl font-bold">{card.word}</p>
                {ttsAvailable() && <SpeakButton onClick={() => say(card.word)} />}
              </div>
              <p className="mt-2 text-muted">{blankOut(card.exampleEs, card.word)}</p>
            </>
          )}

          {revealed && (
            <div className="mt-4 border-t border-line pt-4">
              {reversed ? (
                <div className="flex items-center gap-3">
                  <p className="text-2xl font-bold text-accent">{card.word}</p>
                  {ttsAvailable() && <SpeakButton onClick={() => say(card.word)} />}
                </div>
              ) : (
                <p className="text-xl font-semibold text-accent">{card.meaning}</p>
              )}
              <div className="mt-2 flex items-start gap-2">
                <p className="flex-1 leading-relaxed">{card.exampleEs}</p>
                {ttsAvailable() && <SpeakButton onClick={() => say(card.exampleEs)} small />}
              </div>
              {card.exampleEn && !reversed && <p className="mt-1 text-sm text-muted">{card.exampleEn}</p>}
            </div>
          )}
        </section>

        {!revealed ? (
          <button type="button" onClick={() => setRevealed(true)} className="rounded-xl bg-accent px-4 py-4 text-lg font-medium text-on-accent">
            Mostrar respuesta
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                disabled={busy}
                onClick={() => void rate(g)}
                className={`flex flex-col items-center rounded-xl px-1 py-3 disabled:opacity-50 ${
                  g === 1 ? 'bg-accent-soft text-accent' : g === 3 ? 'bg-accent text-on-accent' : 'border border-line bg-card'
                }`}
              >
                <span className="text-sm font-medium">{GRADE_LABEL[g]}</span>
                <span className="mt-0.5 text-[11px] opacity-80">{due ? formatSpan(due[g], now) : ''}</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </>
  )
}

function SpeakButton({ onClick, small }: { onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Escuchar"
      className={`shrink-0 rounded-full bg-accent-soft text-accent ${small ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-lg'}`}
    >
      🔊
    </button>
  )
}
