import type { Card, Item } from '../db/types'
import { saveCard } from '../lib/cards'
import { wordKey } from '../lib/words'

interface Props {
  item: Item
  known: Map<string, Card>
  onSaved: () => void
}

/** «Palabras clave» from a video clip or news item, each saveable as a card with its example. */
export default function KeyWords({ item, known, onSaved }: Props) {
  if (!item.keyWords) return null
  return (
    <section className="mt-6">
      <h2 className="font-semibold">Palabras clave</h2>
      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card">
        {item.keyWords.map((k) => {
          const saved = known.has(wordKey(k.es))
          return (
            <li key={k.es} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="font-medium">{k.es}</p>
                <p className="text-sm text-muted">{k.en}</p>
              </div>
              <button
                type="button"
                disabled={saved}
                aria-label={`Guardar ${k.es}`}
                onClick={async () => {
                  await saveCard({ word: k.es, meaning: k.en, exampleEs: k.exampleEs, exampleEn: k.exampleEn, sourceItemId: item.id, themeId: item.themeId })
                  onSaved()
                }}
                className="rounded-full border border-line px-3 py-1 text-sm text-accent disabled:text-muted"
              >
                {saved ? '✓' : '+ Guardar'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
