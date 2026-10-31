import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { SKILLS, type Item, type Skill } from '../../db/types'
import TopBar from '../../components/TopBar'
import LevelBadge from '../../components/LevelBadge'

const SKILL_LABEL: Record<Skill, string> = {
  reading: 'Lectura',
  listening: 'Escucha',
  speaking: 'Habla',
  writing: 'Escritura',
  grammar: 'Gramática',
}

export function itemRoute(item: Item): string {
  if (item.skill === 'reading') return `/read/${item.id}`
  if (item.skill === 'listening') return `/listen/${item.id}`
  return `/soon/${item.id}`
}

export default function ThemeView() {
  const { themeId = '' } = useParams()
  const theme = useLiveQuery(() => db.themes.get(themeId), [themeId])
  const items = useLiveQuery(() => db.items.where('themeId').equals(themeId).toArray(), [themeId])
  const progress = useLiveQuery(async () => {
    const rows = await db.itemProgress.toArray()
    return new Map(rows.map((r) => [r.itemId, r]))
  }, [])
  const [showCulture, setShowCulture] = useState(false)

  if (!theme || !items || !progress) return <main className="p-5 text-muted">Cargando…</main>

  const doneCount = items.filter((i) => progress.get(i.id)?.status === 'done').length

  return (
    <>
      <TopBar title={theme.titleEs} back="/" right={<LevelBadge level={theme.level} />} />
      <main className="mx-auto max-w-md space-y-5 p-5">
        <p className="text-sm text-muted">{theme.description}</p>
        <p className="text-sm">
          <span className="font-semibold">{doneCount}</span> de {items.length} terminados
          {theme.status === 'done' && <span className="ml-2 text-ok">· tema completado ✓</span>}
        </p>

        {SKILLS.map((skill) => {
          const group = items.filter((i) => i.skill === skill)
          if (group.length === 0) return null
          return (
            <section key={skill}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{SKILL_LABEL[skill]}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                {group.map((item) => {
                  const st = progress.get(item.id)?.status ?? 'new'
                  return (
                    <li key={item.id}>
                      <Link to={itemRoute(item)} className="flex items-center gap-3 px-4 py-3 active:bg-accent-soft">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                            st === 'done' ? 'border-ok bg-ok text-on-accent' : 'border-line text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.title}</span>
                          <span className="text-xs text-muted">{item.estimatedMinutes} min</span>
                        </span>
                        <LevelBadge level={item.level} stretch={item.stretch} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        <section className="rounded-2xl border border-line bg-card p-4">
          <button type="button" onClick={() => setShowCulture((v) => !v)} className="flex w-full items-center justify-between font-semibold">
            Nota cultural <span className="text-muted">{showCulture ? '−' : '+'}</span>
          </button>
          {showCulture && <p className="mt-2 text-sm leading-relaxed">{theme.cultureNote}</p>}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recursos recomendados</h2>
          <ul className="space-y-1 text-sm">
            {theme.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
