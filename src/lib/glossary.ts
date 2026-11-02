import { packs } from '../content/packs'
import type { GlossSource } from '../content/schema'
import { shuffled } from './meaning'

/** Every pack's glossary merged; the earliest pack wins on duplicates. */
const merged = new Map<string, string>()
const sources = new Map<string, GlossSource[]>()
for (const p of packs)
  for (const [k, v] of Object.entries(p.glossary ?? {}))
    if (!merged.has(k)) {
      merged.set(k, v)
      sources.set(k, p.glossarySources?.[k] ?? [])
    }

/** English meaning(s) for a single-word key, or undefined for phrases and unknown words. */
export function glossFor(key: string): string | undefined {
  return merged.get(key)
}

/** The dictionaries a glossary meaning was checked against (empty if unchecked). */
export function sourcesFor(key: string): GlossSource[] {
  return sources.get(key) ?? []
}

/** Meanings that read as verbs ("to eat", "I buy", "makes") vs nouns/adjectives ("knife", "cheap"). */
const VERBISH = /^(to|i|we|you|he|she|it|they|is|are|was|has|have|goes|gives|makes|says|asks|eats|cuts|costs|wants|shouts|chats|prefers)\b/i
const FUNCTION = /^(the|a|an|of|to|in|on|at|for|with|and|or|but|no|not|yes|my|me|it|that|what|here|very|more|so|just|each|some|these|then|always|because|without|thanks|hi)\b/i

/**
 * Content-word meanings usable as multiple-choice distractors, those of the
 * same kind as `answer` (verb-like or not) first, each group shuffled by `seed`. Skips names and function
 * words so the wrong options are plausible, not giveaways.
 */
export function distractorPool(answer: string, seed: string): string[] {
  const same: string[] = []
  const other: string[] = []
  const verbish = VERBISH.test(answer.trim())
  for (const [k, v] of merged) {
    const first = v.split(' / ')[0] ?? ''
    if (k.length < 4 || v.includes('(') || FUNCTION.test(first)) continue
    ;(VERBISH.test(first) === verbish ? same : other).push(v)
  }
  return [...shuffled(same, seed), ...shuffled(other, seed)]
}
