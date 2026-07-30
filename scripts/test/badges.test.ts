import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  BADGE_FAMILIES,
  badges,
  moments,
  shelf,
  type BadgeTotals,
} from '../../utils/grammar/badges'
import { ACHIEVEMENTS } from '../../utils/grammar/gamify'
import { longestStreak } from '../../utils/grammar/stats'

const NOTHING: BadgeTotals = {
  bestStreak: 0, items: 0, conceptsMastered: 0, words: 0, minutes: 0,
}

const find = (list: ReturnType<typeof badges>, family: string) =>
  list.find(b => b.family === family)!

// ── the catalogue ───────────────────────────────────────────

test('every family has ascending tiers with real names', () => {
  for (const f of BADGE_FAMILIES) {
    assert.ok(f.tiers.length >= 3, `${f.family} has too few tiers to be a ladder`)
    assert.ok(f.labelDe.length > 3, `${f.family} has no label`)
    assert.ok(f.icon.length > 0, `${f.family} has no icon`)
    for (let i = 1; i < f.tiers.length; i++) {
      assert.ok(f.tiers[i].at > f.tiers[i - 1].at, `${f.family} tier ${i} is not higher`)
    }
    for (const t of f.tiers) assert.ok(t.titleDe.length > 3, `${f.family} tier ${t.at} unnamed`)
  }
})

test('the top concept tier is the whole curriculum, not an arbitrary number', () => {
  const top = find(badges(NOTHING), 'concepts')
  assert.equal(BADGE_FAMILIES.find(f => f.family === 'concepts')!.tiers.at(-1)!.at, 41)
  assert.equal(top.tiers, 3)
})

// ── earning them ────────────────────────────────────────────

test('nothing is earned at zero, but the ladder is still shown', () => {
  const list = badges(NOTHING)
  assert.equal(list.length, BADGE_FAMILIES.length)
  for (const b of list) {
    assert.equal(b.tier, 0)
    assert.equal(b.earned, false)
    // The name shown is the FIRST tier's, so an unearned badge reads as a goal
    // rather than as a blank.
    assert.ok(b.titleDe.length > 3)
    assert.ok(b.nextAt! > 0)
  }
})

test('a tier is earned exactly at its threshold', () => {
  assert.equal(find(badges({ ...NOTHING, bestStreak: 6 }), 'streak').tier, 0)
  assert.equal(find(badges({ ...NOTHING, bestStreak: 7 }), 'streak').tier, 1)
  assert.equal(find(badges({ ...NOTHING, bestStreak: 29 }), 'streak').tier, 1)
  assert.equal(find(badges({ ...NOTHING, bestStreak: 30 }), 'streak').tier, 2)
  assert.equal(find(badges({ ...NOTHING, bestStreak: 100 }), 'streak').tier, 3)
})

test('the earned tier carries its own name, not the next one', () => {
  const b = find(badges({ ...NOTHING, bestStreak: 45 }), 'streak')
  assert.equal(b.tier, 2)
  assert.equal(b.titleDe, 'Miesiąc')
  assert.equal(b.nextAt, 100)
})

test('progress is measured from the last threshold, not from zero', () => {
  // 550 items with tiers at 100/1000/5000. From zero this bar would read 11 %
  // and look untouched for months; from the last threshold it reads half way to
  // the next tier, which is the true state.
  const b = find(badges({ ...NOTHING, items: 550 }), 'items')
  assert.equal(b.tier, 1)
  assert.ok(Math.abs(b.fraction - 0.5) < 0.01, `fraction was ${b.fraction}`)
})

test('a completed family is full, with no next threshold to chase', () => {
  const b = find(badges({ ...NOTHING, items: 9999 }), 'items')
  assert.equal(b.tier, 3)
  assert.equal(b.nextAt, undefined)
  assert.equal(b.fraction, 1)
})

test('families are independent — one earned badge does not imply another', () => {
  const list = badges({ ...NOTHING, minutes: 4000 })
  assert.equal(find(list, 'minutes').tier, 3)
  for (const family of ['streak', 'items', 'concepts', 'words']) {
    assert.equal(find(list, family).tier, 0, `${family} was earned for free`)
  }
})

// ── the one-off achievements ────────────────────────────────

test('streak achievements are not on the shelf twice', () => {
  // The streak FAMILY covers the same ground with a visible next tier. They
  // stay in ACHIEVEMENTS so stored ids keep meaning and the summary can still
  // announce them.
  const ids = moments([]).map(m => m.id)
  assert.ok(!ids.includes('streak-7'))
  assert.ok(!ids.includes('streak-30'))
  assert.ok(ACHIEVEMENTS.some(a => a.id === 'streak-7'), 'still declared')
})

test('moments that cannot be derived from a total are kept as flags', () => {
  // "a session without a single mistake" happened; no counter can recover it.
  const ids = moments([]).map(m => m.id)
  for (const id of ['first-session', 'perfect', 'combo-10', 'boss-clear']) {
    assert.ok(ids.includes(id), `${id} is missing from the shelf`)
  }
})

test('an unlocked moment is marked earned, and unknown stored ids are ignored', () => {
  const m = moments(['perfect', 'some-old-id-we-removed'])
  assert.equal(m.find(x => x.id === 'perfect')!.earned, true)
  assert.equal(m.find(x => x.id === 'combo-10')!.earned, false)
  assert.equal(m.length, ACHIEVEMENTS.length - 2)
})

// ── the shelf as a whole ────────────────────────────────────

test('the shelf counts earned tiers against the total available', () => {
  const empty = shelf(NOTHING, [])
  assert.equal(empty.earned, 0)
  assert.equal(empty.total, 15 + 4, '5 families × 3 tiers, plus 4 moments')

  const some = shelf(
    { bestStreak: 30, items: 1200, conceptsMastered: 6, words: 0, minutes: 700 },
    ['perfect', 'first-session'],
  )
  // streak 2 + items 2 + concepts 1 + words 0 + minutes 2 = 7, plus 2 moments.
  assert.equal(some.earned, 9)
})

test('everything earned fills the shelf exactly', () => {
  const all = shelf(
    { bestStreak: 365, items: 20000, conceptsMastered: 41, words: 5000, minutes: 10000 },
    ACHIEVEMENTS.map(a => a.id),
  )
  assert.equal(all.earned, all.total)
})

// ── the derived best streak ─────────────────────────────────

test('the longest streak is read off the day history', () => {
  const d = (date: string, items = 10) => ({ date, items, seconds: 300 })
  assert.equal(longestStreak([]), 0)
  assert.equal(longestStreak([d('2026-04-01')]), 1)
  assert.equal(longestStreak([d('2026-04-01'), d('2026-04-02'), d('2026-04-03')]), 3)
  // A gap resets the run, and the longest earlier run still wins.
  assert.equal(
    longestStreak([d('2026-04-01'), d('2026-04-02'), d('2026-04-03'), d('2026-04-09')]),
    3,
  )
})

test('an empty day row does not bridge a gap', () => {
  // A session quit immediately writes a row with nothing on it. Counting that
  // as a day would hand out a streak nobody earned.
  const run = longestStreak([
    { date: '2026-04-01', items: 10, seconds: 300 },
    { date: '2026-04-02', items: 0, seconds: 0 },
    { date: '2026-04-03', items: 10, seconds: 300 },
  ])
  assert.equal(run, 1)
})

test('the longest streak survives unsorted rows and a month boundary', () => {
  const d = (date: string) => ({ date, items: 5, seconds: 120 })
  const run = longestStreak([d('2026-05-01'), d('2026-04-29'), d('2026-04-30'), d('2026-05-02')])
  assert.equal(run, 4)
})
