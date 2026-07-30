import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  GLOSS_CHUNK,
  MAX_GLOSS_REQUESTS,
  fetchGlosses,
  needGlosses,
  type TranslateFn,
} from '../../utils/grammar/glosses'

/**
 * The translation path, driven by fakes.
 *
 * Every failure mode below has either already happened in this codebase (the
 * 317-second hang) or is something the upstream endpoint demonstrably does
 * (echoing the input it cannot translate, mangling the separator). None of them
 * can be reproduced by pointing the extension at a working endpoint, which is
 * why they are tested against a fake instead.
 *
 * scripts/smoke-translate.mjs covers the other half: that a working endpoint
 * still behaves the way this logic assumes.
 */

/** Records what it was asked, answers "de-<lemma>". */
function fakeTranslate(): { fn: TranslateFn; calls: string[][] } {
  const calls: string[][] = []
  const fn: TranslateFn = async (texts) => {
    calls.push(texts)
    return texts.map(t => `de-${t}`)
  }
  return { fn, calls }
}

const lemmas = (n: number) => Array.from({ length: n }, (_, i) => `słowo${i}`)

test('happy path: every lemma comes back with a gloss', async () => {
  const { fn, calls } = fakeTranslate()
  const out = await fetchGlosses(['kot', 'dom', 'woda'], 'pl', 'de', fn)

  assert.equal(out.glosses.size, 3)
  assert.equal(out.glosses.get('kot'), 'de-kot')
  assert.equal(out.requested, 3)
  assert.equal(out.timedOut, false)
  assert.equal(calls.length, 1)
})

test('requests are chunked, and never larger than the chunk size', async () => {
  const { fn, calls } = fakeTranslate()
  await fetchGlosses(lemmas(60), 'pl', 'de', fn)

  assert.ok(calls.length >= 3, `only ${calls.length} requests`)
  for (const call of calls) {
    assert.ok(call.length <= GLOSS_CHUNK, `a request carried ${call.length} lemmas`)
  }
  assert.equal(calls.flat().length, 60)
})

test('a hanging endpoint gives up at the budget instead of hanging the session', async () => {
  // The regression: measured at 317 seconds before a budget existed, because
  // each chunk timed out and then fell back to one request per word.
  const hang: TranslateFn = () => new Promise<string[]>(() => {})
  const started = Date.now()
  const out = await fetchGlosses(lemmas(60), 'pl', 'de', hang, { budgetMs: 120 })
  const elapsed = Date.now() - started

  assert.equal(out.timedOut, true)
  assert.equal(out.glosses.size, 0)
  assert.ok(elapsed < 2000, `took ${elapsed} ms — the budget did not apply`)
})

test('a failure part-way through keeps the chunks that already succeeded', async () => {
  let call = 0
  const flaky: TranslateFn = async (texts) => {
    if (++call === 2) throw new Error('HTTP 429')
    return texts.map(t => `de-${t}`)
  }
  const out = await fetchGlosses(lemmas(50), 'pl', 'de', flaky, { chunk: 10 })

  assert.equal(out.glosses.size, 10, 'the first chunk should survive the second failing')
  assert.equal(out.glosses.get('słowo0'), 'de-słowo0')
  assert.equal(out.timedOut, true)
})

test('a response of the wrong length is dropped, not misaligned', async () => {
  // The batch endpoint joins texts with a sentinel and sometimes loses it. If
  // the caller indexed into the result anyway, one card would silently get
  // another card's answer — a wrong card that looks exactly like a right one.
  const mangled: TranslateFn = async (texts) =>
    texts.length > 1 ? ['de-kot'] : texts.map(t => `de-${t}`)
  const out = await fetchGlosses(['kot', 'dom', 'woda'], 'pl', 'de', mangled)

  assert.equal(out.glosses.size, 0)
  assert.equal(out.glosses.get('dom'), undefined)
})

test('an echoed input is rejected — "kot → kot" is not a translation', async () => {
  // What the endpoint returns for a token it cannot translate, which is most
  // inflected Polish lemmas. Stored, it produces a card whose question and
  // answer are the same word.
  const echo: TranslateFn = async (texts) => [...texts]
  const out = await fetchGlosses(['kot', 'dom'], 'pl', 'de', echo)
  assert.equal(out.glosses.size, 0)

  const mixedCase: TranslateFn = async (texts) => texts.map(t => t.toUpperCase())
  assert.equal((await fetchGlosses(['kot'], 'pl', 'de', mixedCase)).glosses.size, 0)
})

test('cards that already carry a gloss are never requested', async () => {
  // This is what lets a session run with the network blocked.
  const cards = [
    { lemma: 'kot', translation: 'Katze' },
    { lemma: 'dom', translation: 'Haus' },
  ]
  assert.deepEqual(needGlosses(cards), [])

  const { fn, calls } = fakeTranslate()
  const out = await fetchGlosses(needGlosses(cards).map(c => c.lemma), 'pl', 'de', fn)
  assert.equal(calls.length, 0, 'the network was touched for nothing')
  assert.equal(out.requests, 0)
  assert.equal(out.requested, 0)
  assert.equal(out.timedOut, false)
})

test('needGlosses keeps only the cards actually missing one', () => {
  const cards = [
    { lemma: 'kot', translation: 'Katze' },
    { lemma: 'dom' },
    { lemma: 'woda', translation: '' },
  ]
  assert.deepEqual(needGlosses(cards).map(c => c.lemma), ['dom', 'woda'])
})

test('duplicates are asked about once, and the total is capped', async () => {
  const { fn, calls } = fakeTranslate()
  const out = await fetchGlosses(['kot', 'kot', 'dom', 'kot'], 'pl', 'de', fn)
  assert.equal(out.requested, 2)
  assert.deepEqual(calls[0], ['kot', 'dom'])

  const many = fakeTranslate()
  const capped = await fetchGlosses(lemmas(500), 'pl', 'de', many.fn)
  assert.equal(capped.requested, MAX_GLOSS_REQUESTS)
  assert.equal(many.calls.flat().length, MAX_GLOSS_REQUESTS)
})

test('empty and blank input do nothing at all', async () => {
  const { fn, calls } = fakeTranslate()
  const out = await fetchGlosses(['', ''], 'pl', 'de', fn)
  assert.equal(calls.length, 0)
  assert.equal(out.requested, 0)
})
