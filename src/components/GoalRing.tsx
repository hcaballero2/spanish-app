import type { Settings, SplitKey } from '../db/types'
import { SKILL_LABEL, type SkillSeconds } from '../lib/sessions'

const ORDER: SplitKey[] = ['reading', 'listening', 'speaking', 'writing', 'grammar', 'review']

/** Today's minutes against the daily goal, plus one bar per skill with time in the split (PLAN §5, §10). */
export default function GoalRing({
  settings,
  seconds,
  bySkill,
  streak,
}: {
  settings: Settings
  seconds: number
  bySkill: SkillSeconds
  streak: number
}) {
  const minutes = Math.floor(seconds / 60)
  const goal = settings.dailyMinutes
  const frac = goal > 0 ? Math.min(1, seconds / (goal * 60)) : 0
  const done = frac >= 1
  const r = 42
  const c = 2 * Math.PI * r
  const skills = ORDER.filter((k) => settings.split[k] > 0 || (bySkill[k] ?? 0) > 0)

  return (
    <section aria-label="Meta diaria" className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90" role="img" aria-label={`${minutes} de ${goal} minutos`}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-line" />
          {frac > 0 && (
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${frac * c} ${c}`}
              className={`${done ? 'stroke-ok' : 'stroke-accent'} transition-[stroke-dasharray] duration-500`}
            />
          )}
        </svg>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted">Meta diaria</p>
          <p className="text-3xl font-bold tabular-nums">
            {minutes} <span className="text-base font-normal text-muted">/ {goal} min</span>
          </p>
          <p className={`mt-1 text-sm ${done ? 'font-medium text-ok' : 'text-muted'}`}>
            {done ? '✓ ¡Meta cumplida!' : `Faltan ${Math.max(0, goal - minutes)} min`}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {streak > 0 ? `🔥 Racha de ${streak} día${streak === 1 ? '' : 's'}` : 'Racha: estudia la mitad de tu meta hoy'}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {skills.map((k) => {
          const got = Math.floor((bySkill[k] ?? 0) / 60)
          const target = settings.split[k]
          const f = target > 0 ? Math.min(1, (bySkill[k] ?? 0) / (target * 60)) : 0
          const full = target > 0 && f >= 1
          return (
            <li key={k} className="text-sm">
              <div className="flex justify-between">
                <span>{SKILL_LABEL[k]}</span>
                <span className="tabular-nums text-muted">
                  {full ? '✓ ' : ''}
                  {got} / {target} min
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className={`h-full rounded-full ${full ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${f * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
