import type { GlossSource } from '../content/schema'
import { sourcesFor } from '../lib/glossary'
import { wordReferenceUrl } from '../lib/wiktionary'

const DICTIONARIES: Record<Exclude<GlossSource, 'name'>, { label: string; url: (w: string) => string }> = {
  wordreference: { label: 'WordReference', url: wordReferenceUrl },
  spanishdict: { label: 'SpanishDict', url: (w) => `https://www.spanishdict.com/translate/${encodeURIComponent(w)}` },
  dem: { label: 'DEM (México)', url: (w) => `https://dem.colmex.mx/Ver/${encodeURIComponent(w)}` },
}

/** "Verificado en WordReference · SpanishDict" under a glossary meaning, each linking to the entry. */
export default function GlossSources({ word }: { word: string }) {
  const list = sourcesFor(word)
  if (list.length === 0) return null
  if (list.includes('name')) return <p className="mt-1 text-xs text-muted">Nombre propio</p>
  return (
    <p className="mt-1 text-xs text-muted">
      Verificado en{' '}
      {list.map((s, i) => {
        const d = DICTIONARIES[s as Exclude<GlossSource, 'name'>]
        return (
          <span key={s}>
            {i > 0 && ' · '}
            <a href={d.url(word)} target="_blank" rel="noreferrer" className="underline">
              {d.label}
            </a>
          </span>
        )
      })}
    </p>
  )
}
