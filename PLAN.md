# Plan: Mexican Spanish A2 → B2 study app for iPhone

Audience for this document: the agent that will implement the app. Everything the
user decided is in **Section 1**. Everything the planner inferred is labelled
`[assumption]` and collected in **Section 2** so the user can veto any line.

---

## 1. What the user asked for (fixed requirements)

| Requirement | Detail |
|---|---|
| Device | iPhone. A Mac is available for building/uploading. Must be free. |
| Learner | Currently CEFR A2 in Spanish, Mexican variant. Goal: B2. |
| Goal setting | User sets a target CEFR level; the app steers content toward it. |
| Four skills | Reading, Listening, Speaking, Writing. Every theme must expose all four. |
| Highlight + lookup | In reading text and listening captions, tap/highlight an unknown word, look it up (WordReference or another reputable ES→EN dictionary), or type the meaning manually. |
| Flashcards | Looked-up words become cards. Review them at the end of the day. |
| Themes | Each unit of content shares one topic (Día de los Muertos, street food, holidays…). Loosely connected is fine. Roughly one theme per week, but pace depends on the learner. |
| Time budget | 30–60 min per day, split across the four skills. |
| Study goal | A visible daily goal: time spent so far, time remaining. |

Open question the user raised: *are there study categories beyond the four?*
See Section 3 for proposals. The implementer should build the four, and make the
category list data-driven so a fifth can be added without a schema change.

---

## 2. Assumptions (user: veto any line and the plan adjusts)

1. `[assumption]` **Progressive Web App (PWA) first, not a native App Store app.**
   A PWA is a website that Safari installs to the home screen and that works
   offline. Reason: it is free, needs no Apple developer account, never expires,
   and needs no Mac at all. A native build through Xcode with a *free* Apple ID
   must be re-signed every 7 days from the Mac, which is a chore. The plan keeps a
   native wrapper (Capacitor) as a later optional step.
2. **Theme packs are written by Claude Code during development** and committed
   to the repo as static JSON. `[verified — user, 2026-10-30]` No API key is ever
   used: the implementing agent writes each pack the same way it writes code,
   and new themes later are added by asking Claude Code for another pack. The
   app never contacts an AI at runtime. Hand-written packs use the same schema.
3. `[assumption]` **Listening audio is produced by the phone's built-in Spanish
   text-to-speech (TTS)** over the generated transcript, so audio is free and
   caption highlighting is exact. Real human audio (podcasts) is supported as an
   optional "external media" item where the user pastes a transcript.
4. `[assumption]` **Dictionary lookup opens WordReference in a browser tab** (no
   public API exists) and the app pre-fills a free machine suggestion from the
   Wiktionary API. The user confirms or edits the meaning. Manual entry is always
   available.
5. `[assumption]` **Spaced repetition uses the FSRS algorithm** via the `ts-fsrs`
   npm package. Simpler than writing SM-2 by hand and better scheduling.
6. `[assumption]` **Default daily split** of 45 minutes: Reading 12, Listening 12,
   Speaking 10, Writing 8, plus ~5 minutes of card review. All editable.
7. `[assumption]` Single user, single device, no login, no sync. Data lives in the
   browser's IndexedDB with a manual JSON export/import for backup.
8. `[assumption]` Speaking is self-assessed: record yourself, play back, compare to
   TTS, optionally see a live transcript from the Web Speech API. No automatic
   grading; the app never calls an AI service.

---

## 3. Study categories: proposal for the user

CEFR actually splits the four skills further. Proposed additions, each optional
and off by default:

| Category | Why it matters A2→B2 | How it fits the app |
|---|---|---|
| **Grammar** | The A2→B2 jump is mostly subjunctive, past-tense contrast, conditional, object pronouns. Reading alone won't teach these. | One short grammar "micro-lesson" per theme, with example sentences drawn from that theme's reading. |
| **Spoken interaction** vs **spoken production** | CEFR treats a monologue and a conversation as different skills. | Speaking items get a `mode` field: `monologue` (describe, retell) or `dialogue` (respond to a scripted partner line). |
| **Pronunciation / shadowing** | Mexican-specific sounds and rhythm. | Already covered inside Listening via a "shadow this sentence" button; no separate category needed. |
| **Culture notes** | Dia de Muertos, albures, regional slang. | A short note per theme; not a timed category. |

Recommendation: add **Grammar** as a fifth timed category (5 min/day), keep the
rest as features inside the existing four.

---

## 4. Technology choices

| Layer | Choice | Reason |
|---|---|---|
| Framework | React + TypeScript + Vite | Mainstream, fast builds, good PWA plugin. |
| PWA | `vite-plugin-pwa` (service worker + manifest) | Offline, home-screen install on iOS. |
| State/storage | IndexedDB via `Dexie` | Structured local DB, survives app restarts, no server. |
| Spaced repetition | `ts-fsrs` | Maintained FSRS implementation. |
| Audio out (TTS) | Web Speech API `speechSynthesis`, voice `es-MX` | Free, offline on iOS once voice is installed. |
| Audio in | `MediaRecorder` for recordings; `webkitSpeechRecognition` (`es-MX`) for live transcript | Both work in iOS Safari 14.3+. |
| Styling | Tailwind CSS | Fast mobile layouts. |
| Hosting | GitHub Pages or Cloudflare Pages (free, HTTPS required for PWA) | Zero cost. |
| Content authoring | Claude Code writes packs as JSON; `scripts/validate-content.ts` checks them with Zod | No API key, no runtime cost. |
| Optional native wrapper | Capacitor + Xcode on the Mac | Only if a native feature is needed later. |

**iOS PWA gotchas the implementer must handle**

- Storage can be cleared by Safari after 7 days of non-use *for ordinary tabs*,
  but **not for home-screen-installed PWAs**. Instruct the user to install it.
  Still: provide JSON export/import.
- `speechSynthesis` on iOS needs a user gesture before the first utterance.
  Trigger the first `speak()` from a tap handler.
- `speechSynthesis.getVoices()` is empty until the `voiceschanged` event fires.
- Audio playback inside a PWA is silenced if the mute switch is on; show a hint.
- Service worker must be served over HTTPS (GitHub Pages is fine).
- Add `apple-touch-icon`, `apple-mobile-web-app-capable`, and a 180×180 icon.

---

## 5. Information architecture (screens)

```
Home / Today
├── Daily goal ring: minutes done / target, per-skill bars
├── Current theme card (name, week, level) → "Continue"
├── "Review cards" button (count due today)
└── Settings gear

Theme view
├── Reading item(s)
├── Listening item(s)
├── Speaking item(s)
├── Writing item(s)
├── (Grammar micro-lesson)         ← optional category
└── Culture note

Reading screen       Listening screen      Speaking screen        Writing screen
Listening/reading share the "tappable text" component (Section 7).

Review screen (flashcards, FSRS)
Vocabulary list (all cards, search, edit, delete)
Stats (streak, minutes per skill per week, cards learned, level progress)
Settings (target level, daily minutes, per-skill split, voice, export/import)
```

Each screen with content runs a **session timer** (Section 10).

---

## 6. Data model (Dexie tables)

```ts
// settings (single row, id = 1)
{
  id: 1,
  currentLevel: 'A2' | 'B1' | 'B2',
  targetLevel: 'B1' | 'B2' | 'C1',
  dailyMinutes: number,                 // default 45
  split: { reading: 12, listening: 12, speaking: 10, writing: 8, grammar: 0, review: 5 },
  ttsVoiceURI?: string,
  ttsRate: number,                      // default 0.9
  activeThemeId?: string,
}

// themes (loaded from JSON packs; see Section 8)
{ id, title, titleEs, level, order, description, cultureNote, status: 'locked'|'active'|'done',
  sources: [{ title, url, kind: 'podcast'|'youtube'|'article'|'reader'|'other', recommendedIn: string }] }

// items
{
  id, themeId, skill: 'reading'|'listening'|'speaking'|'writing'|'grammar',
  level: 'A2'|'A2+'|'B1'|'B1+'|'B2',
  title, estimatedMinutes,
  // reading & listening:
  segments?: [{ id, es: string, en?: string }],   // sentence-level; en hidden until tapped
  // speaking:
  mode?: 'monologue'|'dialogue'|'shadow',
  prompt?: string, partnerLines?: string[], modelAnswer?: string,
  // writing:
  prompt?: string, minWords?: number, modelAnswer?: string, checklist?: string[],
  // grammar:
  explanation?: string, examples?: [{es, en}], exercises?: [{q, a}],
  // listening external media:
  audioUrl?: string,
}

// cards
{
  id, word, lemma?, meaning, exampleEs, exampleEn?, sourceItemId, themeId,
  createdAt,
  fsrs: { due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review }
}

// reviews (one row per card answer, for stats)
{ id, cardId, rating: 1|2|3|4, reviewedAt }

// sessions (time tracking)
{ id, skill, itemId?, startedAt, endedAt, seconds }

// progress
{ itemId, status: 'new'|'started'|'done', completedAt?, userText?: string, recordingBlobId? }
{ themeId, selfAssessment?: { canDo: string[], checkedAt } }

// recordings
{ id, itemId, blob: Blob, createdAt }
```

---

## 7. Feature specs

### 7.1 Tappable text (shared by Reading and Listening)

- Render each segment's Spanish text as individual word spans. Strip punctuation
  for the lookup key but keep it visually.
- **Tap a word** → bottom sheet with:
  1. the word, and the sentence it came from (becomes the card's example);
  2. a "suggested meaning" fetched from Wiktionary
     (`https://es.wiktionary.org/api/rest_v1/page/definition/{word}` first,
     fallback `https://en.wiktionary.org/api/rest_v1/page/definition/{word}`);
     show "no suggestion" quietly if nothing comes back;
  3. an **"Open in WordReference"** button →
     `https://www.wordreference.com/es/en/translation.asp?spen={word}` in a new
     tab (`target=_blank`);
  4. an editable meaning field, prefilled with the suggestion;
  5. **"Save card"**.
- **Long-press and drag** selects a multi-word phrase; same sheet.
- Words that already have a card get a subtle underline. Tapping shows the saved
  meaning and an "edit" option.
- Tap the ⓘ at the end of a sentence to reveal the full English gloss
  (`segments[].en`). Keep it hidden by default.

### 7.2 Reading

- Text length by level: A2 ~120, A2+ ~170, B1 ~250, B1+ ~320, B2 ~400 words.
- Progress: scroll to end + "Mark done" button. Optional 3 comprehension
  questions (multiple choice) stored in `item.questions`.
- Timer runs while the screen is open (Section 10).

### 7.3 Listening

- Play button reads the whole transcript through `speechSynthesis` segment by
  segment. The currently spoken segment is highlighted (caption). Use the
  `onend` of each utterance to advance; this is more reliable on iOS than
  `onboundary`.
- Controls: play/pause, previous/next sentence, speed 0.7×–1.2×, "hide
  captions" toggle (listen first, then read).
- Captions are the tappable-text component, so lookup works mid-playback
  (pause automatically when the sheet opens).
- **Shadow** button on each sentence: plays it, then starts a 1-sentence
  recording so the user can repeat and compare.
- **External media item**: fields `audioUrl` + pasted transcript. Captions
  cannot be synced automatically; show the transcript as plain tappable text
  beside an `<audio>` element.
- **Video clip item** (added 2026-11-01, Hazel: learn the human dialect, not
  only the TTS voice): `video {youtubeId, title, channel, start, end,
  embeddable}` + `listenFor` + 3–10 `keyWords {es, en, exampleEs, exampleEn}` +
  questions. Embeddable clips play in place (youtube-nocookie, start/end);
  otherwise a button opens YouTube at the start time. Nothing from the video
  is copied: no transcript, no audio. Questions may be written from YouTube's
  auto-captions but only ask about clearly spoken content. Pick slow, clear
  Mexican speakers first. `scripts/check-videos.ts` confirms each video
  exists, its title/channel match, and `embeddable` is right.

### 7.4 Speaking

- Three modes:
  - `monologue`: prompt ("Describe tu ofrenda ideal"). 60–120 s target.
  - `dialogue`: the app speaks a partner line (TTS), user records a reply,
    next line, and so on (3–6 turns). Lines are scripted in `partnerLines`.
  - `shadow`: list of 5–8 sentences from the theme to repeat after TTS.
- Record with `MediaRecorder`; store the blob; allow playback.
- Optional live transcript via `webkitSpeechRecognition` with `lang='es-MX'`
  so the user can see what the phone *thinks* they said. Label it as
  approximate.
- After recording, reveal `modelAnswer` and a self-rating (1–4) that feeds
  the stats, not FSRS.
- Useful words the user used or wanted are added as cards through a small
  "add word" field on this screen.

### 7.5 Writing

- Prompt + `minWords` (A2: 50, A2+: 70, B1: 100, B1+: 140, B2: 180). Live word count.
- Save draft automatically (`progress.userText`).
- On "Done": reveal `modelAnswer` and `checklist` (e.g. "used preterite vs
  imperfect correctly?", "used two connectors like *sin embargo*"). User ticks
  the checklist; that is the score.
- **"Copy for correction"** button: copies the user's text plus a fixed prompt
  ("Corrige este texto en español mexicano, nivel B1, explica cada cambio")
  to the clipboard so the user can paste it into the Claude app themselves.
  No API call; the app stays free.

### 7.6 Grammar (optional category)

- One micro-lesson per theme: `explanation` (≤150 words), 4–6 `examples`
  pulled from the theme vocabulary, 5 fill-in `exercises` with instant check.

### 7.7 Flashcard review

- "Review" shows cards with `fsrs.due <= now`, newest theme first.
- Card front: word + example sentence with the word blanked (`____`).
  Card back: meaning, full sentence, English gloss, TTS "play" button.
- Four buttons: Again / Hard / Good / Easy → `ts-fsrs` `repeat()`.
- Also a **reverse** direction (EN → ES) once a card has `reps >= 3`.
- Cap new cards per day (default 20) to keep the review pile sane.
- End-of-day nudge: at Home, if due cards > 0 and the time is after the
  user's chosen hour (default 20:00), show "Review tonight's N cards".

### 7.8 CEFR goal and progression

**Principle: never too hard.** `[verified — user, 2026-10-30]` The user asked
for a slow ramp. Every item must be at the learner's current level or at most
one half-step above it (A2 → A2+, never A2 → B1). Mixing inside a theme is
fine; a hard lesson is not.

- Settings hold `currentLevel` and `targetLevel`. Levels are the five
  half-steps A2 → A2+ → B1 → B1+ → B2.
- **Item-level mixing rule.** Each theme has a `level`. Inside it, most items
  sit at that level and **at most one item per skill** may sit one half-step
  higher, tagged `stretch: true` and shown with a "stretch" badge. Nothing in a
  theme may be two half-steps above `currentLevel`.
- **Unknown-word density check.** Comfortable reading needs roughly 95 % known
  words `[assumption — common reading-research guideline]`. Pack authors keep
  readings and transcripts to ~1 new word per 20 at the item's level. In the
  app, if the user saves more than 8 cards per 100 words on one item, that
  item is marked **too hard** automatically.
- **"Too hard" button** on every item. Tapping it marks the item, hides it
  from the queue, and counts against the theme. A theme with 2 or more
  too-hard marks holds the queue at the current level: the next theme offered
  is the next one at the *same* level, not the next in order.
- **Level-up is gated, not automatic.** `currentLevel` may move up one
  half-step only when all of: at least 6 themes completed at the current
  level, no too-hard marks in the last 3 themes, and ≥ 80 % of the
  self-assessment can-do statements ticked. The app suggests; the user
  confirms.
- Every 4 completed themes, show a **self-assessment** of 8–10 CEFR "can-do"
  statements for the next half-step (e.g. A2+: "Puedo pedir comida y
  preguntar qué lleva un platillo").
- **Pace reality check.** `[assumption — Cambridge/CEFR guided-hour
  estimates vary]` A2 → B1 is often quoted at ~150–200 study hours and
  B1 → B2 at ~200 more. At 45 min/day that is roughly 8–9 months per level,
  so the theme queue needs 25–35 themes per level, not 4. The ramp below is
  the first 12 weeks only.
- Stats screen shows: themes done per level, cards in "review" state, minutes
  per skill, streak, too-hard marks.

---

## 8. Content: theme packs

### 8.1 Pack format

One JSON file per theme at `content/themes/<order>-<slug>.json`, validated
against a Zod schema at build time, bundled into the app. Shape = `theme` +
`items[]` from Section 6.

### 8.2 Pack authoring (no script, no API)

- Claude Code writes each pack directly as a JSON file, starting from
  `content/themes/_template.json`.
- Authoring rules the agent must follow for every pack: **Mexican Spanish**
  (never *vosotros*; use *ustedes* and Mexican vocabulary like *platicar,
  chido, camión, ahorita*), the pack's CEFR level, the word counts in
  Section 7, and sentence-level `segments` with English glosses.
- **Sources must come from community-vetted recommendations.**
  `[verified — user, 2026-10-30]` Before writing packs, research what popular
  language-learning communities actually recommend for Mexican Spanish at the
  target level: Reddit threads (r/Spanish, r/languagelearning, r/mexico) and
  comparable sites, but only threads with substantial agreement and
  interaction (many upvotes, many replies, repeated recommendations across
  threads). Use these to choose themes, pick podcasts / YouTube channels /
  readers for external-media items, and match vocabulary and register.
  - Keep a running `content/SOURCES.md`: each resource, its level, the
    thread(s) that recommended it with URLs, and a one-line note on why the
    community rated it. Refresh it when adding new themes.
  - Each theme pack records the resources it drew on in a `sources` array
    (`{ title, url, kind, recommendedIn }`) so the user can go to the
    original material.
  - Never copy copyrighted text into a pack. Write original passages in the
    same register and topic; link out to the original for external media.
- `scripts/validate-content.ts` runs the Zod schema over every pack at build
  time and fails loudly on errors.
- Packs are committed to the repo so the app is fully static. To add a theme
  later, the user asks Claude Code: "write theme 13 about lucha libre at B1+".

### 8.3 Starter theme list (first 12 weeks, A2 → A2+)

| # | Theme | Level |
|---|---|---|
| 1 | Comida callejera (tacos, elotes, tianguis) | A2 |
| 2 | Día de Muertos | A2 |
| 3 | La familia y las reuniones | A2 |
| 4 | Mi rutina en la Ciudad de México | A2 |
| 5 | Mercados y regateo | A2 (stretch items A2+) |
| 6 | Las posadas y la Navidad mexicana | A2 (stretch items A2+) |
| 7 | Transporte y direcciones | A2+ |
| 8 | Música: mariachi, corridos, cumbia | A2+ |
| 9 | Lucha libre y fútbol | A2+ |
| 10 | Salud y una visita al médico | A2+ |
| 11 | Cine y series mexicanas | A2+ (stretch items B1) |
| 12 | Planes y viajes (Oaxaca, Yucatán) | A2+ (stretch items B1) |

Later packs, in order: more A2+ until the level-up gate opens, then B1
(trabajo y entrevistas, noticias ligeras, recetas de la abuela, fiestas
patrias), B1+ (opinión y medio ambiente, historia: la Revolución), and B2
(política y sociedad, humor y albures, literatura breve such as Juan Rulfo
fragments, migración).

Each pack contains at minimum: 2 reading, 2 listening (TTS) plus 1–3 video clips, 2 speaking (one
monologue, one dialogue), 1 writing, 1 grammar, 1 culture note. That is
roughly 5–7 study days at 45 min/day.

---

## 9. Daily flow (what the user experiences)

1. Open app → Home shows goal ring (e.g. 0/45 min), active theme, due cards.
2. Tap "Continue" → theme view with items grouped by skill and each item's
   estimated minutes and done/not-done state. The app suggests the next item
   from the skill with the largest remaining budget today.
3. Study an item. Timer accumulates into today's skill bucket. Tap words →
   cards.
4. Return to Home; ring updates. Repeat until the ring is full or time's up.
5. Evening: "Review N cards" → FSRS session.
6. When all items in a theme are done → theme marked done, next theme
   unlocks, every 4th theme triggers the can-do self-assessment.

---

## 10. Time tracking rules

- A session starts when a content screen mounts and ends on unmount,
  `visibilitychange` to hidden, or 2 minutes of no interaction (tap, scroll,
  audio event). Store `sessions` rows; never trust a single long open tab.
- "Today" = local calendar day. Goal ring = sum of today's `sessions.seconds`
  across skills. Per-skill bar = that skill's seconds vs `split[skill]`.
- Review time counts toward `split.review`.
- Streak = consecutive days with ≥ 50 % of `dailyMinutes`.

---

## 11. Implementation phases (ordered; each ends in a usable app)

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | Vite + React + TS + Tailwind + vite-plugin-pwa scaffold; Dexie schema; deploy to GitHub Pages; install on iPhone | App opens from the home screen offline. |
| 1 | Theme packs loader + Zod schema; 1 hand-written sample pack; Home + Theme view; Reading screen with tappable text + card creation (manual meaning only) | Can read a text and save a card. |
| 2 | Flashcard review with `ts-fsrs`; Vocabulary list; end-of-day nudge | Cards come due and can be rated. |
| 3 | Listening screen: TTS playback, synced captions, shadow recording | Can listen with captions and tap words. |
| 4 | Session timer, daily goal ring, per-skill split, Settings, Stats | Goal ring fills as you study. |
| 5 | Speaking (3 modes) and Writing screens with recordings/drafts | All four skills usable. |
| 6 | Wiktionary suggestion + WordReference button in the lookup sheet | Lookup is one tap. |
| 7 | Research community-recommended resources → `content/SOURCES.md`; pack template + validator; Claude Code writes the first 4 packs (all A2) from those sources; CEFR gating, "too hard" button, density check, self-assessment | A month of content exists, with sources recorded. |
| 8 | Grammar category, external-media items, JSON export/import, "Copy for correction" button | Nice-to-haves. |
| 9 | (optional) Capacitor wrapper and Xcode build on the Mac | Only if a native feature is needed. |

Suggested repo layout:

```
spanish-app/
  PLAN.md
  package.json
  vite.config.ts
  public/           icons, manifest
  content/SOURCES.md  community-recommended resources with thread links
  content/themes/   _template.json, *.json packs
  scripts/          validate-content.ts
  src/
    db/             dexie schema, migrations
    content/        pack loader, zod schema
    features/
      home/ theme/ reading/ listening/ speaking/ writing/ grammar/
      review/ vocab/ stats/ settings/
    components/     TappableText, LookupSheet, GoalRing, Timer
    lib/            tts.ts, recorder.ts, fsrs.ts, sessions.ts, dictionary.ts
```

---

## 12. Acceptance checklist for the implementer

- [ ] Installs to iPhone home screen; opens offline; survives force-quit with data intact.
- [ ] Target level editable; only in-range themes offered; no item more than one half-step above current level; "too hard" holds the level.
- [ ] Reading and listening text is tappable; card created in ≤ 3 taps with manual meaning; WordReference opens in one tap.
- [ ] Listening highlights the sentence being spoken with an `es-MX` voice.
- [ ] Speaking records and plays back; shadow mode works per sentence.
- [ ] Writing saves drafts and shows model answer + checklist on completion.
- [ ] Review screen schedules with FSRS; due counts shown on Home.
- [ ] Goal ring and per-skill bars reflect real session seconds; streak computed.
- [ ] 4 theme packs written in Mexican Spanish, validated, each listing its community-recommended sources; `content/SOURCES.md` exists.
- [ ] JSON export/import round-trips all tables.

---

## 13. Things explicitly out of scope for v1

Accounts, cloud sync, multi-language, App Store release, automatic speech
grading, any AI API calls (at build or runtime), and social features.
