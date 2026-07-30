import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  CASE_ORDER,
  DEFAULT_GOAL,
  caseMasteryGrid,
  goalProgress,
  reviewForecast,
  sessionDiff,
  weakestCase,
  weekCompare,
  weekKey,
  weekTotals,
} from '../../utils/grammar/stats'
import { CONCEPTS } from '../../utils/grammar/curriculum'
import type { SessionDay } from '../../utils/grammar/types'

const DAY = 86_400_000

function day(date: string, extra: Partial<SessionDay> = {}): SessionDay {
  return { lang: 'pl', date, seconds: 0, items: 0, correct: 0, xp: 0, ...extra }
}

// ── daily goal ──────────────────────────────────────────────

test('an untouched day reads as the promise, not as zero', () => {
  const g = goalProgress(undefined)
  assert.equal(g.fraction, 0)
  assert.equal(g.met, false)
  assert.equal(g.labelDe, '15 Minuten heute')
})

test('the goal tracks whichever measure is further along', () => {
  // A careful session: long on the clock, short on items.
  const slow = goalProgress({ seconds: 12 * 60, items: 8 }, DEFAULT_GOAL)
  assert.equal(slow.leading, 'minutes')
  assert.ok(Math.abs(slow.fraction - 12 / 15) < 1e-9)

  // A fast session: many items in little time. Both have to be able to finish
  // the day, or the goal punishes one honest way of working.
  const fast = goalProgress({ seconds: 5 * 60, items: 36 }, DEFAULT_GOAL)
  assert.equal(fast.leading, 'items')
  assert.ok(Math.abs(fast.fraction - 36 / 40) < 1e-9)
})

test('either measure alone can complete the day, and the ring never overfills', () => {
  assert.equal(goalProgress({ seconds: 15 * 60, items: 0 }).met, true)
  assert.equal(goalProgress({ seconds: 0, items: 40 }).met, true)
  const over = goalProgress({ seconds: 90 * 60, items: 400 })
  assert.equal(over.fraction, 1)
  assert.equal(over.labelDe, 'Tagesziel erreicht')
})

test('the remaining label is singular when one unit is left', () => {
  assert.equal(goalProgress({ seconds: 14 * 60, items: 0 }).labelDe, 'noch 1 Minute')
  assert.equal(goalProgress({ seconds: 0, items: 39 }).labelDe, 'noch 1 Aufgabe')
})

// ── case mastery grid ───────────────────────────────────────

test('the grid is 7 cases × 2 numbers, in textbook order', () => {
  const grid = caseMasteryGrid(CONCEPTS, [])
  assert.equal(grid.length, 14)
  assert.deepEqual([...new Set(grid.map(c => c.case))], [...CASE_ORDER])
  assert.equal(grid.filter(c => c.number === 'sg').length, 7)
  assert.equal(grid.filter(c => c.number === 'pl').length, 7)
})

test('every non-vocative cell maps to a real concept', () => {
  // The point of the grid is that it covers the whole table. A missing concept
  // would show as a hole, so this is really a curriculum check.
  const grid = caseMasteryGrid(CONCEPTS, [])
  const holes = grid.filter(c => c.state === 'absent' && !(c.case === 'voc' && c.number === 'pl'))
  assert.deepEqual(holes.map(c => `${c.case}.${c.number}`), [])
})

test('the vocative is one concept: a singular cell and an absent plural', () => {
  // The curriculum teaches it as `case.voc`, not `case.voc.sg`, because its
  // plural is identical to the nominative plural and there is nothing to drill.
  // Reading the id off the pattern alone left the whole row blank.
  const grid = caseMasteryGrid(CONCEPTS, [])
  const sg = grid.find(c => c.case === 'voc' && c.number === 'sg')!
  assert.equal(sg.conceptId, 'case.voc')
  assert.notEqual(sg.state, 'absent')

  const pl = grid.find(c => c.case === 'voc' && c.number === 'pl')!
  assert.equal(pl.state, 'absent')
  assert.equal(pl.conceptId, undefined)
})

test('the grid has exactly one hole, and it is the vocative plural', () => {
  const absent = caseMasteryGrid(CONCEPTS, []).filter(c => c.state === 'absent')
  assert.deepEqual(absent.map(c => `${c.case}.${c.number}`), ['voc.pl'])
})

test('mastery alone does not make a cell solid — two lucky answers are not mastery', () => {
  const perfectButNew = caseMasteryGrid(CONCEPTS, [
    { conceptId: 'case.gen.pl', mastery: 1, seen: 2 },
  ]).find(c => c.conceptId === 'case.gen.pl')!
  assert.equal(perfectButNew.state, 'learning')

  const earned = caseMasteryGrid(CONCEPTS, [
    { conceptId: 'case.gen.pl', mastery: 0.9, seen: 12 },
  ]).find(c => c.conceptId === 'case.gen.pl')!
  assert.equal(earned.state, 'solid')
})

test('weakestCase names the corner worth drilling, and ignores untouched cells', () => {
  const grid = caseMasteryGrid(CONCEPTS, [
    { conceptId: 'case.nom.sg', mastery: 0.95, seen: 20 },
    { conceptId: 'case.gen.pl', mastery: 0.31, seen: 9 },
    { conceptId: 'case.dat.pl', mastery: 0.60, seen: 4 },
  ])
  const weak = weakestCase(grid)!
  assert.equal(weak.conceptId, 'case.gen.pl')

  // Nothing attempted yet → nothing to recommend, rather than an arbitrary cell.
  assert.equal(weakestCase(caseMasteryGrid(CONCEPTS, [])), undefined)
})

// ── review forecast ─────────────────────────────────────────

test('the forecast covers the requested window from today', () => {
  const now = Date.parse('2026-04-01T14:00:00')
  const f = reviewForecast([], [], now, 14)
  assert.equal(f.length, 14)
  assert.equal(f[0].today, true)
  assert.equal(f[1].today, false)
})

test('overdue work lands on today, not in the past', () => {
  const now = Date.parse('2026-04-10T14:00:00')
  const f = reviewForecast(
    [{ due: now - 30 * DAY }, { due: now - DAY }, { due: now }],
    [{ due: now - 5 * DAY } as any],
    now,
  )
  assert.equal(f[0].concepts, 3, 'all three overdue concepts are due now')
  assert.equal(f[0].cards, 1)
})

test('future work lands on its own day, and beyond the window is dropped', () => {
  const now = Date.parse('2026-04-10T09:00:00')
  const f = reviewForecast(
    [{ due: now + 3 * DAY }, { due: now + 3 * DAY }, { due: now + 60 * DAY }],
    [],
    now,
    14,
  )
  assert.equal(f[3].concepts, 2)
  assert.equal(f.reduce((n, d) => n + d.concepts, 0), 2, 'the 60-day item is outside the window')
})

test('a due time late in the day still counts as that day, not the next', () => {
  // Buckets are calendar days from local midnight. Using elapsed-hours
  // arithmetic instead would push a 23:00 review into tomorrow.
  const now = Date.parse('2026-04-10T01:00:00')
  const f = reviewForecast([{ due: Date.parse('2026-04-12T23:30:00') }], [], now)
  assert.equal(f[2].concepts, 1)
  assert.equal(f[2].date, '2026-04-12')
})

// ── session diff ────────────────────────────────────────────

test('a diff separates what advanced from what slipped', () => {
  const before = [
    { conceptId: 'a', intervalDays: 3, seen: 10 },
    { conceptId: 'b', intervalDays: 7, seen: 10 },
    { conceptId: 'c', intervalDays: 2, seen: 10 },
  ]
  const after = [
    { conceptId: 'a', intervalDays: 8, mastery: 0.9, seen: 14 },
    { conceptId: 'b', intervalDays: 1, mastery: 0.4, seen: 14 },
    { conceptId: 'c', intervalDays: 2, mastery: 0.6, seen: 14 },
  ]
  const d = sessionDiff(before, after)
  assert.deepEqual(d.advanced.map(x => x.conceptId), ['a'])
  assert.deepEqual(d.slipped.map(x => x.conceptId), ['b'])
  assert.equal(d.unchanged, 1)
  assert.deepEqual(d.introduced, [])
})

test('a first meeting is introduced, not advanced', () => {
  // The scheduler creates a row before the concept is used, so `seen === 0`
  // has to count as never met — otherwise nothing is ever "new".
  const d = sessionDiff(
    [{ conceptId: 'new', intervalDays: 0, seen: 0 }],
    [{ conceptId: 'new', intervalDays: 1, mastery: 0.7, seen: 4 }],
  )
  assert.deepEqual(d.introduced, ['new'])
  assert.equal(d.advanced.length, 0)
})

test('the biggest movements come first', () => {
  const d = sessionDiff(
    [
      { conceptId: 'small', intervalDays: 1, seen: 5 },
      { conceptId: 'big', intervalDays: 2, seen: 5 },
    ],
    [
      { conceptId: 'small', intervalDays: 2, mastery: 0.8, seen: 8 },
      { conceptId: 'big', intervalDays: 20, mastery: 0.95, seen: 8 },
    ],
  )
  assert.deepEqual(d.advanced.map(x => x.conceptId), ['big', 'small'])
})

test('a session where everything went wrong does not read as progress', () => {
  // The old summary listed every touched concept as "advanced" regardless.
  const d = sessionDiff(
    [{ conceptId: 'a', intervalDays: 10, seen: 20 }],
    [{ conceptId: 'a', intervalDays: 1, mastery: 0.2, seen: 24 }],
  )
  assert.equal(d.advanced.length, 0)
  assert.equal(d.slipped.length, 1)
})

// ── weeks ───────────────────────────────────────────────────

test('weeks start on Monday', () => {
  // 2026-04-06 is a Monday; the Sunday before belongs to the previous week.
  assert.equal(weekKey('2026-04-06'), weekKey('2026-04-12'))
  assert.notEqual(weekKey('2026-04-05'), weekKey('2026-04-06'))
})

test('the week key sorts chronologically as a string', () => {
  const keys = ['2026-01-05', '2026-03-02', '2026-12-28'].map(weekKey)
  assert.deepEqual([...keys].sort(), keys)
})

test('the turn of the year does not produce a week 0 or a week 54', () => {
  for (const date of ['2025-12-29', '2025-12-31', '2026-01-01', '2026-01-04', '2026-01-05']) {
    const week = Number(weekKey(date).split('-W')[1])
    assert.ok(week >= 1 && week <= 53, `${date} → ${weekKey(date)}`)
  }
  // 2025-12-29 is a Monday, so it opens the week that contains 2026-01-01.
  assert.equal(weekKey('2025-12-29'), weekKey('2026-01-01'))
})

test('weekTotals sums days and counts only days with activity', () => {
  const totals = weekTotals([
    day('2026-04-06', { items: 10, correct: 8, seconds: 600, xp: 100 }),
    day('2026-04-07', { items: 20, correct: 15, seconds: 900, xp: 200 }),
    day('2026-04-08'), // a row with nothing on it
  ])
  assert.equal(totals.length, 1)
  assert.equal(totals[0].items, 30)
  assert.equal(totals[0].minutes, 25)
  assert.equal(totals[0].xp, 300)
  assert.equal(totals[0].activeDays, 2, 'an empty day is not an active day')
})

test('the opponent is your best previous week, never the current one', () => {
  const now = Date.parse('2026-04-08T10:00:00') // a Wednesday
  const days = [
    day('2026-03-23', { items: 50, xp: 400, seconds: 3000 }),
    day('2026-03-30', { items: 90, xp: 900, seconds: 4000 }),
    day('2026-04-06', { items: 20, xp: 200, seconds: 1200 }),
  ]
  const cmp = weekCompare(days, now)
  assert.equal(cmp.current.xp, 200)
  assert.equal(cmp.best?.xp, 900, 'the best PREVIOUS week')
  assert.equal(cmp.ahead, false)
  assert.equal(cmp.toBeat, 701)
})

test('being ahead of your best week is reported as ahead, with nothing left to beat', () => {
  const now = Date.parse('2026-04-08T10:00:00')
  const cmp = weekCompare([
    day('2026-03-30', { xp: 100 }),
    day('2026-04-06', { xp: 500 }),
  ], now)
  assert.equal(cmp.ahead, true)
  assert.equal(cmp.toBeat, 0)
})

test('the first week has no opponent rather than a zero one', () => {
  const now = Date.parse('2026-04-08T10:00:00')
  const cmp = weekCompare([day('2026-04-06', { xp: 300 })], now)
  assert.equal(cmp.best, undefined)
  assert.equal(cmp.ahead, false)
  assert.equal(cmp.toBeat, 0)
})
