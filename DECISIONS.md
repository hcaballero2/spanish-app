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
