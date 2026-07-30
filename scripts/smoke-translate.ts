/**
 * Real-network check for the gloss-fetching path Słówka depends on.
 *
 * scripts/test/glosses.test.ts proves the chunking, budget and validation logic
 * against fakes — hanging, throwing, echoing and miscounting responses, none of
 * which a working endpoint will produce on demand. This script proves the other
 * half, and it does it by running the ACTUAL code: utils/translate.ts's
 * translateBatch driven through utils/grammar/glosses.ts's fetchGlosses, exactly
 * as the extension calls them.
 *
 *   npm run smoke:translate            # pl → de
 *   npm run smoke:translate -- pl en
 *
 * Run it whenever glosses stop appearing in Słówka, before changing any code:
 * the likeliest cause is that the endpoint changed, not that the extension did.
 *
 * Exits non-zero on failure, and says which stage failed rather than just
 * "error", because "the network is blocked here" and "the endpoint changed its
 * response format" need completely different responses from you.
 */

import { translateBatch } from '../utils/translate'
import { GLOSS_CHUNK, TRANSLATE_BUDGET_MS, fetchGlosses } from '../utils/grammar/glosses'

// Ten unmistakable words with unmistakable German glosses, so a wrong answer is
// obvious by eye rather than a matter of nuance.
const PROBES: [string, string][] = [
  ['kot', 'Katze'],
  ['dom', 'Haus'],
  ['woda', 'Wasser'],
  ['dziecko', 'Kind'],
  ['ręka', 'Hand'],
  ['miasto', 'Stadt'],
  ['książka', 'Buch'],
  ['chleb', 'Brot'],
  ['noc', 'Nacht'],
  ['drzewo', 'Baum'],
]

// Enough to force more than one chunk, so the chunk boundary is exercised for
// real rather than assumed.
const BULK = [
  'stół', 'okno', 'ulica', 'lekarz', 'szkoła', 'pieniądz', 'droga', 'czas',
  'praca', 'ogień', 'ziemia', 'niebo', 'serce', 'głowa', 'oko', 'noga',
  'matka', 'ojciec', 'brat', 'siostra', 'przyjaciel', 'pies', 'ptak', 'ryba',
  'kwiat', 'las', 'góra', 'rzeka', 'morze', 'deszcz',
]

function fail(stage: string, why: string, meaning?: string): never {
  console.error(`\nFAIL (${stage}): ${why}`)
  if (meaning) console.error(`  ${meaning}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const from = process.argv[2] || 'pl'
  const to = process.argv[3] || 'de'
  const words = PROBES.map(([pl]) => pl)
  const expected = new Map(PROBES)

  // ── stage 1: does the endpoint answer, and does it line answers up with
  // inputs? A shifted response is the failure that would silently give one card
  // another card's answer, if fetchGlosses did not guard against it.
  console.log(`stage 1 — ${words.length} ${from} lemmas → ${to}, one request\n`)
  let direct: string[]
  try {
    direct = await translateBatch(words, from, to)
  } catch (err: any) {
    fail('1/3', `the endpoint did not answer — ${err?.message ?? err}`,
      'If this is a network or proxy problem it says nothing about the extension.')
  }
  if (direct.length !== words.length) {
    fail('1/3', `asked for ${words.length} answers, got ${direct.length}`,
      'fetchGlosses drops a chunk like this rather than misaligning it, so the ' +
      'trainer stays correct — but every card in the chunk is lost.')
  }

  let mismatched = 0
  for (let i = 0; i < words.length; i++) {
    const got = (direct[i] ?? '').trim()
    const want = expected.get(words[i])!
    const ok = got.toLowerCase().includes(want.toLowerCase())
    if (!ok) mismatched++
    console.log(`  ${ok ? '✓' : '✗'} ${words[i].padEnd(10)} → ${got.padEnd(20)} (expected ~${want})`)
  }
  if (mismatched > words.length / 3) {
    fail('1/3', `${mismatched} of ${words.length} answers do not match the expected gloss`,
      'Either the answers are shifted relative to the inputs, or the endpoint changed.')
  }
  console.log(mismatched === 0
    ? '\nok — every answer matched'
    : `\nok, with ${mismatched} answer(s) differing from the expected gloss; read the list above.` +
      ' A synonym is fine, a shift is not.')

  // ── stage 2: the real path. Same functions the extension calls, same chunk
  // size, same budget.
  const all = [...words, ...BULK]
  console.log(`\nstage 2 — ${all.length} lemmas through fetchGlosses (chunk ${GLOSS_CHUNK}, budget ${TRANSLATE_BUDGET_MS} ms)`)
  const started = Date.now()
  const out = await fetchGlosses(all, from, to, translateBatch)
  const elapsed = Date.now() - started

  console.log(`  ${out.glosses.size}/${out.requested} glossed in ${out.requests} request(s), ${(elapsed / 1000).toFixed(1)} s` +
    (out.timedOut ? ' — BUDGET EXCEEDED' : ''))
  if (out.requests < 2) {
    fail('2/3', `only ${out.requests} request(s) — the chunk boundary was never crossed`,
      'Raise the number of probe words so more than one chunk is sent.')
  }
  if (out.glosses.size < out.requested / 2) {
    fail('2/3', `only ${out.glosses.size} of ${out.requested} lemmas came back usable`,
      out.timedOut
        ? 'The budget ran out. Fine when the network is slow; a problem if it is not.'
        : 'The endpoint answered but most answers were rejected as empty or echoed.')
  }

  // ── stage 3: spot-check that the glosses landed on the right words. This is
  // the assertion that a shift inside a chunk would break.
  console.log('\nstage 3 — glosses landed on the right words')
  let wrong = 0
  for (const [pl, de] of PROBES) {
    const got = out.glosses.get(pl)
    const ok = !!got && got.toLowerCase().includes(de.toLowerCase())
    if (!ok) wrong++
    console.log(`  ${ok ? '✓' : '✗'} ${pl.padEnd(10)} → ${got ?? '(missing)'}`)
  }
  if (wrong > PROBES.length / 3) {
    fail('3/3', `${wrong} of ${PROBES.length} probes ended up on the wrong word or missing`)
  }

  console.log('\nPASS — the endpoint and the extension agree about the protocol.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
