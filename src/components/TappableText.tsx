import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Card, Segment } from '../db/types'
import { groupParagraphs, isDialogue } from '../lib/paragraphs'
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
  /** Segment currently being spoken (listening screen), highlighted and scrolled into view. */
  activeSegmentId?: string
  /** Show every paragraph's English under it (the per-paragraph chips still work when false). */
  showAllGloss?: boolean
  /** Tap on a sentence's whitespace/punctuation (listening: jump to that sentence). */
  onSentenceTap?: (segment: Segment) => void
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
 * Flowing paragraphs where each word is tappable (PLAN §7.1, layout revised in
 * phase 3). Tap = one word. Long-press then drag = phrase. A small chip at the
 * end of each paragraph reveals its English.
 */
export default function TappableText({ segments, known, onSelect, activeSegmentId, showAllGloss = false, onSentenceTap }: Props) {
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

  useEffect(() => {
    if (!activeSegmentId || !container.current) return
    const el = container.current.querySelector<HTMLElement>(`[data-sent="${CSS.escape(activeSegmentId)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeSegmentId])

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

  const paragraphs = groupParagraphs(segments)

  const renderSentence = (seg: Segment, si: number, trailing?: ReactNode) => {
    const tokens = tokenize(seg.es)
    const isActive = activeSegmentId === seg.id
    const [dA, dB] =
      drag && drag.segId === seg.id ? (drag.start <= drag.end ? [drag.start, drag.end] : [drag.end, drag.start]) : [-1, -1]
    const renderToken = (t: (typeof tokens)[number], i: number) => {
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
          onClick={(e) => e.stopPropagation()}
          className={[
            'cursor-pointer rounded-sm',
            card ? 'underline decoration-accent/60 decoration-dotted underline-offset-4' : '',
            inDrag ? 'bg-accent/25' : 'active:bg-accent-soft',
          ].join(' ')}
        >
          {t.text}
        </span>
      )
    }
    // Keep a trailing chip on the same line as the last word, so it never wraps alone.
    let lastWord = tokens.length
    if (trailing) for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i]!.key) { lastWord = i; break }
    return (
      <span key={seg.id}>
        {si > 0 && ' '}
        <span
          data-sent={seg.id}
          onClick={onSentenceTap ? () => onSentenceTap(seg) : undefined}
          className={`rounded-sm box-decoration-clone transition-colors ${isActive ? 'bg-accent-soft' : ''}`}
        >
          {tokens.slice(0, lastWord).map((t, i) => renderToken(t, i))}
          {trailing ? (
            <span className="whitespace-nowrap">
              {tokens.slice(lastWord).map((t, i) => renderToken(t, lastWord + i))}
              {trailing}
            </span>
          ) : null}
        </span>
      </span>
    )
  }

  return (
    <div
      ref={container}
      className="text-[18px] leading-[1.75]"
      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {paragraphs.map((para, pi) => {
        const pid = para[0]?.id ?? String(pi)
        const dialogue = para[0] ? isDialogue(para[0]) : false
        const glossOpen = showAllGloss || open.has(pid)
        const hasGloss = para.some((seg) => seg.en)
        return (
          <div key={pid} data-para={pid} className="mb-4">
            {(dialogue ? para.map((seg) => [seg]) : [para]).map((line, li, lines) => (
              <p key={line[0]!.id} className={dialogue ? 'pl-3 -indent-3' : ''}>
                {line.map((seg, si) =>
                  renderSentence(
                    seg,
                    si,
                    si === line.length - 1 && li === lines.length - 1 && hasGloss && !showAllGloss ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleGloss(pid)
                        }}
                        aria-label="Ver traducción"
                        className={`ml-2 inline-flex h-5 items-center rounded-full px-1.5 align-middle indent-0 text-[10px] font-semibold uppercase tracking-wide ${
                          open.has(pid) ? 'bg-accent text-on-accent' : 'bg-line text-muted'
                        }`}
                      >
                        en
                      </button>
                    ) : undefined,
                  ),
                )}
              </p>
            ))}
            {hasGloss && glossOpen && (
              <div className="mt-1 text-[15px] leading-snug text-muted">
                {dialogue ? (
                  para.map((seg) => seg.en && <p key={seg.id} className="pl-3">{seg.en}</p>)
                ) : (
                  <p>{para.map((seg) => seg.en).filter(Boolean).join(' ')}</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { wordKey }
