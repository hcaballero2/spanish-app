// Grading a learner's typed Spanish against a card's word (English → Spanish review).

/** Lowercase, no surrounding punctuation (¿¡?!.,;:«»"), single spaces. */
export function normalizeEs(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[¿¡?!.,;:«»"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * 'exact' when the typed Spanish matches, 'accents' when it only misses accents
 * or ñ (counted correct, the right spelling is shown), else 'wrong'.
 */
export function checkSpanish(typed: string, answer: string): 'exact' | 'accents' | 'wrong' {
  const t = normalizeEs(typed)
  const a = normalizeEs(answer)
  if (!t) return 'wrong'
  if (t === a) return 'exact'
  if (stripAccents(t) === stripAccents(a)) return 'accents'
  return 'wrong'
}
