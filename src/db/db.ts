import Dexie, { type EntityTable } from 'dexie'
import {
  DEFAULT_SETTINGS,
  type Card,
  type Item,
  type ItemProgress,
  type Recording,
  type Review,
  type Session,
  type Settings,
  type Theme,
  type ThemeProgress,
} from './types'

// One Dexie database, tables per PLAN.md §6. Only indexed fields are listed in
// the schema string; every other field is stored but not queryable by index.
export class SpanishDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  themes!: EntityTable<Theme, 'id'>
  items!: EntityTable<Item, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviews!: EntityTable<Review, 'id'>
  sessions!: EntityTable<Session, 'id'>
  itemProgress!: EntityTable<ItemProgress, 'itemId'>
  themeProgress!: EntityTable<ThemeProgress, 'themeId'>
  recordings!: EntityTable<Recording, 'id'>

  constructor() {
    super('spanish-app')
    this.version(1).stores({
      settings: 'id',
      themes: 'id, order, level, status',
      items: 'id, themeId, skill, level, [themeId+skill]',
      cards: 'id, word, themeId, sourceItemId, fsrs.due, createdAt',
      reviews: '++id, cardId, reviewedAt',
      sessions: '++id, skill, itemId, startedAt',
      itemProgress: 'itemId, status',
      themeProgress: 'themeId',
      recordings: '++id, itemId, createdAt',
    })
  }
}

export const db = new SpanishDB()

/** Returns the settings row, creating it with defaults on first run. */
export async function ensureSettings(): Promise<Settings> {
  const existing = await db.settings.get(1)
  if (existing) return existing
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await ensureSettings()
  await db.settings.update(1, patch)
}
