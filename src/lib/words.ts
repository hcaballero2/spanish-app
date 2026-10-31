/** Lookup key for a word: lowercase, punctuation stripped, accents kept. */
export function wordKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'’-]+/gu, '')
    .replace(/^['’-]+|['’-]+$/g, '')
}

export interface Token {
  text: string
  key: string // '' for pure punctuation/whitespace
}

/** Splits a sentence into word and non-word tokens, keeping punctuation visible. */
export function tokenize(sentence: string): Token[] {
  const out: Token[] = []
  const re = /[\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+/gu
  for (const m of sentence.matchAll(re)) {
    const text = m[0]
    out.push({ text, key: wordKey(text) })
  }
  return out
}
