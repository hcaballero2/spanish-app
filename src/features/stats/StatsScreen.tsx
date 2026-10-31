import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { LEVELS, type SplitKey } from '../../db/types'
import TopBar from '../../components/TopBar'
import { SKILL_LABEL, dailyTotals, streak } from '../../lib/sessions'

const SPLIT_ORDER: SplitKey[] = ['reading', 'listening', 'speaking', 'writing', 'grammar', 'review']
const WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** Streak, minutes per day and per skill, cards learned, level progress (PLAN §5, §7.8). */
export default function StatsScreen() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const week = useLiveQuery(() => dailyTotals(7), [])
  const days = useLiveQuery(async () => (settings ? streak(settings.dailyMinutes) : 0), [settings?.dailyMinutes])
  const cards = useLiveQuery(async () => {
    const all = await db.cards.toArray()
    return { total: all.length, learned: all.filter((c) => c.fsrs.state === 2).length }
  }, [])
  const themes = useLiveQuery(() => db.themes.toArray(), [])
  const tooHard = useLiveQuery(() => db.itemProgress.filter((p) => !!p.tooHard).count(), [])
  const output = useLiveQuery(async () => {
    const prog = await db.itemProgress.toArray()
    const items = new Map((await db.items.toArray()).map((i) => [i.id, i]))
    const rated = prog.filter((p) => items.get(p.itemId)?.skill === 'speaking' && p.selfRating)
    const checked = prog.filter((p) => items.get(p.itemId)?.skill === 'writing' && p.checklistDone)
    const listLen = (id: string) => items.get(id)?.checklist?.length ?? 0
    const ticked = checked.reduce((a, p) => a + p.checklistDone!.length, 0)
    const possible = checked.reduce((a, p) => a + listLen(p.itemId), 0)
    return {
      speaking: rated.length,
      avgRating: rated.length ? rated.reduce((a, p) => a + p.selfRating!, 0) / rated.length : 0,
      writing: checked.length,
      checklistPct: possible ? Math.round((ticked / possible) * 100) : 0,
    }
  }, [])
  const [picked, setPicked] = useState(6)

  if (!settings || !week || !cards || !themes) return <main className="p-5 text-muted">Cargando…</main>

  const goal = settings.dailyMinutes
  const maxMin = Math.max(goal, ...week.map((d) => d.seconds / 60))
  const sel = week[Math.min(picked, week.length - 1)]!
  const weekBySkill = (k: SplitKey) => week.reduce((a, d) => a + (d.bySkill[k] ?? 0), 0)
  const weekMinutes = Math.floor(week.reduce((a, d) => a + d.seconds, 0) / 60)

  return (
    <>
      <TopBar title="Estadísticas" back="/" />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-5 pb-16">
        <section className="grid grid-cols-2 gap-3">
          <Tile label="Racha" value={`${days ?? 0}`} unit={days === 1 ? 'día' : 'días'} note="con ≥ la mitad de la meta" />
          <Tile label="Esta semana" value={`${weekMinutes}`} unit="min" note={`meta: ${goal * 7} min`} />
        </section>

        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold">Últimos 7 días</h2>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {dayName(sel.date, week.length - 1 === picked)}: <strong className="text-ink">{Math.floor(sel.seconds / 60)} min</strong>
            {sel.seconds >= goal * 60 ? ' · ✓ meta' : ''}
          </p>
          <div className="relative h-32">
            <div
              className="absolute inset-x-0 border-t border-dashed border-muted/60"
              style={{ bottom: `${(goal / maxMin) * 100}%` }}
              aria-hidden
            >
              <span className="absolute -top-4 right-0 text-[10px] text-muted">meta {goal}</span>
            </div>
            <div className="absolute inset-0 flex items-end gap-1.5">
              {week.map((d, i) => {
                const min = d.seconds / 60
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setPicked(i)}
                    aria-label={`${dayName(d.date, i === week.length - 1)}: ${Math.floor(min)} minutos`}
                    aria-pressed={i === picked}
                    className="flex h-full flex-1 items-end"
                  >
                    <span
                      className={`block w-full rounded-t ${min >= goal ? 'bg-ok' : 'bg-accent'} ${i === picked ? '' : 'opacity-60'}`}
                      style={{ height: `${Math.max(min > 0 ? 3 : 0, (min / maxMin) * 100)}%` }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-1 flex gap-1.5 border-t border-line pt-1 text-center text-[11px] text-muted">
            {week.map((d, i) => (
              <span key={d.day} className={`flex-1 ${i === picked ? 'font-semibold text-ink' : ''}`}>
                {i === week.length - 1 ? 'hoy' : WEEKDAY[d.date.getDay()]}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-3 font-semibold">Minutos por habilidad · 7 días</h2>
          <ul className="flex flex-col gap-2">
            {SPLIT_ORDER.filter((k) => settings.split[k] > 0 || weekBySkill(k) > 0).map((k) => {
              const got = weekBySkill(k) / 60
              const target = settings.split[k] * 7
              return (
                <li key={k} className="text-sm">
                  <div className="flex justify-between">
                    <span>{SKILL_LABEL[k]}</span>
                    <span className="tabular-nums text-muted">
                      {Math.floor(got)} / {target} min
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${target > 0 ? Math.min(100, (got / target) * 100) : 0}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Tile label="Tarjetas" value={`${cards.total}`} unit="guardadas" />
          <Tile label="Aprendidas" value={`${cards.learned}`} unit="en repaso" note="ya pasaron la fase de aprendizaje" />
        </section>

        {output && (output.speaking > 0 || output.writing > 0) && (
          <section className="grid grid-cols-2 gap-3">
            <Tile
              label="Habla"
              value={output.speaking ? output.avgRating.toFixed(1) : '–'}
              unit="de 4"
              note={`autoevaluación · ${output.speaking} ${output.speaking === 1 ? 'tarea' : 'tareas'}`}
            />
            <Tile
              label="Escritura"
              value={output.writing ? `${output.checklistPct}` : '–'}
              unit="%"
              note={`de la lista cumplida · ${output.writing} ${output.writing === 1 ? 'texto' : 'textos'}`}
            />
          </section>
        )}

        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-1 font-semibold">Nivel</h2>
          <p className="mb-3 text-sm text-muted">
            Actual <strong className="text-ink">{settings.currentLevel}</strong> · meta <strong className="text-ink">{settings.targetLevel}</strong>
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {LEVELS.map((l) => {
              const all = themes.filter((t) => t.level === l)
              if (all.length === 0) return null
              const done = all.filter((t) => t.status === 'done').length
              return (
                <li key={l} className="flex justify-between">
                  <span>Temas {l}</span>
                  <span className="tabular-nums text-muted">
                    {done} de {all.length} terminados
                  </span>
                </li>
              )
            })}
            <li className="flex justify-between">
              <span>Marcados «muy difícil»</span>
              <span className="tabular-nums text-muted">{tooHard ?? 0}</span>
            </li>
          </ul>
        </section>
      </main>
    </>
  )
}

function dayName(d: Date, today: boolean): string {
  if (today) return 'Hoy'
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}`
}

function Tile({ label, value, unit, note }: { label: string; value: string; unit: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">
        {value} <span className="text-sm font-normal text-muted">{unit}</span>
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  )
}
