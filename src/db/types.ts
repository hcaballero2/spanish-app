// Data model from PLAN.md §6, with the five half-step CEFR levels from §7.8.

export type Level = 'A2' | 'A2+' | 'B1' | 'B1+' | 'B2'
export const LEVELS: Level[] = ['A2', 'A2+', 'B1', 'B1+', 'B2']

export type Skill = 'reading' | 'listening' | 'speaking' | 'writing' | 'grammar'
export const SKILLS: Skill[] = ['reading', 'listening', 'speaking', 'writing', 'grammar']

export type SplitKey = Skill | 'review'

export interface Settings {
  id: 1
  currentLevel: Level
  targetLevel: Level
  dailyMinutes: number
  split: Record<SplitKey, number>
  ttsVoiceURI?: string
  ttsRate: number
  activeThemeId?: string
  reviewHour: number // 0–23, end-of-day nudge (PLAN §7.7)
  newCardsPerDay: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  currentLevel: 'A2',
  targetLevel: 'B2',
  dailyMinutes: 45,
  split: { reading: 12, listening: 12, speaking: 10, writing: 8, grammar: 0, review: 5 },
  ttsRate: 0.9,
  reviewHour: 20,
  newCardsPerDay: 20,
}

export interface ThemeSource {
  title: string
  url: string
  kind: 'podcast' | 'youtube' | 'article' | 'reader' | 'other'
  recommendedIn: string
}

export interface Theme {
  id: string
  title: string
  titleEs: string
  level: Level
  order: number
  description: string
  cultureNote: string
  status: 'locked' | 'active' | 'done'
  sources: ThemeSource[]
}

export interface Segment {
  id: string
  es: string
  en?: string
}

export interface Item {
  id: string
  themeId: string
  skill: Skill
  level: Level
  stretch?: boolean
  title: string
  estimatedMinutes: number
  // reading & listening
  segments?: Segment[]
  questions?: { q: string; options: string[]; answer: number }[]
  audioUrl?: string
  // speaking
  mode?: 'monologue' | 'dialogue' | 'shadow'
  prompt?: string
  partnerLines?: string[]
  modelAnswer?: string
  // writing
  minWords?: number
  checklist?: string[]
  // grammar
  explanation?: string
  examples?: { es: string; en: string }[]
  exercises?: { q: string; a: string }[]
}

export interface FsrsState {
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number // ts-fsrs State enum: 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review?: Date
}

export interface Card {
  id: string
  word: string
  lemma?: string
  meaning: string
  exampleEs: string
  exampleEn?: string
  sourceItemId: string
  themeId: string
  createdAt: Date
  fsrs: FsrsState
}

export interface Review {
  id?: number
  cardId: string
  rating: 1 | 2 | 3 | 4
  reviewedAt: Date
}

export interface Session {
  id?: number
  skill: SplitKey
  itemId?: string
  startedAt: Date
  endedAt?: Date
  seconds: number
}

export interface ItemProgress {
  itemId: string
  status: 'new' | 'started' | 'done'
  completedAt?: Date
  userText?: string
  recordingBlobId?: number
  tooHard?: boolean
  selfRating?: 1 | 2 | 3 | 4
}

export interface ThemeProgress {
  themeId: string
  selfAssessment?: { canDo: string[]; checkedAt: Date }
  tooHardCount: number
}

export interface Recording {
  id?: number
  itemId: string
  blob: Blob
  createdAt: Date
}
