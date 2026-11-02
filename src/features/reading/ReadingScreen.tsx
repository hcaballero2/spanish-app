import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { cardsByKey, deleteCard, saveCard, updateCardMeaning } from '../../lib/cards'
import TappableText, { type Selection } from '../../components/TappableText'
import LookupSheet from '../../components/LookupSheet'
import TopBar from '../../components/TopBar'
import Timer from '../../components/Timer'
import LevelBadge from '../../components/LevelBadge'
import Comprehension from '../../components/Comprehension'
import DoneButton from '../../components/DoneButton'
import GlossToggle from '../../components/GlossToggle'
import KeyWords from '../../components/KeyWords'
import { markItemDone } from '../../lib/progress'

/** "2026-10-27" → "27 oct 2026" (parsed as a calendar date, so no timezone shift). */
function newsDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ReadingScreen() {
  const { itemId = '' } = useParams()
  const navigate = useNavigate()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  const progress = useLiveQuery(() => db.itemProgress.get(itemId), [itemId])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const [sel, setSel] = useState<Selection | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showGloss, setShowGloss] = useState(false)

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
    await markItemDone(item.id, item.themeId)
    navigate(`/theme/${item.themeId}`)
  }

  return (
    <>
      <TopBar
        title={item.title}
        back={`/theme/${item.themeId}`}
        right={
          <>
            <Timer skill="reading" itemId={item.id} />
            <GlossToggle on={showGloss} onToggle={() => setShowGloss((v) => !v)} />
            <LevelBadge level={item.level} stretch={item.stretch} />
          </>
        }
      />
      <main className="mx-auto max-w-md px-6 pb-32 pt-7">
        {item.news && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">En las noticias</p>
        )}
        <h1 className="font-reading text-[26px] font-semibold leading-tight text-reading">{item.title}</h1>
        {item.news && (
          <p className="mt-3 rounded-xl border border-line bg-card p-3 text-sm text-muted">
            Resumen fácil, con mis palabras, de una nota de <strong className="text-ink">{item.news.outlet}</strong> ({newsDate(item.news.date)}):{' '}
            <a href={item.news.url} target="_blank" rel="noreferrer" className="text-accent underline">
              «{item.news.title}» ↗
            </a>
          </p>
        )}
        <p className="mb-7 mt-2 text-xs text-muted">
          {item.estimatedMinutes} min{cards.length < 3 ? ' · toca una palabra para guardarla; mantén y arrastra para una frase' : ''}
        </p>

        <TappableText segments={item.segments} known={known} onSelect={setSel} showAllGloss={showGloss} />

        <KeyWords item={item} known={known} onSaved={() => flash('Tarjeta guardada')} />

        {item.questions && <Comprehension questions={item.questions} />}

        <section className="mt-8 flex items-center justify-between text-sm text-muted">
          <span>{savedHere} tarjeta{savedHere === 1 ? '' : 's'} de este texto</span>
        </section>

        <DoneButton done={done} onClick={() => void markDone()} />
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
          <span className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow">{toast}</span>
        </div>
      )}
    </>
  )
}
