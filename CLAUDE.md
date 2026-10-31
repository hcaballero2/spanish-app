# spanish-app — instructions for the implementing agent

Read `PLAN.md` in full before doing anything. It is the specification; Section 1
is fixed, Section 2 lists the decisions already approved by the user.

## Non-negotiables
- **Free to build and run.** No paid services, no API keys at build or runtime.
  Content is written by you (Claude Code) as JSON packs, never by an API call.
- **Mexican Spanish only.** Never *vosotros*; use *ustedes* and Mexican vocabulary.
- **Never too hard.** Follow PLAN.md §7.8: no item more than one half-step above
  the learner's current level. The learner is A2 today. First packs are all A2.
- **Community-vetted sources.** Before writing any pack, research what popular
  language-learning threads recommend for Mexican Spanish at that level (Reddit
  and similar, only threads with strong agreement and interaction). Record them in
  `content/SOURCES.md` with thread URLs and in each pack's `sources`. See PLAN.md §8.2.
- **PWA first.** React + TypeScript + Vite + vite-plugin-pwa + Dexie + ts-fsrs +
  Tailwind. No native build unless the user asks (PLAN.md phase 9).

## How to work
- Build in the phase order of PLAN.md §11. Finish a phase, run the checks for it,
  then stop and report before starting the next one.
- Each phase must leave the app usable and deployable.
- Validate every content pack with `scripts/validate-content.ts` before committing.
- Keep the repo layout in PLAN.md §11.
- Ask the user only for things they alone can supply (GitHub account for Pages,
  trying the install on the iPhone). Make routine technical choices yourself and
  note them in a short `DECISIONS.md`.
