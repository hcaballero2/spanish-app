# Community-recommended resources

Resources the packs draw on, with the community threads that recommend them.
Rule (PLAN.md §8.2): only resources with substantial agreement across popular
learner threads. Packs never copy text from these; they link out.

## Verification status (read this first)

Reddit cannot be read from the development machine: reddit.com returns a login
wall to scripts, Anthropic's fetcher is blocked by reddit.com, and the public
mirrors (redlib, rtrace) were down on 2026-10-30. The thread links below were
found through search engines, which quoted parts of the threads. Where a vote or
comment count is missing it was not visible. **Phase 7 must re-check these counts
from a logged-in browser** before packs 2–4 are written, and drop anything that
turns out to be weakly supported.

## Threads consulted

| Thread | Community | Date | What it shows |
|---|---|---|---|
| [Best podcasts to learn Spanish](https://www.reddit.com/r/Spanish/comments/16vw8r1/best_podcasts_to_learn_spanish/) | r/Spanish | Sep 2023 | No Hay Tos recommended as the Mexican podcast; Duolingo Spanish Podcast called easier. Counts not visible. |
| [r/Spanish podcast wiki](https://www.reddit.com/r/Spanish/wiki/podcasts) | r/Spanish | ongoing | Moderator-curated list; marks No Hay Tos as Mexican. |
| [Advice for a fresh beginner](https://www.reddit.com/r/Spanish/comments/105vks3/advice_for_a_fresh_beginner/) | r/Spanish | Jan 2023 | Language Transfer named "one of the most recommended places to start". Counts not visible. |
| [r/learnspanish podcast thread](https://www.reddit.com/r/learnspanish/comments/yk0jui/) | r/learnspanish | Nov 2022 | Podcast recommendations; counts not visible. |
| [Dreaming Spanish community wiki](https://www.reddit.com/r/dreamingspanish/wiki/index) | r/dreamingspanish | ongoing | Level guidance for Superbeginner/Beginner input. |

Independent guides that agree with the threads (used only as corroboration):
espanol.com comprehensible-input YouTube guide, secondhalftravels.com Spanish
YouTube list, afar.com language podcast list, alllanguageresources.com Spanish
podcasts. All name the same four or five resources below.

## Resources

| Resource | Kind | Level | Mexican? | Why the community rates it |
|---|---|---|---|---|
| [Easy Spanish](https://www.youtube.com/@EasySpanish) | YouTube | A1–C1 (has an A1 playlist) | Mexico City street interviews (also Barcelona) | Real people, dual ES/EN subtitles, accent exposure. Named in every guide consulted. Best fit for A2 street-life themes. |
| [Dreaming Spanish](https://www.dreamingspanish.com) | video input | Superbeginner → Advanced | Mixed; several Mexican guides | The most-recommended comprehensible-input source on r/languagelearning and r/Spanish; own subreddit. Use Beginner level at A2. |
| [Butterfly Spanish](https://www.youtube.com/@ButterflySpanish) | YouTube | Beginner–Intermediate | Yes (Ana, Mexican) | Explains Mexican vs Castilian vs LatAm usage; "clear, warm" for beginners in several guides. |
| [No Hay Tos](https://nohaytos.com) | podcast | B1–B2+ (too fast for A2) | Yes (two Mexican teachers) | The Mexican podcast r/Spanish names first. **Not for A2 packs**; reserve for B1+ external-media items. Free transcripts by newsletter. |
| [Language Transfer: Complete Spanish](https://www.languagetransfer.org/complete-spanish) | audio course | A0–A2/B1 | neutral LatAm | Free; repeatedly "most recommended place to start" on r/Spanish. Use for grammar micro-lesson framing. |
| [Duolingo Spanish Podcast](https://podcast.duolingo.com) | podcast | A2–B1 | LatAm, some Mexican stories | Called easier than No Hay Tos in the r/Spanish podcast thread; English narration scaffolds the Spanish. |

## Per-pack use

- **01 Comida callejera (A2):** Easy Spanish (Mexico City food-street episodes),
  Dreaming Spanish Beginner food videos, Butterfly Spanish food vocabulary.

## Word meanings (glossary)

Every glossary meaning is checked against dictionaries, never a machine
translator. Each pack records the source per word in `glossarySources`, and the
app links to it when a word is checked.

- **WordReference** (wordreference.com) and **SpanishDict** (spanishdict.com):
  checked automatically by `scripts/check-glossary.ts`. Results per pack are in
  `content/checks/<pack>.glossary.json`.
- **DEM**, the *Diccionario del español de México* by El Colegio de México
  (dem.colmex.mx): checked by hand for Mexican words (antojito, tianguis,
  suadero, tlacoyo…) and for words the first two don't confirm.
- **name**: proper names (Lupita, Chucho, Roma) that no dictionary lists.
- Sentence translations are written to match the checked glossary meanings.

Pack 01 (2026-11-01): 198 of 213 confirmed automatically. The other 15 were
checked by hand: most were matcher misses (conjugated verbs like *soy*, *es*),
3 are names, and 9 meanings were reworded (e.g. *suadero* "beef brisket" →
"beef cut from the chest", per DEM).
