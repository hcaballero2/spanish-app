// Spaced repetition on top of ts-fsrs (PLAN §7.2). Uses the library's legacy
// `fsrs()`/`createEmptyCard()` API because its Card shape is exactly what
// phase 1 stored under `cards.fsrs`; the scheduler is FSRS-6 with default
// weights, learning steps 1m/10m and relearning 10m.
import { createEmptyCard, fsrs, Rating, State, type Grade } from 'ts-fsrs'
import { db } from '../db/db'
import type { Card, FsrsState, Settings } from '../db/types'

export type { Grade }
export { Rating }

const scheduler = fsrs({ enable_fuzz: true })

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
export const GRADE_LABEL: Record<Grade, string> = { 1: 'Otra vez', 2: 'Difícil', 3: 'Bien', 4: 'Fácil' }

export function isNew(card: Card): boolean {
  return card.fsrs.state === State.New
}

/** Spanish → English ('fwd', the original card) or English → Spanish ('rev', typed in Spanish). */
export type Direction = 'fwd' | 'rev'

/** One question in the review queue: a card asked in one direction. */
export interface QueueEntry {
  card: Card
  dir: Direction
}

function stateOf(card: Card, dir: Direction): FsrsState {
  return dir === 'rev' ? (card.fsrsRev ?? card.fsrs) : card.fsrs
}

/** A card is multiple choice until it has been answered correctly this many times; then typed recall. */
export const MC_ROUNDS = 2

/**
 * Correct Spanish → English answers (rating above "Otra vez") per card, for
 * choosing multiple choice vs typed recall and for unlocking English → Spanish.
 */
export async function correctCounts(cardIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>(cardIds.map((id) => [id, 0]))
  if (cardIds.length === 0) return m
  const rows = await db.reviews.where('cardId').anyOf(cardIds).toArray()
  for (const r of rows) if (r.rating > 1 && !r.dir) m.set(r.cardId, (m.get(r.cardId) ?? 0) + 1)
  return m
}

/**
 * Cards known one way (MC_ROUNDS correct Spanish → English answers) that have
 * no English → Spanish side stored yet, returned with a fresh in-memory one.
 * Covers cards from before this existed; `rateCard` stores it on first rating.
 * Read-only, so it is safe inside a liveQuery (Home's due count).
 */
async function unlockedReverse(now: Date): Promise<Card[]> {
  const pending = await db.cards.filter((c) => !c.fsrsRev).toArray()
  if (pending.length === 0) return []
  const counts = await correctCounts(pending.map((c) => c.id))
  return pending.filter((c) => (counts.get(c.id) ?? 0) >= MC_ROUNDS).map((c) => ({ ...c, fsrsRev: { ...createEmptyCard(now) } }))
}

/** Next due date per grade, for the label on the "Siguiente" button. */
export function previewDue(card: Card, now = new Date(), dir: Direction = 'fwd'): Record<Grade, Date> {
  const log = scheduler.repeat(stateOf(card, dir), now)
  return { 1: log[1].card.due, 2: log[2].card.due, 3: log[3].card.due, 4: log[4].card.due }
}

/**
 * Rates one direction of a card: stores its new FSRS state and appends a review
 * row. A Spanish → English answer that reaches MC_ROUNDS correct also unlocks
 * the English → Spanish side. Returns the updated card.
 */
export async function rateCard(card: Card, grade: Grade, now = new Date(), dir: Direction = 'fwd'): Promise<Card> {
  const before = stateOf(card, dir)
  const next: FsrsState = { ...scheduler.next(before, now, grade).card }
  let updated: Card = dir === 'rev' ? { ...card, fsrsRev: next } : { ...card, fsrs: next }
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.reviews.add({ cardId: card.id, rating: grade, reviewedAt: now, wasNew: before.state === State.New, ...(dir === 'rev' ? { dir } : {}) })
    if (dir === 'fwd' && grade > 1 && !card.fsrsRev) {
      const correct = await db.reviews
        .where('cardId')
        .equals(card.id)
        .filter((r) => r.rating > 1 && !r.dir)
        .count()
      if (correct >= MC_ROUNDS) updated = { ...updated, fsrsRev: { ...createEmptyCard(now) } }
    }
    await db.cards.update(card.id, dir === 'rev' ? { fsrsRev: next } : { fsrs: next, ...(updated.fsrsRev ? { fsrsRev: updated.fsrsRev } : {}) })
  })
  return updated
}

function startOfDay(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s
}

/** How many brand-new cards were introduced today in one direction (each counts towards `newCardsPerDay`). */
export async function newCardsIntroducedToday(now = new Date(), dir: Direction = 'fwd'): Promise<number> {
  const rows = await db.reviews.where('reviewedAt').aboveOrEqual(startOfDay(now)).toArray()
  return rows.filter((r) => r.wasNew && (dir === 'rev') === (r.dir === 'rev')).length
}

/**
 * The review queue: every card direction whose due date has passed, newest
 * theme first. Brand-new cards are capped per direction at `newCardsPerDay`
 * minus the ones already introduced today (new cards are due at creation).
 * Order: Spanish → English reviews, English → Spanish reviews, then new ones.
 * When both sides of a card are due only Spanish → English is asked, so one
 * answer never gives the other away; the reverse waits for the next session.
 */
export async function buildQueue(settings: Pick<Settings, 'newCardsPerDay'>, now = new Date()): Promise<QueueEntry[]> {
  const [due, storedRev, unlocked, themes, newToday, newRevToday] = await Promise.all([
    db.cards.where('fsrs.due').belowOrEqual(now).toArray(),
    db.cards.where('fsrsRev.due').belowOrEqual(now).toArray(),
    unlockedReverse(now),
    db.themes.toArray(),
    newCardsIntroducedToday(now, 'fwd'),
    newCardsIntroducedToday(now, 'rev'),
  ])
  const themeOrder = new Map(themes.map((t) => [t.id, t.order]))
  const byNewestTheme = (dir: Direction) => (a: Card, b: Card) => {
    const d = (themeOrder.get(b.themeId) ?? 0) - (themeOrder.get(a.themeId) ?? 0)
    return d !== 0 ? d : stateOf(a, dir).due.getTime() - stateOf(b, dir).due.getTime()
  }
  const fresh = (s: FsrsState) => s.state === State.New
  const cap = (n: number) => Math.max(0, settings.newCardsPerDay - n)
  const dueRev = [...storedRev, ...unlocked]
  const fwdIds = new Set(due.map((c) => c.id))
  const rev = dueRev.filter((c) => c.fsrsRev && !fwdIds.has(c.id))
  const entries = (cards: Card[], dir: Direction) => cards.map((card) => ({ card, dir }))
  return [
    ...entries(due.filter((c) => !fresh(c.fsrs)).sort(byNewestTheme('fwd')), 'fwd'),
    ...entries(rev.filter((c) => !fresh(c.fsrsRev!)).sort(byNewestTheme('rev')), 'rev'),
    ...entries(due.filter((c) => fresh(c.fsrs)).sort(byNewestTheme('fwd')).slice(0, cap(newToday)), 'fwd'),
    ...entries(rev.filter((c) => fresh(c.fsrsRev!)).sort(byNewestTheme('rev')).slice(0, cap(newRevToday)), 'rev'),
  ]
}

/** Short Spanish label for a time span from `now` to `due`: "1 min", "3 h", "4 d", "2 meses". */
export function formatSpan(due: Date, now = new Date()): string {
  const ms = Math.max(0, due.getTime() - now.getTime())
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo} ${mo === 1 ? 'mes' : 'meses'}`
  const y = Math.round(mo / 12)
  return `${y} ${y === 1 ? 'año' : 'años'}`
}

/** "hoy", "mañana", "en 4 d" for the vocabulary list. */
export function formatDue(due: Date, now = new Date()): string {
  if (due.getTime() <= now.getTime()) return 'ahora'
  const days = Math.ceil((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${formatSpan(due, now)}`
}

/** Replaces the card's word in its example sentence with a blank. */
export function blankOut(sentence: string, word: string): string {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu')
  return re.test(sentence) ? sentence.replace(re, '$1____') : sentence
}
