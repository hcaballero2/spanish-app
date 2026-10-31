import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Session, SplitKey } from '../db/types'

// Time tracking per PLAN §10. A session row is written as soon as studying
// starts and its seconds are updated every few seconds, so a force-quit loses
// at most one flush. A row ends on unmount, when the page is hidden, after
// 2 minutes without interaction (those 2 minutes still count), or at
// local midnight (so "today" stays a calendar day).

const IDLE_MS = 2 * 60_000
const FLUSH_EVERY_S = 5
const ACTIVITY = 'study-activity'
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

/** Counts as interaction for the idle rule; call it on audio events (PLAN §10). */
export function noteActivity(): void {
  window.dispatchEvent(new Event(ACTIVITY))
}

export function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Runs the session timer while the calling screen is mounted. Returns the
 * time studied so far, continuing across visits: all-time for an item, today
 * for review (no item). Also whether the timer is paused (idle or hidden).
 */
export function useSessionTimer(skill: SplitKey, itemId?: string): { seconds: number; paused: boolean } {
  const [seconds, setSeconds] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let segStart: number | null = null
    let rowId: Promise<number> | null = null
    let banked = 0 // seconds from earlier visits plus segments already closed on this screen
    const mountedAt = new Date()
    let lastActivity = Date.now()
    let ticks = 0

    const segSeconds = (end: number) => (segStart === null ? 0 : Math.max(0, Math.round((end - segStart) / 1000)))

    const write = (row: Promise<number>, secs: number, endedAt?: Date) =>
      row.then((id) => db.sessions.update(id, endedAt ? { seconds: secs, endedAt } : { seconds: secs })).catch(() => {})

    const start = (at: number) => {
      segStart = at
      const row: Omit<Session, 'id'> = { skill, itemId, startedAt: new Date(at), seconds: 0 }
      rowId = db.sessions.add(row as Session) as Promise<number>
      setPaused(false)
    }

    const stop = (at: number) => {
      if (segStart === null || !rowId) return
      const secs = segSeconds(at)
      const row = rowId
      if (secs === 0) row.then((id) => db.sessions.delete(id)).catch(() => {})
      else write(row, secs, new Date(at))
      banked += secs
      segStart = null
      rowId = null
      setPaused(true)
      setSeconds(banked)
    }

    const onActivity = () => {
      lastActivity = Date.now()
      if (segStart === null && document.visibilityState === 'visible') start(lastActivity)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop(Date.now())
      else onActivity()
    }
    const onPageHide = () => stop(Date.now())

    const tick = () => {
      const now = Date.now()
      if (segStart === null) return
      if (now - lastActivity > IDLE_MS) {
        stop(lastActivity + IDLE_MS)
        return
      }
      const midnight = addDays(startOfDay(new Date(segStart)), 1).getTime()
      if (now >= midnight) {
        stop(midnight)
        start(midnight)
      }
      setSeconds(banked + segSeconds(now))
      if (++ticks % FLUSH_EVERY_S === 0 && rowId) write(rowId, segSeconds(now))
    }

    // Earlier visits: rows that started before this screen opened.
    const earlier = itemId
      ? db.sessions.where('itemId').equals(itemId)
      : db.sessions.where('startedAt').aboveOrEqual(startOfDay()).filter((r) => r.skill === skill)
    let alive = true
    earlier
      .filter((r) => r.startedAt < mountedAt)
      .toArray()
      .then((rows) => {
        if (!alive) return
        banked += rows.reduce((a, r) => a + r.seconds, 0)
        setSeconds(banked + segSeconds(Date.now()))
      })
      .catch(() => {})

    if (document.visibilityState === 'visible') start(Date.now())
    else setPaused(true)
    const interval = window.setInterval(tick, 1000)
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { capture: true, passive: true })
    window.addEventListener(ACTIVITY, onActivity)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      alive = false
      window.clearInterval(interval)
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity, { capture: true })
      window.removeEventListener(ACTIVITY, onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      stop(Date.now())
    }
  }, [skill, itemId])

  return { seconds, paused }
}

export type SkillSeconds = Partial<Record<SplitKey, number>>

export interface DayTotal {
  day: string // YYYY-MM-DD
  date: Date
  seconds: number
  bySkill: SkillSeconds
}

/** Per-day totals for the last `days` local days, oldest first, today last. */
export async function dailyTotals(days: number, today: Date = new Date()): Promise<DayTotal[]> {
  const from = addDays(startOfDay(today), -(days - 1))
  const rows = await db.sessions.where('startedAt').aboveOrEqual(from).toArray()
  const out: DayTotal[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    out.push({ day: dayKey(date), date, seconds: 0, bySkill: {} })
  }
  const index = new Map(out.map((d) => [d.day, d]))
  for (const r of rows) {
    const d = index.get(dayKey(r.startedAt))
    if (!d) continue
    d.seconds += r.seconds
    d.bySkill[r.skill] = (d.bySkill[r.skill] ?? 0) + r.seconds
  }
  return out
}

export async function todayTotals(): Promise<DayTotal> {
  return (await dailyTotals(1))[0]!
}

/**
 * Consecutive days with at least half the daily goal (PLAN §10). Today counts
 * once it qualifies; until then the streak runs through yesterday.
 */
export async function streak(dailyMinutes: number, today: Date = new Date()): Promise<number> {
  const needed = (dailyMinutes * 60) / 2
  const perDay = new Map<string, number>()
  await db.sessions.each((r) => {
    const k = dayKey(r.startedAt)
    perDay.set(k, (perDay.get(k) ?? 0) + r.seconds)
  })
  const met = (d: Date) => (perDay.get(dayKey(d)) ?? 0) >= needed
  let day = startOfDay(today)
  if (!met(day)) day = addDays(day, -1)
  let n = 0
  while (met(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export const SKILL_LABEL: Record<SplitKey, string> = {
  reading: 'Lectura',
  listening: 'Escucha',
  speaking: 'Habla',
  writing: 'Escritura',
  grammar: 'Gramática',
  review: 'Repaso',
}
