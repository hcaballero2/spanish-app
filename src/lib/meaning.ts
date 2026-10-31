// Checking a learner's English meaning against an answer key, and building
// multiple-choice options. Pure functions; the glossary comes from the packs.

/** Splits "taco seller / taco man; vendor" into its alternatives. */
export function alternatives(meaning: string): string[] {
  return meaning
    .split(/\s*[/;,]\s*/)
    .map((m) => m.trim())
    .filter(Boolean)
}

/** Lowercase, no accents, no punctuation or parentheticals, no leading article/"to". */
export function normalizeMeaning(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/^(to|a|an|the) /, '')
  return s
}

function stem(word: string): string {
  return word.length > 3 ? word.replace(/(es|s)$/, '') : word
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]!
}

/**
 * True when `guess` matches one of the alternatives in any of `answers`:
 * same words after normalizing (plurals and small typos forgiven), or the guess
 * contains every word of an alternative ("the taco man" ⊇ "taco man").
 */
export function meaningMatches(guess: string, answers: string[]): boolean {
  const g = normalizeMeaning(guess)
  if (!g) return false
  const gWords = g.split(' ').map(stem)
  const gJoined = gWords.join(' ')
  for (const answer of answers) {
    for (const alt of alternatives(answer)) {
      const a = normalizeMeaning(alt)
      if (!a) continue
      const aWords = a.split(' ').map(stem)
      const aJoined = aWords.join(' ')
      if (gJoined === aJoined) return true
      const allowed = aJoined.length <= 4 ? 0 : aJoined.length <= 8 ? 1 : 2
      if (editDistance(gJoined, aJoined) <= allowed) return true
      if (aWords.every((w) => gWords.includes(w)) && gWords.length <= aWords.length + 2) return true
    }
  }
  return false
}

/** Small seeded shuffle so options keep their order while a card stays on screen. */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    const j = h % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Three wrong options for a multiple-choice question: other saved cards'
 * meanings first, then glossary meanings, never one that any of `answers`
 * (the card's meaning plus its glossary entry) would accept.
 */
export function pickDistractors(answers: string[], pool: string[], seed: string, n = 3): string[] {
  const seen = new Set<string>(answers.flatMap(alternatives).map(normalizeMeaning))
  const out: string[] = []
  for (const cand of pool) {
    const first = alternatives(cand)[0]
    if (!first) continue
    const key = normalizeMeaning(first)
    if (!key || seen.has(key) || meaningMatches(first, answers) || answers.some((a) => meaningMatches(a, [cand]))) continue
    seen.add(key)
    out.push(first)
    if (out.length === n) break
  }
  return shuffled(out, seed)
}
