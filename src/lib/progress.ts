import { db } from '../db/db'
import type { ItemProgress } from '../db/types'
import { completeTheme } from '../content/seed'

/** Merges fields into an item's progress row, creating it as 'started' if missing. */
export async function patchItemProgress(itemId: string, patch: Partial<Omit<ItemProgress, 'itemId'>>): Promise<void> {
  await db.transaction('rw', db.itemProgress, async () => {
    const prev = await db.itemProgress.get(itemId)
    await db.itemProgress.put({ status: 'started', ...prev, ...patch, itemId })
  })
}

/** Marks an item done and completes the theme when it was the last one (PLAN §7.8 gating is phase 7). */
export async function markItemDone(itemId: string, themeId: string): Promise<void> {
  // Merge, so a writing draft, checklist or self-rating survives being marked done.
  await patchItemProgress(itemId, { status: 'done', completedAt: new Date() })
  const siblings = await db.items.where('themeId').equals(themeId).toArray()
  const prog = await db.itemProgress.bulkGet(siblings.map((s) => s.id))
  const allDone = siblings.every((s, i) => prog[i]?.status === 'done' || s.id === itemId)
  if (allDone) await completeTheme(themeId)
}
