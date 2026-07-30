import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BLOCKED_LEMMAS, SEMANTIC_SETS, inSemanticClass } from '../../utils/grammar/semantics'
import { TEMPLATES } from '../../utils/grammar/templates'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Every lemma the bundled morph table actually contains. */
const lemmas = new Set<string>()
for (const line of readFileSync(join(ROOT, 'public/data/pl.morph.tsv'), 'utf-8').split('\n')) {
  const lemma = line.split('\t')[0]
  if (lemma) lemmas.add(lemma)
}

test('every curated semantic lemma exists in the morph table', () => {
  // Guards against silent drift: rebuilding the table with a different topN
  // would otherwise leave dead entries that quietly shrink the drill pool.
  const missing: string[] = []
  for (const [cls, set] of Object.entries(SEMANTIC_SETS)) {
    for (const lemma of set) {
      if (!lemmas.has(lemma)) missing.push(`${cls}: ${lemma}`)
    }
  }
  assert.deepEqual(missing, [], `curated lemmas not in pl.morph.tsv:\n  ${missing.join('\n  ')}`)
})

test('semantic classes are large enough to keep drills varied', () => {
  for (const [cls, set] of Object.entries(SEMANTIC_SETS)) {
    assert.ok(set.size >= 20, `${cls} has only ${set.size} lemmas — drills will repeat`)
  }
})

test('companion is a superset of person', () => {
  for (const p of SEMANTIC_SETS.person) {
    assert.ok(SEMANTIC_SETS.companion.has(p), `${p} missing from companion`)
  }
})

test('no blocked lemma sneaks into a semantic class', () => {
  for (const [cls, set] of Object.entries(SEMANTIC_SETS)) {
    for (const lemma of set) {
      assert.ok(!BLOCKED_LEMMAS.has(lemma), `${cls} contains blocked lemma ${lemma}`)
    }
  }
})

test('inSemanticClass is permissive when no class is demanded', () => {
  assert.ok(inSemanticClass('cokolwiek', undefined))
  assert.ok(inSemanticClass('lekarz', 'person'))
  assert.ok(!inSemanticClass('temat', 'person'), 'a topic is not a person')
  assert.ok(!inSemanticClass('klatka', 'companion'), 'a cage is not company')
})

test('frames that make a semantic demand actually declare one', () => {
  // These are the frames the audit caught generating absurd sentences.
  const mustConstrain: Record<string, string> = {
    'ins.sg.jestem': 'person',
    'ins.sg.z': 'companion',
    'acc.sg.mam': 'concrete',
  }
  for (const [templateId, expected] of Object.entries(mustConstrain)) {
    const t = TEMPLATES.find(x => x.id === templateId)
    assert.ok(t, `${templateId} missing`)
    const spec = t.slots[t.answerSlot]
    assert.equal(spec.semantic, expected, `${templateId} must constrain its slot`)
  }
})

test('a fixed-gender adjective in a frame forces a gender constraint', () => {
  // 'X jest duży' only works for masculine X.
  for (const t of TEMPLATES) {
    if (!/\b(duży|mały|nowy|stary)\b/.test(t.frame)) continue
    const spec = t.slots[t.answerSlot]
    assert.ok(spec.gender, `${t.id}: frame has a masculine adjective but no gender constraint`)
  }
})
