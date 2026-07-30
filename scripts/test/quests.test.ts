import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  QUESTS,
  QUEST_BY_ID,
  QUEST_COUNT,
  applyContribution,
  currentQuests,
  emptyApplyState,
  generateQuests,
  grammarContribution,
  questViews,
  vocabContribution,
  type Quest,
  type QuestContext,
} from '../../utils/grammar/quests'
import { LEECH_LAPSES } from '../../utils/grammar/vocab'
import { weekKey } from '../../utils/grammar/stats'
import { makeRandom } from '../../utils/grammar/generator'

const NOW = Date.parse('2026-04-08T10:00:00') // a Wednesday

function ctx(over: Partial<QuestContext> = {}): QuestContext {
  return { progress: [], cards: [], xp: 0, streak: 0, ...over }
}

/** A learner far enough in that most quests apply. */
function advanced(): QuestContext {
  return ctx({
    xp: 4000,
    streak: 9,
    progress: [
      ...['nom', 'gen', 'dat', 'acc', 'ins', 'loc'].flatMap(c => [
        { conceptId: `case.${c}.sg`, seen: 20, mastery: 0.9, lapses: 0 },
        { conceptId: `case.${c}.pl`, seen: 10, mastery: 0.5, lapses: 2 },
      ]),
      { conceptId: 'case.voc', seen: 5, mastery: 0.6, lapses: 0 },
      { conceptId: 'prefix.system', seen: 8, mastery: 0.55, lapses: 1 },
    ],
    cards: Array.from({ length: 40 }, (_, i) => ({
      lemma: `w${i}`,
      lapses: i < 6 ? LEECH_LAPSES : 0,
      due: NOW,
    })),
  })
}

// ── the catalogue ───────────────────────────────────────────

test('every quest is well formed and uniquely identified', () => {
  const ids = new Set<string>()
  for (const q of QUESTS) {
    assert.ok(!ids.has(q.id), `duplicate quest id ${q.id}`)
    ids.add(q.id)
    assert.ok(q.target > 0, `${q.id} has no target`)
    assert.ok(q.xp > 0, `${q.id} awards no XP`)
    assert.ok(q.titleDe.length > 3, `${q.id} has no title`)
    assert.ok(q.descDe.length > 10, `${q.id} has no description`)
    assert.equal(QUEST_BY_ID.get(q.id), q)
  }
})

test('enough quests are always relevant that the set is never short', () => {
  // A brand-new learner still has to get three.
  const beginner = generateQuests(ctx(), '2026-W15', makeRandom(1))
  assert.equal(beginner.quests.length, QUEST_COUNT)
})

test('a quest is not offered for something out of reach', () => {
  const beginner = generateQuests(ctx(), '2026-W15', makeRandom(7)).quests.map(q => q.id)
  // Nothing about leeches, prefixes or plurals — none of that has been met yet.
  for (const id of ['leeches.clear', 'prefix.15', 'plural.push', 'cases.all', 'both.3']) {
    assert.ok(!beginner.includes(id), `${id} was offered to a beginner`)
  }
})

test('an advanced learner gets the harder quests, and variety across weeks', () => {
  const state = advanced()
  const sets = [1, 2, 3, 4, 5].map(
    seed => generateQuests(state, '2026-W15', makeRandom(seed)).quests.map(q => q.id).sort().join(),
  )
  assert.ok(new Set(sets).size > 1, 'the same three every week')
  const all = new Set(sets.flatMap(s => s.split(',')))
  assert.ok(all.size > QUEST_COUNT, 'the pool never widened past one set')
})

test('generation does not mutate the catalogue order', () => {
  // The shuffle used to run in place, which made the module-level array's order
  // depend on how many sessions had been played.
  const before = QUESTS.map(q => q.id)
  for (let i = 0; i < 5; i++) generateQuests(advanced(), '2026-W15', makeRandom(i))
  assert.deepEqual(QUESTS.map(q => q.id), before)
})

// ── the weekly reroll ───────────────────────────────────────

test('quests survive the week and reroll when it turns', () => {
  const first = currentQuests(undefined, advanced(), NOW, makeRandom(3))
  assert.equal(first.rerolled, true)
  assert.equal(first.week.week, weekKey(NOW))

  // Same week, later in the week: the same object, so nothing is persisted.
  const friday = Date.parse('2026-04-10T22:00:00')
  const again = currentQuests(first.week, advanced(), friday, makeRandom(3))
  assert.equal(again.rerolled, false)
  assert.equal(again.week, first.week)

  // The following Monday: a new set.
  const monday = Date.parse('2026-04-13T06:00:00')
  const next = currentQuests(first.week, advanced(), monday, makeRandom(4))
  assert.equal(next.rerolled, true)
  assert.notEqual(next.week.week, first.week.week)
})

// ── contributions ───────────────────────────────────────────

test('a grammar session counts distinct cases, not attempts', () => {
  const c = grammarContribution([
    { conceptId: 'case.gen.sg', correct: true },
    { conceptId: 'case.gen.sg', correct: true },
    { conceptId: 'case.gen.pl', correct: true },
    { conceptId: 'case.acc.sg', correct: true },
    { conceptId: 'case.loc.pl', correct: false }, // wrong: does not count
  ], 5)
  assert.deepEqual([...c.cases].sort(), ['acc', 'gen'])
  assert.deepEqual([...c.plurals], ['gen'])
  assert.equal(c.correct, 4)
})

test('non-case concepts do not leak into the case set', () => {
  const c = grammarContribution([
    { conceptId: 'prefix.system', correct: true },
    { conceptId: 'prefix.families', correct: true },
    { conceptId: 'verb.past', correct: true },
    { conceptId: 'case.notacase.sg', correct: true },
  ], 0)
  assert.equal(c.cases.size, 0, 'only the seven real cases count')
  assert.equal(c.prefix, 2)
})

test('boss items are counted separately as well as as correct answers', () => {
  const c = grammarContribution([
    { conceptId: 'case.gen.pl', correct: true, phase: 'boss' },
    { conceptId: 'case.gen.pl', correct: true, phase: 'drill' },
  ], 2)
  assert.equal(c.boss, 1)
  assert.equal(c.correct, 2)
})

test('a vocab session counts leeches as they were BEFORE it', () => {
  // A card stops being a leech the moment it is answered right, so reading the
  // set afterwards would credit nothing.
  const before = new Set(['trudne', 'gorsze'])
  const c = vocabContribution([
    { lemma: 'trudne', correct: true, kind: 'produce' },
    { lemma: 'gorsze', correct: false },
    { lemma: 'łatwe', correct: true, kind: 'recognize' },
  ], 3, before)
  assert.deepEqual([...c.leeches], ['trudne'], 'the failed leech does not count')
  assert.equal(c.produce, 1)
  assert.equal(c.correct, 2)
})

// ── applying them ───────────────────────────────────────────

const quest = (id: string, over: Partial<Quest> = {}): Quest => {
  const spec = QUEST_BY_ID.get(id)!
  return { id, metric: spec.metric, target: spec.target, progress: 0, ...over }
}

test('a running-total quest accumulates across sessions', () => {
  let quests = [quest('correct.150')]
  let state = emptyApplyState()
  for (let i = 0; i < 3; i++) {
    const r = applyContribution(quests, state, {
      ...grammarContribution(
        Array.from({ length: 40 }, () => ({ conceptId: 'case.gen.sg', correct: true })), 0),
    }, `2026-04-0${8 + i}`, NOW)
    quests = r.quests
    state = r.state
  }
  assert.equal(quests[0].progress, 120)
  assert.equal(quests[0].doneAt, undefined)
})

test('a distinct-thing quest unions across sessions rather than adding', () => {
  let quests = [quest('cases.tour')] // 5 distinct cases
  let state = emptyApplyState()

  const drill = (cases: string[]) =>
    grammarContribution(cases.map(c => ({ conceptId: `case.${c}.sg`, correct: true })), 0)

  let r = applyContribution(quests, state, drill(['gen', 'acc']), '2026-04-08', NOW)
  assert.equal(r.quests[0].progress, 2)

  // The same two again: still two, not four.
  r = applyContribution(r.quests, r.state, drill(['gen', 'acc']), '2026-04-09', NOW)
  assert.equal(r.quests[0].progress, 2)

  r = applyContribution(r.quests, r.state, drill(['dat', 'ins', 'loc']), '2026-04-10', NOW)
  assert.equal(r.quests[0].progress, 5)
  assert.deepEqual(r.completed, ['cases.tour'])
  assert.equal(r.xp, QUEST_BY_ID.get('cases.tour')!.xp)
})

test('two sessions on one day are one day', () => {
  let quests = [quest('days.5')]
  let state = emptyApplyState()
  const active = grammarContribution([{ conceptId: 'case.gen.sg', correct: true }], 0)

  let r = applyContribution(quests, state, active, '2026-04-08', NOW)
  r = applyContribution(r.quests, r.state, active, '2026-04-08', NOW)
  assert.equal(r.quests[0].progress, 1, 'a second session is not a second day')

  r = applyContribution(r.quests, r.state, active, '2026-04-09', NOW)
  assert.equal(r.quests[0].progress, 2)
})

test('a combo quest takes the best, not the sum', () => {
  let quests = [quest('combo.12')]
  let state = emptyApplyState()
  const withCombo = (n: number) => ({ ...grammarContribution([], 0), combo: n })

  let r = applyContribution(quests, state, withCombo(8), '2026-04-08', NOW)
  assert.equal(r.quests[0].progress, 8)
  r = applyContribution(r.quests, r.state, withCombo(5), '2026-04-09', NOW)
  assert.equal(r.quests[0].progress, 8, 'a worse session does not lower it')
  r = applyContribution(r.quests, r.state, withCombo(14), '2026-04-10', NOW)
  assert.equal(r.quests[0].progress, 12, 'clamped to the target')
  assert.deepEqual(r.completed, ['combo.12'])
})

test('a finished quest is never completed twice, and awards XP once', () => {
  const done = [quest('days.5', { progress: 5, doneAt: NOW - 1000 })]
  const r = applyContribution(done, emptyApplyState(),
    grammarContribution([{ conceptId: 'case.gen.sg', correct: true }], 0), '2026-04-09', NOW)
  assert.deepEqual(r.completed, [])
  assert.equal(r.xp, 0)
  assert.equal(r.quests[0].doneAt, NOW - 1000, 'the original completion time is kept')
})

test('completing two quests at once awards both', () => {
  const quests = [quest('correct.150', { progress: 149 }), quest('days.5', { progress: 4 })]
  // A day-based quest derives its progress from the counted-days set, not from
  // the stored number, so the four days have to be in the state to be real.
  const state = {
    ...emptyApplyState(),
    countedDays: { days: ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-11'] },
  }
  const r = applyContribution(quests, state,
    grammarContribution([{ conceptId: 'case.gen.sg', correct: true }], 0), '2026-04-09', NOW)
  assert.deepEqual(r.completed.sort(), ['correct.150', 'days.5'])
  assert.equal(r.xp, QUEST_BY_ID.get('correct.150')!.xp + QUEST_BY_ID.get('days.5')!.xp)
})

test('a day-based quest ignores a stored count that its day set contradicts', () => {
  // The set is the source of truth. A stored progress of 4 with no days
  // recorded is inconsistent state, and trusting it would let a quest be
  // completed by a session that did nothing.
  const quests = [quest('days.5', { progress: 4 })]
  const r = applyContribution(quests, emptyApplyState(),
    grammarContribution([{ conceptId: 'case.gen.sg', correct: true }], 0), '2026-04-09', NOW)
  assert.equal(r.quests[0].progress, 1)
  assert.deepEqual(r.completed, [])
})

test('a new learner still gets three quests, and they are ones they can do', () => {
  const beginner = generateQuests(ctx(), '2026-W15', makeRandom(11)).quests
  assert.equal(beginner.length, QUEST_COUNT)
  for (const q of beginner) {
    assert.ok(QUEST_BY_ID.get(q.id)!.relevant(ctx()), `${q.id} is not reachable yet`)
  }
})

test('newly met concepts feed the beginner topic quest', () => {
  const quests = [quest('topics.2')]
  let r = applyContribution(quests, emptyApplyState(),
    grammarContribution([{ conceptId: 'case.nom.sg', correct: true }], 0, 1), '2026-04-08', NOW)
  assert.equal(r.quests[0].progress, 1)
  r = applyContribution(r.quests, r.state,
    grammarContribution([{ conceptId: 'case.acc.sg', correct: true }], 0, 1), '2026-04-09', NOW)
  assert.deepEqual(r.completed, ['topics.2'])
})

test('two sessions in one day are two sessions but one day', () => {
  const quests = [quest('sessions.4'), quest('days.5')]
  const active = grammarContribution([{ conceptId: 'case.gen.sg', correct: true }], 0)
  let r = applyContribution(quests, emptyApplyState(), active, '2026-04-08', NOW)
  r = applyContribution(r.quests, r.state, active, '2026-04-08', NOW)
  assert.equal(r.quests[0].progress, 2, 'sessions counts both')
  assert.equal(r.quests[1].progress, 1, 'days counts one')
})

test('applying a contribution does not mutate what it was given', () => {
  const quests = [quest('correct.150')]
  const state = emptyApplyState()
  applyContribution(quests, state,
    grammarContribution([{ conceptId: 'case.gen.sg', correct: true }], 0), '2026-04-09', NOW)
  assert.equal(quests[0].progress, 0)
  assert.deepEqual(state, emptyApplyState())
})

// ── rendering ───────────────────────────────────────────────

test('a view carries the authored German and a clamped fraction', () => {
  const views = questViews([quest('days.5', { progress: 9, doneAt: NOW })])
  assert.equal(views.length, 1)
  assert.equal(views[0].titleDe, QUEST_BY_ID.get('days.5')!.titleDe)
  assert.equal(views[0].progress, 5, 'clamped to the target')
  assert.equal(views[0].fraction, 1)
  assert.equal(views[0].done, true)
})

test('a stored quest whose spec was removed is dropped, not rendered blank', () => {
  const views = questViews([
    { id: 'quest.that.no.longer.exists', metric: 'correct', target: 10, progress: 3 },
    quest('days.5'),
  ])
  assert.deepEqual(views.map(v => v.id), ['days.5'])
})
