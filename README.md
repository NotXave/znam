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
- **YouTube** — watch pages get a score badge next to the title (fetched from
  the video's subtitles in your target language); on search result pages a
  "% Score results" button badges up to 30 thumbnails.
- **Bootstrap your knowledge** three ways (app page):
  - *Calibrate*: a ~35-word frequency quiz estimates "you know the top N
    words" (logistic fit), adjustable before applying.
  - *Import*: the vocabulary CSV exported by
    [manga-translator](https://github.com/NotXave/manga-translator) or
    language-reactor-clone.
  - *Organically*: click words while reading, mark pages as read.
- **Export** — words as CSV (Excel-safe BOM) or Anki-importable text.

## Build & install

```sh
npm install
npm run build          # → .output/firefox-mv2
```

Load in Firefox via `about:debugging` → *This Firefox* → *Load Temporary
Add-on* → pick `.output/firefox-mv2/manifest.json`.

Then open the popup → *Open library & words* → **Languages** → *Download &
install* for your target language.

## Language data

The extension downloads two compact artifacts per language from this repo's
`data/` directory (or install them from local files in the Languages tab):

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
