import { db } from '../db/db'
import { completeTheme } from '../content/seed'

/** Marks an item done and completes the theme when it was the last one (PLAN §7.8 gating is phase 7). */
export async function markItemDone(itemId: string, themeId: string): Promise<void> {
  await db.itemProgress.put({ itemId, status: 'done', completedAt: new Date() })
  const siblings = await db.items.where('themeId').equals(themeId).toArray()
  const prog = await db.itemProgress.bulkGet(siblings.map((s) => s.id))
  const allDone = siblings.every((s, i) => prog[i]?.status === 'done' || s.id === itemId)
  if (allDone) await completeTheme(themeId)
}
