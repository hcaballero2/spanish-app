import { useState } from 'react'
import { saveCard } from '../lib/cards'

/** Picks the first sentence in `texts` that contains the word, for the card's example. */
function exampleFor(word: string, texts: string[]): string | undefined {
  const key = word.trim().toLowerCase()
  for (const t of texts) {
    for (const s of t.split(/(?<=[.!?])\s+|\s*\/\s*/)) {
      if (s.toLowerCase().includes(key)) return s.trim()
    }
  }
  return undefined
}

/** "Add word" field (PLAN §7.4): a word the learner used or wanted becomes a review card. */
export default function AddWord({
  itemId,
  themeId,
  texts,
  onSaved,
}: {
  itemId: string
  themeId: string
  /** Item text to look for an example sentence in; the first entry is the fallback example. */
  texts: string[]
  onSaved: (word: string) => void
}) {
  const [word, setWord] = useState('')
  const [meaning, setMeaning] = useState('')
  const ready = word.trim() !== '' && meaning.trim() !== ''

  const save = async () => {
    if (!ready) return
    const w = word.trim()
    await saveCard({ word: w, meaning, exampleEs: exampleFor(w, texts) ?? texts[0] ?? w, sourceItemId: itemId, themeId })
    setWord('')
    setMeaning('')
    onSaved(w)
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-card p-4">
      <h2 className="font-semibold">Añadir palabra</h2>
      <p className="mt-1 text-sm text-muted">¿Te faltó una palabra o usaste una nueva? Guárdala para repasarla.</p>
      <div className="mt-3 flex flex-col gap-2">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Palabra en español"
          aria-label="Palabra en español"
          lang="es"
          autoCapitalize="none"
          className="rounded-xl border border-line bg-paper px-3 py-2"
        />
        <input
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder="Significado en inglés"
          aria-label="Significado"
          autoCapitalize="none"
          className="rounded-xl border border-line bg-paper px-3 py-2"
        />
        <button type="button" onClick={() => void save()} disabled={!ready} className="rounded-xl bg-accent-soft px-4 py-2.5 font-medium text-accent disabled:opacity-50">
          Guardar tarjeta
        </button>
      </div>
    </section>
  )
}
