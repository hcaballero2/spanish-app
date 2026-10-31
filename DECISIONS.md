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
