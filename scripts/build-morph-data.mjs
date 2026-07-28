#!/usr/bin/env node
// Builds the tagged inflection table that the grammar game (Trening tab) drills:
//   public/data/<lang>.morph.tsv   lemma \t pos \t tag \t form
//
// Unlike <lang>.lemmas.tsv (form → lemma, used by the reader) this keeps the
// GRAMMATICAL TAG, which is what lets the exercise generator both ask for a
// specific form and build near-miss distractors from the same paradigm.
//
// Source: UniMorph (CC-BY-SA) — https://github.com/unimorph/<lang3>
//   lemma \t form \t TAG;TAG;TAG, already a clean cross-linguistic schema.
//
// Coverage caveat (measured for Polish): UniMorph holds ~10k lemmas and covers
// only ~46% of the top-2000 frequency lemmas, and NO closed-class words at all
// (no pronouns, numerals or prepositions). That is deliberate here — the table
// is intersected with the frequency list and the game draws slots only from
// lemmas with a verified paradigm. Closed-class paradigms are hand-authored in
// utils/grammar/closed-class.ts, because prepositions additionally need
// case-government data that no morphology dump carries.
//
// Usage: node scripts/build-morph-data.mjs <lang> [topN=5000]

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'public', 'data')
const CACHE_DIR = join(ROOT, '.cache')

const UNIMORPH_BASE = 'https://raw.githubusercontent.com/unimorph'

/** ISO-639-1 → the ISO-639-3 code UniMorph repos are named by. */
const UNIMORPH_REPO = {
  pl: 'pol', de: 'deu', es: 'spa', fr: 'fra', it: 'ita', pt: 'por',
  nl: 'nld', sv: 'swe', cs: 'ces', uk: 'ukr', ru: 'rus', el: 'ell',
  tr: 'tur', hu: 'hun', bg: 'bul', ro: 'ron',
}

/**
 * UniMorph tag → our compact axis names.
 * ESS (essive) is how UniMorph encodes the Polish LOCATIVE — the single most
 * confusing mapping in the whole file, so it is spelled out rather than hidden.
 */
const CASE_TAGS = {
  NOM: 'nom', GEN: 'gen', DAT: 'dat', ACC: 'acc',
  INS: 'ins', ESS: 'loc', LOC: 'loc', VOC: 'voc',
}
const NUM_TAGS = { SG: 'sg', PL: 'pl' }
const GEN_TAGS = { MASC: 'm', FEM: 'f', NEUT: 'n' }
/** Polish masculine splits three ways and the accusative depends on it. */
const ANIM_TAGS = { HUM: 'hum', ANIM: 'anim', INAN: 'inan' }
const PERSON_TAGS = { 1: '1', 2: '2', 3: '3' }
const TENSE_TAGS = { PRS: 'pres', PST: 'past', FUT: 'fut' }
const MOOD_TAGS = { IMP: 'imp', COND: 'cond' }

async function fetchText(url) {
  process.stderr.write(`fetch ${url}\n`)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`)
  return await resp.text()
}

/** Download once into .cache/ — the UniMorph dumps are multi-MB. */
async function cachedFetch(url, cacheName) {
  await mkdir(CACHE_DIR, { recursive: true })
  const path = join(CACHE_DIR, cacheName)
  try {
    const st = await stat(path)
    if (st.size > 0) {
      process.stderr.write(`cache hit ${cacheName} (${(st.size / 1e6).toFixed(1)} MB)\n`)
      return await readFile(path, 'utf-8')
    }
  } catch {
    // not cached yet
  }
  const text = await fetchText(url)
  await writeFile(path, text, 'utf-8')
  return text
}

/**
 * Canonical axis order for the emitted tag. UniMorph itself is inconsistent —
 * it writes adjectives gender-first (FEM;ACC;SG) but verbs gender-last
 * (PST;1;SG;FEM). The generator has to be able to BUILD a tag string and look
 * it up directly, so everything is re-emitted in one fixed order regardless of
 * how the source happened to spell it:
 *
 *   [tense|mood] [person] [number] [gender] [animacy] [case]
 *
 * e.g.  sg.gen · sg.f.gen · past.p1.sg.m · pres.p3.pl
 */
const AXIS_ORDER = ['tense', 'person', 'number', 'gender', 'anim', 'case']

/**
 * Turn a UniMorph tag bundle into `pos` + a compact dot-joined tag.
 * Returns null for rows the game never drills (participles, converbs, …), so
 * the table stays small and every row is something a template can ask for.
 */
function normalizeTag(rawTags) {
  const tags = rawTags.split(';').map(t => t.trim()).filter(Boolean)
  if (tags.length === 0) return null

  const head = tags[0]
  // Skip non-finite/derived forms — out of scope for tier 1–4.
  if (head === 'V.PTCP' || head === 'V.MSDR' || head === 'V.CVB') return null

  const axis = {}
  let pos = null

  for (const tag of tags) {
    if (tag === 'N') { pos = 'N'; continue }
    if (tag === 'ADJ') { pos = 'A'; continue }
    if (tag === 'V') { pos = 'V'; continue }
    if (CASE_TAGS[tag]) { axis.case = CASE_TAGS[tag]; continue }
    if (NUM_TAGS[tag]) { axis.number = NUM_TAGS[tag]; continue }
    if (GEN_TAGS[tag]) { axis.gender = GEN_TAGS[tag]; continue }
    if (ANIM_TAGS[tag]) { axis.anim = ANIM_TAGS[tag]; continue }
    if (TENSE_TAGS[tag]) { axis.tense = TENSE_TAGS[tag]; continue }
    if (MOOD_TAGS[tag]) { axis.tense = MOOD_TAGS[tag]; continue }
    if (PERSON_TAGS[tag]) { axis.person = `p${PERSON_TAGS[tag]}`; continue }
    // Anything else (aspect labels, politeness, …) is dropped on purpose.
  }

  if (!pos) {
    // Some UniMorph rows omit the POS head; infer it from what we did see.
    if (axis.tense || axis.person) pos = 'V'
    else if (axis.case) pos = 'N'
    else return null
  }

  const parts = AXIS_ORDER.map(a => axis[a]).filter(Boolean)
  if (parts.length === 0) return null

  return { pos, tag: parts.join('.') }
}

/** lemma set of the top-N frequency lemmas, read from the sibling artifact. */
async function loadTopLemmas(lang, topN) {
  const path = join(DATA_DIR, `${lang}.freq.tsv`)
  const text = await readFile(path, 'utf-8')
  const out = new Set()
  for (const line of text.split('\n')) {
    const [lemma, rank] = line.replace(/\r$/, '').split('\t')
    if (!lemma || !rank) continue
    if (Number(rank) > topN) continue
    out.add(lemma.toLowerCase())
  }
  return out
}

async function main() {
  const [lang, topNArg] = process.argv.slice(2)
  if (!lang) {
    console.error('usage: node scripts/build-morph-data.mjs <lang> [topN=2000]')
    process.exit(1)
  }
  const topN = Number(topNArg) || 5000
  const repo = UNIMORPH_REPO[lang]
  if (!repo) {
    console.error(`no UniMorph repo mapped for "${lang}" — add it to UNIMORPH_REPO`)
    process.exit(1)
  }

  const topLemmas = await loadTopLemmas(lang, topN)
  console.error(`top-${topN} frequency lemmas: ${topLemmas.size}`)

  const raw = await cachedFetch(`${UNIMORPH_BASE}/${repo}/master/${repo}`, `unimorph-${repo}.tsv`)

  const rows = []
  const seen = new Set() // dedupe on lemma+tag+form
  const coveredLemmas = new Set()
  const posCounts = {}
  let skippedTag = 0
  let outOfScope = 0

  for (const line of raw.split('\n')) {
    const [lemmaRaw, form, tags] = line.replace(/\r$/, '').split('\t')
    if (!lemmaRaw || !form || !tags) continue
    const lemma = lemmaRaw.toLowerCase()
    if (!topLemmas.has(lemma)) { outOfScope++; continue }

    const norm = normalizeTag(tags)
    if (!norm) { skippedTag++; continue }

    const key = `${lemma}\t${norm.tag}\t${form}`
    if (seen.has(key)) continue
    seen.add(key)

    rows.push({ lemma, pos: norm.pos, tag: norm.tag, form: form.toLowerCase() })
    coveredLemmas.add(lemma)
    posCounts[norm.pos] = (posCounts[norm.pos] ?? 0) + 1
  }

  rows.sort((a, b) => a.lemma.localeCompare(b.lemma) || a.tag.localeCompare(b.tag))

  await mkdir(DATA_DIR, { recursive: true })
  const outPath = join(DATA_DIR, `${lang}.morph.tsv`)
  await writeFile(
    outPath,
    rows.map(r => `${r.lemma}\t${r.pos}\t${r.tag}\t${r.form}`).join('\n') + '\n',
    'utf-8',
  )

  // ── Coverage report ───────────────────────────────────────
  // Template authors need this: it says which lemmas are safe to reference.
  const pct = ((coveredLemmas.size / topLemmas.size) * 100).toFixed(1)
  console.error('')
  console.error(`wrote ${outPath}`)
  console.error(`  rows:            ${rows.length}`)
  console.error(`  lemmas covered:  ${coveredLemmas.size} / ${topLemmas.size} (${pct}%)`)
  console.error(`  by POS:          ${Object.entries(posCounts).map(([p, n]) => `${p}=${n}`).join(' ')}`)
  console.error(`  skipped (tag):   ${skippedTag}   out of top-${topN}: ${outOfScope}`)
  console.error('')
  console.error('  Closed-class words (pronouns/numerals/prepositions) are NOT in')
  console.error('  UniMorph — they live in utils/grammar/closed-class.ts by hand.')

  const listPath = join(CACHE_DIR, `${lang}.morph-lemmas.txt`)
  await writeFile(listPath, [...coveredLemmas].sort().join('\n') + '\n', 'utf-8')
  console.error(`  usable lemma list → ${listPath}`)

  if (lang === 'pl') {
    console.error('\n  spot checks:')
    for (const probe of ['kot', 'robić', 'dobry', 'miasto']) {
      const forms = rows.filter(r => r.lemma === probe)
      const sample = forms.slice(0, 4).map(f => `${f.form}/${f.tag}`).join(' ')
      console.error(`    ${probe}: ${forms.length} forms  ${sample}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
