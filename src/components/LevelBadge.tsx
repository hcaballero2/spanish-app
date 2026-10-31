import type { Level } from '../db/types'

export default function LevelBadge({ level, stretch }: { level: Level; stretch?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
      <span className="rounded bg-line px-1.5 py-0.5">{level}</span>
      {stretch && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">reto</span>}
    </span>
  )
}
