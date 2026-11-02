import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import TopBar from '../../components/TopBar'
import Timer from '../../components/Timer'
import { MC_ROUNDS, Rating, blankOut, buildQueue, correctCounts, formatSpan, previewDue, rateCard, type Grade, type QueueEntry } from '../../lib/fsrs'
import { distractorPool, glossFor } from '../../lib/glossary'
import GlossSources from '../../components/GlossSources'
import { meaningMatches, pickDistractors, shuffled } from '../../lib/meaning'
import { checkSpanish } from '../../lib/spanish'
import { speak, ttsAvailable } from '../../lib/tts'

/** The learner's answer to the card on screen, once given. */
interface Answer {
  correct: boolean
  choice?: string // multiple choice
  typed?: string // typed recall
  accents?: boolean // English → Spanish: right apart from accents / ñ
}

/**
 * Flashcard review (PLAN §7.2), graded by the app. Spanish → English: a card's
 * first MC_ROUNDS correct answers are multiple choice, after that the learner
 * types the meaning. English → Spanish (unlocked after that): the learner types
 * the Spanish word, with the example sentence as a fill-in-the-blank hint;
 * missing accents still count. Right → "Bien", wrong → "Otra vez" (FSRS ratings).
 */
export default function ReviewScreen() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const allCards = useLiveQuery(() => db.cards.toArray(), [])
  const [queue, setQueue] = useState<QueueEntry[] | null>(null)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // Build the queue once; grading does not reshuffle it under the learner's thumb.
  useEffect(() => {
    if (!settings || queue) return
    let cancelled = false
    buildQueue(settings).then(async (q) => {
      const c = await correctCounts(q.map((x) => x.card.id))
      if (cancelled) return
      setCounts(c)
      setQueue(q)
    })
    return () => {
      cancelled = true
    }
  }, [settings, queue])

  const card = queue?.[0]?.card
  const reverse = queue?.[0]?.dir === 'rev'
  const gloss = card ? glossFor(card.lemma ?? '') : undefined
  const answers = card ? [card.meaning, ...(gloss ? [gloss] : [])] : []

  // Options stay put while this card is on screen (seeded by card + rep count).
  const options = useMemo(() => {
    if (!card || !allCards) return []
    const seed = `${card.id}:${card.fsrs.reps}`
    const others = allCards.filter((c) => c.id !== card.id).map((c) => c.meaning)
    const pool = [...shuffled(others, seed), ...distractorPool(card.meaning, seed)]
    return shuffled([card.meaning, ...pickDistractors(answers, pool, seed)], seed + 'o')
  }, [card?.id, card?.fsrs.reps, allCards === undefined])
  // Too few wrong options to make a fair question → typed recall instead.
  const multipleChoice = !!card && !reverse && (counts.get(card.id) ?? 0) < MC_ROUNDS && options.length >= 4

  useEffect(() => {
    if (card && !multipleChoice && !answer) {
      const t = window.setTimeout(() => input.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [card, multipleChoice, answer])

  if (!settings || !queue || !allCards) return <main className="p-5 text-muted">Cargando…</main>

  const total = done + queue.length

  const next = async (grade: Grade) => {
    if (!card || busy) return
    setBusy(true)
    try {
      const now = new Date()
      const dir = reverse ? 'rev' : 'fwd'
      const updated = await rateCard(card, grade, now, dir)
      if (grade > 1 && !reverse) setCounts((m) => new Map(m).set(card.id, (m.get(card.id) ?? 0) + 1))
      const rest = queue.slice(1)
      const due = reverse ? updated.fsrsRev!.due : updated.fsrs.due
      // A miss (1-minute learning step) comes back later in this session.
      if (due.getTime() - now.getTime() < 5 * 60_000) rest.push({ card: updated, dir })
      else setDone((d) => d + 1)
      setQueue(rest)
      setAnswer(null)
      setTyped('')
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

  const grade: Grade = answer?.correct ? Rating.Good : Rating.Again
  const due = answer ? previewDue(card, undefined, reverse ? 'rev' : 'fwd') : null
  const now = new Date()

  const choose = (opt: string) => {
    if (answer) return
    setAnswer({ correct: opt === card.meaning, choice: opt })
  }
  const submitTyped = (giveUp = false) => {
    if (answer) return
    if (!giveUp && !typed.trim()) {
      input.current?.focus()
      return
    }
    input.current?.blur()
    if (reverse) {
      const result = giveUp ? 'wrong' : checkSpanish(typed, card.word)
      setAnswer({ correct: result !== 'wrong', accents: result === 'accents', typed: giveUp ? '' : typed })
      return
    }
    setAnswer({ correct: !giveUp && meaningMatches(typed, answers), typed: giveUp ? '' : typed })
  }

  return (
    <>
      <TopBar
        title="Repaso"
        back="/"
        right={
          <>
            <Timer skill="review" />
            <span className="text-xs text-muted">
              {done + 1} / {total}
            </span>
          </>
        }
      />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-32">
        <section className="rounded-2xl border border-line bg-card p-5">
          {reverse ? (
            <>
              <p className="text-xs uppercase tracking-wide text-muted">¿Cómo se dice en español? · escribe</p>
              <p className="mt-2 text-2xl font-bold">{card.meaning}</p>
              <p className="mt-2 text-muted">{blankOut(card.exampleEs, card.word)}</p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-muted">¿Qué significa? · {multipleChoice ? 'elige' : 'escribe'}</p>
              <div className="mt-2 flex items-center gap-3">
                <p className="text-2xl font-bold">{card.word}</p>
                {ttsAvailable() && <SpeakButton onClick={() => say(card.word)} />}
              </div>
              <p className="mt-2 text-muted">{blankOut(card.exampleEs, card.word)}</p>
            </>
          )}
        </section>

        {multipleChoice ? (
          <div className="grid gap-2" role="group" aria-label="Opciones">
            {options.map((opt) => {
              const isAnswer = opt === card.meaning
              const picked = answer?.choice === opt
              const cls = !answer
                ? 'border-line bg-card'
                : isAnswer
                  ? 'border-ok bg-ok-soft'
                  : picked
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-card opacity-60'
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={!!answer}
                  onClick={() => choose(opt)}
                  className={`rounded-xl border px-4 py-3 text-left ${cls}`}
                >
                  {answer && isAnswer ? '✓ ' : answer && picked ? '✗ ' : ''}
                  {opt}
                </button>
              )
            })}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitTyped()
            }}
            className="flex flex-col gap-2"
          >
            <input
              ref={input}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              readOnly={!!answer}
              placeholder={reverse ? 'escribe en español' : 'escribe el significado en inglés'}
              lang={reverse ? 'es' : 'en'}
              aria-label="Tu respuesta"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              className={`w-full rounded-xl border px-3 py-3 text-base ${
                !answer ? 'border-line bg-card' : answer.correct ? 'border-ok bg-ok-soft' : 'border-accent bg-accent-soft'
              }`}
            />
            {!answer && (
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-xl bg-accent px-4 py-3 font-medium text-on-accent">
                  Comprobar
                </button>
                <button type="button" onClick={() => submitTyped(true)} className="rounded-xl border border-line px-4 py-3 text-muted">
                  No sé
                </button>
              </div>
            )}
          </form>
        )}

        {answer && (
          <section className="rounded-2xl border border-line bg-card p-5" role="status">
            <p className={`font-semibold ${answer.correct ? 'text-ok' : 'text-accent'}`}>
              {answer.accents ? '✓ Casi: fíjate en los acentos.' : answer.correct ? '✓ ¡Correcto!' : answer.typed === '' ? 'La respuesta:' : '✗ No exactamente.'}
            </p>
            {reverse ? (
              <div className="mt-1 flex items-center gap-3">
                <p className="text-xl font-semibold">{card.word}</p>
                {ttsAvailable() && <SpeakButton onClick={() => say(card.word)} small />}
              </div>
            ) : (
              <>
                <p className="mt-1 text-xl font-semibold">{card.meaning}</p>
                {gloss && !meaningMatches(card.meaning, [gloss]) && <p className="text-sm text-muted">También: {gloss}</p>}
              </>
            )}
            {gloss && <GlossSources word={card.lemma ?? ''} />}
            <div className="mt-3 flex items-start gap-2">
              <p className="flex-1 leading-relaxed">{card.exampleEs}</p>
              {ttsAvailable() && <SpeakButton onClick={() => say(card.exampleEs)} small />}
            </div>
            {card.exampleEn && <p className="mt-1 text-sm text-muted">{card.exampleEn}</p>}
          </section>
        )}

        {answer && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void next(grade)}
              className="rounded-xl bg-accent px-4 py-4 text-lg font-medium text-on-accent disabled:opacity-50"
            >
              Siguiente
              <span className="ml-2 text-sm opacity-80">· vuelve en {due ? formatSpan(due[grade], now) : ''}</span>
            </button>
            {!answer.correct && answer.typed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void next(Rating.Good)}
                className="rounded-xl border border-line px-4 py-3 text-sm text-muted disabled:opacity-50"
              >
                Mi respuesta también vale
              </button>
            )}
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
