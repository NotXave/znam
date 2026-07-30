#!/usr/bin/env node
// Builds the pseudoword list the calibration quiz uses to measure over-claiming:
//   public/data/<lang>.pseudo.tsv    one invented word per line
//
// A vocabulary self-report inflates: people say "yes, I know that" to words
// they have only seen, or have never seen at all. The standard correction is to
// mix in words that LOOK like the language but do not exist, measure how often
// the learner claims those, and discount their yeses accordingly.
//
// The words are sampled from a character trigram model trained on the real
// word list, so they obey Polish spelling and phonotactics — `bramierz` reads
// as a plausible Polish noun, `xqwbz` does not and would fool nobody.
//
// The critical step is REJECTION: every candidate is checked against all
// ~293k real surface forms in <lang>.lemmas.tsv plus every lemma in
// <lang>.freq.tsv. Accidentally shipping a real word as a "fake" one would
// punish the learner for knowing it, so the rejection set is deliberately
// much larger than the frequency list alone.
//
// KNOWN LIMITATION, and why the extra filters below exist.
// <lang>.lemmas.tsv is trimmed to forms of the top-50k lemmas, so genuinely
// real but less common words are simply absent from the rejection set — an
// early run of this script happily emitted `przeczyć` (to contradict) and
// `morzyć` (to famish) as "fakes". Membership testing alone cannot catch those.
// Two filters reduce the risk:
//
//   1. Candidates within edit distance 1 of a real word are dropped. Those are
//      the collision-prone ones (podzić ← chodzić / rodzić).
//   2. The *most* word-like candidates are dropped too. Ranking by likelihood
//      and taking the very top selects precisely for "indistinguishable from a
//      real word", which is the opposite of what is wanted here — so a middle
//      band is taken instead.
//
// The residual risk is small and self-limiting: a learner who knows one
// accidentally-real word contributes at most one false alarm out of several,
// and the Laplace smoothing in falseAlarmRate() blunts even that.
//
// Usage: node scripts/build-pseudowords.mjs <lang> [count=400]

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'public', 'data')

const MIN_LEN = 5
const MAX_LEN = 10
/** Deterministic output: the same language always yields the same list. */
const SEED = 0x5eed

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every real surface form and lemma — the rejection set. */
async function loadRealWords(lang) {
  const real = new Set()

  const lemmas = await readFile(join(DATA_DIR, `${lang}.lemmas.tsv`), 'utf-8')
  for (const line of lemmas.split('\n')) {
    const [form, lemma] = line.split('\t')
    if (form) real.add(form.trim())
    if (lemma) real.add(lemma.trim())
  }

  const freq = await readFile(join(DATA_DIR, `${lang}.freq.tsv`), 'utf-8')
  for (const line of freq.split('\n')) {
    const [lemma] = line.split('\t')
    if (lemma) real.add(lemma.trim())
  }

  real.delete('')
  return real
}

/**
 * Trigram model over the most frequent lemmas: P(next char | previous two).
 * Training on frequent words rather than the whole form list keeps the output
 * looking like ordinary vocabulary instead of rare inflected oddities.
 */
function trainTrigrams(words) {
  const model = new Map()
  const add = (ctx, ch) => {
    let counts = model.get(ctx)
    if (!counts) { counts = new Map(); model.set(ctx, counts) }
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  for (const w of words) {
    const s = `^^${w}$`
    for (let i = 2; i < s.length; i++) add(s.slice(i - 2, i), s[i])
  }
  return model
}

function sampleFrom(counts, rand) {
  let total = 0
  for (const n of counts.values()) total += n
  let r = rand() * total
  for (const [ch, n] of counts) {
    r -= n
    if (r <= 0) return ch
  }
  return '$'
}

function generate(model, rand) {
  let ctx = '^^'
  let out = ''
  for (let i = 0; i < MAX_LEN + 4; i++) {
    const counts = model.get(ctx)
    if (!counts) return null
    const ch = sampleFrom(counts, rand)
    if (ch === '$') break
    out += ch
    ctx = ctx.slice(1) + ch
  }
  return out
}

const POLISH_LETTERS = /^[a-ząćęłńóśźż]+$/
/** Cheap structural rejects, before the (more expensive) likelihood score. */
function plausible(word) {
  if (!POLISH_LETTERS.test(word)) return false
  if (!/[aąeęioóuy]/.test(word)) return false
  if (/[^aąeęioóuy]{5,}/.test(word)) return false
  if (/(.)\1\1/.test(word)) return false // no triple letters
  // Polish tolerates a few doubled letters (panna, lekki) but never two
  // doubles in one short word — that reads as Italian, not Polish.
  if ((word.match(/(.)\1/g) ?? []).length > 1) return false
  if (/^[aąeęioóuy]{2}/.test(word)) return false // no word-initial vowel pile-up
  return true
}

/**
 * Mean log-probability per character under the training model.
 *
 * Sampling alone happily produces `alletetta` and `akbyś`: each individual
 * trigram is attested, but the sequence as a whole is wildly unlikely. Ranking
 * candidates by their own likelihood and keeping the best is a far better
 * filter than trying to enumerate bad clusters by hand.
 */
function score(word, model) {
  const s = `^^${word}$`
  let total = 0
  let n = 0
  for (let i = 2; i < s.length; i++) {
    const counts = model.get(s.slice(i - 2, i))
    if (!counts) return -Infinity
    let sum = 0
    for (const c of counts.values()) sum += c
    total += Math.log((counts.get(s[i]) ?? 0.01) / sum)
    n++
  }
  return n > 0 ? total / n : -Infinity
}

const ALPHABET = 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż'

/**
 * True if the candidate is one edit away from something real.
 * Enumerating the ~500 neighbours of a candidate and testing set membership is
 * far cheaper than scanning 311k real words per candidate.
 */
function nearRealWord(word, real) {
  for (let i = 0; i < word.length; i++) {
    // deletion
    if (real.has(word.slice(0, i) + word.slice(i + 1))) return true
    // substitution
    for (const ch of ALPHABET) {
      if (ch === word[i]) continue
      if (real.has(word.slice(0, i) + ch + word.slice(i + 1))) return true
    }
  }
  // insertion
  for (let i = 0; i <= word.length; i++) {
    for (const ch of ALPHABET) {
      if (real.has(word.slice(0, i) + ch + word.slice(i))) return true
    }
  }
  return false
}

async function main() {
  const [lang, countArg] = process.argv.slice(2)
  if (!lang) {
    console.error('usage: node scripts/build-pseudowords.mjs <lang> [count=400]')
    process.exit(1)
  }
  const want = Number(countArg) || 400

  const real = await loadRealWords(lang)
  console.error(`rejection set: ${real.size} real words/forms`)

  // Train on the top frequency lemmas — ordinary vocabulary shapes.
  const freq = await readFile(join(DATA_DIR, `${lang}.freq.tsv`), 'utf-8')
  const trainingWords = []
  for (const line of freq.split('\n')) {
    const [lemma, rank] = line.split('\t')
    if (!lemma || !rank) continue
    if (Number(rank) > 8000) continue
    const w = lemma.trim()
    if (w.length >= MIN_LEN - 1 && POLISH_LETTERS.test(w)) trainingWords.push(w)
  }
  console.error(`training on ${trainingWords.length} lemmas`)

  const model = trainTrigrams(trainingWords)
  const rand = mulberry32(SEED)

  // Over-generate, then keep only the most Polish-looking candidates.
  const pool = new Set()
  let tries = 0
  let rejectedReal = 0
  let rejectedShape = 0
  let rejectedNear = 0
  const OVERSAMPLE = 12

  while (pool.size < want * OVERSAMPLE && tries < want * OVERSAMPLE * 60) {
    tries++
    const w = generate(model, rand)
    if (!w || w.length < MIN_LEN || w.length > MAX_LEN) { rejectedShape++; continue }
    if (!plausible(w)) { rejectedShape++; continue }
    if (real.has(w)) { rejectedReal++; continue }
    if (nearRealWord(w, real)) { rejectedNear++; continue }
    pool.add(w)
  }

  // Take a MIDDLE band of likelihood, not the top. The most word-like
  // candidates are exactly the ones most likely to be real words missing from
  // the rejection set — selecting for them would be selecting for the bug.
  const ranked = [...pool]
    .map(w => ({ w, s: score(w, model) }))
    .sort((a, b) => b.s - a.s)
  const skip = Math.min(Math.floor(ranked.length * 0.15), Math.max(0, ranked.length - want))
  const band = ranked.slice(skip, skip + want)
  const words = band.map(r => r.w).sort()
  const cutoff = band[band.length - 1]?.s ?? 0
  await mkdir(DATA_DIR, { recursive: true })
  const outPath = join(DATA_DIR, `${lang}.pseudo.tsv`)
  await writeFile(outPath, words.join('\n') + '\n', 'utf-8')

  console.error('')
  console.error(`wrote ${outPath}`)
  console.error(`  pseudowords:      ${words.length} (best of ${pool.size} candidates)`)
  console.error(`  attempts:         ${tries}`)
  console.error(`  rejected (real):  ${rejectedReal}   ← would have been a real word`)
  console.error(`  rejected (shape): ${rejectedShape}`)
  console.error(`  rejected (near):  ${rejectedNear}   ← one edit from a real word`)
  console.error(`  likelihood floor: ${cutoff.toFixed(2)} mean log-prob/char`)
  console.error('')
  console.error(`  kept (most word-like):  ${band.slice(0, 10).map(r => r.w).join(', ')}`)
  console.error(`  kept (least word-like): ${band.slice(-10).map(r => r.w).join(', ')}`)
  console.error(`  dropped as too word-like: ${ranked.slice(0, 8).map(r => r.w).join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
