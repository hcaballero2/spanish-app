import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { db, ensureSettings, updateSettings } from '../../db/db'
import { LEVELS, type Level } from '../../db/types'
import InstallHint from '../../components/InstallHint'
import { isStandalone } from '../../lib/platform'

export default function Home() {
  const settings = useLiveQuery(() => db.settings.get(1))
  const [online, setOnline] = useState(navigator.onLine)

  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    void ensureSettings()
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
        <p className="mt-1 text-sm text-muted">El contenido y el cronómetro llegan en las siguientes fases.</p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Nivel</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <LevelSelect
            label="Actual"
            value={settings.currentLevel}
            onChange={(v) => updateSettings({ currentLevel: v })}
          />
          <LevelSelect
            label="Meta"
            value={settings.targetLevel}
            onChange={(v) => updateSettings({ targetLevel: v })}
          />
        </div>
        <p className="mt-3 text-xs text-muted">Se guarda en este dispositivo.</p>
      </section>

      <InstallHint />

      {needRefresh && (
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-xl bg-accent px-4 py-3 font-medium text-white"
        >
          Hay una versión nueva · Actualizar
        </button>
      )}

      <footer className="mt-4 text-center text-xs text-muted">
        Fase 0 · {isStandalone() ? 'instalada' : 'en navegador'}
        {offlineReady ? ' · lista sin conexión' : ''}
      </footer>
    </main>
  )
}

function LevelSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: Level
  onChange: (v: Level) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Level)}
        className="rounded-lg border border-line bg-paper px-3 py-2 text-base"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
