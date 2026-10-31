import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { seedContent } from './content/seed'
import { applyTheme } from './lib/theme'
import Home from './features/home/Home'
import ThemeView from './features/theme/ThemeView'
import ReadingScreen from './features/reading/ReadingScreen'
import ListeningScreen from './features/listening/ListeningScreen'
import ReviewScreen from './features/review/ReviewScreen'
import VocabList from './features/vocab/VocabList'
import ComingSoon from './features/soon/ComingSoon'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const themePref = useLiveQuery(async () => (await db.settings.get(1))?.theme, [])

  useEffect(() => {
    seedContent()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    if (themePref) applyTheme(themePref)
  }, [themePref])

  if (error) return <main className="p-5 text-accent">No se pudo cargar el contenido: {error}</main>
  if (!ready) return <main className="p-5 text-muted">Cargando…</main>

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/theme/:themeId" element={<ThemeView />} />
        <Route path="/read/:itemId" element={<ReadingScreen />} />
        <Route path="/listen/:itemId" element={<ListeningScreen />} />
        <Route path="/review" element={<ReviewScreen />} />
        <Route path="/vocab" element={<VocabList />} />
        <Route path="/soon/:itemId" element={<ComingSoon />} />
      </Routes>
    </HashRouter>
  )
}
