import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  bandForRank,
  falseAlarmRate,
  fitPosterior,
  midpointStats,
  pKnown,
  pYes,
  posteriorPKnown,
  rankAtProbability,
  summarize,
  vocabSizeAt,
  MAX_ITEMS,
  MAX_LEARNING_BAND,
  MIN_ITEMS,
  SEED_RANKS,
  jitterRank,
  nextTargetRank,
  shouldStop,
  type CalibrationAnswer,
} from '../../utils/calibration'

const MAX_RANK = 50_000

// ── a simulated learner, so the estimator can be checked against truth ──

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Answer a set of ranks the way a learner with a given true midpoint would,
 * optionally over-claiming on non-words at rate `overclaim`.
 */
function simulate(
  ranks: number[],
  trueMid: number,
  trueSlope: number,
  seed: number,
  opts: { overclaim?: number; pseudoCount?: number } = {},
): CalibrationAnswer[] {
  const rand = rng(seed)
  const out: CalibrationAnswer[] = ranks.map(rank => ({
    rank,
    // An over-claimer says yes to things they don't know, real words included.
    known: rand() < (opts.overclaim ?? 0) + (1 - (opts.overclaim ?? 0)) * pKnown(rank, trueMid, trueSlope),
  }))
  for (let i = 0; i < (opts.pseudoCount ?? 0); i++) {
    out.push({ rank: 0, pseudo: true, known: rand() < (opts.overclaim ?? 0) })
  }
  return out
}

const LADDER: number[] = []
for (let r = 25; r <= 50_000; r = Math.ceil(r * 1.22)) LADDER.push(r)

// ── the model ───────────────────────────────────────────────

test('pKnown is monotone decreasing and bounded', () => {
  let prev = 1
  for (const r of [1, 10, 100, 1000, 10_000, 50_000]) {
    const p = pKnown(r, 3, 2)
    assert.ok(p > 0 && p < 1, `out of range at ${r}: ${p}`)
    assert.ok(p <= prev, `not monotone at ${r}`)
    prev = p
  }
})

test('pKnown crosses 0.5 exactly at the midpoint', () => {
  assert.ok(Math.abs(pKnown(1000, 3, 2) - 0.5) < 1e-9, '10^3 = 1000')
})

test('the guessing floor lifts the answer curve but not the knowledge curve', () => {
  const rank = 40_000
  assert.ok(pKnown(rank, 3, 2) < 0.05, 'genuinely unlikely to be known')
  assert.ok(pYes(rank, 3, 2, 0.3) > 0.29, 'but a 30 % over-claimer still says yes')
  assert.equal(pYes(rank, 3, 2, 0), pKnown(rank, 3, 2), 'f=0 collapses to the honest curve')
})

test('falseAlarmRate measures over-claiming, and is smoothed at the extremes', () => {
  assert.equal(falseAlarmRate([]), 0, 'no pseudowords → no correction')

  const honest = falseAlarmRate(Array.from({ length: 8 }, () => ({ rank: 0, pseudo: true, known: false })))
  assert.ok(honest > 0 && honest < 0.1, `smoothed away from a hard zero: ${honest}`)

  const liar = falseAlarmRate(Array.from({ length: 8 }, () => ({ rank: 0, pseudo: true, known: true })))
  assert.ok(liar > 0.9 && liar < 1, `smoothed away from a hard one: ${liar}`)
})

// ── the posterior ───────────────────────────────────────────

test('the posterior is a normalized distribution', () => {
  const post = fitPosterior(simulate(LADDER, 3, 2, 1))
  let total = 0
  for (const row of post.weight) for (const w of row) total += w
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`)
})

test('more evidence produces a tighter posterior', () => {
  const few = fitPosterior(simulate(LADDER.slice(0, 6), 3, 2, 7))
  const many = fitPosterior(simulate([...LADDER, ...LADDER, ...LADDER], 3, 2, 7))
  assert.ok(
    midpointStats(many).sd < midpointStats(few).sd,
    'uncertainty must shrink with data',
  )
})

test('posteriorPKnown is monotone decreasing in rank', () => {
  const post = fitPosterior(simulate(LADDER, 3, 2, 3))
  let prev = 1
  for (const r of [1, 5, 50, 500, 5000, 50_000]) {
    const p = posteriorPKnown(post, r)
    assert.ok(p <= prev + 1e-12, `not monotone at ${r}: ${p} > ${prev}`)
    prev = p
  }
})

test('rankAtProbability inverts posteriorPKnown', () => {
  const post = fitPosterior(simulate(LADDER, 3, 2, 11))
  for (const target of [0.9, 0.5]) {
    const r = rankAtProbability(post, target, MAX_RANK)
    if (r > 0 && r < MAX_RANK) {
      assert.ok(posteriorPKnown(post, r) >= target, `P at ${r} below target ${target}`)
      assert.ok(posteriorPKnown(post, r + 1) < target, `P at ${r + 1} not below target ${target}`)
    }
  }
})

test('rankAtProbability handles both saturated ends', () => {
  const knowsNothing = fitPosterior(LADDER.map(rank => ({ rank, known: false })))
  assert.equal(rankAtProbability(knowsNothing, 0.9, MAX_RANK), 0, 'nothing qualifies')

  const knowsAll = fitPosterior(LADDER.map(rank => ({ rank, known: true })))
  assert.ok(rankAtProbability(knowsAll, 0.5, MAX_RANK) > 10_000, 'the estimate extends far out')
})

// ── vocabulary size ─────────────────────────────────────────

test('vocabulary size is the expected count, NOT the 50 % crossing point', () => {
  // This is the defect the rewrite exists to fix. A learner with midpoint 1000
  // does not know 1000 words: they know most of the first few hundred, about
  // half around 1000, and a thin tail beyond.
  const size = vocabSizeAt(3, 2, MAX_RANK)
  assert.ok(size > 0)
  assert.ok(
    Math.abs(size - 1000) > 100,
    `size (${size.toFixed(0)}) must not simply echo the crossing rank (1000)`,
  )
})

test('vocabulary size grows with the midpoint', () => {
  const small = vocabSizeAt(2, 2, MAX_RANK)
  const large = vocabSizeAt(4, 2, MAX_RANK)
  assert.ok(large > small * 5, `${small.toFixed(0)} → ${large.toFixed(0)}`)
})

test('the credible interval brackets the estimate and is not degenerate', () => {
  const est = summarize(fitPosterior(simulate(LADDER, 3, 2, 5)), MAX_RANK)
  assert.ok(est.low <= est.size && est.size <= est.high, `${est.low} ≤ ${est.size} ≤ ${est.high}`)
  assert.ok(est.high > est.low, 'a real interval, not a point')
})

test('the estimate recovers a simulated learner across the range', () => {
  for (const trueMid of [2, 2.5, 3, 3.5, 4]) {
    const truth = vocabSizeAt(trueMid, 2, MAX_RANK)
    let covered = 0
    const runs = 12
    for (let seed = 0; seed < runs; seed++) {
      const est = summarize(fitPosterior(simulate(LADDER, trueMid, 2, seed * 97 + 1)), MAX_RANK)
      if (truth >= est.low && truth <= est.high) covered++
    }
    // A 90 % interval should cover the truth most of the time. Allow slack for
    // 12 noisy runs; the point is that it is calibrated, not lucky.
    assert.ok(
      covered >= runs * 0.6,
      `mid=${trueMid}: interval covered truth ${covered}/${runs} times`,
    )
  }
})

test('an over-claimer is corrected back toward the truth', () => {
  // Same true ability, but this learner says yes to 30 % of things they don't
  // know — including the non-words, which is how we catch them.
  const trueMid = 2.5
  const honest = simulate(LADDER, trueMid, 2, 42, { pseudoCount: 10 })
  const liar = simulate(LADDER, trueMid, 2, 42, { overclaim: 0.3, pseudoCount: 10 })

  const fHonest = falseAlarmRate(honest)
  const fLiar = falseAlarmRate(liar)
  assert.ok(fLiar > fHonest + 0.1, `over-claiming detected: ${fHonest.toFixed(2)} → ${fLiar.toFixed(2)}`)

  const uncorrected = summarize(fitPosterior(liar, 0), MAX_RANK)
  const corrected = summarize(fitPosterior(liar, fLiar), MAX_RANK)
  const truth = vocabSizeAt(trueMid, 2, MAX_RANK)

  assert.ok(
    Math.abs(corrected.size - truth) < Math.abs(uncorrected.size - truth),
    `correction should help: truth=${truth.toFixed(0)} raw=${uncorrected.size} corrected=${corrected.size}`,
  )
})

// ── banding ─────────────────────────────────────────────────

test('bands never claim a word is known past the 90 % mark', () => {
  const knownUpTo = 500
  const learningUpTo = 3000

  assert.equal(bandForRank(1, knownUpTo, learningUpTo)?.band, 'known')
  assert.equal(bandForRank(500, knownUpTo, learningUpTo)?.band, 'known')
  assert.equal(bandForRank(501, knownUpTo, learningUpTo)?.band, 'learning')
  assert.equal(bandForRank(3000, knownUpTo, learningUpTo)?.band, 'learning')
  assert.equal(bandForRank(3001, knownUpTo, learningUpTo), undefined, 'left alone entirely')
})

test('the learning band is graded by confidence, not flat', () => {
  assert.equal(bandForRank(600, 500, 3000, 0.88)?.level, 5)
  assert.equal(bandForRank(1500, 500, 3000, 0.7)?.level, 4)
  assert.equal(bandForRank(2900, 500, 3000, 0.52)?.level, 3)
})

test('a real fit produces a known band strictly inside the learning band', () => {
  const est = summarize(fitPosterior(simulate(LADDER, 3, 2, 21)), MAX_RANK)
  assert.ok(
    est.knownUpTo <= est.learningUpTo,
    `known band (${est.knownUpTo}) must not exceed learning band (${est.learningUpTo})`,
  )
})

test('a learner who knows nothing is not handed a vocabulary', () => {
  // The old code returned 0 here and the UI clamped it to a slider value of
  // 100, one click away from marking the 100 most common words known.
  const est = summarize(fitPosterior(LADDER.map(rank => ({ rank, known: false }))), MAX_RANK)
  assert.equal(est.knownUpTo, 0, 'nothing is marked known')
  assert.ok(est.size < 200, `size stays near zero, got ${est.size}`)
})

// ── adaptive selection ──────────────────────────────────────

test('adaptive selection asks where it is least certain', () => {
  // The most informative question for a logistic is the one at P = 0.5.
  const post = fitPosterior(simulate(LADDER, 3, 2, 31))
  const target = nextTargetRank(post, MAX_RANK)
  const p = posteriorPKnown(post, target)
  assert.ok(Math.abs(p - 0.5) < 0.15, `expected a coin-flip question, got P=${p.toFixed(2)}`)
})

test('the quiz stops early when confident, but not before a floor', () => {
  const confident = fitPosterior(simulate([...LADDER, ...LADDER, ...LADDER], 3, 2, 4))
  assert.ok(!shouldStop(confident, MIN_ITEMS - 1), 'never stops below the floor')
  assert.ok(shouldStop(confident, MAX_ITEMS), 'always stops at the ceiling')
})

test('an uncertain posterior keeps asking', () => {
  // Two answers cannot pin down a two-parameter model.
  const vague = fitPosterior([{ rank: 100, known: true }, { rank: 20_000, known: false }])
  assert.ok(!shouldStop(vague, MIN_ITEMS), 'still uncertain after the minimum')
})

test('adaptive converges in far fewer items than the fixed sweep', () => {
  // Simulate the real loop: repeatedly ask at the current best guess.
  for (const trueMid of [2, 3, 4]) {
    const answers: CalibrationAnswer[] = []
    const rand = rng(trueMid * 1000 + 7)
    let asked = 0
    while (asked < MAX_ITEMS) {
      const post = fitPosterior(answers)
      if (shouldStop(post, asked)) break
      const rank = asked < 6 ? SEED_RANKS[asked] : nextTargetRank(post, MAX_RANK)
      answers.push({ rank, known: rand() < pKnown(rank, trueMid, 2) })
      asked++
    }
    const est = summarize(fitPosterior(answers), MAX_RANK)
    const truth = vocabSizeAt(trueMid, 2, MAX_RANK)
    assert.ok(asked <= MAX_ITEMS, `used ${asked} items`)
    assert.ok(
      truth >= est.low * 0.4 && truth <= est.high * 2.5,
      `mid=${trueMid}: truth ${truth.toFixed(0)} vs [${est.low}, ${est.high}] after ${asked} items`,
    )
  }
})

test('jitterRank varies the word without leaving the neighbourhood', () => {
  const rand = rng(5)
  const seen = new Set<number>()
  for (let i = 0; i < 30; i++) {
    const r = jitterRank(1000, rand)
    seen.add(r)
    assert.ok(r > 500 && r < 2000, `stayed near the target: ${r}`)
  }
  assert.ok(seen.size > 10, `retests should not reuse one rank, saw ${seen.size} distinct`)
})

test('pseudowords are excluded from the ability fit', () => {
  // A pseudoword answered "yes" must not be read as evidence of knowing a
  // rank-0 word; it only moves the guessing floor.
  const real: CalibrationAnswer[] = LADDER.map(rank => ({ rank, known: pKnown(rank, 3, 2) > 0.5 }))
  const withPseudo: CalibrationAnswer[] = [
    ...real,
    ...Array.from({ length: 6 }, () => ({ rank: 0, pseudo: true, known: true })),
  ]
  const a = summarize(fitPosterior(real, 0), MAX_RANK)
  const b = summarize(fitPosterior(withPseudo, 0), MAX_RANK)
  assert.equal(a.size, b.size, 'pseudoword answers do not enter the ability likelihood')
})

test('the item cap counts pseudowords too', () => {
  // A cap that only counted scored items served 35 questions for a limit of
  // 25, because a quarter of them were pseudowords and "didn't count".
  const post = fitPosterior(simulate(LADDER.slice(0, 8), 3, 2, 2))
  assert.ok(shouldStop(post, MAX_ITEMS, 8), 'total reached the cap, so stop')
  assert.ok(!shouldStop(post, 8, 8), 'well under the cap, keep going')
})

test('the learning band is capped so apply cannot flood the word list', () => {
  // A confident learner's 50 % point sits near the end of the frequency list.
  // Uncapped, applying that marked ~20k words as "currently studying".
  const knowsAll = fitPosterior(LADDER.map(rank => ({ rank, known: true })))
  const est = summarize(knowsAll, MAX_RANK)
  assert.ok(
    est.learningUpTo - est.knownUpTo <= MAX_LEARNING_BAND,
    `band was ${est.learningUpTo - est.knownUpTo}, cap is ${MAX_LEARNING_BAND}`,
  )
})

test('capping the band never inverts it', () => {
  for (const seed of [1, 9, 17, 33]) {
    const est = summarize(fitPosterior(simulate(LADDER, 3.5, 2, seed)), MAX_RANK)
    assert.ok(est.learningUpTo >= est.knownUpTo, `inverted at seed ${seed}`)
  }
})
