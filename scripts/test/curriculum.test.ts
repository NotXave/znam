import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  CONCEPTS,
  CONCEPT_BY_ID,
  isMastered,
  isUnlocked,
  nextNewConcept,
} from '../../utils/grammar/curriculum'
import { AUTHORED_CONCEPTS, LESSONS, LESSON_BY_CONCEPT } from '../../utils/grammar/lessons.de'
import { TEMPLATES, TEMPLATES_BY_CONCEPT } from '../../utils/grammar/templates'

// ── graph integrity ─────────────────────────────────────────

test('concept ids are unique', () => {
  const ids = CONCEPTS.map(c => c.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate concept id')
})

test('every prerequisite refers to a real concept', () => {
  const missing: string[] = []
  for (const c of CONCEPTS) {
    for (const req of c.requires) {
      if (!CONCEPT_BY_ID.has(req)) missing.push(`${c.id} → ${req}`)
    }
  }
  assert.deepEqual(missing, [], 'dangling prerequisites')
})

test('the prerequisite graph is acyclic', () => {
  // A cycle would make both concepts permanently unreachable — the learner
  // would simply never be offered them, with no error anywhere.
  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []
  const visit = (id: string) => {
    if (state.get(id) === 'done') return
    assert.notEqual(state.get(id), 'open', `cycle: ${[...stack, id].join(' → ')}`)
    state.set(id, 'open')
    stack.push(id)
    for (const req of CONCEPT_BY_ID.get(id)?.requires ?? []) visit(req)
    stack.pop()
    state.set(id, 'done')
  }
  for (const c of CONCEPTS) visit(c.id)
})

test('prerequisites never point at a higher tier', () => {
  // Requiring a tier-4 concept from a tier-2 one would gate the early
  // curriculum behind the late one.
  for (const c of CONCEPTS) {
    for (const req of c.requires) {
      const dep = CONCEPT_BY_ID.get(req)!
      assert.ok(
        dep.tier <= c.tier,
        `${c.id} (tier ${c.tier}) requires ${req} (tier ${dep.tier})`,
      )
    }
  }
})

test('at least one concept has no prerequisites', () => {
  assert.ok(CONCEPTS.some(c => c.requires.length === 0), 'nothing would ever unlock')
})

test('every concept is reachable from a root', () => {
  const mastered = new Set<string>()
  const lookup = (id: string) =>
    mastered.has(id) ? { mastery: 1, intervalDays: 999 } : undefined

  // Repeatedly unlock whatever is now available, as a learner would.
  for (let pass = 0; pass < CONCEPTS.length + 1; pass++) {
    for (const c of CONCEPTS) {
      if (!mastered.has(c.id) && isUnlocked(c.id, lookup)) mastered.add(c.id)
    }
  }
  const stranded = CONCEPTS.filter(c => !mastered.has(c.id)).map(c => c.id)
  assert.deepEqual(stranded, [], 'concepts that can never unlock')
})

// ── content coverage ────────────────────────────────────────

test('every concept has a lesson', () => {
  const missing = CONCEPTS.filter(c => !LESSON_BY_CONCEPT.has(c.id)).map(c => c.id)
  assert.deepEqual(missing, [], `concepts with no lesson:\n  ${missing.join('\n  ')}`)
})

test('every lesson belongs to a real concept', () => {
  const orphans = LESSONS.filter(l => !CONCEPT_BY_ID.has(l.conceptId)).map(l => l.conceptId)
  assert.deepEqual(orphans, [], 'lessons for concepts that no longer exist')
})

test('no concept has two lessons', () => {
  const ids = LESSONS.map(l => l.conceptId)
  assert.equal(new Set(ids).size, ids.length, 'duplicate lesson')
})

test('every lesson is actually filled in', () => {
  for (const l of LESSONS) {
    assert.ok(l.hookDe.length > 20, `${l.conceptId}: hook too thin`)
    assert.ok(l.ruleDe.length > 40, `${l.conceptId}: rule too thin`)
    assert.ok(l.bridgeDe.length > 40, `${l.conceptId}: no German bridge`)
    assert.ok(l.trapDe.length > 30, `${l.conceptId}: no trap`)
    assert.ok(l.mnemonicDe.length > 15, `${l.conceptId}: no mnemonic`)
    assert.ok(l.table.length >= 3, `${l.conceptId}: pattern table too small`)
    assert.ok(l.tableHead.length >= 2, `${l.conceptId}: table has no headers`)
    for (const row of l.table) {
      assert.equal(
        row.length, l.tableHead.length,
        `${l.conceptId}: row [${row.join(', ')}] does not match ${l.tableHead.length} headers`,
      )
    }
  }
})

// ── the case grid, which is the point of the curriculum ─────

test('every core case is taught in BOTH singular and plural', () => {
  // Stopping at the singular would mean teaching the easy half of Polish: the
  // genitive plural's zero ending and the masculine-personal forms have no
  // German counterpart at all.
  const missing: string[] = []
  for (const c of ['nom', 'acc', 'gen', 'dat', 'ins', 'loc']) {
    for (const n of ['sg', 'pl']) {
      const id = `case.${c}.${n}`
      if (!CONCEPT_BY_ID.has(id)) missing.push(id)
      else if (!AUTHORED_CONCEPTS.has(id)) missing.push(`${id} (no lesson)`)
    }
  }
  assert.deepEqual(missing, [], `missing from the case grid:\n  ${missing.join('\n  ')}`)
})

test('the vocative is present, even if only lightly', () => {
  assert.ok(CONCEPT_BY_ID.has('case.voc'), 'you still need it for names')
  assert.ok(AUTHORED_CONCEPTS.has('case.voc'))
})

test('verb prefixes are taught as a system AND as families', () => {
  for (const id of ['prefix.system', 'prefix.families', 'prefix.aspect']) {
    assert.ok(CONCEPT_BY_ID.has(id), `${id} missing from the curriculum`)
    assert.ok(AUTHORED_CONCEPTS.has(id), `${id} has no lesson`)
  }
})

test('the prefix lesson actually shows the German parallel', () => {
  // pod-pisać = unter-schreiben is the whole reason this group exists.
  const lesson = LESSON_BY_CONCEPT.get('prefix.system')!
  const text = JSON.stringify(lesson).toLowerCase()
  assert.ok(text.includes('unterschreiben'), 'the exact-match example is missing')
  assert.ok(text.includes('podpisać'.toLowerCase()))
})

// ── templates ───────────────────────────────────────────────

test('template ids are unique', () => {
  const ids = TEMPLATES.map(t => t.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate template id')
})

test('every template targets a real concept', () => {
  const bad: string[] = []
  for (const t of TEMPLATES) {
    for (const cid of t.conceptIds) {
      if (!CONCEPT_BY_ID.has(cid)) bad.push(`${t.id} → ${cid}`)
    }
  }
  assert.deepEqual(bad, [], 'templates pointing at concepts that do not exist')
})

test('a concept that is taught can also be drilled', () => {
  // A lesson with no template introduces a topic and then has nothing to
  // practise — the session would show the lesson card and immediately end.
  const undrillable = [...AUTHORED_CONCEPTS].filter(id => !TEMPLATES_BY_CONCEPT.has(id))
  assert.deepEqual(
    undrillable, [],
    `taught but never drilled:\n  ${undrillable.join('\n  ')}`,
  )
})

// ── progression ─────────────────────────────────────────────

test('a fresh learner is offered a tier-1 root first', () => {
  const first = nextNewConcept(() => undefined, new Set(), AUTHORED_CONCEPTS)
  assert.ok(first, 'nothing offered to a new learner')
  assert.equal(CONCEPT_BY_ID.get(first)!.tier, 1)
  assert.equal(CONCEPT_BY_ID.get(first)!.requires.length, 0)
})

test('mastery requires both accuracy and durability', () => {
  const accurateButNew = () => ({ mastery: 1, intervalDays: 1 })
  const durableButShaky = () => ({ mastery: 0.4, intervalDays: 90 })
  assert.ok(!isMastered('gender.basic', accurateButNew), 'one good day is not mastery')
  assert.ok(!isMastered('gender.basic', durableButShaky), 'time alone is not mastery')
})
