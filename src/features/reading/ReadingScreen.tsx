import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { cardsByKey, deleteCard, saveCard, updateCardMeaning } from '../../lib/cards'
import TappableText, { type Selection } from '../../components/TappableText'
import LookupSheet from '../../components/LookupSheet'
import TopBar from '../../components/TopBar'
import LevelBadge from '../../components/LevelBadge'
import { completeTheme } from '../../content/seed'

export default function ReadingScreen() {
  const { itemId = '' } = useParams()
  const navigate = useNavigate()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  const progress = useLiveQuery(() => db.itemProgress.get(itemId), [itemId])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const [sel, setSel] = useState<Selection | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})

  if (!item || !cards) return <main className="p-5 text-muted">Cargando…</main>
  if (!item.segments) return <main className="p-5">Este elemento no tiene texto.</main>

  const known = cardsByKey(cards)
  const existing = sel ? known.get(sel.key) : undefined
  const savedHere = cards.filter((c) => c.sourceItemId === item.id).length
  const done = progress?.status === 'done'

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1500)
  }

  const markDone = async () => {
    await db.itemProgress.put({ itemId: item.id, status: 'done', completedAt: new Date() })
    const siblings = await db.items.where('themeId').equals(item.themeId).toArray()
    const prog = await db.itemProgress.bulkGet(siblings.map((s) => s.id))
    const allDone = siblings.every((s, i) => prog[i]?.status === 'done' || s.id === item.id)
    if (allDone) await completeTheme(item.themeId)
    navigate(`/theme/${item.themeId}`)
  }

  return (
    <>
      <TopBar title={item.title} back={`/theme/${item.themeId}`} right={<LevelBadge level={item.level} stretch={item.stretch} />} />
      <main className="mx-auto max-w-md p-5 pb-32">
        <p className="mb-4 text-xs text-muted">
          Toca una palabra para guardarla · mantén presionado y arrastra para una frase · {item.estimatedMinutes} min
        </p>

        <TappableText segments={item.segments} known={known} onSelect={setSel} />

        {item.questions && item.questions.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="font-semibold">Comprensión</h2>
            {item.questions.map((q, qi) => {
              const picked = answers[qi]
              return (
                <div key={qi} className="rounded-2xl border border-line bg-white p-4">
                  <p className="mb-2 font-medium">{q.q}</p>
                  <div className="space-y-1">
                    {q.options.map((opt, oi) => {
                      const state =
                        picked === undefined ? '' : oi === q.answer ? 'border-green-600 bg-green-50' : oi === picked ? 'border-accent bg-accent-soft' : 'opacity-60'
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
        )}

        <section className="mt-8 flex items-center justify-between text-sm text-muted">
          <span>{savedHere} tarjeta{savedHere === 1 ? '' : 's'} de este texto</span>
        </section>

        <button
          type="button"
          onClick={markDone}
          className={`mt-4 w-full rounded-xl px-4 py-3 font-medium ${done ? 'border border-line text-muted' : 'bg-accent text-white'}`}
        >
          {done ? 'Terminado ✓' : 'Marcar como terminado'}
        </button>
      </main>

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
              await saveCard({
                word: sel.text,
                meaning,
                exampleEs: sel.segment.es,
                exampleEn: sel.segment.en,
                sourceItemId: item.id,
                themeId: item.themeId,
              })
              flash('Tarjeta guardada')
            }
          }}
          onDelete={existing ? () => deleteCard(existing.id) : undefined}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center">
          <span className="rounded-full bg-ink px-4 py-2 text-sm text-white shadow">{toast}</span>
        </div>
      )}
    </>
  )
}
