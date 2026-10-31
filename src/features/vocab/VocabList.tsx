import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Card } from '../../db/types'
import TopBar from '../../components/TopBar'
import LookupSheet from '../../components/LookupSheet'
import { deleteCard, updateCardMeaning } from '../../lib/cards'
import { formatDue, isNew } from '../../lib/fsrs'

/** Every saved card, newest first, with search, edit and delete (PLAN §7.2). */
export default function VocabList() {
  const cards = useLiveQuery(() => db.cards.orderBy('createdAt').reverse().toArray(), [])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Card | null>(null)

  if (!cards) return <main className="p-5 text-muted">Cargando…</main>

  const q = query.trim().toLowerCase()
  const shown = q ? cards.filter((c) => c.word.toLowerCase().includes(q) || c.meaning.toLowerCase().includes(q)) : cards
  const now = new Date()

  return (
    <>
      <TopBar title="Vocabulario" back="/" right={<span className="text-xs text-muted">{cards.length}</span>} />
      <main className="mx-auto max-w-md p-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar palabra o significado"
          autoCapitalize="off"
          autoCorrect="off"
          className="mb-4 w-full rounded-xl border border-line bg-card px-3 py-3 text-base"
        />

        {shown.length === 0 ? (
          <p className="text-sm text-muted">{cards.length === 0 ? 'Aún no has guardado palabras. Toca una palabra en una lectura.' : 'Sin resultados.'}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-accent-soft">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.word}</span>
                    <span className="block truncate text-sm text-muted">{c.meaning}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{isNew(c) ? 'nueva' : formatDue(c.fsrs.due, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {editing && (
        <LookupSheet
          selection={{ text: editing.word, key: editing.lemma ?? editing.word, segment: { id: '', es: editing.exampleEs, en: editing.exampleEn } }}
          existing={editing}
          onClose={() => setEditing(null)}
          onSave={(meaning) => updateCardMeaning(editing.id, meaning)}
          onDelete={() => deleteCard(editing.id)}
        />
      )}
    </>
  )
}
