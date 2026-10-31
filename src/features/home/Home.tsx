import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { db } from '../../db/db'
import { buildQueue } from '../../lib/fsrs'
import InstallHint from '../../components/InstallHint'
import GoalRing from '../../components/GoalRing'
import { streak, todayTotals } from '../../lib/sessions'
import LevelBadge from '../../components/LevelBadge'
import { isStandalone } from '../../lib/platform'

export default function Home() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const theme = useLiveQuery(
    () => (settings?.activeThemeId ? db.themes.get(settings.activeThemeId) : undefined),
    [settings?.activeThemeId],
  )
  const themeStats = useLiveQuery(async () => {
    if (!settings?.activeThemeId) return undefined
    const items = await db.items.where('themeId').equals(settings.activeThemeId).toArray()
    const prog = await db.itemProgress.bulkGet(items.map((i) => i.id))
    return { total: items.length, done: prog.filter((p) => p?.status === 'done').length }
  }, [settings?.activeThemeId])
  const cardCount = useLiveQuery(() => db.cards.count(), [])
  const dueCount = useLiveQuery(
    async () => (settings ? (await buildQueue(settings)).length : 0),
    [settings?.newCardsPerDay],
  )
  const today = useLiveQuery(() => todayTotals(), [])
  const streakDays = useLiveQuery(async () => (settings ? streak(settings.dailyMinutes) : 0), [settings?.dailyMinutes])
  const themesDone = useLiveQuery(() => db.themes.where('status').equals('done').count(), [])
  const [online, setOnline] = useState(navigator.onLine)

  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!settings) return <main className="p-5 text-muted">Cargando…</main>

  // End-of-day nudge (PLAN §7.7): cards are waiting and it is past the review hour.
  const nudge = (dueCount ?? 0) > 0 && new Date().getHours() >= settings.reviewHour

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Hoy</h1>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted">{online ? 'en línea' : 'sin conexión'}</span>
          <Link to="/stats" aria-label="Estadísticas" className="rounded-lg px-2 py-1 text-xl">
            📊
          </Link>
          <Link to="/settings" aria-label="Ajustes" className="rounded-lg px-2 py-1 text-xl">
            ⚙️
          </Link>
        </div>
      </header>

      <GoalRing settings={settings} seconds={today?.seconds ?? 0} bySkill={today?.bySkill ?? {}} streak={streakDays ?? 0} />

      {theme ? (
        <section className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Tema {theme.order}</p>
              <h2 className="text-lg font-semibold">{theme.titleEs}</h2>
            </div>
            <LevelBadge level={theme.level} />
          </div>
          {themeStats && (
            <p className="mt-1 text-sm text-muted">
              {themeStats.done} de {themeStats.total} terminados
            </p>
          )}
          <Link to={`/theme/${theme.id}`} className="mt-3 block rounded-xl bg-accent px-4 py-3 text-center font-medium text-on-accent">
            Continuar
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">
          No hay más temas. {themesDone ?? 0} completados. Pide a Claude Code otro paquete.
        </section>
      )}

      {nudge && (
        <section className="rounded-2xl bg-accent-soft p-4 text-sm">
          <p className="font-semibold text-accent">Antes de dormir</p>
          <p className="mt-1">
            Repasa las {dueCount} tarjeta{dueCount === 1 ? '' : 's'} de hoy. Son unos minutos y así no se olvidan.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Tarjetas</p>
            <p className="text-sm text-muted">
              {cardCount ?? 0} guardada{cardCount === 1 ? '' : 's'} · {dueCount ?? 0} pendiente{dueCount === 1 ? '' : 's'}
            </p>
          </div>
          <Link to="/vocab" className="text-sm text-accent">
            Ver todas
          </Link>
        </div>
        {dueCount ? (
          <Link to="/review" className="mt-3 block rounded-xl bg-accent px-4 py-3 text-center font-medium text-on-accent">
            Repasar {dueCount}
          </Link>
        ) : (
          <p className="mt-3 rounded-xl border border-line px-4 py-3 text-center text-sm text-muted">Nada pendiente por ahora</p>
        )}
      </section>

      <InstallHint />

      {needRefresh && (
        <button type="button" onClick={() => updateServiceWorker(true)} className="rounded-xl bg-accent px-4 py-3 font-medium text-on-accent">
          Hay una versión nueva · Actualizar
        </button>
      )}

      <footer className="mt-4 text-center text-xs text-muted">
        Fase 4 · {isStandalone() ? 'instalada' : 'en navegador'}
        {offlineReady ? ' · lista sin conexión' : ''}
      </footer>
    </main>
  )
}
