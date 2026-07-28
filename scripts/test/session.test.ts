import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  commitAnswer,
  dayKey,
  nextExercise,
  phaseBudgets,
  progress,
  qualifiesForStreak,
  secondsRemaining,
  startSession,
} from '../../utils/grammar/session'
import type { Exercise, SessionPhase, SessionPlan } from '../../utils/grammar/types'

const NOW = Date.parse('2026-01-01T12:00:00Z')

function ex(id: string, phase: SessionPhase): Exercise {
  return {
    id,
    templateId: 't',
    conceptId: 'c',
    kind: 'cloze',
    promptDe: 'p',
    text: '___',
    cue: 'kot',
    answer: 'kota',
    options: [],
    alsoAccept: [],
    phase,
  }
}

function plan(exercises: Exercise[], minutes = 15): SessionPlan {
  return {
    lang: 'pl',
    date: '2026-01-01',
    totalSeconds: minutes * 60,
    budgets: phaseBudgets(minutes * 60),
    exercises,
    conceptIds: ['c'],
  }
}

test('phase budgets sum to at most the session length', () => {
  const budgets = phaseBudgets(900)
  const total = budgets.reduce((n, b) => n + b.seconds, 0)
  assert.ok(total <= 900, `phases must fit in the session: ${total}`)
  // The remainder is the summary screen, which has no exercises.
  assert.ok(total >= 800, `but should use most of it: ${total}`)
})

test('a 15-minute session hands out items until the clock runs out', () => {
  const items = Array.from({ length: 200 }, (_, i) => ex(`e${i}`, 'drill'))
  const state = startSession(plan(items), NOW)

  let now = NOW
  let served = 0
  while (nextExercise(state, now)) {
    commitAnswer(state, 8000)
    now += 8000
    served++
    if (served > 500) break
  }

  const elapsedMin = (now - NOW) / 60000
  assert.ok(served > 0, 'served something')
  assert.ok(elapsedMin <= 15.5, `did not overrun 15 min: ${elapsedMin.toFixed(1)}`)
})

test('the hard time cap ends the session even with items left', () => {
  const items = Array.from({ length: 500 }, (_, i) => ex(`e${i}`, 'drill'))
  const state = startSession(plan(items), NOW)
  // Jump straight past the total budget.
  assert.equal(nextExercise(state, NOW + 901_000), undefined)
})

test('a phase stops serving once its own budget is spent', () => {
  const items = [
    ...Array.from({ length: 50 }, (_, i) => ex(`w${i}`, 'warmup')),
    ex('d0', 'drill'),
  ]
  const state = startSession(plan(items), NOW)
  const warmupBudget = state.plan.budgets.find(b => b.phase === 'warmup')!.seconds

  let now = NOW
  const seen: string[] = []
  while (seen.length < 60) {
    const e = nextExercise(state, now)
    if (!e) break
    seen.push(e.id)
    commitAnswer(state, 10_000)
    now += 10_000
  }

  assert.ok(state.spent.warmup >= warmupBudget, 'warm-up budget consumed')
  assert.ok(seen.includes('d0'), 'moved on to the drill phase')
  const warmupServed = seen.filter(id => id.startsWith('w')).length
  assert.ok(warmupServed < 50, 'did not serve every warm-up item')
})

test('an item already on screen is never cut off mid-question', () => {
  // nextExercise is only consulted BETWEEN items, so the contract is simply
  // that committing an answer past the deadline still records cleanly.
  const state = startSession(plan([ex('e0', 'drill')]), NOW)
  const first = nextExercise(state, NOW)
  assert.ok(first)
  commitAnswer(state, 999_000)
  assert.equal(state.index, 1)
  assert.equal(nextExercise(state, NOW + 999_000), undefined)
})

test('progress and remaining time behave at the edges', () => {
  const state = startSession(plan([ex('a', 'drill'), ex('b', 'drill')]), NOW)
  assert.equal(progress(state, NOW), 0)
  assert.equal(secondsRemaining(state, NOW), 900)
  assert.equal(secondsRemaining(state, NOW + 2_000_000), 0, 'never negative')
  assert.equal(progress(state, NOW + 2_000_000), 1, 'never above 1')
})

test('streak qualification is generous but not free', () => {
  const items = Array.from({ length: 40 }, (_, i) => ex(`e${i}`, 'drill'))
  const state = startSession(plan(items), NOW)

  assert.ok(!qualifiesForStreak(state, NOW + 60_000, 2), 'a one-minute poke does not count')
  assert.ok(qualifiesForStreak(state, NOW + 700_000, 5), 'two thirds of the time counts')
  assert.ok(qualifiesForStreak(state, NOW + 60_000, 30), '30 items counts')
})

test('reaching the boss round always counts for the streak', () => {
  const state = startSession(plan([ex('b0', 'boss')]), NOW)
  nextExercise(state, NOW)
  commitAnswer(state, 5000)
  assert.ok(qualifiesForStreak(state, NOW + 5000, 1))
})

test('dayKey uses local time, not UTC', () => {
  const d = new Date(2026, 0, 15, 23, 30)
  assert.equal(dayKey(d.getTime()), '2026-01-15')
})
