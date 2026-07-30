/**
 * Content audit for the grammar game.
 *
 * The hybrid content strategy — authored frames × generated fillers — has one
 * failure mode no unit test can catch: sentences that are grammatically perfect
 * but semantically absurd ("Ich gehe mit einem Krieg spazieren"). This script
 * samples real generated output so a human can actually read it.
 *
 *   npm run audit:grammar               # summary + a sample to stdout
 *   npm run audit:grammar -- --all      # every generated item, as TSV
 *
 * Review the output, then fix the offending TEMPLATE (tighten its slot spec or
 * reword the frame) rather than patching around it downstream.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { generate, makeRandom, rankLemmas, type Paradigm, type VocabRank } from '../utils/grammar/generator'
import { TEMPLATES } from '../utils/grammar/templates'
import { CONCEPT_BY_ID } from '../utils/grammar/curriculum'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PER_TEMPLATE = 60

const paradigms = new Map<string, Paradigm>()
for (const line of readFileSync(join(ROOT, 'public/data/pl.morph.tsv'), 'utf-8').split('\n')) {
  if (!line) continue
  const [lemma, , tag, form] = line.split('\t')
  if (!lemma || !tag || !form) continue
  let p = paradigms.get(lemma)
  if (!p) { p = new Map(); paradigms.set(lemma, p) }
  p.set(tag, form)
}

const rank = new Map<string, number>()
for (const line of readFileSync(join(ROOT, 'public/data/pl.freq.tsv'), 'utf-8').split('\n')) {
  const [lemma, r] = line.split('\t')
  if (lemma && r) rank.set(lemma, Number(r))
}

const vocab: VocabRank = {
  learning: new Set(),
  known: new Set(paradigms.keys()),
  ignored: new Set(),
  rank,
}

const pool = rankLemmas([...paradigms.keys()], vocab)
const showAll = process.argv.includes('--all')

interface Row {
  templateId: string
  conceptId: string
  promptDe: string
  text: string
  cue: string
  answer: string
  options: string
}

const rows: Row[] = []
const failures: string[] = []

for (const template of TEMPLATES) {
  let made = 0
  const seen = new Set<string>()

  for (let seed = 0; seed < PER_TEMPLATE * 4 && made < PER_TEMPLATE; seed++) {
    const random = makeRandom(seed * 2654435761)
    const offset = Math.floor(random() * pool.length)
    const rotated = [...pool.slice(offset), ...pool.slice(0, offset)]
    const ex = generate(template, template.conceptIds[0], 'drill', {
      lemmas: rotated,
      paradigmOf: l => paradigms.get(l),
      random,
    })
    if (!ex) continue
    const key = `${ex.text}|${ex.answer}`
    if (seen.has(key)) continue
    seen.add(key)
    made++
    rows.push({
      templateId: ex.templateId,
      conceptId: ex.conceptId,
      promptDe: ex.promptDe,
      text: ex.text,
      cue: ex.cue,
      answer: ex.answer,
      options: ex.options.join(' / '),
    })
  }

  if (made === 0) {
    failures.push(`${template.id}: generated NOTHING`)
  } else if (template.kind === 'quiz') {
    // A quiz pool is a hand-written list, so its size IS its variety. Only an
    // implausibly tiny pool is worth flagging.
    if (made < 3) failures.push(`${template.id}: only ${made} authored items — too few to drill`)
  } else if (made < PER_TEMPLATE / 4) {
    failures.push(`${template.id}: only ${made} distinct items — slot spec may be too narrow`)
  }
}

if (showAll) {
  console.log(['template', 'concept', 'promptDe', 'text', 'cue', 'answer', 'options'].join('\t'))
  for (const r of rows) {
    console.log([r.templateId, r.conceptId, r.promptDe, r.text, r.cue, r.answer, r.options].join('\t'))
  }
} else {
  const byTemplate = new Map<string, Row[]>()
  for (const r of rows) {
    const list = byTemplate.get(r.templateId) ?? []
    list.push(r)
    byTemplate.set(r.templateId, list)
  }

  for (const [templateId, list] of byTemplate) {
    const concept = CONCEPT_BY_ID.get(list[0].conceptId)
    console.log(`\n── ${templateId}  (${concept?.titleDe ?? list[0].conceptId})  ${list.length} distinct`)
    console.log(`   „${list[0].promptDe}"`)
    for (const r of list.slice(0, 8)) {
      console.log(`   ${r.text.padEnd(34)}  → ${r.answer.padEnd(16)} [${r.cue}]`)
    }
  }
}

console.error(`\n${rows.length} items across ${TEMPLATES.length} templates`)
console.error(`unique sentences: ${new Set(rows.map(r => r.text)).size}`)
console.error(`distinct lemmas used: ${new Set(rows.map(r => r.cue)).size}`)

if (failures.length > 0) {
  console.error('\nPROBLEM TEMPLATES:')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.error('\nno template failed to generate.')
