import { useState } from 'react'
import type { Item } from '../db/types'

/** Multiple-choice questions after a reading or listening (PLAN §7.2). */
export default function Comprehension({ questions }: { questions: NonNullable<Item['questions']> }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  if (questions.length === 0) return null
  return (
    <section className="mt-8 space-y-4">
      <h2 className="font-semibold">Comprensión</h2>
      {questions.map((q, qi) => {
        const picked = answers[qi]
        return (
          <div key={qi} className="rounded-2xl border border-line bg-card p-4">
            <p className="mb-2 font-medium">{q.q}</p>
            <div className="space-y-1">
              {q.options.map((opt, oi) => {
                const state =
                  picked === undefined ? '' : oi === q.answer ? 'border-ok bg-ok-soft' : oi === picked ? 'border-accent bg-accent-soft' : 'opacity-60'
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={picked !== undefined}
                    onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                    className={`block w-full rounded-lg border border-line px-3 py-2 text-left text-sm ${state}`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
