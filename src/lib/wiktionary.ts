/**
 * Suggested meanings from English Wiktionary's REST API (PLAN §7.1). It is
 * community-written, so the lookup sheet ranks it below the dictionary-checked
 * glossary. es.wiktionary.org answers 501 for this endpoint, so only the
 * English one is used. Failures (offline, no entry) resolve to [] quietly.
 */
export interface WikiSense {
  pos: string
  text: string
}

const MAX_SENSES = 4
const cache = new Map<string, Promise<WikiSense[]>>()

function plain(html: string): string {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function load(word: string): Promise<WikiSense[]> {
  try {
    const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`)
    if (!res.ok) return []
    const data = (await res.json()) as { es?: { partOfSpeech: string; definitions: { definition: string }[] }[] }
    const senses: WikiSense[] = []
    for (const entry of data.es ?? []) {
      for (const d of entry.definitions) {
        const text = plain(d.definition)
        // Sub-senses sometimes repeat a fragment of the sense above; skip those.
        if (text && !senses.some((s) => s.text.includes(text))) senses.push({ pos: entry.partOfSpeech, text })
      }
    }
    return senses.slice(0, MAX_SENSES)
  } catch {
    cache.delete(word) // offline: try again next time
    return []
  }
}

export function wiktionary(word: string): Promise<WikiSense[]> {
  const key = word.trim().toLowerCase()
  let p = cache.get(key)
  if (!p) {
    p = load(key)
    cache.set(key, p)
  }
  return p
}

export const wordReferenceUrl = (word: string) =>
  `https://www.wordreference.com/es/en/translation.asp?spen=${encodeURIComponent(word)}`
