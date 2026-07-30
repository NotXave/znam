# znam

A browser extension for **comprehensible input**: it tracks which words you
know per language, turns any webpage into a click-to-translate reader, scores
every page and YouTube video by how much of it you understand, and builds a
personal library sorted by difficulty — so you can always read/watch at the
i+1 sweet spot.

*znam* is Polish for "I know".

## Features

- **Universal reader** — toggle on any page (toolbar popup or `Alt+R`).
  Words are wrapped in clickable spans: click for a translation tooltip
  (Google Translate + Reverso Context + Wiktionary, rendered progressively),
  drag across words to translate a phrase, right-click for the whole sentence.
  DeepL is queried alongside Google/Reverso via its unofficial web endpoint,
  so its translation and alternatives always appear in the dropdown to compare
  and pick from (the pick is saved to the word). Requests are serialized on a
  ~1.2 s queue with a short cooldown + one retry, which keeps the rate-limited
  free endpoint reliable even during click bursts; set it as the default in
  the popup → Primary source.
- **Word knowledge** — every word is `unknown`, `learning`, `known`, or
  `ignored`. Clicking an unknown word auto-marks it *learning*; tooltip
  buttons switch status. Unknown words get a blue tint, learning words yellow.
- **Lemmatization** — inflected forms map to their lemma (*robię, robił,
  zrobisz → robić*), so knowing one form counts them all. Per-language
  dictionaries are installed once from the app page (Languages tab).
- **Comprehensibility score** — a floating badge shows *"93% · sweet spot ·
  12 unknown"* for the current page. "✓ Read" marks all remaining unknown
  words as known. Capitalized words the dictionary doesn't know are treated
  as names and excluded.
- **Library** — every page/video you read with the reader on is saved and
  rescored live against your current knowledge; sort by comprehensibility,
  pin your reading list.
- **YouTube** — watch pages get a score badge above the title (fetched from
  the video's subtitles in your target language), and the rendered subtitles
  themselves become clickable: words are highlighted by status, clicking
  pauses the video and opens the tooltip with level/Known/Ignore buttons —
  marking words while watching refines your knowledge over time. The **📌
  Subtitles** button opens a pinned panel below the video: the current line
  with clickable/colored words and its translation, plus previous/replay/next
  line controls and an auto-pause-per-line toggle. On browse and search pages
  a "% Score results" button badges up to 30 thumbnails.

- **Shorts immersion feed** — on youtube.com/shorts your personalized feed
  becomes a comprehensible-input feed. Each short is scored the moment it
  opens; shorts are auto-skipped when they have **no target-language
  subtitles** *or* fall **below your comprehension target** (Any / ≥50 / ≥70 /
  ≥85 %), so you stay in the i+1 sweet spot. A clean overlay shows the current
  line (clickable, colored by level) + its translation, a difficulty chip, and
  a "marked this session" counter, with controls for **loop** (repetition),
  **playback speed** (0.75–1.5×), the difficulty gate, and language-only
  auto-skip. Clicking a word pauses the video. Keyboard: Shift+S skip,
  Shift+R replay, Shift+L loop. Phrase lookup: click first word, shift-click
  last.

- **Comprehension score** is weighted two ways: by learning stage (known = 100 %,
  learning stages 1–5 = 20–100 %) and by word frequency (an unknown *rare* word
  barely dents the score; an unknown *common* word costs more) — so the i+1
  difficulty label reflects what actually blocks comprehension.

- **Automatic level progression** — a learning word you keep meeting while
  reading/watching *without looking it up* climbs a stage on its own (every few
  distinct readings), so your knowledge calibrates over time with no manual
  bookkeeping. Looking a word up excludes it from that reading's exposures.

- **🦬 Trening — a 15-minute daily grammar game** (app page → Trening). Reading
  builds vocabulary; it does not teach you the seven cases. This tab does, in
  **German**, and it is bounded by *time* rather than item count — a session
  ends when the fifteen minutes are up, never mid-question.
  - **41 concepts**, every one with a lesson and drills: all six core cases in
    **singular and plural** (the plural is where Polish actually hurts), the
    vocative, four verb tenses, aspect, adjective agreement, prepositions by
    governed case, numerals, and pronouns.
  - **Verb prefixes as a first-class group.** Polish builds huge verb families
    off one stem, and the system transfers almost directly from German:
    `pod·pisać` is `unter·schreiben`, `przed·stawić` is `vor·stellen`,
    `wy·jść` is `aus·gehen`. Taught both as a system (~15 prefixes with their
    German twins) and as families (*pisać → podpisać, zapisać, wypisać …*).
  - **Explains, then drills.** Each concept opens with a micro-lesson: the rule,
    a pattern table, the **bridge to German** (*„mit + Dativ" → z + Instrumental*),
    the mistake German speakers reliably make, and a mnemonic.
  - **Exercises are generated, not canned** — authored sentence frames are filled
    from a tagged inflection table (`public/data/pl.morph.tsv`, from UniMorph),
    preferring **words you are already learning in znam**. Wrong answers are
    pulled from the *same word's own paradigm* (*kina* vs *kinu / kinem / kinie*),
    so a case drill forces a real decision instead of a guess.
  - **Spaced repetition over concepts**, not cards — grammar clicks all at once,
    so an SM-2-lite scheduler tracks 41 concepts in a prerequisite graph. A
    topic unlocks only when its prerequisites are both accurate *and* durable.
  - **Made to come back to.** The home screen answers *what should I do today*
    and *what did yesterday accomplish*, not just *did you show up*:
    - a **daily goal ring** that fills on minutes **or** items, whichever you
      hit first, so a slow careful session and a fast confident one both finish
      the day (both modes count toward it);
    - **three weekly quests** generated from your own state and rerolled Monday
      — *„Der Plural tut weh — drei verschiedene Fälle im Plural"*, *„Drei
      Dauerbrenner erledigen"*, *„20-mal selbst getippt"*. A streak cannot name
      the thing you have been avoiding; a quest can;
    - a **7 × 2 case grid**, the table every Polish textbook uses, so *"I still
      can't do the genitive plural"* is visible at a glance;
    - a **review forecast** — 14 days of concepts and cards coming back due;
    - a **session diff** on the summary: what you met for the first time, what
      the scheduler now trusts you with (*„in 8 statt 3 Tagen"*), what came back
      closer;
    - a **badge shelf** with five three-tier ladders, derived from totals so
      they always show the next rung rather than a bare unlocked flag;
    - and **this week against your own best week** — no leaderboard, the
      opponent is last-month-you.
    Plus streaks with forgiveness (a banked freeze absorbs one missed day), XP
    with a combo multiplier, ranks *Nowicjusz → Legenda*, a boss round on your
    weakest topic, and Żubr the bison as coach. No dependencies and no asset
    files: CSS animations, inline SVG icons, and a drawn Żubr.
- **📚 Słówka — a vocabulary trainer for the words you keep getting wrong**
  (second mode on the Trening screen, with its own streak). znam already counts
  every time you look a word up; this drills exactly those. Cards come **only**
  from the top 3000 lemmas (adjustable 1000–5000), so you never waste a session
  on something that appears once in a million words. Three kinds: recognize
  (Polish → four German glosses, distractors from a nearby frequency band),
  produce (German → type the Polish), and context, which reuses the sentence
  the reader captured when you first clicked the word. Doing both modes in a
  day earns a **Perfekter Tag** bonus.
- **Stats dashboard** (app page → Stats) — words known, learning-stage
  distribution, new words per day over the last 30 days, and reading activity
  (pages/videos, how many sit in the 90–98 % "sweet spot").
- **Four themes** (Midnight, Daylight, Nord, Sepia) sharing one set of design
  tokens: a ten-step neutral ramp per theme plus a single accent, hairline
  borders instead of shadows, and a real type scale in which Polish under study
  gets its own display face. WCAG AA contrast across all four is asserted by
  `npm test`, which parses the stylesheet — a near-monochrome palette is exactly
  where contrast fails quietly.
- **Bootstrap your knowledge** three ways (app page):
  - *Calibrate*: an adaptive ~25-item quiz estimates your vocabulary size with
    a 90 % credible interval. Some of the words are **invented** — plausible
    Polish non-words generated offline — which measures how often you'd claim a
    word you don't know and corrects the estimate for it. Results are applied in
    **bands**: words you almost certainly know are marked known, the uncertain
    band becomes *learning* rather than being claimed outright, and the run can
    be undone in one click.
  - *Import*: the vocabulary CSV exported by
    [manga-translator](https://github.com/NotXave/manga-translator) or
    language-reactor-clone.
  - *Organically*: click words while reading, mark pages as read.
- **Export** — words as CSV (Excel-safe BOM) or Anki-importable text. Every
  time you look a word up is counted, so the Words tab can sort by "most
  looked up" and export just your hardest words (looked up ≥ N times) straight
  to Anki — your personal review deck of the words that keep tripping you up.

## Build & install

```sh
npm install
npm run build          # → .output/firefox-mv2
```

**Permanent install** (survives restarts): see **[INSTALL.md](INSTALL.md)** —
sign it as an unlisted add-on with `npm run sign` (needs free Mozilla API
keys) and install the resulting `.xpi` via `about:addons`, or let the GitHub
release workflow build a signed `.xpi` for you.

**Quick test only** (temporary, gone on restart): Firefox `about:debugging` →
*This Firefox* → *Load Temporary Add-on* → pick
`.output/firefox-mv2/manifest.json`.

Then open the popup → *Open library & words* → **Languages** → *Install* for
your target language.

## Language data

Two compact artifacts per language live in `public/data/` — Polish, German
and English are bundled with the extension; other languages are fetched from
this repo (or installed from local files in the Languages tab):

| file | content |
|---|---|
| `<lang>.lemmas.tsv` | `form <TAB> lemma`, trimmed to forms of the top-50k lemmas |
| `<lang>.freq.tsv` | `lemma <TAB> rank`, OpenSubtitles frequencies merged by lemma |
| `<lang>.morph.tsv` | `lemma <TAB> pos <TAB> tag <TAB> form` — the tagged inflection table the grammar game drills (Polish only) |
| `<lang>.pseudo.tsv` | invented but plausible non-words, for the calibration quiz's guessing-rate correction |
| `<lang>.known.tsv` | one lemma per line — the words a dictionary recognises, so the trainers never drill a name |

They are built offline by:

```sh
node scripts/build-lang-data.mjs pl     # reader: lemmas + frequencies
npm run build:morph                     # Trening: tagged inflection table
node scripts/build-pseudowords.mjs pl   # Calibrate: invented words
npm run build:known                     # Trening + Calibrate: what counts as a word
node scripts/build-prefix-families.mjs  # candidates for hand-verification
```

`known.tsv` exists because a frequency list is not a vocabulary. OpenSubtitles
ranks *boho* at 157 and *liam* at 4000; for the reader's comprehension score
those are legitimately tokens you understand, but asking "do you know *liam*?"
in a vocabulary test measures nothing. The spaCy lookups **preserve case**, and
81 374 of 213 124 noun lemmas are capitalised in every entry that produces them
(`Komarowo`, `Marshall`), while ordinary words appear lowercase or in both
casings (`Kot|kot`) — so a lowercase entry somewhere is the signal. Membership
alone is not: PoliMorf is a full morphological dictionary and inflects proper
nouns too. Closed-class words the POS tables omit (`by`, `trzeba`, `przecież`)
are hand-listed in the script, and the UniMorph table is unioned back in to
recover words Polish conventionally capitalises (`Amerykanin`, `Rosjanin`).

The morphology table comes from [UniMorph](https://github.com/unimorph/pol)
(CC-BY-SA), intersected with the top-2000 frequency lemmas — ~23k rows covering
~925 lemmas, every form verified rather than generated. UniMorph carries no
closed-class words at all, so pronouns, numerals and prepositions (with the
case each governs) are hand-authored in `utils/grammar/closed-class.ts`.

## Tests

```sh
npm test               # node --test, zero dependencies
npm run audit:grammar  # sample real generated exercises for human review
npm run smoke:translate # hits the live translation endpoint
```

The grammar modules under `utils/grammar/` are pure functions, which is what
makes them testable without a browser or a test framework — the suite runs on
Node 22's built-in runner and native TypeScript type-stripping. `audit:grammar`
exists because no unit test catches a sentence that is perfectly inflected and
semantically absurd; read its output whenever you add a template.

`smoke:translate` covers the half of Słówka's gloss fetching that fakes cannot:
it runs the real `translateBatch` through the real `fetchGlosses` against the
live endpoint and checks that answers still line up with the words they gloss.
The failure modes fakes *are* needed for — a hanging endpoint, a mangled
separator, a response that echoes its input — live in `glosses.test.ts`,
including the 317-second session-start hang as a regression test.

Sources: Polish from [spaCy lookups](https://github.com/explosion/spacy-lookups-data)
(PoliMorf, BSD), other languages from
[lemmatization-lists](https://github.com/michmech/lemmatization-lists)
(CC-BY-SA), frequencies from
[FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles).
Languages without lemma data still work — forms are then tracked literally.

## Known limitations

- Polish aspect pairs are separate lemmas (*robić* vs *zrobić*) — knowing one
  does not mark the other.
- YouTube subtitles are fetched via the InnerTube player API with an
  ANDROID/IOS client identity, because WEB-client timedtext URLs return empty
  bodies without a proof-of-origin token. If YouTube retires those client
  versions, bump them in `utils/youtube-captions.ts`. Videos without subtitles
  in your target language show *no subs* / *n/a*.
- The reader is toggle-per-page by design; heavy web apps are not good
  wrapping targets. Use the popup's "Always on" for your regular reading
  sites.
