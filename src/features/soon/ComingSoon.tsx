import { useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import TopBar from '../../components/TopBar'

const PHASE: Record<string, string> = {
  grammar: 'fase 8',
}

export default function ComingSoon() {
  const { itemId = '' } = useParams()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  if (!item) return <main className="p-5 text-muted">Cargando…</main>
  return (
    <>
      <TopBar title={item.title} back={`/theme/${item.themeId}`} />
      <main className="mx-auto max-w-md p-5">
        <p className="text-muted">
          La pantalla de <strong>{item.skill}</strong> llega en la {PHASE[item.skill] ?? 'siguiente fase'}.
        </p>
      </main>
    </>
  )
}
