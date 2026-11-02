import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { cardsByKey, saveCard } from '../../lib/cards'
import { wordKey } from '../../lib/words'
import { markItemDone } from '../../lib/progress'
import TopBar from '../../components/TopBar'
import Timer from '../../components/Timer'
import LevelBadge from '../../components/LevelBadge'
import Comprehension from '../../components/Comprehension'
import DoneButton from '../../components/DoneButton'

/** 75 → "1:15" */
function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Listening with real Mexican speakers: a clip of a YouTube video, played in
 * place when the channel allows embedding, otherwise opened in YouTube at the
 * start time. Nothing from the video is copied; the app adds what to listen
 * for, key words to save, and questions.
 */
export default function VideoScreen() {
  const { itemId = '' } = useParams()
  const navigate = useNavigate()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  const progress = useLiveQuery(() => db.itemProgress.get(itemId), [itemId])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const [toast, setToast] = useState<string | null>(null)

  if (!item) return null
  const video = item.video
  if (!video) return <main className="p-5">Este elemento no tiene video.</main>
  const known = cardsByKey(cards ?? [])
  const done = progress?.status === 'done'
  const watchUrl = `https://www.youtube.com/watch?v=${video.youtubeId}&t=${video.start}s`
  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.youtubeId}?start=${video.start}&end=${video.end}&playsinline=1&rel=0&hl=es`

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  return (
    <>
      <TopBar
        title={item.title}
        back={`/theme/${item.themeId}`}
        right={
          <>
            <Timer skill="listening" itemId={item.id} />
            <LevelBadge level={item.level} stretch={item.stretch} />
          </>
        }
      />
      <main className="mx-auto max-w-md p-5 pb-24">
        <p className="text-xs text-muted">
          Video real · {video.channel} · minuto {clock(video.start)}–{clock(video.end)}
        </p>

        {item.listenFor && (
          <section className="mt-3 rounded-2xl border-l-4 border-accent bg-accent-soft p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Escucha para…</h2>
            <p className="mt-1">{item.listenFor}</p>
          </section>
        )}

        {video.embeddable ? (
          <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-ink">
            <iframe
              src={embedUrl}
              title={video.title}
              className="h-full w-full"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-line bg-card p-4">
            <a
              href={watchUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl bg-accent px-4 py-3 text-center font-medium text-on-accent"
            >
              ▶ Ver en YouTube desde el {clock(video.start)}
            </a>
            <p className="mt-2 text-sm text-muted">
              Este canal no deja ver sus videos dentro de otras apps. Míralo hasta el {clock(video.end)} y regresa aquí para las preguntas.
            </p>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          «{video.title}» ·{' '}
          <a href={`https://www.youtube.com/watch?v=${video.youtubeId}`} target="_blank" rel="noreferrer" className="underline">
            video completo
          </a>
        </p>

        {item.keyWords && (
          <section className="mt-6">
            <h2 className="font-semibold">Palabras clave</h2>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card">
              {item.keyWords.map((k) => {
                const saved = known.has(wordKey(k.es))
                return (
                  <li key={k.es} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <p className="font-medium">{k.es}</p>
                      <p className="text-sm text-muted">{k.en}</p>
                    </div>
                    <button
                      type="button"
                      disabled={saved}
                      aria-label={`Guardar ${k.es}`}
                      onClick={async () => {
                        await saveCard({ word: k.es, meaning: k.en, exampleEs: k.exampleEs, exampleEn: k.exampleEn, sourceItemId: item.id, themeId: item.themeId })
                        flash('Tarjeta guardada')
                      }}
                      className="rounded-full border border-line px-3 py-1 text-sm text-accent disabled:text-muted"
                    >
                      {saved ? '✓' : '+ Guardar'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {item.questions && <Comprehension questions={item.questions} />}

        <DoneButton done={done} onClick={() => void markItemDone(item.id, item.themeId).then(() => navigate(`/theme/${item.themeId}`))} />
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center">
          <span className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow">{toast}</span>
        </div>
      )}
    </>
  )
}
