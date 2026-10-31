import { createEmptyCard } from 'ts-fsrs'
import { db } from '../db/db'
import type { Card } from '../db/types'
import { wordKey } from './words'

export interface NewCardInput {
  word: string
  meaning: string
  exampleEs: string
  exampleEn?: string
  sourceItemId: string
  themeId: string
}

export async function saveCard(input: NewCardInput): Promise<Card> {
  const now = new Date()
  const empty = createEmptyCard(now)
  const card: Card = {
    id: crypto.randomUUID(),
    word: input.word.trim(),
    lemma: wordKey(input.word),
    meaning: input.meaning.trim(),
    exampleEs: input.exampleEs,
    exampleEn: input.exampleEn,
    sourceItemId: input.sourceItemId,
    themeId: input.themeId,
    createdAt: now,
    fsrs: { ...empty },
  }
  await db.cards.put(card)
  return card
}

export async function updateCardMeaning(id: string, meaning: string): Promise<void> {
  await db.cards.update(id, { meaning: meaning.trim() })
}

export async function deleteCard(id: string): Promise<void> {
  await db.cards.delete(id)
}

/** Map from lookup key (lemma) to card, for underlining known words. */
export function cardsByKey(cards: Card[]): Map<string, Card> {
  const m = new Map<string, Card>()
  for (const c of cards) m.set(c.lemma ?? wordKey(c.word), c)
  return m
}
