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
