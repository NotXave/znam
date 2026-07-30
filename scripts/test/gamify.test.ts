import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  ACHIEVEMENTS,
  advanceStreak,
  comboMultiplier,
  daysBetween,
  MAX_FREEZES,
  newAchievements,
  newGameState,
  nextRank,
  rankFor,
  scoreSession,
  zubrLine,
} from '../../utils/grammar/gamify'
import type { Attempt, SessionPhase } from '../../utils/grammar/types'

function att(correct: boolean, phase: SessionPhase = 'drill', nearMiss = false): Attempt {
  return {
    exerciseId: 'e', templateId: 't', conceptId: 'c',
    correct, nearMiss, answer: 'x', ms: 1000, phase,
  }
}

test('combo multiplier rises and then caps at 2x', () => {
  assert.equal(comboMultiplier(0), 1)
  assert.ok(Math.abs(comboMultiplier(5) - 1.5) < 1e-9)
  assert.ok(Math.abs(comboMultiplier(10) - 2) < 1e-9)
  assert.ok(Math.abs(comboMultiplier(999) - 2) < 1e-9, 'caps')
})

test('ranks progress and the last rank has no next', () => {
  assert.equal(rankFor(0).id, 'nowicjusz')
  assert.equal(rankFor(600).id, 'uczen')
  assert.equal(rankFor(999_999).id, 'legenda')
  assert.equal(nextRank(0)?.id, 'uczen')
  assert.equal(nextRank(999_999), undefined)
})

test('a wrong answer breaks the combo', () => {
  const perfect = scoreSession(Array.from({ length: 5 }, () => att(true)), { lessonShown: false, completed: false })
  const broken = scoreSession(
    [att(true), att(true), att(false), att(true)],
    { lessonShown: false, completed: false },
  )
  assert.equal(perfect.maxCombo, 5)
  assert.equal(broken.maxCombo, 2)
  assert.ok(perfect.items > broken.items)
})

test('boss items are worth double and near misses half', () => {
  const normal = scoreSession([att(true)], { lessonShown: false, completed: false })
  const boss = scoreSession([att(true, 'boss')], { lessonShown: false, completed: false })
  const near = scoreSession([att(true, 'drill', true)], { lessonShown: false, completed: false })
  assert.equal(boss.items, normal.items * 2)
  assert.ok(near.items < normal.items)
})

test('lesson and completion bonuses are additive', () => {
  const s = scoreSession([att(true)], { lessonShown: true, completed: true })
  assert.equal(s.total, s.items + s.lesson + s.session)
  assert.equal(s.lesson, 50)
  assert.equal(s.session, 100)
})

test('no XP for a session of pure failure', () => {
  const s = scoreSession([att(false), att(false)], { lessonShown: false, completed: false })
  assert.equal(s.items, 0)
  assert.equal(s.maxCombo, 0)
})

test('daysBetween', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-02'), 1)
  assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0)
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1, 'handles month ends')
})

test('a consecutive day extends the streak', () => {
  const s0 = { ...newGameState('pl'), streak: 3, lastDay: '2026-01-01' }
  const { state, broken } = advanceStreak(s0, '2026-01-02')
  assert.equal(state.streak, 4)
  assert.ok(!broken)
})

test('training twice in one day does not double-count', () => {
  const s0 = { ...newGameState('pl'), streak: 3, lastDay: '2026-01-02' }
  const { state } = advanceStreak(s0, '2026-01-02')
  assert.equal(state.streak, 3)
})

test('a banked freeze absorbs exactly one missed day', () => {
  const s0 = { ...newGameState('pl'), streak: 9, lastDay: '2026-01-01', freezes: 1 }
  const { state, freezeUsed, broken } = advanceStreak(s0, '2026-01-03')
  assert.ok(freezeUsed)
  assert.ok(!broken)
  assert.equal(state.streak, 10)
  assert.equal(state.freezes, 0, 'freeze consumed')
})

test('without a freeze, a missed day breaks the streak', () => {
  const s0 = { ...newGameState('pl'), streak: 9, lastDay: '2026-01-01', freezes: 0 }
  const { state, broken } = advanceStreak(s0, '2026-01-03')
  assert.ok(broken)
  assert.equal(state.streak, 1)
})

test('a long absence breaks the streak even with a freeze banked', () => {
  const s0 = { ...newGameState('pl'), streak: 40, lastDay: '2026-01-01', freezes: 2 }
  const { state, broken } = advanceStreak(s0, '2026-01-20')
  assert.ok(broken)
  assert.equal(state.streak, 1)
  assert.equal(state.freezes, 2, 'freezes are not wasted on a hopeless gap')
})

test('a freeze is banked every seventh day, up to the cap', () => {
  let state = newGameState('pl')
  let day = 1
  const next = () => `2026-01-${String(day++).padStart(2, '0')}`
  for (let i = 0; i < 21; i++) state = advanceStreak(state, next()).state
  assert.equal(state.streak, 21)
  assert.ok(state.freezes <= MAX_FREEZES, `capped at ${MAX_FREEZES}, got ${state.freezes}`)
  assert.ok(state.freezes > 0, 'and actually earned some')
})

test('achievements unlock once and only once', () => {
  const fresh = newGameState('pl')
  const attempts = Array.from({ length: 12 }, () => att(true))
  const first = newAchievements(fresh, attempts, 12, 7)
  assert.ok(first.includes('first-session'))
  assert.ok(first.includes('perfect'))
  assert.ok(first.includes('combo-10'))
  assert.ok(first.includes('streak-7'))

  const after = { ...fresh, achievements: first }
  const second = newAchievements(after, attempts, 12, 7)
  assert.equal(second.length, 0, 'already-earned achievements do not re-fire')
})

test('a flawless boss round earns the boss achievement', () => {
  const got = newAchievements(newGameState('pl'), [att(true, 'boss'), att(true, 'boss')], 2, 1)
  assert.ok(got.includes('boss-clear'))

  const missed = newAchievements(newGameState('pl'), [att(true, 'boss'), att(false, 'boss')], 1, 1)
  assert.ok(!missed.includes('boss-clear'))
})

test('every achievement id is unique', () => {
  const ids = ACHIEVEMENTS.map(a => a.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('the mascot always has something to say', () => {
  for (const kind of ['correct', 'nearMiss', 'wrong', 'bossHit', 'sessionEnd'] as const) {
    assert.ok(zubrLine(kind, () => 0).length > 0)
    assert.ok(zubrLine(kind, () => 0.999).length > 0, `${kind} must not overflow its pool`)
  }
})
