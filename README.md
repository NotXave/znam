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

- **Stats dashboard** (app page → Stats) — words known, learning-stage
  distribution, new words per day over the last 30 days, and reading activity
  (pages/videos, how many sit in the 90–98 % "sweet spot").
- **Bootstrap your knowledge** three ways (app page):
  - *Calibrate*: a ~35-word frequency quiz estimates "you know the top N
    words" (logistic fit), adjustable before applying.
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

Load in Firefox via `about:debugging` → *This Firefox* → *Load Temporary
Add-on* → pick `.output/firefox-mv2/manifest.json`.

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

They are built offline by:

```sh
node scripts/build-lang-data.mjs pl
```

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
