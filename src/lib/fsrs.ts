// Spaced repetition on top of ts-fsrs (PLAN §7.2). Uses the library's legacy
// `fsrs()`/`createEmptyCard()` API because its Card shape is exactly what
// phase 1 stored under `cards.fsrs`; the scheduler is FSRS-6 with default
// weights, learning steps 1m/10m and relearning 10m.
import { fsrs, Rating, State, type Grade } from 'ts-fsrs'
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

/** A card is shown "reversed" (English on the front) once it has been seen a few times. */
export function isReversed(card: Card): boolean {
  return card.fsrs.reps >= 3
}

/** Next due date per grade, for the labels under the rating buttons. */
export function previewDue(card: Card, now = new Date()): Record<Grade, Date> {
  const log = scheduler.repeat(card.fsrs, now)
  return { 1: log[1].card.due, 2: log[2].card.due, 3: log[3].card.due, 4: log[4].card.due }
}

/** Rates a card: stores the new FSRS state and appends a review row. Returns the updated card. */
export async function rateCard(card: Card, grade: Grade, now = new Date()): Promise<Card> {
  const result = scheduler.next(card.fsrs, now, grade)
  const next: FsrsState = { ...result.card }
  const updated: Card = { ...card, fsrs: next }
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.update(card.id, { fsrs: next })
    await db.reviews.add({ cardId: card.id, rating: grade, reviewedAt: now, wasNew: isNew(card) })
  })
  return updated
}

function startOfDay(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s
}

/** How many brand-new cards were introduced today (counts towards `newCardsPerDay`). */
export async function newCardsIntroducedToday(now = new Date()): Promise<number> {
  const rows = await db.reviews.where('reviewedAt').aboveOrEqual(startOfDay(now)).toArray()
  return rows.filter((r) => r.wasNew).length
}

/**
 * The review queue: every card whose due date has passed, newest theme first,
 * with brand-new cards capped at `newCardsPerDay` minus the ones already
 * introduced today. New cards are due at creation, so they are "due" too.
 */
export async function buildQueue(settings: Pick<Settings, 'newCardsPerDay'>, now = new Date()): Promise<Card[]> {
  const [due, themes, newToday] = await Promise.all([
    db.cards.where('fsrs.due').belowOrEqual(now).toArray(),
    db.themes.toArray(),
    newCardsIntroducedToday(now),
  ])
  const themeOrder = new Map(themes.map((t) => [t.id, t.order]))
  const byNewestTheme = (a: Card, b: Card) => {
    const d = (themeOrder.get(b.themeId) ?? 0) - (themeOrder.get(a.themeId) ?? 0)
    return d !== 0 ? d : a.fsrs.due.getTime() - b.fsrs.due.getTime()
  }
  const review = due.filter((c) => !isNew(c)).sort(byNewestTheme)
  const fresh = due.filter(isNew).sort(byNewestTheme).slice(0, Math.max(0, settings.newCardsPerDay - newToday))
  return [...review, ...fresh]
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
