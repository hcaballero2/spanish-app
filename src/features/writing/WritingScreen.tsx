import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Item } from '../../db/types'
import { markItemDone, patchItemProgress } from '../../lib/progress'
import { speak } from '../../lib/tts'
import TopBar from '../../components/TopBar'
import Timer from '../../components/Timer'
import LevelBadge from '../../components/LevelBadge'
import DoneButton from '../../components/DoneButton'

const SAVE_DELAY_MS = 600

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

/** The text pasted into the Claude app by hand (PLAN §7.5). The app itself never calls an AI service. */
export function correctionPrompt(item: Item, text: string): string {
  return `Corrige este texto en español mexicano, nivel ${item.level}, explica cada cambio.\n\nTarea: ${item.prompt ?? ''}\n\nMi texto:\n${text.trim()}`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers without the async clipboard API.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** Writing (PLAN §7.5): prompt, live word count, autosaved draft, then model answer + checklist. */
export default function WritingScreen() {
  const { itemId = '' } = useParams()
  // Keyed so the draft state never carries over to another item.
  return <WritingItem key={itemId} itemId={itemId} />
}

function WritingItem({ itemId }: { itemId: string }) {
  const navigate = useNavigate()
  const item = useLiveQuery(() => db.items.get(itemId), [itemId])
  const progress = useLiveQuery(async () => (await db.itemProgress.get(itemId)) ?? null, [itemId])
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const pending = useRef<{ timer: number; text: string } | null>(null)

  // Load the draft once; after that the textarea owns the text.
  useEffect(() => {
    if (text === null && progress !== undefined) setText(progress?.userText ?? '')
  }, [progress, text])

  const flush = () => {
    const p = pending.current
    if (!p) return
    window.clearTimeout(p.timer)
    pending.current = null
    void patchItemProgress(itemId, { userText: p.text }).then(() => setSaved(true))
  }
  useEffect(() => flush, []) // save the last keystrokes when leaving

  if (!item || progress === undefined || text === null) return <main className="p-5 text-muted">Cargando…</main>

  const min = item.minWords ?? 0
  const words = countWords(text)
  const revealed = progress?.checklistDone !== undefined
  const ticks = progress?.checklistDone ?? []
  const checklist = item.checklist ?? []

  const onChange = (value: string) => {
    setText(value)
    setSaved(false)
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = { text: value, timer: window.setTimeout(flush, SAVE_DELAY_MS) }
  }

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  const toggleTick = (i: number) => {
    const next = ticks.includes(i) ? ticks.filter((t) => t !== i) : [...ticks, i].sort((a, b) => a - b)
    void patchItemProgress(item.id, { checklistDone: next })
  }

  return (
    <>
      <TopBar
        title={item.title}
        back={`/theme/${item.themeId}`}
        right={
          <>
            <Timer skill="writing" itemId={item.id} />
            <LevelBadge level={item.level} stretch={item.stretch} />
          </>
        }
      />
      <main className="mx-auto max-w-md px-5 pb-32 pt-5">
        <p className="text-xs uppercase tracking-wide text-muted">Escritura · {item.estimatedMinutes} min</p>
        <p className="mt-2 text-[17px] leading-relaxed">{item.prompt}</p>

        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
          lang="es"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="sentences"
          aria-label="Tu texto"
          placeholder="Escribe aquí…"
          className="mt-4 min-h-[40vh] w-full resize-y rounded-2xl border border-line bg-card p-4 font-reading text-[18px] leading-[1.6] text-reading outline-none focus:border-accent"
        />
        <div className="mt-1.5 flex justify-between text-xs">
          <span className={words >= min ? 'font-medium text-ok' : 'text-muted'} aria-live="polite">
            {words} / {min} palabras{words >= min ? ' ✓' : ''}
          </span>
          <span className="text-muted">{saved ? 'Guardado' : 'Guardando…'}</span>
        </div>

        {!revealed ? (
          <button
            type="button"
            onClick={() => {
              flush()
              void patchItemProgress(item.id, { checklistDone: [] })
            }}
            disabled={words === 0}
            className="mt-5 w-full rounded-xl bg-accent px-4 py-3 font-medium text-on-accent disabled:opacity-50"
          >
            Terminé · ver modelo
          </button>
        ) : (
          <>
            <section className="mt-6 rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Texto modelo</h2>
                <button type="button" onClick={() => speak(item.modelAnswer ?? '')} className="text-sm text-accent">
                  🔊 Escuchar
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">Una forma posible, no la única.</p>
              <p className="mt-3 font-reading text-[17px] leading-relaxed text-reading">{item.modelAnswer}</p>
            </section>

            {checklist.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-semibold">Revisa tu texto</h2>
                  <span className="text-sm tabular-nums text-muted">
                    {ticks.length} de {checklist.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {checklist.map((c, i) => (
                    <li key={i}>
                      <label className="flex items-start gap-3 rounded-xl border border-line bg-card p-3">
                        <input type="checkbox" checked={ticks.includes(i)} onChange={() => toggleTick(i)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ok)]" />
                        <span className="text-[15px]">{c}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6 rounded-2xl border border-line bg-card p-4">
              <h2 className="font-semibold">¿Quieres correcciones?</h2>
              <p className="mt-1 text-sm text-muted">Copia tu texto con una instrucción y pégalo en la app de Claude.</p>
              <button
                type="button"
                onClick={() => void copyText(correctionPrompt(item, text)).then((ok) => flash(ok ? 'Copiado. Pégalo en la app de Claude.' : 'No se pudo copiar'))}
                className="mt-3 w-full rounded-xl bg-accent-soft px-4 py-2.5 font-medium text-accent"
              >
                📋 Copiar para corregir
              </button>
            </section>
          </>
        )}

        {revealed && (
          <DoneButton
            done={progress?.status === 'done'}
            onClick={() => {
              flush()
              void markItemDone(item.id, item.themeId).then(() => navigate(`/theme/${item.themeId}`))
            }}
          />
        )}
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center">
          <span className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow">{toast}</span>
        </div>
      )}
    </>
  )
}
