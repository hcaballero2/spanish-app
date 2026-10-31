import { useEffect, useRef, useState } from 'react'
import type { Card } from '../db/types'
import type { Selection } from './TappableText'
import { glossFor } from '../lib/glossary'
import { meaningMatches } from '../lib/meaning'

interface Props {
  selection: Selection
  existing?: Card
  onSave: (meaning: string) => Promise<void> | void
  onDelete?: () => Promise<void> | void
  onClose: () => void
}

/** What "Comprobar" found: right/wrong against the pack glossary, or no key (phrases, names). */
type Check = { kind: 'right' | 'wrong' | 'unknown'; gloss?: string } | null

/**
 * Bottom sheet for a tapped word or phrase (PLAN §7.1). For a new card the
 * learner first guesses the meaning from context, then "Comprobar" checks the
 * guess against the pack glossary (or shows the sentence translation when the
 * glossary has no entry) before the card is saved.
 */
export default function LookupSheet({ selection, existing, onSave, onDelete, onClose }: Props) {
  const [meaning, setMeaning] = useState(existing?.meaning ?? '')
  const [check, setCheck] = useState<Check>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const gloss = selection.key.includes(' ') ? undefined : glossFor(selection.key)

  useEffect(() => {
    setMeaning(existing?.meaning ?? '')
    setCheck(null)
    const t = window.setTimeout(() => input.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [selection, existing])

  const save = async (value = meaning) => {
    if (!value.trim()) {
      input.current?.focus()
      return
    }
    setBusy(true)
    try {
      await onSave(value)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const runCheck = (giveUp = false) => {
    if (!giveUp && !meaning.trim()) {
      input.current?.focus()
      return
    }
    input.current?.blur()
    if (!gloss) setCheck({ kind: 'unknown' })
    else if (!giveUp && meaningMatches(meaning, [gloss])) setCheck({ kind: 'right', gloss })
    else setCheck({ kind: 'wrong', gloss })
  }

  const checking = !existing && !check
  const glossFirst = gloss?.split(' / ')[0] ?? ''

  return (
    <div className="fixed inset-0 z-20 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (checking) runCheck()
          else void save()
        }}
        className="relative w-full rounded-t-3xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <p className="text-2xl font-bold">{selection.text}</p>
        <p className="mt-1 text-sm text-muted">{selection.segment.es}</p>

        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-wide text-muted">
            {existing ? 'Significado' : '¿Qué crees que significa?'}
          </span>
          <input
            ref={input}
            value={meaning}
            onChange={(e) => {
              setMeaning(e.target.value)
              if (check) setCheck(null)
            }}
            placeholder="escribe el significado en inglés"
            autoCapitalize="off"
            autoCorrect="off"
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-3 text-base"
          />
        </label>

        {check?.kind === 'right' && (
          <div className="mt-3 rounded-xl border border-ok bg-ok-soft p-3 text-sm" role="status">
            <p className="font-semibold text-ok">✓ ¡Bien!</p>
            <p className="mt-1 text-muted">Diccionario: {check.gloss}</p>
          </div>
        )}
        {check?.kind === 'wrong' && (
          <div className="mt-3 rounded-xl bg-accent-soft p-3 text-sm" role="status">
            <p className="font-semibold text-accent">{meaning.trim() ? 'No exactamente.' : 'Aquí está.'}</p>
            <p className="mt-1">
              En este texto significa: <strong>{check.gloss}</strong>
            </p>
          </div>
        )}
        {check?.kind === 'unknown' && (
          <div className="mt-3 rounded-xl border border-line bg-card p-3 text-sm" role="status">
            <p className="text-muted">No hay definición guardada. Compara con la frase completa:</p>
            <p className="mt-1">{selection.segment.en ?? '—'}</p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {checking ? (
            <>
              <button type="submit" className="flex-1 rounded-xl bg-accent px-4 py-3 font-medium text-on-accent">
                Comprobar
              </button>
              <button type="button" onClick={() => runCheck(true)} className="rounded-xl border border-line px-4 py-3 text-muted">
                No sé
              </button>
            </>
          ) : check?.kind === 'wrong' ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(glossFirst)}
                className="flex-1 rounded-xl bg-accent px-4 py-3 font-medium text-on-accent disabled:opacity-50"
              >
                Guardar «{glossFirst}»
              </button>
              {meaning.trim() && (
                <button type="submit" disabled={busy} className="rounded-xl border border-line px-4 py-3 text-muted disabled:opacity-50">
                  Dejar la mía
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-accent px-4 py-3 font-medium text-on-accent disabled:opacity-50"
              >
                {existing ? 'Guardar cambios' : 'Guardar tarjeta'}
              </button>
              {existing && onDelete && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDelete()
                    onClose()
                  }}
                  className="rounded-xl border border-line px-4 py-3 text-muted"
                >
                  Eliminar
                </button>
              )}
            </>
          )}
        </div>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm text-muted">
          Cancelar
        </button>
      </form>
    </div>
  )
}
