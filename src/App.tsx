import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { seedContent } from './content/seed'
import Home from './features/home/Home'
import ThemeView from './features/theme/ThemeView'
import ReadingScreen from './features/reading/ReadingScreen'
import ComingSoon from './features/soon/ComingSoon'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    seedContent()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <main className="p-5 text-accent">No se pudo cargar el contenido: {error}</main>
  if (!ready) return <main className="p-5 text-muted">Cargando…</main>

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/theme/:themeId" element={<ThemeView />} />
        <Route path="/read/:itemId" element={<ReadingScreen />} />
        <Route path="/soon/:itemId" element={<ComingSoon />} />
      </Routes>
    </HashRouter>
  )
}
