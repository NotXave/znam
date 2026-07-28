import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildPlan } from '../../utils/grammar/plan'
import { newProgress, review } from '../../utils/grammar/srs'
import { AUTHORED_CONCEPTS } from '../../utils/grammar/lessons.de'
import { commitAnswer, nextExercise, startSession } from '../../utils/grammar/session'
import type { Paradigm, VocabRank } from '../../utils/grammar/generator'
import type { ConceptProgress } from '../../utils/grammar/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NOW = Date.parse('2026-03-01T09:00:00Z')
const DAY = 86_400_000

const paradigms = new Map<string, Paradigm>()
const ranks = new Map<string, number>()
{
  for (const line of readFileSync(join(ROOT, 'public/data/pl.morph.tsv'), 'utf-8').split('\n')) {
    if (!line) continue
    const [lemma, , tag, form] = line.split('\t')
    if (!lemma || !tag || !form) continue
    let p = paradigms.get(lemma)
    if (!p) { p = new Map(); paradigms.set(lemma, p) }
    p.set(tag, form)
  }
  for (const line of readFileSync(join(ROOT, 'public/data/pl.freq.tsv'), 'utf-8').split('\n')) {
    const [lemma, rank] = line.split('\t')
    if (lemma && rank) ranks.set(lemma, Number(rank))
  }
}

const vocab: VocabRank = {
  learning: new Set(['kot', 'dom']),
  known: new Set(paradigms.keys()),
  ignored: new Set(),
  rank: ranks,
}

const base = { lang: 'pl', minutes: 15, now: NOW, paradigms, vocab, newPerDay: 1, seed: 7 }

test('a brand-new learner gets a lesson and a playable plan', () => {
  const plan = buildPlan({ ...base, progress: [] })

  assert.equal(plan.totalSeconds, 900)
  assert.ok(plan.newConceptId, 'introduces something')
  assert.ok(plan.lesson, 'and shows its lesson')
  assert.equal(plan.lesson!.conceptId, plan.newConceptId)
  assert.ok(plan.exercises.length > 0, 'has exercises')
  assert.equal(plan.date, new Date(NOW).toISOString().slice(0, 10))
})

test('the first concept taught is a tier-1 root with no prerequisites', () => {
  const plan = buildPlan({ ...base, progress: [] })
  assert.equal(plan.newConceptId, 'gender.basic')
})

test('only authored concepts are ever scheduled', () => {
  const plan = buildPlan({ ...base, progress: [] })
  for (const id of plan.conceptIds) {
    assert.ok(AUTHORED_CONCEPTS.has(id), `${id} has no lesson written`)
  }
})

test('every generated exercise is well-formed', () => {
  const plan = buildPlan({ ...base, progress: [] })
  for (const e of plan.exercises) {
    assert.ok(!e.text.includes('{'), `unfilled slot: ${e.text}`)
    assert.ok(e.answer.length > 0, 'has an answer')
    assert.ok(e.text.length > 0, 'has a question')
    // transform/gender-sort put the word in `text` and leave `cue` empty.
    if (e.kind !== 'transform' && e.kind !== 'gender-sort') {
      assert.ok(e.cue.length > 0, `has a cue: ${e.templateId}`)
    }
    if (e.options.length > 0) {
      assert.ok(e.options.includes(e.answer), `answer missing from options: ${e.text}`)
    }
  }
})

test('a plan covers every phase so the boss round is reachable', () => {
  const plan = buildPlan({ ...base, progress: [] })
  const phases = new Set(plan.exercises.map(e => e.phase))
  assert.ok(phases.has('lesson'), 'guided items after the lesson')
  assert.ok(phases.has('drill'), 'the main block')
  assert.ok(phases.has('boss'), 'a boss round')
})

test('exercises are ordered warm-up → lesson → drill → boss', () => {
  const plan = buildPlan({ ...base, progress: [] })
  const order = ['warmup', 'lesson', 'drill', 'boss']
  let last = -1
  for (const e of plan.exercises) {
    const i = order.indexOf(e.phase)
    assert.ok(i >= last, `phase went backwards at ${e.id}: ${e.phase}`)
    last = i
  }
})

test('nothing new is introduced when newPerDay is 0', () => {
  const progress = [seasoned('gender.basic')]
  const plan = buildPlan({ ...base, progress, newPerDay: 0 })
  assert.equal(plan.newConceptId, undefined)
  assert.equal(plan.lesson, undefined)
})

test('a concept only unlocks once its prerequisite is truly mastered', () => {
  // gender.basic seen once but nowhere near durable → acc must stay locked.
  const shaky = review(newProgress('pl', 'gender.basic', NOW), 1, NOW)
  const shakyPlan = buildPlan({ ...base, progress: [shaky] })
  assert.notEqual(shakyPlan.newConceptId, 'case.acc.sg')

  const solid = [seasoned('gender.basic')]
  const solidPlan = buildPlan({ ...base, progress: solid })
  assert.equal(solidPlan.newConceptId, 'case.nom.sg', 'the next tier-1 concept opens')
})

test('due concepts are drilled, concepts not yet due are not', () => {
  const due = { ...seasoned('gender.basic'), due: NOW - 5 * DAY }
  const notDue = { ...seasoned('case.nom.sg'), due: NOW + 30 * DAY }
  const plan = buildPlan({ ...base, progress: [due, notDue], newPerDay: 0 })

  assert.ok(plan.conceptIds.includes('gender.basic'), 'the overdue concept is drilled')
  const warmup = plan.exercises.filter(e => e.phase === 'warmup')
  assert.ok(warmup.every(e => e.conceptId === 'gender.basic'), 'warm-up covers only what is due')
})

test('the boss round targets the weakest concept', () => {
  const strong = { ...seasoned('gender.basic'), mastery: 0.99, due: NOW - DAY }
  const weak = { ...seasoned('case.acc.sg'), mastery: 0.2, due: NOW - DAY }
  const plan = buildPlan({ ...base, progress: [strong, weak], newPerDay: 0 })

  const boss = plan.exercises.filter(e => e.phase === 'boss')
  assert.ok(boss.length > 0)
  assert.ok(boss.every(e => e.conceptId === 'case.acc.sg'), 'boss fights the weak spot')
})

test('drills use the words the learner is actually learning', () => {
  const plan = buildPlan({ ...base, progress: [] })
  // 'kot' and 'dom' are the only 'learning' words, so they should dominate.
  // The word sits in `cue`, or in `text` for transform/gender-sort items.
  const words = plan.exercises.map(e => e.cue || e.text)
  assert.ok(
    words.some(w => w === 'kot' || w === 'dom'),
    `expected learning words, saw ${[...new Set(words)].slice(0, 5)}`,
  )
})

test('ignored words never reach an exercise', () => {
  const shunned: VocabRank = {
    learning: new Set(),
    known: new Set(paradigms.keys()),
    ignored: new Set(['kot']),
    rank: ranks,
  }
  const plan = buildPlan({ ...base, vocab: shunned, progress: [] })
  assert.ok(plan.exercises.every(e => e.cue !== 'kot'), 'ignored lemma leaked into a drill')
})

test('a full plan actually plays through inside its time budget', () => {
  const plan = buildPlan({ ...base, progress: [] })
  const state = startSession(plan, NOW)

  let now = NOW
  let answered = 0
  while (nextExercise(state, now)) {
    commitAnswer(state, 8_000)
    now += 8_000
    answered++
    if (answered > 300) break
  }

  const minutes = (now - NOW) / 60_000
  assert.ok(answered > 5, `should be a real session, got ${answered} items`)
  assert.ok(minutes <= 15.5, `overran the budget: ${minutes.toFixed(1)} min`)
})

test('a rushed learner still cannot exceed the session length', () => {
  const plan = buildPlan({ ...base, progress: [] })
  const state = startSession(plan, NOW)
  let now = NOW
  let answered = 0
  // Answering every item in one second flat.
  while (nextExercise(state, now)) {
    commitAnswer(state, 1_000)
    now += 1_000
    answered++
    if (answered > 2000) break
  }
  assert.ok((now - NOW) / 1000 <= 900, 'hard cap holds even at speed')
})

test('plans are reproducible for a given seed', () => {
  const a = buildPlan({ ...base, progress: [], seed: 123 })
  const b = buildPlan({ ...base, progress: [], seed: 123 })
  assert.deepEqual(
    a.exercises.map(e => `${e.templateId}:${e.answer}`),
    b.exercises.map(e => `${e.templateId}:${e.answer}`),
  )
})

/** A concept that is both accurate and durable — i.e. genuinely mastered. */
function seasoned(conceptId: string): ConceptProgress {
  let p = newProgress('pl', conceptId, NOW)
  for (let i = 0; i < 8; i++) p = review(p, 1, NOW)
  return { ...p, due: NOW - DAY }
}
