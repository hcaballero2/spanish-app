import { db, ensureSettings } from '../db/db'
import type { Item, Theme } from '../db/types'
import { packs } from './packs'

/**
 * Copies the bundled packs into Dexie on every launch. Content rows are
 * overwritten (packs are the source of truth); theme status and all progress
 * tables are preserved.
 */
export async function seedContent(): Promise<void> {
  const settings = await ensureSettings()
  await db.transaction('rw', db.themes, db.items, db.settings, async () => {
    const existing = new Map((await db.themes.toArray()).map((t) => [t.id, t]))
    const themes: Theme[] = packs.map((p) => ({
      id: p.id,
      title: p.title,
      titleEs: p.titleEs,
      level: p.level,
      order: p.order,
      description: p.description,
      cultureNote: p.cultureNote,
      status: existing.get(p.id)?.status ?? 'locked',
      sources: p.sources,
    }))
    const items: Item[] = packs.flatMap((p) =>
      p.items.map((it) => ({ ...it, themeId: p.id }) as Item),
    )
    await db.themes.bulkPut(themes)
    await db.items.bulkPut(items)

    // Make sure exactly one theme is active: the setting, or the first not-done theme.
    const hasActive = settings.activeThemeId && themes.some((t) => t.id === settings.activeThemeId)
    if (!hasActive) {
      const first = themes.filter((t) => t.status !== 'done').sort((a, b) => a.order - b.order)[0]
      if (first) {
        await db.themes.update(first.id, { status: 'active' })
        await db.settings.update(1, { activeThemeId: first.id })
      }
    } else {
      await db.themes.update(settings.activeThemeId!, { status: 'active' })
    }
  })
}

/** Marks a theme done and activates the next one in order. */
export async function completeTheme(themeId: string): Promise<void> {
  await db.transaction('rw', db.themes, db.settings, async () => {
    const theme = await db.themes.get(themeId)
    if (!theme || theme.status === 'done') return
    await db.themes.update(themeId, { status: 'done' })
    const next = (await db.themes.where('order').above(theme.order).sortBy('order')).find(
      (t) => t.status !== 'done',
    )
    if (next) {
      await db.themes.update(next.id, { status: 'active' })
      await db.settings.update(1, { activeThemeId: next.id })
    } else {
      await db.settings.update(1, { activeThemeId: undefined })
    }
  })
}
