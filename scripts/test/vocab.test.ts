import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  DEFAULT_MAX_RANK,
  LEECH_LAPSES,
  STRUGGLE_LOOKUPS,
  blankWord,
  buildVocabExercise,
  eligible,
  kindFor,
  nearbyGlosses,
  resetVocabIds,
  selectCards,
  type VocabCandidate,
  type VocabCard,
} from '../../utils/grammar/vocab'
import { makeRandom } from '../../utils/grammar/generator'

const NOW = Date.parse('2026-04-01T10:00:00Z')
const DAY = 86_400_000

function cand(lemma: string, rank: number, extra: Partial<VocabCandidate> = {}): VocabCandidate {
  return { lemma, rank, translation: `de-${lemma}`, ...extra }
}

function card(lemma: string, extra: Partial<VocabCard> = {}): VocabCard {
  return {
    lang: 'pl', lemma, translation: `de-${lemma}`,
    mastery: 0.5, ease: 2.3, intervalDays: 3, due: NOW + DAY,
    lapses: 0, seen: 1, createdAt: NOW, ...extra,
  }
}

// ── the frequency ceiling ───────────────────────────────────

test('the pool respects the frequency ceiling', () => {
  // This is the user-facing promise: no words that turn up once in a million.
  const pool = eligible(
    [cand('częsty', 500), cand('średni', 2900), cand('rzadki', 9000), cand('bardzoRzadki', 45000)],
    DEFAULT_MAX_RANK,
  )
  assert.deepEqual(pool.map(c => c.lemma), ['częsty', 'średni'])
})

test('the ceiling is adjustable', () => {
  const all = [cand('bliski', 500), cand('sredni', 2500), cand('daleki', 4500)]
  assert.equal(eligible(all, 1000).length, 1)
  assert.equal(eligible(all, 3000).length, 2)
  assert.equal(eligible(all, 5000).length, 3)
})

test('ignored words and profanity never enter the pool', () => {
  const pool = eligible(
    [cand('kot', 100), cand('pies', 200, { status: 'ignored' }), cand('kurwa', 50)],
    DEFAULT_MAX_RANK,
  )
  assert.deepEqual(pool.map(c => c.lemma), ['kot'])
})

test('unranked words are excluded — the ceiling would be meaningless', () => {
  assert.equal(eligible([cand('nieznany', 0)], DEFAULT_MAX_RANK).length, 0)
})

test('one-letter words are skipped', () => {
  // w, z, i and o are real Polish words, but drilling them as vocabulary
  // teaches nothing.
  assert.equal(eligible([cand('w', 20), cand('dom', 80)], DEFAULT_MAX_RANK).length, 1)
})

// ── selection order ─────────────────────────────────────────

test('leeches come first, ahead of everything else', () => {
  const candidates = [
    cand('nowy', 100),
    cand('trudny', 900),
    cand('zapomniany', 800),
  ]
  const cards = new Map([
    ['trudny', card('trudny', { lapses: LEECH_LAPSES, due: NOW + 30 * DAY })],
    ['zapomniany', card('zapomniany', { due: NOW - 5 * DAY })],
  ])
  const picked = selectCards({ candidates, cards, maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 10 })
  assert.equal(picked[0].lemma, 'trudny', 'a leech outranks even an overdue card')
  assert.equal(picked[1].lemma, 'zapomniany', 'then the overdue card')
})

test('words you keep looking up are drilled ahead of new ones', () => {
  // The whole premise: znam already records which words keep slipping away.
  const candidates = [
    cand('nowy', 100),
    cand('ciagleZapominam', 2000, { lookups: 5 }),
  ]
  const picked = selectCards({
    candidates, cards: new Map(), maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 10,
  })
  assert.equal(picked[0].lemma, 'ciagleZapominam')
})

test('more lookups means higher priority', () => {
  const candidates = [
    cand('raz', 100, { lookups: STRUGGLE_LOOKUPS }),
    cand('wiele', 200, { lookups: 9 }),
  ]
  const picked = selectCards({
    candidates, cards: new Map(), maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 10,
  })
  assert.equal(picked[0].lemma, 'wiele')
})

test('cards not yet due are left alone', () => {
  const candidates = [cand('spokojny', 100)]
  const cards = new Map([['spokojny', card('spokojny', { due: NOW + 10 * DAY })]])
  const picked = selectCards({ candidates, cards, maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 10 })
  assert.equal(picked.length, 0, 'reviewing early defeats the point of spacing')
})

test('low-level learning words outrank untouched filler', () => {
  const candidates = [
    cand('obcy', 100),
    cand('uczony', 900, { status: 'learning', level: 1 }),
  ]
  const picked = selectCards({
    candidates, cards: new Map(), maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 10,
  })
  assert.equal(picked[0].lemma, 'uczony')
})

test('selection honours the limit', () => {
  const candidates = Array.from({ length: 50 }, (_, i) => cand(`w${i}`, i + 1))
  const picked = selectCards({
    candidates, cards: new Map(), maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 8,
  })
  assert.equal(picked.length, 8)
})

// ── question construction ───────────────────────────────────

test('recognize offers the gloss among plausible neighbours', () => {
  resetVocabIds()
  const target = cand('kot', 1000)
  const pool = Array.from({ length: 20 }, (_, i) => cand(`w${i}`, 950 + i * 5))
  const e = buildVocabExercise(target, 'recognize', pool, 'drill', makeRandom(1))!
  assert.ok(e)
  assert.equal(e.prompt, 'kot')
  assert.equal(e.answer, 'de-kot')
  assert.ok(e.options.includes('de-kot'))
  assert.equal(e.options.length, 4)
  assert.equal(new Set(e.options).size, 4, 'no duplicate glosses')
})

test('distractors come from a nearby frequency band', () => {
  // A rank-50 word beside three rank-19000 words gives itself away.
  const target = cand('cel', 1000)
  const pool = [
    ...Array.from({ length: 6 }, (_, i) => cand(`blisko${i}`, 990 + i)),
    ...Array.from({ length: 6 }, (_, i) => cand(`daleko${i}`, 19000 + i)),
  ]
  const glosses = nearbyGlosses(target, pool, 3, makeRandom(3))
  assert.equal(glosses.length, 3)
  for (const g of glosses) {
    assert.ok(g.startsWith('de-blisko'), `${g} is not a near neighbour`)
  }
})

test('produce asks for the Polish word', () => {
  const e = buildVocabExercise(cand('dom', 100), 'produce', [], 'drill', makeRandom(2))!
  assert.equal(e.prompt, 'de-dom')
  assert.equal(e.answer, 'dom')
  assert.equal(e.options.length, 0, 'free text, so you actually produce it')
})

test('a word with no gloss produces nothing rather than a broken card', () => {
  const noGloss: VocabCandidate = { lemma: 'x', rank: 100 }
  assert.equal(buildVocabExercise(noGloss, 'recognize', [], 'drill', makeRandom(1)), undefined)
  assert.equal(buildVocabExercise(noGloss, 'produce', [], 'drill', makeRandom(1)), undefined)
})

// ── context items ───────────────────────────────────────────

test('blankWord finds the inflected form, not just the lemma', () => {
  // The stored sentence contains a case form; a plain replace would miss it.
  assert.equal(blankWord('Widzę dużego kota tutaj.', 'kot'), 'Widzę dużego ___ tutaj.')
  assert.equal(blankWord('Idę do kina.', 'kino'), 'Idę do ___.')
})

test('blankWord blanks only the first hit', () => {
  const out = blankWord('Kot i kot.', 'kot')
  assert.equal(out, '___ i kot.')
})

test('blankWord gives up rather than returning the sentence unchanged', () => {
  assert.equal(blankWord('Zupełnie inne zdanie.', 'kot'), undefined)
})

test('a context item reuses the sentence the reader captured', () => {
  const withContext = cand('kot', 500, { context: 'Widzę kota na stole.' })
  const e = buildVocabExercise(withContext, 'context', [], 'drill', makeRandom(1))!
  assert.ok(e.prompt.includes('___'), `expected a gap, got "${e.prompt}"`)
  assert.equal(e.answer, 'kot')
  assert.equal(e.sub, 'de-kot', 'the gloss is the hint')
})

test('context falls back cleanly when no sentence was captured', () => {
  assert.equal(
    buildVocabExercise(cand('kot', 500), 'context', [], 'drill', makeRandom(1)),
    undefined,
  )
})

test('kinds alternate so a session is not all one shape', () => {
  const kinds = Array.from({ length: 8 }, (_, i) => kindFor(i, true))
  assert.ok(kinds.includes('recognize'))
  assert.ok(kinds.includes('produce'))
  assert.ok(kinds.includes('context'))

  const noContext = Array.from({ length: 8 }, (_, i) => kindFor(i, false))
  assert.ok(!noContext.includes('context'), 'never asks for a sentence it does not have')
})

test('words with a stored gloss are preferred, so a session works offline', () => {
  // A gloss is saved whenever the learner picks one in the reader tooltip —
  // which also means they looked the word up, the very signal this trainer
  // exists to act on. Without this ordering a blocked network produced an empty
  // session even with plenty of usable words on hand.
  const candidates: VocabCandidate[] = [
    { lemma: 'bezGlosy', rank: 100 },
    { lemma: 'zGlosa', rank: 900, translation: 'de-zGlosa' },
    { lemma: 'tezBez', rank: 200 },
  ]
  const picked = selectCards({
    candidates, cards: new Map(), maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 3,
  })
  assert.equal(picked[0].lemma, 'zGlosa', 'the translatable word comes first')
})

test('priority still beats gloss availability', () => {
  // A leech without a gloss must not be pushed behind a fresh word that has
  // one — the network fetch exists precisely to rescue that case.
  const candidates: VocabCandidate[] = [
    { lemma: 'nowy', rank: 100, translation: 'de-nowy' },
    { lemma: 'leech', rank: 900 },
  ]
  const cards = new Map([['leech', card('leech', { lapses: LEECH_LAPSES })]])
  const picked = selectCards({
    candidates, cards, maxRank: DEFAULT_MAX_RANK, now: NOW, limit: 3,
  })
  assert.equal(picked[0].lemma, 'leech')
})
