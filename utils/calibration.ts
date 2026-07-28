import { getLemmasAtRanks } from './db'

/**
 * Vocabulary-size calibration.
 *
 * The model is a logistic over log-frequency rank: the more common a word, the
 * more likely you know it. What changed from the first version is what is done
 * with that model.
 *
 * The old code fitted the rank where P(known) = 0.5 and then marked *every*
 * lemma below it as known — which, by construction, marks a large number of
 * words the learner does not know. Here the fit produces two separate things:
 *
 *   - an *expected vocabulary size*  Σ P(known | r)  — the defensible number
 *   - per-rank probabilities, applied as BANDS rather than as a prefix
 *
 * It also carries a guessing floor `f` (the rate at which a learner claims to
 * know words that do not exist), which §pseudowords estimates directly.
 */

export interface CalibrationSample {
  lemma: string
  rank: number
  /** True for a generated non-word — used to measure over-claiming. */
  pseudo?: boolean
}

export interface CalibrationAnswer {
  rank: number
  known: boolean
  pseudo?: boolean
}

// ── the model ───────────────────────────────────────────────

/** P(the learner genuinely knows a word at this rank). Monotone decreasing. */
export function pKnown(rank: number, mid: number, slope: number): number {
  return 1 / (1 + Math.exp(slope * (Math.log10(Math.max(1, rank)) - mid)))
}

/**
 * P(the learner *answers* "yes"), including the guessing floor.
 * A learner who says yes to 20 % of non-words has f = 0.2, and every one of
 * their yeses is worth proportionally less.
 */
export function pYes(rank: number, mid: number, slope: number, f: number): number {
  return f + (1 - f) * pKnown(rank, mid, slope)
}

/** The false-alarm rate, measured from pseudoword trials. */
export function falseAlarmRate(answers: CalibrationAnswer[]): number {
  const pseudo = answers.filter(a => a.pseudo)
  if (pseudo.length === 0) return 0
  const yes = pseudo.filter(a => a.known).length
  // Laplace smoothing: with few trials, don't let 0/4 collapse to a hard zero
  // or 4/4 to a hard one.
  return (yes + 0.5) / (pseudo.length + 1)
}

// ── posterior ───────────────────────────────────────────────

/**
 * The midpoint grid runs below log10(1) = 0 on purpose.
 *
 * A grid floored at 0.7 cannot represent a genuine beginner: every hypothesis
 * it contains assigns >90 % to the single most common word, so a learner who
 * answers "no" to everything still comes out owning a small vocabulary. Letting
 * the midpoint go negative gives the model somewhere to put "knows nothing yet",
 * which is a real state for this app's users.
 */
const MID_GRID: number[] = []
for (let m = -1; m <= 4.9; m += 0.05) MID_GRID.push(Number(m.toFixed(3)))
const SLOPE_GRID = [0.8, 1, 1.3, 1.6, 2, 2.5, 3, 4, 5, 6]

export interface Posterior {
  mid: number[]
  slope: number[]
  /** weight[i][j] for mid[i] × slope[j], normalized to sum 1. */
  weight: number[][]
  /** The guessing floor this posterior was fitted with. */
  f: number
}

/**
 * Full Bayesian posterior over (mid, slope) with a uniform prior.
 *
 * The old code grid-searched for a single argmax and then discarded the slope
 * (`void bestSlope`) — but the spread of that surface *is* the confidence, and
 * throwing it away is why the result could never report an interval.
 */
export function fitPosterior(answers: CalibrationAnswer[], f = 0): Posterior {
  const real = answers.filter(a => !a.pseudo)
  const weight: number[][] = []
  let max = -Infinity

  const logLik: number[][] = MID_GRID.map((mid) =>
    SLOPE_GRID.map((slope) => {
      let ll = 0
      for (const { rank, known } of real) {
        const p = Math.min(1 - 1e-9, Math.max(1e-9, pYes(rank, mid, slope, f)))
        ll += known ? Math.log(p) : Math.log(1 - p)
      }
      if (ll > max) max = ll
      return ll
    }),
  )

  // Exponentiate in a numerically safe way, then normalize.
  let total = 0
  for (let i = 0; i < MID_GRID.length; i++) {
    weight[i] = []
    for (let j = 0; j < SLOPE_GRID.length; j++) {
      const w = Math.exp(logLik[i][j] - max)
      weight[i][j] = w
      total += w
    }
  }
  if (total > 0) {
    for (let i = 0; i < MID_GRID.length; i++) {
      for (let j = 0; j < SLOPE_GRID.length; j++) weight[i][j] /= total
    }
  }

  return { mid: MID_GRID, slope: SLOPE_GRID, weight, f }
}

/** Posterior-averaged P(known | rank) — what the bands are cut from. */
export function posteriorPKnown(post: Posterior, rank: number): number {
  let p = 0
  for (let i = 0; i < post.mid.length; i++) {
    for (let j = 0; j < post.slope.length; j++) {
      const w = post.weight[i][j]
      if (w > 0) p += w * pKnown(rank, post.mid[i], post.slope[j])
    }
  }
  return p
}

/** Posterior mean and SD of the midpoint, in log10-rank space. */
export function midpointStats(post: Posterior): { mean: number; sd: number } {
  let mean = 0
  for (let i = 0; i < post.mid.length; i++) {
    for (let j = 0; j < post.slope.length; j++) mean += post.weight[i][j] * post.mid[i]
  }
  let varSum = 0
  for (let i = 0; i < post.mid.length; i++) {
    for (let j = 0; j < post.slope.length; j++) {
      varSum += post.weight[i][j] * (post.mid[i] - mean) ** 2
    }
  }
  return { mean, sd: Math.sqrt(Math.max(0, varSum)) }
}

// ── the outputs ─────────────────────────────────────────────

/**
 * Vocabulary size for one parameter pair: the expected number of known words,
 * Σ P(known | r) over the ranked list. This is the honest estimate — the rank
 * where you know half the words is not how many words you know.
 */
export function vocabSizeAt(mid: number, slope: number, maxRank: number): number {
  let sum = 0
  for (let r = 1; r <= maxRank; r++) sum += pKnown(r, mid, slope)
  return sum
}

export interface SizeEstimate {
  /** Posterior mean vocabulary size. */
  size: number
  /** 90 % credible interval. */
  low: number
  high: number
  /** Highest rank still ≥ 0.90 likely known — the `known` band. */
  knownUpTo: number
  /** Highest rank still ≥ 0.50 likely known — the end of the `learning` band. */
  learningUpTo: number
  /** Measured over-claiming rate on non-words. */
  falseAlarm: number
}

/**
 * How many words the uncertain band may seed as `learning`.
 *
 * Without a cap a confident learner's 50 % point sits near the end of the
 * frequency list, and applying it marks ~20 000 words as "currently studying" —
 * which floods the Words tab and hands the vocabulary trainer a queue of words
 * the learner has never actually met. The band is a seed, not a syllabus; past
 * this many words it is better to meet them by reading.
 */
export const MAX_LEARNING_BAND = 2000

/**
 * Summarize a posterior into everything the UI and the apply step need.
 *
 * `vocabSizeAt` is evaluated per grid point (not just at the mean) so the
 * interval reflects genuine parameter uncertainty rather than a point estimate
 * with error bars bolted on.
 */
export function summarize(post: Posterior, maxRank: number): SizeEstimate {
  const points: { size: number; w: number }[] = []
  let mean = 0
  for (let i = 0; i < post.mid.length; i++) {
    for (let j = 0; j < post.slope.length; j++) {
      const w = post.weight[i][j]
      if (w < 1e-9) continue
      const size = vocabSizeAt(post.mid[i], post.slope[j], maxRank)
      points.push({ size, w })
      mean += w * size
    }
  }
  points.sort((a, b) => a.size - b.size)

  const quantile = (q: number): number => {
    let acc = 0
    for (const p of points) {
      acc += p.w
      if (acc >= q) return p.size
    }
    return points.length > 0 ? points[points.length - 1].size : 0
  }

  const knownUpTo = rankAtProbability(post, 0.9, maxRank)
  const rawLearning = rankAtProbability(post, 0.5, maxRank)

  return {
    size: Math.round(mean),
    low: Math.round(quantile(0.05)),
    high: Math.round(quantile(0.95)),
    knownUpTo,
    learningUpTo: Math.min(rawLearning, knownUpTo + MAX_LEARNING_BAND),
    falseAlarm: post.f,
  }
}

/**
 * The highest rank whose posterior P(known) is still ≥ `target`.
 * Binary search is valid because posteriorPKnown is monotone decreasing in rank
 * (it is a positive mixture of monotone decreasing logistics).
 */
export function rankAtProbability(post: Posterior, target: number, maxRank: number): number {
  if (posteriorPKnown(post, 1) < target) return 0
  if (posteriorPKnown(post, maxRank) >= target) return maxRank

  let lo = 1
  let hi = maxRank
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (posteriorPKnown(post, mid) >= target) lo = mid
    else hi = mid - 1
  }
  return lo
}

// ── applying the result ─────────────────────────────────────

export type CalibrationBand = 'known' | 'learning'

export interface BandAssignment {
  band: CalibrationBand
  /** Only for the learning band: 3–5, scaled by how likely the word is known. */
  level?: 3 | 4 | 5
}

/**
 * Which band a rank falls into, or undefined for "leave this word alone".
 *
 * This is the correction at the heart of the rewrite. Words between the 50 %
 * and 90 % marks are genuinely uncertain, so they are recorded as *learning*
 * at a level scaled by their probability rather than being claimed as known.
 */
export function bandForRank(
  rank: number,
  knownUpTo: number,
  learningUpTo: number,
  pAtRank?: number,
): BandAssignment | undefined {
  if (rank <= knownUpTo) return { band: 'known' }
  if (rank <= learningUpTo) {
    // P runs 0.9 → 0.5 across this band; map it onto levels 5 → 3.
    const p = pAtRank ?? 0.7
    const level = p >= 0.8 ? 5 : p >= 0.65 ? 4 : 3
    return { band: 'learning', level: level as 3 | 4 | 5 }
  }
  return undefined
}

// ── adaptive item selection ─────────────────────────────────

/** Never ask fewer than this — a handful of items cannot pin anything down. */
export const MIN_ITEMS = 12
/** Never ask more than this, however uncertain we still are. */
export const MAX_ITEMS = 25
/** Stop once the midpoint is known to roughly this precision (log10 rank). */
export const TARGET_SD = 0.2
/** Roughly this share of items are invented words. */
export const PSEUDO_SHARE = 0.25

/**
 * The most informative rank to ask about next.
 *
 * For a logistic, Fisher information peaks where P = 0.5, so the best question
 * is the one the current posterior is least able to predict. This is why ~18
 * adaptive items beat the old fixed 38: the old sweep spent most of its
 * questions far outside the learner's range, where the answer was a foregone
 * conclusion and told us nothing.
 */
export function nextTargetRank(post: Posterior, maxRank: number): number {
  const r = rankAtProbability(post, 0.5, maxRank)
  return Math.min(maxRank, Math.max(1, r))
}

/**
 * Enough evidence, or enough questions.
 *
 * `asked` counts EVERY item shown, pseudowords included. Counting only the
 * real ones let a 25-item cap serve 35 questions, because a quarter of them
 * didn't count — and the learner experiences all of them.
 */
export function shouldStop(post: Posterior, asked: number, realAsked = asked): boolean {
  if (asked >= MAX_ITEMS) return true
  if (realAsked < MIN_ITEMS) return false
  return midpointStats(post).sd <= TARGET_SD
}

/**
 * A jittered rank near the target, so repeat runs don't reuse the same words.
 * The old sampler always took the first lemma at-or-above a fixed ladder, which
 * meant the same 38 words forever — memorable, and therefore useless on retest.
 */
export function jitterRank(target: number, random: () => number): number {
  // ±25 % in log space keeps the jitter proportional across the range.
  const factor = Math.pow(10, (random() - 0.5) * 0.22)
  return Math.max(1, Math.round(target * factor))
}

// ── sampling ────────────────────────────────────────────────

/**
 * The initial ladder, used to seed the posterior before adaptation can steer.
 * Wide and coarse: six items spanning the whole range locate the learner
 * roughly, and adaptive selection refines from there.
 */
export const SEED_RANKS = [50, 300, 1200, 4000, 12000, 35000]

/** ~40 lemmas at log-spaced ranks between 25 and 50k (non-adaptive fallback). */
export async function calibrationSample(lang: string): Promise<CalibrationSample[]> {
  const ranks: number[] = []
  for (let r = 25; r <= 50000; r = Math.ceil(r * 1.22)) ranks.push(r)
  const rows = await getLemmasAtRanks(lang, ranks)
  const seen = new Set<string>()
  return rows.filter(({ lemma }) => {
    if (seen.has(lemma)) return false
    seen.add(lemma)
    return true
  })
}
