#!/usr/bin/env node
// Builds the compact per-language data artifacts bundled with the extension:
//   public/data/<lang>.lemmas.tsv  form \t lemma   (trimmed to forms of the top-N lemmas)
//   public/data/<lang>.freq.tsv    lemma \t rank   (frequency merged by lemma)
//
// Sources:
//   - Polish lemma data: spaCy lookups (PoliMorf-derived, BSD) — the michmech
//     lemmatization-lists repo has no Polish file.
//   - Other languages: michmech/lemmatization-lists TSVs (CC-BY-SA).
//   - Frequencies: hermitdave/FrequencyWords (OpenSubtitles 2018, 50k surface forms).
//
// Usage: node scripts/build-lang-data.mjs <lang> [topN=50000]

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')

const SPACY_BASE =
  'https://raw.githubusercontent.com/explosion/spacy-lookups-data/master/spacy_lookups_data/data'
const MICHMECH_BASE = 'https://raw.githubusercontent.com/michmech/lemmatization-lists/master'
const FREQ_BASE = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018'

// Languages whose lemma data comes from spaCy lookups (POS-split JSON maps).
// Order = conflict precedence (first wins).
const SPACY_LANGS = {
  pl: ['noun', 'verb', 'adj', 'adv', 'aux', 'adp', 'num', 'part', 'pron'],
}

async function fetchText(url, { optional = false } = {}) {
  process.stderr.write(`fetch ${url}\n`)
  const resp = await fetch(url)
  if (!resp.ok) {
    if (optional && resp.status === 404) return null
    throw new Error(`HTTP ${resp.status} for ${url}`)
  }
  const buf = new Uint8Array(await resp.arrayBuffer())
  // Some lemmatization-lists files are UTF-16LE with BOM — sniff it.
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf)
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf)
  return new TextDecoder('utf-8').decode(buf)
}

function isSimpleWord(s) {
  return s && !s.includes(' ') && s.length < 40
}

/** form(lowercase) → lemma(lowercase) */
async function loadLemmaMap(lang) {
  const map = new Map()

  if (SPACY_LANGS[lang]) {
    for (const pos of SPACY_LANGS[lang]) {
      const text = await fetchText(`${SPACY_BASE}/${lang}_lemma_lookup_${pos}.json`, { optional: true })
      if (!text) continue
      const obj = JSON.parse(text)
      let added = 0
      for (const [form, lemma] of Object.entries(obj)) {
        const f = form.toLowerCase()
        const l = String(lemma).toLowerCase()
        if (!isSimpleWord(f) || !isSimpleWord(l)) continue
        if (!map.has(f)) {
          map.set(f, l)
          added++
        }
      }
      process.stderr.write(`  ${pos}: +${added} forms (total ${map.size})\n`)
    }
    return map
  }

  const text = await fetchText(`${MICHMECH_BASE}/lemmatization-${lang}.txt`, { optional: true })
  if (!text) return map // no lemma source — freq-only artifact still works
  for (const line of text.split('\n')) {
    const [lemma, form] = line.replace(/\r$/, '').split('\t')
    if (!lemma || !form) continue
    const f = form.toLowerCase()
    const l = lemma.toLowerCase()
    if (!isSimpleWord(f) || !isSimpleWord(l)) continue
    if (!map.has(f)) map.set(f, l)
  }
  return map
}

/** [{ word, count }] from the 50k OpenSubtitles list. */
async function loadFrequencies(lang) {
  const text = await fetchText(`${FREQ_BASE}/${lang}/${lang}_50k.txt`)
  const out = []
  for (const line of text.split('\n')) {
    const [word, count] = line.trim().split(/\s+/)
    if (!word || !count) continue
    out.push({ word: word.toLowerCase(), count: Number(count) })
  }
  return out
}

async function main() {
  const [lang, topNArg] = process.argv.slice(2)
  if (!lang) {
    console.error('usage: node scripts/build-lang-data.mjs <lang> [topN=50000]')
    process.exit(1)
  }
  const topN = Number(topNArg) || 50000

  const lemmaMap = await loadLemmaMap(lang)
  console.error(`lemma map: ${lemmaMap.size} forms`)

  const freqs = await loadFrequencies(lang)
  console.error(`frequency list: ${freqs.length} surface forms`)

  // Merge surface-form counts by lemma
  const lemmaCounts = new Map()
  for (const { word, count } of freqs) {
    const lemma = lemmaMap.get(word) ?? word
    lemmaCounts.set(lemma, (lemmaCounts.get(lemma) ?? 0) + count)
  }
  const ranked = [...lemmaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([lemma], i) => ({ lemma, rank: i + 1 }))
  const topLemmas = new Set(ranked.map(r => r.lemma))
  console.error(`ranked lemmas: ${ranked.length}`)

  // Keep only forms that resolve to a top lemma
  const keptForms = []
  for (const [form, lemma] of lemmaMap) {
    if (topLemmas.has(lemma)) keptForms.push([form, lemma])
  }
  console.error(`kept forms: ${keptForms.length} of ${lemmaMap.size}`)

  await mkdir(DATA_DIR, { recursive: true })
  const lemmasPath = join(DATA_DIR, `${lang}.lemmas.tsv`)
  const freqPath = join(DATA_DIR, `${lang}.freq.tsv`)
  await writeFile(
    lemmasPath,
    keptForms.map(([f, l]) => `${f}\t${l}`).join('\n') + '\n',
    'utf-8',
  )
  await writeFile(
    freqPath,
    ranked.map(r => `${r.lemma}\t${r.rank}`).join('\n') + '\n',
    'utf-8',
  )
  console.error(`wrote ${lemmasPath}`)
  console.error(`wrote ${freqPath}`)

  // Spot checks
  if (lang === 'pl') {
    for (const probe of ['robię', 'robił', 'zrobisz', 'kotem', 'domu']) {
      console.error(`  spot check: ${probe} → ${lemmaMap.get(probe) ?? '(miss)'}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
