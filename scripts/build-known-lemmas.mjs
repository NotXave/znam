#!/usr/bin/env node
// Builds public/data/<lang>.known.tsv — the set of lemmas that a curated
// morphological dictionary recognises as words of the language.
//
// WHY THIS FILE EXISTS
// --------------------
// The frequency list (public/data/<lang>.freq.tsv) is derived from
// OpenSubtitles, so it faithfully carries everything that appears in subtitle
// text: character names (`liam`, `nicholas`), place names (`komarowo`),
// untranslated foreign words (`hombre`, `matter`), and transliteration noise.
// For the reader's comprehension score that is correct — meeting "Liam" in a
// sentence really is a token you understand — but for the two trainers it is
// not. A vocabulary test that asks "do you know *liam*?" is measuring nothing,
// and Słówka drilling `hombre` as Polish is actively wrong.
//
// The build already downloads the POS-split spaCy lookups (PoliMorf-derived)
// and uses them for form → lemma mapping — but it lowercases every lemma on the
// way in, and in doing so destroys the one signal that separates a word from a
// name. The source files PRESERVE CASE, and 81 374 of the 213 124 noun lemmas
// are capitalised in every entry that produces them: `Komarowo`, `Marshall`,
// `Elias`, `Boho`. Ordinary vocabulary appears lowercase (`dom`) or in both
// casings, because a sentence-initial occurrence also gets recorded (`Kot|kot`).
//
// So the rule is: a lemma is a common word of the language iff the dictionary
// lists it with a lowercase initial somewhere. Membership alone is NOT enough —
// PoliMorf is a full morphological dictionary and inflects proper nouns too.
//
// This is also why the filter cannot be applied to freq.tsv's own contents: the
// OpenSubtitles frequency source is lowercased before it is published, so the
// case signal genuinely does not survive there. It survives here.
//
// The result is a separate artifact rather than a filter on freq.tsv, because
// the reader and the trainers legitimately want different answers.
//
// The filter is deliberately aggressive, because the two error directions do not
// cost the same. A real word wrongly excluded costs almost nothing: calibration
// samples by rank and simply takes a neighbour, and Słówka loses one card out of
// thousands. A name wrongly included costs a whole quiz item measuring nothing,
// or a Słówka session drilling `hombre` as Polish. So when in doubt, drop.
//
// Usage: node scripts/build-known-lemmas.mjs <lang>

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'public', 'data')

const SPACY_BASE =
  'https://raw.githubusercontent.com/explosion/spacy-lookups-data/master/spacy_lookups_data/data'

// Same list build-lang-data.mjs uses, so the two artifacts agree about which
// dictionary they are quoting.
const SPACY_LANGS = {
  pl: ['noun', 'verb', 'adj', 'adv', 'aux', 'adp', 'num', 'part', 'pron'],
}

/**
 * Closed-class and adverbial vocabulary the lookup tables do not carry.
 *
 * The `adp`, `part` and `pron` files hold fifteen, two and four entries
 * respectively — effectively nothing — and the `adv` file is thin. Without this
 * list the filter rejects `by`, `dlaczego`, `trzeba`, `jednak` and `przecież`:
 * some of the most common words in the language.
 *
 * The list is hand-verified, in the same spirit as utils/grammar/prefixes.ts and
 * aspect-pairs.ts. It is finite because the class is finite; every entry was
 * taken from the top-3000 rejection list and checked by hand.
 */
const ALWAYS_KNOWN = {
  pl: [
    // pronouns and their oblique stems
    'ja', 'ty', 'on', 'ona', 'ono', 'my', 'wy', 'oni', 'one',
    'mnie', 'ciebie', 'jego', 'niego', 'jej', 'niej', 'nas', 'was', 'ich', 'nich',
    'mi', 'ci', 'mu', 'jemu', 'nam', 'wam', 'im', 'nim', 'nimi', 'nią', 'nie',
    'siebie', 'się', 'sobie', 'sobą',
    'mój', 'twój', 'jego', 'jej', 'nasz', 'wasz', 'ich', 'swój',
    'ten', 'ta', 'to', 'ci', 'te', 'tamten', 'tamta', 'tamto',
    'kto', 'co', 'kogo', 'czego', 'komu', 'czemu', 'czym', 'kim',
    'który', 'jaki', 'czyj', 'każdy', 'wszystko', 'wszyscy', 'nic', 'nikt',
    'ktoś', 'coś', 'ktokolwiek', 'cokolwiek', 'sam', 'sama', 'samo',
    // prepositions
    'w', 'we', 'z', 'ze', 'na', 'do', 'od', 'ode', 'o', 'po', 'przy', 'przez',
    'dla', 'bez', 'pod', 'nad', 'przed', 'za', 'u', 'ku', 'obok', 'około',
    'między', 'wśród', 'oprócz', 'podczas', 'według', 'wobec', 'zamiast',
    // conjunctions and particles
    'i', 'a', 'ale', 'lecz', 'oraz', 'czy', 'albo', 'lub', 'ani', 'więc',
    'że', 'żeby', 'aby', 'bo', 'ponieważ', 'gdy', 'kiedy', 'jeśli', 'jeżeli',
    'jak', 'jakby', 'niż', 'choć', 'chociaż', 'zanim', 'dopóki',
    'tak', 'nie', 'też', 'także', 'już', 'jeszcze', 'tylko', 'nawet', 'chyba',
    'może', 'właśnie', 'bardzo', 'trochę', 'zawsze', 'nigdy', 'często',
    'tu', 'tutaj', 'tam', 'gdzie', 'dokąd', 'stąd', 'stamtąd',
    'teraz', 'wtedy', 'dziś', 'dzisiaj', 'wczoraj', 'jutro', 'potem', 'znowu',
    'bardziej', 'najbardziej', 'mniej', 'więcej', 'dużo', 'mało',
    'oczywiście', 'niestety', 'proszę', 'dziękuję', 'przepraszam',
    'no', 'ok', 'hej', 'cześć', 'dobrze', 'źle',
    // conditional and subordinating particles — the `by` family in full
    'by', 'bym', 'byś', 'byśmy', 'byście', 'gdyby', 'gdybym', 'gdybyś',
    'gdybyśmy', 'gdybyście', 'żebym', 'żebyś', 'żebyśmy', 'żebyście',
    'abym', 'abyś', 'abyśmy', 'jakbym', 'jakbyś', 'niech', 'oby',
    // discourse connectives
    'czyli', 'zatem', 'jednak', 'przecież', 'zresztą', 'również', 'także',
    'natomiast', 'ponadto', 'iż', 'gdyż', 'oto', 'otóż', 'owszem', 'ależ',
    'czyżby', 'nieprawdaż', 'dlatego', 'dlaczego', 'skąd', 'odkąd', 'póki',
    'pomimo', 'byle', 'niby', 'rzekomo',
    // adverbs of time, manner, degree and place
    'naprawdę', 'trzeba', 'nadal', 'kiedyś', 'wciąż', 'aż', 'gdzieś', 'dość',
    'najpierw', 'inaczej', 'znów', 'znowu', 'przynajmniej', 'dopiero', 'wcale',
    'natychmiast', 'kiedykolwiek', 'gdziekolwiek', 'jakoś', 'wkrótce',
    'wszędzie', 'nigdzie', 'indziej', 'jedynie', 'ponownie', 'niedługo',
    'strasznie', 'widać', 'tędy', 'wreszcie', 'nareszcie', 'coraz', 'nieco',
    'wokół', 'dookoła', 'pomiędzy', 'wewnątrz', 'zewnątrz', 'tuż', 'powoli',
    'zwłaszcza', 'osobiście', 'codziennie', 'dziennie', 'rzeczywiście',
    'zazwyczaj', 'akurat', 'zapewne', 'wprost', 'naprzód', 'ledwo', 'ledwie',
    'następnie', 'niedaleko', 'niezbyt', 'nawzajem', 'obecnie', 'faktycznie',
    'doprawdy', 'niedawno', 'dotąd', 'niemal', 'specjalnie', 'wiecznie',
    'przedtem', 'przeciwko', 'stale', 'wkrótce', 'natychmiastowo',
    // evaluative adverbs and predicatives — extremely common in speech
    'nieźle', 'wspaniale', 'fajnie', 'dziwnie', 'niedobrze', 'nieważne',
    'niemożliwe', 'lepiej', 'gorzej', 'najlepiej', 'lepszy', 'gorszy',
    'najlepszy', 'najgorszy', 'niesamowity', 'niezły',
    // interjections that carry real frequency in subtitles
    'ach', 'och', 'aha', 'ej', 'ha', 'hmm', 'amen', 'okej',
  ],
}

async function fetchText(url, { optional = false } = {}) {
  process.stderr.write(`fetch ${url}\n`)
  const resp = await fetch(url)
  if (!resp.ok) {
    if (optional && resp.status === 404) return null
    throw new Error(`HTTP ${resp.status} for ${url}`)
  }
  return await resp.text()
}

function isSimpleWord(s) {
  return s && !s.includes(' ') && s.length < 40
}

/**
 * Every lemma the POS lookup tables record with a lowercase initial.
 *
 * The case test is the filter. Dropping it — as build-lang-data.mjs does, quite
 * correctly for its own purpose — admits every proper noun in PoliMorf.
 */
async function loadDictionaryLemmas(lang) {
  const known = new Set()
  const posList = SPACY_LANGS[lang]
  if (!posList) throw new Error(`no dictionary source configured for "${lang}"`)

  for (const pos of posList) {
    const text = await fetchText(`${SPACY_BASE}/${lang}_lemma_lookup_${pos}.json`, { optional: true })
    if (!text) continue
    const obj = JSON.parse(text)
    const before = known.size
    let dropped = 0
    for (const lemma of Object.values(obj)) {
      const raw = String(lemma)
      if (!isSimpleWord(raw)) continue
      if (/^\p{Lu}/u.test(raw)) { dropped++; continue }
      known.add(raw.toLowerCase())
    }
    process.stderr.write(
      `  ${pos}: +${known.size - before} lemmas (total ${known.size}), ${dropped} capitalised entries skipped\n`,
    )
  }
  return known
}

/**
 * Lemmas from the UniMorph inflection table, if one is built for this language.
 *
 * The case test has one systematic blind spot: words this corpus only ever
 * recorded capitalised. Some are conventional — Polish capitalises nationality
 * nouns, so `Amerykanin`, `Rosjanin` and `Indianin` have no lowercase entry at
 * all — and some are accidents of which phrase the word was seen in (`Straż
 * Miejska` gives `Straż`, never `straż`).
 *
 * The morphology table is an independent, hand-verified inventory that the
 * grammar game already drills, so anything in it is a word by construction.
 * Unioning it back in recovers the blind spot without loosening the case test.
 */
async function loadMorphLemmas(lang) {
  try {
    const text = await readFile(join(DATA_DIR, `${lang}.morph.tsv`), 'utf-8')
    const out = new Set()
    for (const line of text.split('\n')) {
      const lemma = line.slice(0, line.indexOf('\t')).trim()
      if (lemma) out.add(lemma.toLowerCase())
    }
    return out
  } catch {
    return new Set() // no morphology table for this language
  }
}

/** [lemma, rank] from the artifact build-lang-data.mjs already wrote. */
async function loadFreqLemmas(lang) {
  const path = join(DATA_DIR, `${lang}.freq.tsv`)
  const text = await readFile(path, 'utf-8')
  const out = []
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab <= 0) continue
    const lemma = line.slice(0, tab).trim()
    const rank = Number(line.slice(tab + 1).trim())
    if (lemma && Number.isFinite(rank)) out.push([lemma, rank])
  }
  return out
}

// Words the trainers must be able to reach, and words they must never reach.
// Asserted at build time so a source change that breaks the filter fails here
// rather than silently in a learner's session.
const PROBES = {
  pl: {
    keep: ['kot', 'dom', 'miasto', 'lekarz', 'spadek', 'książka', 'robić', 'dziecko',
           'woda', 'ręka', 'ulica', 'pieniądz', 'wczoraj', 'przez', 'żeby',
           // the closed-class hole ALWAYS_KNOWN exists to plug
           'by', 'dlaczego', 'trzeba', 'jednak', 'przecież', 'naprawdę', 'czyli'],
    drop: ['liam', 'elias', 'hombre', 'matter', 'komarowo', 'marshall', 'nicholas',
           'desi', 'boho',
           // English that leaks in through untranslated subtitle lines
           'you', 'okay', 'yeah', 'the', 'love',
           // subtitle-format noise the frequency list happily ranks
           'fscx100', 'fscy100', 'napisy24', 'synchro',
           // place and person names, which PoliMorf inflects like any noun
           'ameryka', 'londyn', 'paryż', 'chicago', 'michael', 'anna', 'john'],
  },
}

async function main() {
  const lang = process.argv[2]
  if (!lang) {
    console.error('usage: node scripts/build-known-lemmas.mjs <lang>')
    process.exit(1)
  }

  const dict = await loadDictionaryLemmas(lang)
  for (const w of ALWAYS_KNOWN[lang] ?? []) dict.add(w)
  const morph = await loadMorphLemmas(lang)
  let recovered = 0
  for (const w of morph) if (!dict.has(w)) { dict.add(w); recovered++ }
  console.error(`dictionary lemmas: ${dict.size} (${recovered} recovered from the morphology table)`)

  const freq = await loadFreqLemmas(lang)
  console.error(`frequency lemmas: ${freq.length}`)

  // Intersect, keeping frequency order so the file is diff-friendly and the
  // most important entries are at the top.
  const kept = freq.filter(([lemma]) => dict.has(lemma))
  const pct = ((kept.length / freq.length) * 100).toFixed(1)
  console.error(`kept: ${kept.length} of ${freq.length} (${pct}%)`)

  // How aggressive is the filter where it actually matters? The trainers only
  // ever look at the first few thousand ranks.
  for (const band of [1000, 3000, 5000, 20000]) {
    const inBand = kept.filter(([, rank]) => rank <= band).length
    console.error(`  rank ≤ ${band}: ${inBand}/${Math.min(band, freq.length)} kept`)
  }

  await mkdir(DATA_DIR, { recursive: true })
  const path = join(DATA_DIR, `${lang}.known.tsv`)
  await writeFile(path, kept.map(([lemma]) => lemma).join('\n') + '\n', 'utf-8')
  console.error(`wrote ${path}`)

  const probes = PROBES[lang]
  if (!probes) return
  const keptSet = new Set(kept.map(([lemma]) => lemma))
  const freqSet = new Set(freq.map(([lemma]) => lemma))
  let failed = 0
  for (const w of probes.keep) {
    if (!freqSet.has(w)) {
      console.error(`  note: "${w}" is not in the frequency list at all — probe skipped`)
      continue
    }
    if (!keptSet.has(w)) {
      console.error(`  FAIL: real word "${w}" was filtered out`)
      failed++
    }
  }
  for (const w of probes.drop) {
    if (keptSet.has(w)) {
      console.error(`  FAIL: junk word "${w}" survived the filter`)
      failed++
    }
  }
  if (failed > 0) {
    console.error(`${failed} probe(s) failed — the artifact was written, but do not ship it`)
    process.exit(1)
  }
  console.error(`all ${probes.keep.length + probes.drop.length} probes passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
