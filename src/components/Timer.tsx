import type { SplitKey } from '../db/types'
import { formatClock, useSessionTimer } from '../lib/sessions'

/** Runs the session timer for this screen and shows the time studied here (PLAN §10). */
export default function Timer({ skill, itemId }: { skill: SplitKey; itemId?: string }) {
  const { seconds, paused } = useSessionTimer(skill, itemId)
  return (
    <span
      role="timer"
      aria-label={paused ? `En pausa, ${formatClock(seconds)}` : `Tiempo, ${formatClock(seconds)}`}
      title={paused ? 'En pausa: toca la pantalla para seguir' : 'Tiempo de estudio en esta pantalla'}
      className={`rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${paused ? 'bg-line text-muted' : 'text-muted'}`}
    >
      {paused ? '⏸ ' : ''}
      {formatClock(seconds)}
    </span>
  )
}
