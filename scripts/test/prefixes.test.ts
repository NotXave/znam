import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PREFIXES,
  PREFIX_BY_ID,
  PREFIXED_VERBS,
  VERB_FAMILIES,
  FAMILY_BY_BASE,
} from '../../utils/grammar/prefixes'
import {
  ASPECT_PAIRS,
  aspectPairOf,
  aspectPartner,
} from '../../utils/grammar/aspect-pairs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The frequency list is the ground truth for "is this a real Polish word". */
const freqRank = new Map<string, number>()
for (const line of readFileSync(join(ROOT, 'public/data/pl.freq.tsv'), 'utf-8').split('\n')) {
  const [lemma, rank] = line.split('\t')
  if (lemma && rank) freqRank.set(lemma.trim(), Number(rank))
}

// ── prefixes ────────────────────────────────────────────────

test('prefix ids are unique and hyphen-free', () => {
  const ids = PREFIXES.map(p => p.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate prefix')
  for (const id of ids) {
    assert.ok(!id.includes('-'), `${id} should not carry a hyphen`)
    assert.ok(id.length > 0)
  }
})

test('every prefix carries a German twin and an example', () => {
  for (const p of PREFIXES) {
    assert.ok(p.deTwin.length > 0, `${p.id}: no German twin`)
    assert.ok(p.meaningDe.length > 10, `${p.id}: meaning too thin`)
    assert.ok(p.exampleP1.length > 0 && p.exampleDe.length > 0, `${p.id}: incomplete example`)
    assert.ok(
      p.exampleP1.startsWith(p.id),
      `${p.id}: example "${p.exampleP1}" does not actually use the prefix`,
    )
  }
})

// ── verb families ───────────────────────────────────────────

test('every family member actually starts with its declared prefix over the base', () => {
  // The whole pedagogical claim is prefix + base = member. If that decomposition
  // is wrong anywhere, the lesson teaches a false pattern.
  for (const family of VERB_FAMILIES) {
    for (const m of family.members) {
      assert.ok(
        m.verb.startsWith(m.prefix),
        `${m.verb} does not start with "${m.prefix}"`,
      )
      const remainder = m.verb.slice(m.prefix.length)
      // The remainder should be the base, allowing for the regular stem changes
      // Polish makes at a prefix boundary (jść/jechać alternations etc).
      assert.ok(
        remainder.length >= 3,
        `${m.verb} minus "${m.prefix}" leaves too little: "${remainder}"`,
      )
    }
  }
})

test('every family member is a real, reasonably common word', () => {
  const missing: string[] = []
  for (const family of VERB_FAMILIES) {
    if (!freqRank.has(family.base)) missing.push(`base ${family.base}`)
    for (const m of family.members) {
      if (!freqRank.has(m.verb)) missing.push(`${family.base} → ${m.verb}`)
    }
  }
  assert.deepEqual(missing, [], `not in the frequency list:\n  ${missing.join('\n  ')}`)
})

test('no family member has an empty or duplicated gloss', () => {
  for (const family of VERB_FAMILIES) {
    assert.ok(family.baseDe.length > 0, `${family.base}: no base gloss`)
    const glosses = family.members.map(m => m.de)
    for (const g of glosses) assert.ok(g.length > 0, `${family.base}: empty gloss`)
    assert.equal(
      new Set(glosses).size,
      glosses.length,
      `${family.base}: two members share a gloss, so the drill has no right answer`,
    )
  }
})

test('no verb appears in two families with conflicting glosses', () => {
  const seen = new Map<string, string>()
  for (const family of VERB_FAMILIES) {
    for (const m of family.members) {
      const prev = seen.get(m.verb)
      assert.ok(
        prev === undefined || prev === m.de,
        `${m.verb} glossed both "${prev}" and "${m.de}"`,
      )
      seen.set(m.verb, m.de)
    }
  }
})

test('families are big enough to be worth drilling', () => {
  for (const family of VERB_FAMILIES) {
    assert.ok(
      family.members.length >= 3,
      `${family.base} has only ${family.members.length} members`,
    )
  }
})

test('family prefixes are drawn from the documented prefix set', () => {
  const unknown = new Set<string>()
  for (const family of VERB_FAMILIES) {
    for (const m of family.members) {
      if (!PREFIX_BY_ID.has(m.prefix)) unknown.add(`${m.prefix} (${m.verb})`)
    }
  }
  // A prefix used in a family but absent from PREFIXES has no lesson behind it.
  assert.deepEqual([...unknown], [], 'prefixes used without being documented')
})

test('the lookup index covers every member', () => {
  let count = 0
  for (const family of VERB_FAMILIES) count += family.members.length
  assert.equal(PREFIXED_VERBS.size, count, 'index lost entries to key collisions')
  assert.equal(FAMILY_BY_BASE.size, VERB_FAMILIES.length)
})

// ── aspect pairs ────────────────────────────────────────────

test('aspect pairs are real words on both sides', () => {
  const missing: string[] = []
  for (const p of ASPECT_PAIRS) {
    if (!freqRank.has(p.impf)) missing.push(`impf ${p.impf}`)
    if (!freqRank.has(p.perf)) missing.push(`perf ${p.perf}`)
  }
  assert.deepEqual(missing, [], `not in the frequency list:\n  ${missing.join('\n  ')}`)
})

test('no aspect pair is listed twice', () => {
  const keys = ASPECT_PAIRS.map(p => `${p.impf}/${p.perf}`)
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  assert.deepEqual(dupes, [], `duplicate pairs: ${dupes.join(', ')}`)
})

test('no verb is claimed by two different pairs', () => {
  // aspectPairOf indexes by both members; a collision silently drops one.
  const impfs = ASPECT_PAIRS.map(p => p.impf)
  const perfs = ASPECT_PAIRS.map(p => p.perf)
  assert.equal(new Set(impfs).size, impfs.length, 'an imperfective appears in two pairs')
  assert.equal(new Set(perfs).size, perfs.length, 'a perfective appears in two pairs')
})

test('the two members of a pair are always different words', () => {
  for (const p of ASPECT_PAIRS) {
    assert.notEqual(p.impf, p.perf, `${p.impf} paired with itself`)
    assert.ok(p.de.length > 0, `${p.impf}/${p.perf}: no gloss`)
  }
})

test('byPrefix is honest about the derivation', () => {
  for (const p of ASPECT_PAIRS) {
    if (!p.byPrefix) continue
    assert.ok(
      p.perf.endsWith(p.impf),
      `${p.impf} → ${p.perf} is marked byPrefix but is not the base plus a prefix`,
    )
  }
})

test('aspectPartner round-trips in both directions', () => {
  for (const p of ASPECT_PAIRS.slice(0, 20)) {
    assert.equal(aspectPartner(p.impf), p.perf)
    assert.equal(aspectPartner(p.perf), p.impf)
    assert.equal(aspectPairOf(p.impf), aspectPairOf(p.perf))
  }
  assert.equal(aspectPartner('nieistniejące'), undefined)
})
