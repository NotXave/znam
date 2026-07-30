#!/usr/bin/env node
// Mines CANDIDATE verb-prefix families from the frequency list, for hand
// verification into utils/grammar/prefixes.ts.
//
// Polish builds enormous verb families by prefixing one base: pisać gives
// podpisać, zapisać, wypisać, przepisać, dopisać, odpisać… and each prefix
// carries a meaning that transfers almost directly from German
// (pod·pisać = unter·schreiben). Teaching that system is worth far more than
// teaching the verbs one at a time.
//
// This script only proposes. It CANNOT tell podpisać (sign) from podać (pass),
// or decide whether zadać really belongs to dać — and a wrong gloss teaches a
// wrong word. So the output is a candidate list for a human to check, exactly
// like the aspect pairs. Nothing here is shipped directly.
//
// Usage: node scripts/build-prefix-families.mjs [minFamily=4]
//   → writes .cache/pl.prefix-candidates.tsv

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'public', 'data')
const CACHE_DIR = join(ROOT, '.cache')

/** Ordered longest-first so `przy` is tried before `prze` before `p`. */
const PREFIXES = [
  'przy', 'prze', 'roz', 'nad', 'pod', 'obe', 'wze', 'współ',
  'do', 'na', 'od', 'po', 'ob', 'wy', 'za', 'we', 'ze',
  'u', 'w', 'z', 's',
]

/** Verb endings — used to keep the candidate set to plausible verbs. */
const VERB_ENDING = /(ać|eć|ić|yć|ować|ąć|c|ść|źć)$/

async function main() {
  const minFamily = Number(process.argv[2]) || 4

  const freqText = await readFile(join(DATA_DIR, 'pl.freq.tsv'), 'utf-8')
  const rank = new Map()
  for (const line of freqText.split('\n')) {
    const [lemma, r] = line.replace(/\r$/, '').split('\t')
    if (lemma && r) rank.set(lemma.trim(), Number(r))
  }

  // Candidate verbs: anything in the frequency list shaped like a verb.
  const verbs = new Set()
  for (const lemma of rank.keys()) {
    if (VERB_ENDING.test(lemma) && lemma.length >= 4) verbs.add(lemma)
  }
  console.error(`verb-shaped lemmas: ${verbs.size}`)

  // base → [{ prefix, verb, rank }]
  const families = new Map()
  for (const verb of verbs) {
    for (const prefix of PREFIXES) {
      if (!verb.startsWith(prefix)) continue
      const base = verb.slice(prefix.length)
      if (base.length < 3 || !verbs.has(base)) continue
      // Only the longest matching prefix counts, so `przyjechać` is filed
      // under przy+jechać and not also p+rzyjechać.
      const list = families.get(base) ?? []
      if (!list.some(e => e.verb === verb)) {
        list.push({ prefix, verb, rank: rank.get(verb) ?? 99999 })
      }
      families.set(base, list)
      break
    }
  }

  const ranked = [...families.entries()]
    .filter(([, members]) => members.length >= minFamily)
    .map(([base, members]) => ({
      base,
      baseRank: rank.get(base) ?? 99999,
      members: members.sort((a, b) => a.rank - b.rank),
    }))
    .sort((a, b) => b.members.length - a.members.length || a.baseRank - b.baseRank)

  await mkdir(CACHE_DIR, { recursive: true })
  const outPath = join(CACHE_DIR, 'pl.prefix-candidates.tsv')
  const lines = ['# base\tbaseRank\tsize\tprefix:verb(rank) …']
  for (const fam of ranked) {
    lines.push(
      `${fam.base}\t${fam.baseRank}\t${fam.members.length}\t` +
      fam.members.map(m => `${m.prefix}:${m.verb}(${m.rank})`).join(' '),
    )
  }
  await writeFile(outPath, lines.join('\n') + '\n', 'utf-8')

  console.error('')
  console.error(`wrote ${outPath}`)
  console.error(`  families (>= ${minFamily} members): ${ranked.length}`)
  console.error('')
  console.error('  VERIFY BY HAND before copying into utils/grammar/prefixes.ts —')
  console.error('  this heuristic cannot tell a real derivation from a coincidence.')
  console.error('')
  for (const fam of ranked.slice(0, 12)) {
    console.error(
      `  ${fam.base.padEnd(12)} (${String(fam.members.length).padStart(2)}) ` +
      fam.members.slice(0, 9).map(m => m.verb).join(' '),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
