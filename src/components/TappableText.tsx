import { useEffect, useRef, useState } from 'react'
import type { Card, Segment } from '../db/types'
import { tokenize, wordKey } from '../lib/words'

export interface Selection {
  text: string
  key: string
  segment: Segment
}

interface Props {
  segments: Segment[]
  known: Map<string, Card>
  onSelect: (sel: Selection) => void
  /** Segment currently being spoken (listening screen), highlighted. */
  activeSegmentId?: string
}

interface Drag {
  segId: string
  start: number
  end: number
  active: boolean // true once the long-press timer fired
}

const LONG_PRESS_MS = 350
const MOVE_TOLERANCE = 8

/**
 * Sentence-level text where each word is tappable (PLAN §7.1).
 * Tap = one word. Long-press then drag = phrase. ⓘ reveals the English gloss.
 */
export default function TappableText({ segments, known, onSelect, activeSegmentId }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const timer = useRef<number | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const container = useRef<HTMLDivElement>(null)

  // Block page scroll only while a phrase drag is active.
  useEffect(() => {
    const el = container.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current?.active) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d
    setDrag(d)
  }

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  const emit = (segId: string, start: number, end: number) => {
    const seg = segments.find((s) => s.id === segId)
    if (!seg) return
    const tokens = tokenize(seg.es)
    const [a, b] = start <= end ? [start, end] : [end, start]
    const text = tokens.slice(a, b + 1).map((t) => t.text).join('').trim()
    const key = tokens
      .slice(a, b + 1)
      .filter((t) => t.key)
      .map((t) => t.key)
      .join(' ')
    if (!key) return
    onSelect({ text, key, segment: seg })
  }

  const onPointerDown = (e: React.PointerEvent, segId: string, idx: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    origin.current = { x: e.clientX, y: e.clientY }
    setDragBoth({ segId, start: idx, end: idx, active: false })
    clearTimer()
    timer.current = window.setTimeout(() => {
      timer.current = null
      const d = dragRef.current
      if (d) {
        setDragBoth({ ...d, active: true })
        if (navigator.vibrate) navigator.vibrate(10)
      }
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (!d.active) {
      const o = origin.current
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE) {
        // The user is scrolling, not selecting.
        clearTimer()
        setDragBoth(null)
      }
      return
    }
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const word = el?.closest<HTMLElement>('[data-seg][data-i]')
    if (word && word.dataset.seg === d.segId) {
      const idx = Number(word.dataset.i)
      if (idx !== d.end) setDragBoth({ ...d, end: idx })
    }
  }

  const onPointerUp = () => {
    const d = dragRef.current
    clearTimer()
    setDragBoth(null)
    if (!d) return
    emit(d.segId, d.start, d.end)
  }

  const onPointerCancel = () => {
    clearTimer()
    setDragBoth(null)
  }

  const toggleGloss = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      ref={container}
      className="space-y-3 text-[19px] leading-[1.7]"
      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {segments.map((seg) => {
        const tokens = tokenize(seg.es)
        const isActive = activeSegmentId === seg.id
        const [dA, dB] =
          drag && drag.segId === seg.id
            ? drag.start <= drag.end
              ? [drag.start, drag.end]
              : [drag.end, drag.start]
            : [-1, -1]
        return (
          <p key={seg.id} className={`rounded-lg px-1 transition-colors ${isActive ? 'bg-accent-soft' : ''}`}>
            {tokens.map((t, i) => {
              if (!t.key) return <span key={i}>{t.text}</span>
              const card = known.get(t.key)
              const inDrag = drag?.active && drag.segId === seg.id && i >= dA && i <= dB
              return (
                <span
                  key={i}
                  data-seg={seg.id}
                  data-i={i}
                  onPointerDown={(e) => onPointerDown(e, seg.id, i)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onContextMenu={(e) => e.preventDefault()}
                  className={[
                    'cursor-pointer rounded-sm px-[1px]',
                    card ? 'underline decoration-accent/50 decoration-dotted underline-offset-4' : '',
                    inDrag ? 'bg-accent/25' : 'active:bg-accent-soft',
                  ].join(' ')}
                >
                  {t.text}
                </span>
              )
            })}
            {seg.en && (
              <button
                type="button"
                onClick={() => toggleGloss(seg.id)}
                aria-label="Ver traducción"
                className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] align-middle ${
                  open.has(seg.id) ? 'bg-accent text-white' : 'bg-line text-muted'
                }`}
              >
                i
              </button>
            )}
            {seg.en && open.has(seg.id) && (
              <span className="mt-1 block text-[15px] leading-snug text-muted">{seg.en}</span>
            )}
          </p>
        )
      })}
    </div>
  )
}

export { wordKey }
