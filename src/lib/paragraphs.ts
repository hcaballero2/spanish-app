import type { Segment } from '../db/types'

const DIALOGUE = /^\s*[—–]/

/**
 * Groups sentence segments into blocks for display:
 * - a segment with `break: true` starts a new block;
 * - switching between narration and dialogue (leading em dash) starts a new
 *   block, so a run of dialogue lines forms one exchange. The renderer puts
 *   each dialogue line on its own row, as in Spanish typography.
 */
export function groupParagraphs(segments: Segment[]): Segment[][] {
  const out: Segment[][] = []
  let current: Segment[] = []
  let prevDialogue = false
  for (const seg of segments) {
    const dialogue = DIALOGUE.test(seg.es)
    const startsNew = seg.break === true || dialogue !== prevDialogue
    if (startsNew && current.length > 0) {
      out.push(current)
      current = []
    }
    current.push(seg)
    prevDialogue = dialogue
  }
  if (current.length > 0) out.push(current)
  return out
}

export function isDialogue(seg: Segment): boolean {
  return DIALOGUE.test(seg.es)
}
