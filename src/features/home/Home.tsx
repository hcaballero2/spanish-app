import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { db, updateSettings } from '../../db/db'
import { LEVELS, type Level } from '../../db/types'
import InstallHint from '../../components/InstallHint'
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

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Hoy</h1>
        <span className="text-xs text-muted">{online ? 'en línea' : 'sin conexión'}</span>
      </header>

      <section className="rounded-2xl bg-accent-soft p-4">
        <p className="text-xs uppercase tracking-wide text-muted">Meta diaria</p>
        <p className="text-3xl font-bold">
          0 <span className="text-base font-normal text-muted">/ {settings.dailyMinutes} min</span>
        </p>
        <p className="mt-1 text-xs text-muted">El cronómetro llega en la fase 4.</p>
      </section>

      {theme ? (
        <section className="rounded-2xl border border-line bg-white p-4">
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
          <Link to={`/theme/${theme.id}`} className="mt-3 block rounded-xl bg-accent px-4 py-3 text-center font-medium text-white">
            Continuar
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">
          No hay más temas. {themesDone ?? 0} completados. Pide a Claude Code otro paquete.
        </section>
      )}

      <section className="flex items-center justify-between rounded-2xl border border-line bg-white p-4">
        <div>
          <p className="font-semibold">Tarjetas</p>
          <p className="text-sm text-muted">{cardCount ?? 0} guardadas · el repaso llega en la fase 2</p>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Nivel</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <LevelSelect label="Actual" value={settings.currentLevel} onChange={(v) => updateSettings({ currentLevel: v })} />
          <LevelSelect label="Meta" value={settings.targetLevel} onChange={(v) => updateSettings({ targetLevel: v })} />
        </div>
      </section>

      <InstallHint />

      {needRefresh && (
        <button type="button" onClick={() => updateServiceWorker(true)} className="rounded-xl bg-accent px-4 py-3 font-medium text-white">
          Hay una versión nueva · Actualizar
        </button>
      )}

      <footer className="mt-4 text-center text-xs text-muted">
        Fase 1 · {isStandalone() ? 'instalada' : 'en navegador'}
        {offlineReady ? ' · lista sin conexión' : ''}
      </footer>
    </main>
  )
}

function LevelSelect({ label, value, onChange }: { label: string; value: Level; onChange: (v: Level) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Level)} className="rounded-lg border border-line bg-paper px-3 py-2 text-base">
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
