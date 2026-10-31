import { z } from 'zod'

export const LevelSchema = z.enum(['A2', 'A2+', 'B1', 'B1+', 'B2'])
export const LEVEL_ORDER = LevelSchema.options

const SegmentSchema = z.strictObject({
  id: z.string().min(1),
  es: z.string().min(1),
  en: z.string().min(1).optional(),
})

const QuestionSchema = z.strictObject({
  q: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4),
  answer: z.number().int().min(0),
})

const base = {
  id: z.string().regex(/^[a-z0-9-]+$/, 'kebab-case id'),
  level: LevelSchema,
  stretch: z.boolean().optional(),
  title: z.string().min(1),
  estimatedMinutes: z.number().int().min(1).max(60),
}

const ReadingItem = z.strictObject({
  ...base,
  skill: z.literal('reading'),
  segments: z.array(SegmentSchema).min(1),
  questions: z.array(QuestionSchema).max(5).optional(),
})

const ListeningItem = z.strictObject({
  ...base,
  skill: z.literal('listening'),
  segments: z.array(SegmentSchema).min(1),
  questions: z.array(QuestionSchema).max(5).optional(),
  audioUrl: z.url().optional(),
})

const SpeakingItem = z.strictObject({
  ...base,
  skill: z.literal('speaking'),
  mode: z.enum(['monologue', 'dialogue', 'shadow']),
  prompt: z.string().min(1),
  partnerLines: z.array(z.string().min(1)).min(3).max(6).optional(),
  segments: z.array(SegmentSchema).min(5).max(8).optional(),
  modelAnswer: z.string().min(1).optional(),
})

const WritingItem = z.strictObject({
  ...base,
  skill: z.literal('writing'),
  prompt: z.string().min(1),
  minWords: z.number().int().min(20),
  modelAnswer: z.string().min(1),
  checklist: z.array(z.string().min(1)).min(2).max(6),
})

const GrammarItem = z.strictObject({
  ...base,
  skill: z.literal('grammar'),
  explanation: z.string().min(1),
  examples: z.array(z.strictObject({ es: z.string().min(1), en: z.string().min(1) })).min(4).max(6),
  exercises: z.array(z.strictObject({ q: z.string().min(1), a: z.string().min(1) })).min(3).max(8),
})

export const ItemSchema = z.discriminatedUnion('skill', [
  ReadingItem,
  ListeningItem,
  SpeakingItem,
  WritingItem,
  GrammarItem,
])

export const SourceSchema = z.strictObject({
  title: z.string().min(1),
  url: z.url(),
  kind: z.enum(['podcast', 'youtube', 'article', 'reader', 'other']),
  recommendedIn: z.string().min(1),
})

export const ThemePackSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/, 'kebab-case id'),
    order: z.number().int().min(1),
    title: z.string().min(1),
    titleEs: z.string().min(1),
    level: LevelSchema,
    description: z.string().min(1),
    cultureNote: z.string().min(1),
    canDo: z.array(z.string().min(1)).min(3).max(10),
    sources: z.array(SourceSchema).min(1),
    items: z.array(ItemSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const themeIdx = LEVEL_ORDER.indexOf(pack.level)
    const stretchPerSkill = new Map<string, number>()
    const ids = new Set<string>()

    pack.items.forEach((item, i) => {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `duplicate item id ${item.id}` })
      }
      ids.add(item.id)

      const diff = LEVEL_ORDER.indexOf(item.level) - themeIdx
      // PLAN §7.8: items sit at the theme level, or one half-step up with stretch: true.
      if (diff < 0) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'level'], message: 'item below theme level' })
      } else if (diff === 1) {
        if (!item.stretch) {
          ctx.addIssue({ code: 'custom', path: ['items', i, 'stretch'], message: 'one half-step above theme level requires stretch: true' })
        }
        const n = (stretchPerSkill.get(item.skill) ?? 0) + 1
        stretchPerSkill.set(item.skill, n)
        if (n > 1) {
          ctx.addIssue({ code: 'custom', path: ['items', i], message: `more than one stretch item for ${item.skill}` })
        }
      } else if (diff > 1) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'level'], message: 'item more than one half-step above theme level (never too hard)' })
      } else if (item.stretch) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'stretch'], message: 'stretch: true but item is at theme level' })
      }

      if (item.skill === 'speaking') {
        if (item.mode === 'dialogue' && !item.partnerLines) {
          ctx.addIssue({ code: 'custom', path: ['items', i, 'partnerLines'], message: 'dialogue needs partnerLines' })
        }
        if (item.mode === 'shadow' && !item.segments) {
          ctx.addIssue({ code: 'custom', path: ['items', i, 'segments'], message: 'shadow needs segments' })
        }
      }
      if ('questions' in item && item.questions) {
        item.questions.forEach((q, qi) => {
          if (q.answer >= q.options.length) {
            ctx.addIssue({ code: 'custom', path: ['items', i, 'questions', qi, 'answer'], message: 'answer index out of range' })
          }
        })
      }
    })

    const skills = new Set(pack.items.map((it) => it.skill))
    for (const s of ['reading', 'listening', 'speaking', 'writing'] as const) {
      if (!skills.has(s)) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: `pack has no ${s} item (every theme must expose all four skills)` })
      }
    }
  })

export type ThemePack = z.infer<typeof ThemePackSchema>
export type PackItem = z.infer<typeof ItemSchema>

/** Target reading/transcript length by level (PLAN §7.2). */
export const READING_WORDS: Record<z.infer<typeof LevelSchema>, number> = {
  A2: 120,
  'A2+': 170,
  B1: 250,
  'B1+': 320,
  B2: 400,
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
