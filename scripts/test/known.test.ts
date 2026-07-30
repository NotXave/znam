import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { eligible, selectCards, type VocabCandidate } from '../../utils/grammar/vocab'

/**
 * Guards on public/data/pl.known.tsv — the artifact that keeps the two trainers
 * from drilling proper nouns.
 *
 * These assertions run against the SHIPPED FILE, not against a fixture. That is
 * the point: the original bug was not a logic error, it was an artifact that
 * contained `liam`, `boho` and `hombre`, and no amount of testing the filter
 * function in isolation would have caught it. If a rebuild ever regresses the
 * data, these fail.
 */

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data')

const known = new Set(
  readFileSync(join(DATA, 'pl.known.tsv'), 'utf-8').split('\n').map(s => s.trim()).filter(Boolean),
)

const freq = new Map<string, number>()
for (const line of readFileSync(join(DATA, 'pl.freq.tsv'), 'utf-8').split('\n')) {
  const tab = line.indexOf('\t')
  if (tab <= 0) continue
  freq.set(line.slice(0, tab).trim(), Number(line.slice(tab + 1).trim()))
}

// ── the artifact ────────────────────────────────────────────

test('known list is present and plausibly sized', () => {
  assert.ok(known.size > 8000, `only ${known.size} lemmas`)
  assert.ok(known.size < freq.size, 'the filter must actually remove something')
})

test('every known lemma is also in the frequency list', () => {
  // The trainers look words up by rank; an entry with no rank is unreachable
  // and would only bloat the install.
  for (const lemma of known) {
    assert.ok(freq.has(lemma), `"${lemma}" has no frequency rank`)
  }
})

test('proper nouns and foreign words are rejected', () => {
  // Every one of these is in pl.freq.tsv, several inside the top 1000 — a
  // frequency ceiling alone does not remove them.
  const junk = [
    'liam', 'elias', 'nicholas', 'marshall', 'michael', 'anna', 'john',   // people
    'komarowo', 'ameryka', 'londyn', 'paryż', 'chicago',                  // places
    'hombre', 'matter', 'you', 'okay', 'yeah', 'the', 'love',             // not Polish
    'boho', 'desi',                                                        // untraceable noise
    'fscx100', 'fscy100', 'napisy24', 'synchro',                          // subtitle formatting
  ]
  for (const w of junk) {
    assert.ok(freq.has(w), `test is stale: "${w}" is no longer in the frequency list`)
    assert.ok(!known.has(w), `junk word "${w}" survived the filter`)
  }
})

test('ordinary vocabulary is kept', () => {
  const real = [
    'kot', 'dom', 'miasto', 'lekarz', 'spadek', 'dziecko', 'woda', 'ręka',
    'ulica', 'robić', 'mówić', 'wiedzieć', 'duży', 'nowy', 'dobry',
  ]
  for (const w of real) {
    assert.ok(freq.has(w), `test is stale: "${w}" is no longer in the frequency list`)
    assert.ok(known.has(w), `real word "${w}" was filtered out`)
  }
})

test('high-frequency function words survive', () => {
  // The dictionary's POS tables carry almost no closed-class entries, so these
  // depend on the hand-authored ALWAYS_KNOWN list in the build script. Losing
  // them would strip the most common words in the language.
  for (const w of ['by', 'dlaczego', 'trzeba', 'jednak', 'przecież', 'naprawdę',
                   'czyli', 'żeby', 'przez', 'wczoraj']) {
    assert.ok(known.has(w), `function word "${w}" was filtered out`)
  }
})

test('the top band stays dense enough to sample from', () => {
  // Calibration walks outward from a target rank. If the list were sparse the
  // item shown could drift far from the rank the posterior asked for.
  for (const band of [1000, 3000, 5000]) {
    let kept = 0
    for (const [lemma, rank] of freq) if (rank <= band && known.has(lemma)) kept++
    assert.ok(kept / band > 0.8, `only ${kept}/${band} kept at rank ≤ ${band}`)
  }
})

test('every lemma the grammar game drills is recognised', () => {
  // Trening and Słówka must agree about what a word is: a lemma good enough to
  // build a case exercise from is good enough to put on a card.
  const morph = new Set<string>()
  for (const line of readFileSync(join(DATA, 'pl.morph.tsv'), 'utf-8').split('\n')) {
    const tab = line.indexOf('\t')
    if (tab > 0) morph.add(line.slice(0, tab).trim())
  }
  const missing = [...morph].filter(l => !known.has(l))
  assert.deepEqual(missing, [], `drilled but not recognised: ${missing.join(', ')}`)
})

// ── the filter in use ───────────────────────────────────────

const cand = (lemma: string, rank: number): VocabCandidate => ({
  lemma, rank, translation: `de-${lemma}`,
})

test('eligible() drops unrecognised lemmas when a list is supplied', () => {
  const pool = [cand('kot', 1996), cand('boho', 157), cand('dom', 83), cand('liam', 4000)]
  const out = eligible(pool, 5000, known).map(c => c.lemma)
  assert.deepEqual(out.sort(), ['dom', 'kot'])
})

test('an empty or absent list disables the filter rather than the trainer', () => {
  // The graceful-degradation path: a pre-v4 database, or a language with no
  // dictionary behind it, must still get a session.
  const pool = [cand('kot', 1996), cand('boho', 157)]
  assert.equal(eligible(pool, 5000, new Set()).length, 2)
  assert.equal(eligible(pool, 5000, undefined).length, 2)
  assert.equal(eligible(pool, 5000).length, 2)
})

test('selectCards passes the filter through', () => {
  const picked = selectCards({
    candidates: [cand('boho', 157), cand('liam', 4000), cand('kot', 1996)],
    cards: new Map(),
    maxRank: 5000,
    now: Date.now(),
    limit: 10,
    known,
  })
  assert.deepEqual(picked.map(c => c.lemma), ['kot'])
})
