import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  applySession,
  correctRates,
  gradeOf,
  isLeech,
  LEECH_THRESHOLD,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  newProgress,
  review,
  selectDue,
} from '../../utils/grammar/srs'
import type { Attempt } from '../../utils/grammar/types'

const NOW = Date.parse('2026-01-01T12:00:00Z')
const DAY = 86_400_000

test('gradeOf maps a correct rate onto 0..5', () => {
  assert.equal(gradeOf(0), 0)
  assert.equal(gradeOf(1), 5)
  assert.equal(gradeOf(0.5), 3)
  assert.equal(gradeOf(-1), 0, 'clamps below')
  assert.equal(gradeOf(2), 5, 'clamps above')
})

test('a perfect run walks the interval 1 → 3 → ease-scaled', () => {
  let p = newProgress('pl', 'case.acc.sg', NOW)
  assert.equal(p.intervalDays, 0)

  p = review(p, 1, NOW)
  assert.equal(p.intervalDays, 1)

  p = review(p, 1, NOW)
  assert.equal(p.intervalDays, 3)

  const third = review(p, 1, NOW)
  assert.equal(third.intervalDays, Math.round(3 * third.ease))
  assert.ok(third.intervalDays > 3, 'intervals grow')
})

test('a lapse resets the interval and docks ease', () => {
  let p = newProgress('pl', 'case.gen.sg', NOW)
  p = review(p, 1, NOW)
  p = review(p, 1, NOW)
  const easeBefore = p.ease

  const lapsed = review(p, 0.2, NOW)
  assert.equal(lapsed.intervalDays, 1, 'back to one day')
  assert.equal(lapsed.lapses, 1)
  assert.ok(lapsed.ease < easeBefore, 'ease drops')
})

test('ease stays inside its bounds under sustained extremes', () => {
  let p = newProgress('pl', 'x', NOW)
  for (let i = 0; i < 50; i++) p = review(p, 0, NOW)
  assert.ok(p.ease >= MIN_EASE, `ease floor: ${p.ease}`)

  let q = newProgress('pl', 'y', NOW)
  for (let i = 0; i < 50; i++) q = review(q, 1, NOW)
  assert.ok(q.ease <= MAX_EASE, `ease ceiling: ${q.ease}`)
})

test('intervals are capped', () => {
  let p = newProgress('pl', 'z', NOW)
  for (let i = 0; i < 40; i++) p = review(p, 1, NOW)
  assert.ok(p.intervalDays <= MAX_INTERVAL_DAYS)
})

test('mastery is an EWMA — one bad day dents but does not erase', () => {
  let p = newProgress('pl', 'a', NOW)
  for (let i = 0; i < 10; i++) p = review(p, 1, NOW)
  assert.ok(p.mastery > 0.9, `built up: ${p.mastery}`)

  const after = review(p, 0, NOW)
  assert.ok(after.mastery > 0.5, `survives one bad day: ${after.mastery}`)
  assert.ok(after.mastery < p.mastery, 'but does drop')
})

test('leeches are flagged at the threshold', () => {
  let p = newProgress('pl', 'b', NOW)
  for (let i = 0; i < LEECH_THRESHOLD; i++) p = review(p, 0, NOW)
  assert.equal(p.lapses, LEECH_THRESHOLD)
  assert.ok(isLeech(p))
})

test('correctRates aggregates attempts per concept', () => {
  const attempts: Attempt[] = [
    mkAttempt('case.acc.sg', true),
    mkAttempt('case.acc.sg', false),
    mkAttempt('case.ins.sg', true),
  ]
  const rates = correctRates(attempts)
  assert.equal(rates.get('case.acc.sg'), 0.5)
  assert.equal(rates.get('case.ins.sg'), 1)
})

test('applySession only touches concepts the session drilled', () => {
  const existing = [newProgress('pl', 'case.acc.sg', NOW), newProgress('pl', 'untouched', NOW)]
  const out = applySession(existing, [mkAttempt('case.acc.sg', true)], 'pl', NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].conceptId, 'case.acc.sg')
})

test('selectDue puts leeches first, then most overdue', () => {
  const fresh = { ...newProgress('pl', 'fresh', NOW), due: NOW - DAY }
  const stale = { ...newProgress('pl', 'stale', NOW), due: NOW - 10 * DAY }
  const leech = { ...newProgress('pl', 'leech', NOW), due: NOW - DAY, lapses: LEECH_THRESHOLD }
  const future = { ...newProgress('pl', 'future', NOW), due: NOW + 5 * DAY }

  const picked = selectDue([fresh, stale, leech, future], NOW, 10)
  assert.equal(picked[0].conceptId, 'leech', 'leech jumps the queue')
  assert.equal(picked[1].conceptId, 'stale', 'then most overdue')
  assert.ok(!picked.some(p => p.conceptId === 'future'), 'not-yet-due excluded')
})

function mkAttempt(conceptId: string, correct: boolean): Attempt {
  return {
    exerciseId: 'e1',
    templateId: 't1',
    conceptId,
    correct,
    nearMiss: false,
    answer: 'x',
    ms: 1000,
    phase: 'drill',
  }
}
