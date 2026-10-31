import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Recording } from '../db/types'

const MONOLOGUE = '_'

/** Stores a recording, replacing the earlier one for the same item and segment (only the latest is kept). */
export async function saveRecording(itemId: string, segmentId: string | undefined, blob: Blob): Promise<void> {
  await db.transaction('rw', db.recordings, async () => {
    await db.recordings
      .where('itemId')
      .equals(itemId)
      .filter((r) => (r.segmentId ?? MONOLOGUE) === (segmentId ?? MONOLOGUE))
      .delete()
    await db.recordings.add({ itemId, segmentId, blob, createdAt: new Date() })
  })
}

/** Object URLs for an item's saved recordings, keyed by segment id (`_` for a monologue). Revoked on change. */
export function useRecordingUrls(itemId: string): Map<string, string> | undefined {
  const rows = useLiveQuery(() => db.recordings.where('itemId').equals(itemId).toArray(), [itemId])
  const urls = useMemo(() => {
    if (!rows) return undefined
    const m = new Map<string, string>()
    for (const r of rows as Recording[]) m.set(r.segmentId ?? MONOLOGUE, URL.createObjectURL(r.blob))
    return m
  }, [rows])
  useEffect(() => () => urls?.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}

export const MONOLOGUE_KEY = MONOLOGUE
