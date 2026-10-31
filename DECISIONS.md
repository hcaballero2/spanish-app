# Decisions log

Routine technical choices made by the implementing agent. PLAN.md is the spec;
this file records what was picked where the plan left room.

## Phase 0 (2026-10-30)

- **Tailwind v4 via `@tailwindcss/vite`** instead of v3 + PostCSS. One plugin, no
  `tailwind.config.js`; design tokens live in `src/index.css` under `@theme`.
- **TypeScript 5.9**, not 7.x. TS 7 is the new native compiler and the Vite
  template tooling is still validated against 5.x.
- **Base path `/spanish-app/`** hardcoded for the GitHub Pages project site, with
  `VITE_BASE` as an override for a custom domain or Cloudflare Pages.
- **Five half-step levels everywhere.** PLAN §6 shows `currentLevel: 'A2'|'B1'|'B2'`
  but §7.8 (newer, user-verified) requires A2 / A2+ / B1 / B1+ / B2. The `Level`
  type in `src/db/types.ts` uses the five steps for both current and target.
- **Progress is two tables**, `itemProgress` (key `itemId`) and `themeProgress`
  (key `themeId`), because PLAN §6 lists two row shapes with different keys
  under one heading.
- **Service worker: `registerType: 'autoUpdate'`** with a visible "Actualizar"
  button. Precache covers all emitted files so the app opens fully offline.
- **Icons** are rendered from `scripts/icon-src.svg` with `rsvg-convert`
  (`npm run icons`). The PNGs are committed so CI does not need librsvg.
- **`npm audit` warnings** come from `workbox-build` inside `vite-plugin-pwa`
  (build-time only, nothing shipped to the phone). Left as-is; revisit when
  vite-plugin-pwa updates its deps.
- **Deploy** with the official `actions/deploy-pages` workflow on push to `main`.

## Phase 1 (2026-10-30)

- **Hash routing** (`react-router` v7 `HashRouter`). GitHub Pages has no SPA
  rewrite and the installed PWA reopens at its start URL; `#/theme/x` survives
  both without any server config.
- **Packs are bundled with `import.meta.glob`**, validated by Zod at load and
  by `npm run validate` (which `npm run build` runs first). `_template.json`
  is skipped by filename.
- **Packs are re-seeded into Dexie on every launch**: content rows are
  overwritten, `themes.status` and all progress tables are preserved, so a
  fixed typo in a pack reaches the phone on the next update without a migration.
- **ts-fsrs v6** `Card` shape (`learning_steps`, no `elapsed_days`) is stored
  verbatim under `cards.fsrs` so phase 2 can pass it to the scheduler as is.
  PLAN §6 listed the older field names.
- **Phrase selection** = long-press (350 ms, no movement) then drag; a move of
  more than 8 px before the timer fires is treated as a scroll. A non-passive
  `touchmove` listener blocks page scroll only while a drag is active.
  Needs a real-device check on iOS.
- **Lookup key** keeps accents and strips punctuation (`wordKey`), so
  *pica* and *pica.* are the same card. No lemmatisation: *tacos* and *taco*
  are separate cards for now.
- **Theme completion** happens when the last item is marked done
  (`completeTheme`), which activates the next theme by `order`. The CEFR
  gating from PLAN §7.8 is phase 7.
- **Smoke test** `scripts/smoke.mjs` drives headless Chrome over the DevTools
  protocol (no Puppeteer dependency). `npm run smoke` after `npm run preview`.
- **Reddit could not be read from this machine** (login wall, blocked
  fetcher, mirrors down). `content/SOURCES.md` records which thread links
  were found via search engines and flags vote counts for re-verification in
  phase 7.

## Phase 2 (2026-10-30)

- **ts-fsrs legacy API** (`fsrs()`, `createEmptyCard()`, `.next()`, `.repeat()`)
  rather than the new async `DefaultScheduler`. It is marked deprecated in
  ts-fsrs 6.0 but still shipped, and its `Card` shape is exactly what phase 1
  stored under `cards.fsrs`, so no migration. Model: FSRS-6, default weights,
  fuzz on, learning steps 1 m / 10 m, relearning 10 m. Revisit (and migrate
  `cards.fsrs`) if a later ts-fsrs release removes the legacy entry points.
- **Review queue** (`buildQueue`): cards with `fsrs.due <= now`, newest theme
  first (PLAN §7.2), reviewed cards before new ones, new cards capped at
  `newCardsPerDay` minus the new cards already introduced today. "Introduced
  today" is counted from `reviews.wasNew`, a new optional field on the
  review row.
- **Within a session, only "Otra vez" repeats** (its learning step is 1 min
  and the card is re-queued at the end). "Difícil" (6 min) and "Bien"
  (10 min) wait for the next session, so a short session actually ends; Anki
  would show them again.
- **Reverse cards** (English on the front) start at `reps >= 3`, per PLAN §7.2.
- **TTS** uses `speechSynthesis` with `lang es-MX`, preferring an es-MX voice,
  else any Spanish voice. Only triggered from a tap (iOS requirement).
- **Dark mode** follows the system by default. Colour tokens live in
  `@theme`; the dark values override the same custom properties under
  `prefers-color-scheme: dark` (unless `html[data-theme="light"]`) and under
  `html[data-theme="dark"]`. New tokens: `card` (surface), `on-accent`,
  `ok`/`ok-soft` (correct answers) replace the hardcoded white/green classes.
  `settings.theme` (`system | light | dark`) is applied by `applyTheme`,
  which also rewrites the `theme-color` metas (iOS status bar) and caches the
  choice in `localStorage` so an inline script in `index.html` applies it
  before first paint. Settings rows written before this field existed are
  back-filled with defaults in `ensureSettings`.
- **Bundle is ~520 kB (163 kB gzip)** mostly because ts-fsrs 6 re-exports every
  model from its index. Precached once by the service worker, so left as-is;
  a subpath import could trim it later.
- **Vocabulary list** reuses `LookupSheet` for editing by building a
  `Selection` from the card's own example sentence.

## Phase 3 — listening, reading layout, graded review (2026-10-30)

- **Reading layout deviates from PLAN §7.1** at Hazel's request (phase 1
  screen was "clunky and hard to parse"). Text renders as flowing paragraphs
  (`lib/paragraphs.ts`): a segment with `break: true` starts a block, and a
  run of dialogue lines (leading em dash) forms one exchange with each line
  on its own row. One "en" chip per block replaces the per-sentence ⓘ; a
  top-bar toggle shows every translation. The chip is kept on the same line
  as the last word so it never wraps alone.
- **Pack schema gained** `segments[].break` and a `glossary` (lowercase
  surface form → English meanings, alternatives separated by " / "). The
  validator warns when a reading/listening word is missing from the
  glossary. Pack 01 has a full glossary (213 words).
- **Listening** (`/listen/:itemId`) speaks one segment per utterance with
  `speakSegment`, advancing on `onend` (PLAN §7.3). Pause = cancel and
  remember the sentence index, because iOS `speechSynthesis.pause()` is
  unreliable. A watchdog reports an error if `onstart` never fires (no
  Spanish voice / silent switch). Speed steps 0.7–1.2× persist to
  `settings.ttsRate`. Captions can be hidden; tapping a sentence jumps there;
  tapping a word pauses and opens the lookup sheet.
- **Shadowing** plays the current sentence, then records up to 8 s with
  `MediaRecorder` (audio/mp4 on iOS, webm/opus elsewhere) and stores it in
  `recordings` with the new optional `segmentId`.
- **Saving a word checks the guess** (Hazel's request). The sheet asks "¿Qué
  crees que significa?"; "Comprobar" compares the guess with the glossary
  (`lib/meaning.ts`: normalised, plurals and small typos forgiven, any
  alternative accepted). Wrong → shows the meaning and offers to save it or
  keep the learner's own. Phrases and words without an entry show the
  sentence translation instead. Editing an existing card skips the check.
- **Review is graded by the app** (Hazel's request), replacing the four
  self-rating buttons. A card is multiple choice until it has 2 correct
  answers (`MC_ROUNDS`, counted from review rows with rating > 1), then the
  learner types the meaning. Right → FSRS "Bien", wrong or "No sé" →
  "Otra vez". A wrong typed answer offers "Mi respuesta también vale"
  (→ "Bien") because English meanings have many phrasings. Wrong options
  come from other saved cards first, then glossary meanings of the same kind
  (verb-like vs not), never one the glossary would also accept. Falls back
  to typed recall if fewer than three wrong options exist. "Difícil" and
  "Fácil" are no longer used.
- **Reverse cards dropped**: PLAN §7.2's English-front cards (reps ≥ 3) are
  replaced by typed recall of the meaning, which is what Hazel asked for.

## Phase 4 — timer, goal ring, settings, stats (2026-10-30)

- **Session rows are written live.** A row is added when studying starts and
  its `seconds` are flushed every 5 s, so a force-quit loses at most 5 s
  (PLAN §10 "never trust a single long open tab"). `lib/sessions.ts`.
- **Session ends** on unmount, `visibilitychange` → hidden, `pagehide`, or
  2 min without a tap/scroll/key/audio event. Those 2 min still count (quiet
  reading of a short text is study time); locking the phone stops the timer at
  once, so a walk-away overcounts by at most 2 min. Any interaction resumes
  with a new row.
  Sessions are split at local midnight so "today" is a calendar day.
  Rows that round to 0 s are deleted.
- **Audio counts as interaction:** `speakSegment` start/end calls
  `noteActivity()`, so listening without touching the screen keeps the timer running.
- **Timed screens:** reading, listening, review (counts toward `split.review`).
  Home, theme view, vocab, settings and stats are not study time.
- **Streak:** consecutive days with ≥ 50 % of `dailyMinutes` (PLAN §10).
  Today counts once it qualifies; until then the streak runs through
  yesterday, so it does not drop to 0 in the morning.
- **Daily goal and split are independent** (PLAN §6). The default split sums
  to 47 min against a 45-min goal (PLAN §2 item 6), so Settings shows the
  mismatch with an "Ajustar" button that rescales the split proportionally.
  The goal ring uses `dailyMinutes`; the bars use `split[skill]`.
- **Level and appearance moved from Home to Settings** (`/settings`); Home
  gets 📊 Stats and ⚙️ Settings links. Export/import stays in phase 8.
- **Stats chart:** one series (minutes per day), single accent hue, dashed
  goal line, tap a bar to read its value (no per-bar labels). Bars turn
  green (`ok`) on days the goal was met.
- **Top-bar timer continues across visits** (Hazel, 2026-10-30: it reset on
  every entry). It shows the all-time total for the item, or today's review
  total on the review screen, read from earlier `sessions` rows on mount.

## Reading polish (2026-10-30, Hazel's request)
- Reading/listening text uses Literata (book serif) at 19px, line-height 1.6, warm off-black `--color-reading` (#2e2723 light, #e4dbd0 dark). Hazel picked this over a sans option.
- Font is self-hosted from `@fontsource-variable/literata`, Latin subset only (52 KB woff2, precached), falling back to Georgia — works offline, no Google Fonts request.
- EN chips are outlined and smaller, with an enlarged invisible hit area; the gloss is a quiet left-ruled block in the UI sans.
- The "tap a word…" hint shows only until the learner has 3 cards.

## Phase 5 — speaking and writing (2026-10-31)
- Routes `/speak/:itemId` (monologue, dialogue, shadow) and `/write/:itemId`; both screens are keyed by item id so state never carries across items.
- Only the latest recording per item + segment is kept (`segmentId`: sentence id for shadow, `turn-N` for dialogue, none for monologue). Saves storage on the phone. Listening shadow uses the same rule now.
- Monologue target is 60 s (PLAN says 60–120; the A2 prompt asks for 60–90). A bar fills to the minute; recording can go past it.
- Dialogue: one tap on "Empezar" speaks line 1 (iOS needs a tap for speech); each saved reply speaks the next line. Partner text stays visible (A2). If the voice fails, recording still works.
- Shadow (speaking): tap → TTS → auto-record up to 8 s, same as listening.
- The model answer and the 1–4 self-rating appear only after a recording exists (all turns, for a dialogue). Self-rating is stored in `itemProgress.selfRating` and shown on Stats as an average; it never touches FSRS.
- Live transcript is opt-in (checkbox, remembered per device in localStorage), es-MX, labelled «aproximado». Off by default because running speech recognition and recording together on iOS is unproven.
- Recording counts as study activity (the clock ticks `noteActivity` every second), so a long monologue never idles the timer.
- "Añadir palabra" saves a card; its example is the first sentence in the item (prompt, model answer, partner lines, sentences) containing the word, else the prompt.
- Writing: draft autosaves 600 ms after typing stops and on blur/leave (`itemProgress.userText`). Spellcheck and autocorrect are off so the learner writes accents themselves.
- "Terminé · ver modelo" reveals the model and the checklist; ticks are stored as `itemProgress.checklistDone` (indexes, no schema change). Stats shows the % of checklist lines ticked. "Marcar como terminado" appears only after the reveal.
- "Copiar para corregir" copies: «Corrige este texto en español mexicano, nivel {item level}, explica cada cambio.» + the task + the text. PLAN's example says B1; the item's level is used instead.
- `markItemDone` now merges into the progress row instead of replacing it, so drafts, ticks and ratings survive.
- Smoke uses Chrome's fake microphone flags and stubs `navigator.clipboard.writeText` (headless Chrome has no real clipboard).
