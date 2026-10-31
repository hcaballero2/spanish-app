import { useEffect, useRef, useState } from 'react'
import type { Card } from '../db/types'
import type { Selection } from './TappableText'

interface Props {
  selection: Selection
  existing?: Card
  onSave: (meaning: string) => Promise<void> | void
  onDelete?: () => Promise<void> | void
  onClose: () => void
}

/** Bottom sheet for a tapped word or phrase (PLAN §7.1). Manual meaning entry. */
export default function LookupSheet({ selection, existing, onSave, onDelete, onClose }: Props) {
  const [meaning, setMeaning] = useState(existing?.meaning ?? '')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMeaning(existing?.meaning ?? '')
    const t = window.setTimeout(() => input.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [selection, existing])

  const save = async () => {
    if (!meaning.trim()) {
      input.current?.focus()
      return
    }
    setBusy(true)
    try {
      await onSave(meaning)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="relative w-full rounded-t-3xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <p className="text-2xl font-bold">{selection.text}</p>
        <p className="mt-1 text-sm text-muted">{selection.segment.es}</p>

        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-wide text-muted">Significado</span>
          <input
            ref={input}
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="escribe el significado en inglés"
            autoCapitalize="off"
            autoCorrect="off"
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-3 text-base"
          />
        </label>

        <div className="mt-4 flex gap-2">
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
        </div>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm text-muted">
          Cancelar
        </button>
      </form>
    </div>
  )
}
